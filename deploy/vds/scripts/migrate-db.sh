#!/usr/bin/env bash
# One-off: copies one app's database from Railway into this server's Postgres, then compares the row count of every
# table on both sides (exit 1 on any difference).
#
#   read -rs SOURCE_DATABASE_URL && export SOURCE_DATABASE_URL     (paste Railway's DATABASE_PUBLIC_URL, nothing echoed)
#   scripts/migrate-db.sh love          love-site
#   scripts/migrate-db.sh fcassist      FC Assist (end the URL with /fcassist, Railway's default points at /railway)
#   unset SOURCE_DATABASE_URL
#
# - The source address is read only from the environment and reaches the client container by name (-e VAR), never on a
#   command line or in a log. No `set -x`.
# - Stops without writing anything when the target database already has tables.
# - Restore: one transaction, objects owned by the app's role (love / fcassist), no grants from Railway.
set -euo pipefail
cd "$(dirname "$0")/.."
# the dump and the count files hold user data
umask 077

DB=${1:-}
case "$DB" in
  love|fcassist) ;;
  *) echo "usage: $0 love|fcassist" >&2; exit 2 ;;
esac
: "${SOURCE_DATABASE_URL:?SOURCE_DATABASE_URL is not set (read -rs SOURCE_DATABASE_URL && export SOURCE_DATABASE_URL)}"
case "$SOURCE_DATABASE_URL" in
  postgres://*|postgresql://*) ;;
  *) echo "SOURCE_DATABASE_URL must start with postgres:// or postgresql://" >&2; exit 2 ;;
esac

CLIENT_IMAGE=postgres:18
DUMP_DIR=/srv/backups/migrate
DUMP_NAME="${DB}_$(date +%Y%m%d-%H%M%S).dump"
mkdir -p "$DUMP_DIR"

src() { docker run --rm -i -e SOURCE_DATABASE_URL "$CLIENT_IMAGE" sh -c 'psql "$SOURCE_DATABASE_URL" -v ON_ERROR_STOP=1 -At "$@"' sh "$@"; }
dst() { docker compose exec -T postgres psql -U postgres -d "$DB" -v ON_ERROR_STOP=1 -At "$@"; }
TABLES_SQL="SELECT format('%I.%I', table_schema, table_name) FROM information_schema.tables
            WHERE table_type = 'BASE TABLE' AND table_schema NOT IN ('pg_catalog', 'information_schema') ORDER BY 1"

echo "1/4 checks"
SOURCE_VERSION=$(src -c 'SHOW server_version_num')
echo "    source server: $(src -c 'SHOW server_version')"
if [ "$SOURCE_VERSION" -ge 190000 ]; then
  echo "source is newer than Postgres 18: raise CLIENT_IMAGE here and the postgres image in compose.yml first" >&2
  exit 3
fi
IN_TARGET=$(dst -c "SELECT count(*) FROM ($TABLES_SQL) t")
if [ "$IN_TARGET" != "0" ]; then
  echo "target database $DB is not empty ($IN_TARGET tables). Stopped, nothing written." >&2
  exit 3
fi

echo "2/4 dump -> $DUMP_DIR/$DUMP_NAME"
# as the calling user, so the dump is theirs (mode 600) and not root's
docker run --rm --user "$(id -u):$(id -g)" -e SOURCE_DATABASE_URL -v "$DUMP_DIR:/out" "$CLIENT_IMAGE" \
  sh -c 'umask 077; pg_dump "$SOURCE_DATABASE_URL" --format=custom --no-owner --no-privileges --file="/out/$1"' sh "$DUMP_NAME"

echo "3/4 restore into $DB (single transaction)"
docker compose exec -T postgres pg_restore -U postgres -d "$DB" --no-owner --no-privileges --role="$DB" \
  --single-transaction --exit-on-error < "$DUMP_DIR/$DUMP_NAME"

echo "4/4 row counts"
# exact count(*) of every table in one query per side
COUNTS_SQL="SELECT t || '|' || (xpath('/row/c/text()', query_to_xml('SELECT count(*) AS c FROM ' || t, false, true, '')))[1]::text
            FROM ($TABLES_SQL) AS l(t)"
src -c "$COUNTS_SQL" > "/tmp/$DB.source.counts"
dst -c "$COUNTS_SQL" > "/tmp/$DB.target.counts"
if diff "/tmp/$DB.source.counts" "/tmp/$DB.target.counts" > /dev/null; then
  sed 's/|/  /' "/tmp/$DB.target.counts" | sed 's/^/    /'
  echo "done: $(wc -l < "/tmp/$DB.target.counts") tables, every one with the same number of rows"
else
  echo "row counts differ (< source, > target):" >&2
  diff "/tmp/$DB.source.counts" "/tmp/$DB.target.counts" >&2 || true
  exit 1
fi
