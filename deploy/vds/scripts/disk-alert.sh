#!/usr/bin/env bash
# Warns when the server disk fills up (photos, database, images and build cache all share one disk).
# Logs to syslog (journalctl -t disk-alert) and, when NTFY_URL is set in the env file, sends a push notification through
# ntfy (free phone app: subscribe to the same topic). At most one notification per day while the disk stays full.
#
#   cron (deploy user):  */30 * * * * /srv/src/love-site/deploy/vds/scripts/disk-alert.sh >> /srv/backups/disk-alert.log 2>&1
#
# env file (default ~/.disk-alert.env, chmod 600):
#   NTFY_URL=https://ntfy.sh/<long-random-topic>
#
# Overrides: DISK_ALERT_THRESHOLD (percent, default 85), DISK_ALERT_PATH (default /), DISK_ALERT_ENV, DISK_ALERT_STATE.
set -euo pipefail

THRESHOLD="${DISK_ALERT_THRESHOLD:-85}"
CHECK_PATH="${DISK_ALERT_PATH:-/}"
ENV_FILE="${DISK_ALERT_ENV:-$HOME/.disk-alert.env}"
STATE="${DISK_ALERT_STATE:-$HOME/.disk-alert.last}"

NTFY_URL=""
if [[ -f "$ENV_FILE" ]]; then
  # shellcheck disable=SC1090
  source "$ENV_FILE"
fi

used=$(df --output=pcent "$CHECK_PATH" | tail -n 1 | tr -dc '0-9')
avail=$(df -h --output=avail "$CHECK_PATH" | tail -n 1 | tr -d ' ')
now=$(date '+%F %T')

if (( used < THRESHOLD )); then
  rm -f "$STATE"
  echo "$now ok: disk ${used}% used, ${avail} free"
  exit 0
fi

msg="Sunucu diski %${used} dolu (${avail} boş). Kontrol: df -h / && docker system df"
echo "$now DISK ALERT: $msg"
logger -t disk-alert "$msg" 2>/dev/null || true

today=$(date +%F)
if [[ -f "$STATE" && "$(cat "$STATE")" == "$today" ]]; then
  echo "$now already notified today"
  exit 0
fi

if [[ -n "$NTFY_URL" ]]; then
  if curl -fsS -m 15 -H "Title: Hatira Defterim disk uyarisi" -H "Priority: high" -d "$msg" "$NTFY_URL" > /dev/null; then
    echo "$today" > "$STATE"
    echo "$now notification sent"
  else
    echo "$now notification failed (will retry on the next run)"
  fi
else
  echo "$today" > "$STATE"
  echo "$now NTFY_URL not set, only logged"
fi
