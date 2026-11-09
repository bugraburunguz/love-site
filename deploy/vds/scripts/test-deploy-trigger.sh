#!/usr/bin/env bash
# Tests for deploy-trigger.sh with stub git / docker / curl. Needs Linux (flock): run it in a container:
#
#   docker run --rm -v "$PWD/deploy/vds:/vds:ro" ubuntu:24.04 bash /vds/scripts/test-deploy-trigger.sh
set -uo pipefail

SRC_DIR=$(cd "$(dirname "$0")/.." && pwd)
WORK=$(mktemp -d)
trap 'rm -rf "$WORK"' EXIT
fails=0

# a copy of the stack folder with a minimal .env, and stubs that log every call
mkdir -p "$WORK/vds/scripts" "$WORK/bin" "$WORK/src"
cp "$SRC_DIR/scripts/deploy-trigger.sh" "$WORK/vds/scripts/" 2>/dev/null
printf 'LOVE_DOMAIN=love.test\nFC_DOMAIN=fc.test\n' > "$WORK/vds/.env"
for tool in git docker curl; do
  cat > "$WORK/bin/$tool" <<EOF
#!/bin/sh
echo "$tool \$*" >> "$WORK/calls"
[ "$tool" = git ] && [ -n "\${FAIL_GIT:-}" ] && exit 1
exit 0
EOF
  chmod +x "$WORK/bin/$tool"
done

run() { # run <SSH_ORIGINAL_COMMAND>; sets $status and $calls
  : > "$WORK/calls"
  SSH_ORIGINAL_COMMAND="$1" PATH="$WORK/bin:$PATH" SRC_ROOT="$WORK/src" LOCK_FILE="$WORK/lock" HEALTH_TIMEOUT=2 \
    bash "$WORK/vds/scripts/deploy-trigger.sh" > "$WORK/out" 2>&1
  status=$?
  calls=$(cat "$WORK/calls")
}
check() { # check <name> <condition result 0/1>
  if [ "$2" = 0 ]; then echo "ok   $1"; else echo "FAIL $1"; sed 's/^/     /' "$WORK/out"; fails=$((fails + 1)); fi
}

for bad in "" "rm -rf /" "love; id" "love && id" "../love" "LOVE" "fc-backend extra"; do
  run "$bad"
  [ "$status" = 2 ] && [ -z "$calls" ]; check "rejects '$bad' without running anything" $?
done

run love
[ "$status" = 0 ] \
  && grep -qx "git -C $WORK/src/love-site pull --ff-only" <<< "$calls" \
  && grep -qx "docker compose build love-web" <<< "$calls" \
  && grep -qx "docker compose up -d" <<< "$calls" \
  && grep -q "curl .*https://love.test/actuator/health" <<< "$calls"
check "love: pulls love-site, builds love-web, applies the stack, checks health" $?

run fc-backend
[ "$status" = 0 ] \
  && grep -qx "git -C $WORK/src/FCarrierTacticBuilderBackend pull --ff-only" <<< "$calls" \
  && grep -qx "docker compose build fc-backend" <<< "$calls" \
  && ! grep -q "build love-web" <<< "$calls"
check "fc-backend: pulls the backend repo and builds only fc-backend" $?

run fc-web
[ "$status" = 0 ] \
  && grep -qx "git -C $WORK/src/FCarrierTacticBuilderWeb pull --ff-only" <<< "$calls" \
  && grep -qx "docker compose build fc-web" <<< "$calls" \
  && grep -q "curl .*https://fc.test/" <<< "$calls"
check "fc-web: pulls the web repo, builds only fc-web, checks the site" $?

FAIL_GIT=1 run love
[ "$status" != 0 ] && ! grep -q "^docker" <<< "$calls"; check "a failed pull stops before any build" $?

[ $fails = 0 ] && echo "all passed" || { echo "$fails failed"; exit 1; }
