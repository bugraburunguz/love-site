#!/usr/bin/env bash
# Nightly FC Assist database dump (love-site backs itself up through BACKUP_S3_* in love.env). Keeps 14 days on the
# server and, when /srv/backups/offsite.env exists, copies new dumps off the server with rclone.
#
#   cron (deploy user):  30 3 * * * /srv/src/love-site/deploy/vds/scripts/backup-fc.sh >> /srv/backups/fc/backup.log 2>&1
#
# offsite.env (chmod 600), any S3-compatible bucket (Cloudflare R2, Backblaze B2 ...):
#   RCLONE_CONFIG_OFF_TYPE=s3
#   RCLONE_CONFIG_OFF_PROVIDER=Other
#   RCLONE_CONFIG_OFF_ENDPOINT=https://...
#   RCLONE_CONFIG_OFF_ACCESS_KEY_ID=...
#   RCLONE_CONFIG_OFF_SECRET_ACCESS_KEY=...
#   RCLONE_CONFIG_OFF_REGION=auto
#   OFFSITE_BUCKET=...
set -euo pipefail
cd "$(dirname "$0")/.."

OUT=/srv/backups/fc
mkdir -p "$OUT"
FILE="$OUT/fcassist_$(date +%F).dump"

docker compose exec -T postgres pg_dump -U postgres -d fcassist --format=custom > "$FILE.part"
mv "$FILE.part" "$FILE"
echo "$(date '+%F %T') dump $(du -h "$FILE" | cut -f1) $FILE"

# only our own dated dumps, only older than 14 days
find "$OUT" -maxdepth 1 -name 'fcassist_*.dump' -mtime +13 -print -delete

if [ -f /srv/backups/offsite.env ]; then
  set -a; . /srv/backups/offsite.env; set +a
  ENV_ARGS=()
  for v in $(env | awk -F= '/^RCLONE_CONFIG_OFF_/ {print $1}'); do ENV_ARGS+=(-e "$v"); done
  docker run --rm "${ENV_ARGS[@]}" -v "$OUT:/data:ro" rclone/rclone:1.71.2 \
    copy /data "off:$OFFSITE_BUCKET/fcassist" --include 'fcassist_*.dump' --max-age 3d
  echo "$(date '+%F %T') off-site copy done"
fi
