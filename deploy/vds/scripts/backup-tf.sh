#!/usr/bin/env bash
# Nightly Tunc Fitness backup: database dump and uploaded images (logos, campaign photos). Keeps 14 days on the server
# and, when /srv/backups/offsite.env exists, copies new files off the server with rclone (same format as backup-fc.sh).
#
#   cron (deploy user):  40 3 * * * /srv/src/love-site/deploy/vds/scripts/backup-tf.sh >> /srv/backups/tf/backup.log 2>&1
set -euo pipefail
cd "$(dirname "$0")/.."
# dumps hold gym members' names and phone numbers
umask 077

OUT=/srv/backups/tf
mkdir -p "$OUT"
STAMP=$(date +%F)
DB_FILE="$OUT/tuncfitness_$STAMP.dump"
MEDIA_FILE="$OUT/tuncfitness-media_$STAMP.tar"
# a failed dump leaves no half-written file behind
trap 'rm -f "$DB_FILE.part" "$MEDIA_FILE.part"' EXIT

docker compose exec -T postgres pg_dump -U postgres -d tuncfitness --format=custom > "$DB_FILE.part"
mv "$DB_FILE.part" "$DB_FILE"
docker compose exec -T tf-backend tar -C /data -cf - media > "$MEDIA_FILE.part"
mv "$MEDIA_FILE.part" "$MEDIA_FILE"
echo "$(date '+%F %T') dump $(du -h "$DB_FILE" | cut -f1) $DB_FILE, media $(du -h "$MEDIA_FILE" | cut -f1)"

# only our own dated files, only older than 14 days
find "$OUT" -maxdepth 1 \( -name 'tuncfitness_*.dump' -o -name 'tuncfitness-media_*.tar' \) -mtime +13 -print -delete

if [ -f /srv/backups/offsite.env ]; then
  set -a; . /srv/backups/offsite.env; set +a
  ENV_ARGS=()
  for v in $(env | awk -F= '/^RCLONE_CONFIG_OFF_/ {print $1}'); do ENV_ARGS+=(-e "$v"); done
  docker run --rm "${ENV_ARGS[@]}" -v "$OUT:/data:ro" rclone/rclone:1.71.2 \
    copy /data "off:$OFFSITE_BUCKET/tuncfitness" --include 'tuncfitness*' --max-age 3d
  echo "$(date '+%F %T') off-site copy done"
fi
