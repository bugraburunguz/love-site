#!/usr/bin/env bash
# One-off, after `docker compose up -d garage`: gives the single node its storage role, creates love-site's bucket and
# key, and writes the key into love.env (S3_ACCESS_KEY_ID / S3_SECRET_ACCESS_KEY must be empty there). The secret is
# generated here and goes straight into the file; it is never printed. Safe to run again: existing parts are kept.
#
#   scripts/garage-init.sh            (GARAGE_CAPACITY=200G to announce a different size; default 100G)
set -euo pipefail
cd "$(dirname "$0")/.."

BUCKET=lovesite
KEY_NAME=love-site
g() { docker compose exec -T -e RUST_LOG=warn garage /garage "$@"; }

for _ in $(seq 1 30); do g status > /dev/null 2>&1 && break; sleep 1; done

NODE=$(g status 2>/dev/null | awk '/NO ROLE ASSIGNED/ {print $1; exit}')
if [ -n "$NODE" ]; then
  g layout assign -z dc1 -c "${GARAGE_CAPACITY:-100G}" "$NODE" > /dev/null
  g layout apply --version 1 > /dev/null
  echo "layout: node $NODE, ${GARAGE_CAPACITY:-100G}"
else
  echo "layout: already set"
fi

if g bucket info "$BUCKET" > /dev/null 2>&1; then
  echo "bucket $BUCKET: already there"
else
  g bucket create "$BUCKET" > /dev/null
  echo "bucket $BUCKET: created"
fi

if g key info "$KEY_NAME" > /dev/null 2>&1; then
  echo "key $KEY_NAME: already there (love.env left as it is)"
else
  grep -q '^S3_ACCESS_KEY_ID=$' love.env && grep -q '^S3_SECRET_ACCESS_KEY=$' love.env \
    || { echo "love.env: S3_ACCESS_KEY_ID= and S3_SECRET_ACCESS_KEY= must be there and empty" >&2; exit 2; }
  KEY_ID="GK$(openssl rand -hex 12)"
  SECRET="$(openssl rand -hex 32)"
  g key import --yes -n "$KEY_NAME" "$KEY_ID" "$SECRET" > /dev/null
  tmp=$(mktemp love.env.XXXXXX)
  awk -v id="$KEY_ID" -v sec="$SECRET" '
    /^S3_ACCESS_KEY_ID=$/ { print "S3_ACCESS_KEY_ID=" id; next }
    /^S3_SECRET_ACCESS_KEY=$/ { print "S3_SECRET_ACCESS_KEY=" sec; next }
    { print }' love.env > "$tmp"
  chmod 600 "$tmp"
  mv "$tmp" love.env
  unset SECRET
  echo "key $KEY_NAME: created, written to love.env"
fi

g bucket allow --read --write --owner "$BUCKET" --key "$KEY_NAME" > /dev/null
echo "key $KEY_NAME may read and write $BUCKET"
