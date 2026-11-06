#!/usr/bin/env bash
# Copies every object of love-site's Railway bucket into Garage (originals, variants, songs: nothing has to be
# reprocessed), then checks that every source object is in Garage with the same size. Run it once while the site is
# still on Railway (the long, bulk copy) and again during the switch (only what changed since).
#
#   read -rs SRC_S3_ACCESS_KEY_ID && read -rs SRC_S3_SECRET_ACCESS_KEY && export SRC_S3_ACCESS_KEY_ID SRC_S3_SECRET_ACCESS_KEY
#   SRC_S3_ENDPOINT=https://t3.storageapi.dev SRC_S3_BUCKET=<railway bucket name> scripts/migrate-bucket.sh
#   unset SRC_S3_ACCESS_KEY_ID SRC_S3_SECRET_ACCESS_KEY
#
# The destination is Garage inside the compose network, with the key garage-init.sh wrote into love.env. Keys reach the
# rclone container by name (-e VAR), never on a command line. Nothing is ever deleted on either side.
set -euo pipefail
cd "$(dirname "$0")/.."

: "${SRC_S3_ENDPOINT:?}" "${SRC_S3_BUCKET:?}" "${SRC_S3_ACCESS_KEY_ID:?}" "${SRC_S3_SECRET_ACCESS_KEY:?}"
DST_BUCKET=$(awk -F= '/^S3_BUCKET=/ {print $2}' love.env)
: "${DST_BUCKET:?S3_BUCKET missing in love.env}"

export RCLONE_CONFIG_SRC_TYPE=s3 RCLONE_CONFIG_SRC_PROVIDER=Other RCLONE_CONFIG_SRC_REGION="${SRC_S3_REGION:-auto}"
export RCLONE_CONFIG_SRC_ENDPOINT="$SRC_S3_ENDPOINT" RCLONE_CONFIG_SRC_FORCE_PATH_STYLE="${SRC_S3_PATH_STYLE:-false}"
export RCLONE_CONFIG_SRC_ACCESS_KEY_ID="$SRC_S3_ACCESS_KEY_ID" RCLONE_CONFIG_SRC_SECRET_ACCESS_KEY="$SRC_S3_SECRET_ACCESS_KEY"
export RCLONE_CONFIG_DST_TYPE=s3 RCLONE_CONFIG_DST_PROVIDER=Other RCLONE_CONFIG_DST_REGION=garage
export RCLONE_CONFIG_DST_ENDPOINT=http://garage:3900 RCLONE_CONFIG_DST_FORCE_PATH_STYLE=true RCLONE_CONFIG_DST_NO_CHECK_BUCKET=true
RCLONE_CONFIG_DST_ACCESS_KEY_ID=$(awk -F= '/^S3_ACCESS_KEY_ID=/ {print $2}' love.env)
RCLONE_CONFIG_DST_SECRET_ACCESS_KEY=$(awk -F= '/^S3_SECRET_ACCESS_KEY=/ {print $2}' love.env)
export RCLONE_CONFIG_DST_ACCESS_KEY_ID RCLONE_CONFIG_DST_SECRET_ACCESS_KEY

ENV_ARGS=()
for v in $(env | awk -F= '/^RCLONE_CONFIG_(SRC|DST)_/ {print $1}'); do ENV_ARGS+=(-e "$v"); done
rclone() { docker run --rm --network vds_default "${ENV_ARGS[@]}" rclone/rclone:1.71.2 "$@"; }

echo "1/2 copy src:$SRC_S3_BUCKET -> garage:$DST_BUCKET"
# --metadata keeps Content-Type and Cache-Control; an object that is already there with the same size and time is skipped
rclone copy "src:$SRC_S3_BUCKET" "dst:$DST_BUCKET" --metadata --transfers 8 --checkers 16 --fast-list --stats 30s --stats-one-line

echo "2/2 check: every source object is in Garage with the same size"
rclone check "src:$SRC_S3_BUCKET" "dst:$DST_BUCKET" --one-way --size-only --fast-list
echo "done"
