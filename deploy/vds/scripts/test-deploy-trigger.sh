#!/usr/bin/env bash
# Tests for deploy-trigger.sh with stub git / docker / curl. Needs Linux (flock, setsid): run it in a container:
#
#   docker run --rm -v "$PWD/deploy/vds:/vds:ro" ubuntu:24.04 bash /vds/scripts/test-deploy-trigger.sh
set -uo pipefail

SRC_DIR=$(cd "$(dirname "$0")/.." && pwd)
WORK=$(mktemp -d)
trap 'rm -rf "$WORK"' EXIT
fails=0

# a copy of the stack folder with a minimal .env, and stubs that log every call
mkdir -p "$WORK/vds/scripts" "$WORK/bin" "$WORK/src" "$WORK/home"
cp "$SRC_DIR/scripts/deploy-trigger.sh" "$WORK/vds/scripts/" 2>/dev/null
printf 'LOVE_DOMAIN="love.test"\nFC_DOMAIN=fc.test\n' > "$WORK/vds/.env"
cat > "$WORK/bin/git" <<EOF
#!/bin/sh
echo "git \$*" >> "$WORK/calls"
case "\$*" in *"rev-parse HEAD"*) echo prev123 ;; esac
case "\$*" in *pull*) [ -n "\${FAIL_GIT:-}" ] && exit 1 ;; esac
exit 0
EOF
cat > "$WORK/bin/docker" <<EOF
#!/bin/sh
echo "docker \$*" >> "$WORK/calls"
# only the first build fails, so the rollback build succeeds
case "\$*" in "compose build"*) [ -n "\${FAIL_BUILD:-}" ] && [ ! -e "$WORK/built" ] && { touch "$WORK/built"; exit 1; } ;; esac
case "\$*" in *"exec -T fc-backend"*) [ -n "\${FAIL_HEALTH:-}" ] && exit 1 ;; esac
exit 0
EOF
cat > "$WORK/bin/curl" <<EOF
#!/bin/sh
echo "curl \$*" >> "$WORK/calls"
[ -n "\${FAIL_HEALTH:-}" ] && exit 1
exit 0
EOF
chmod +x "$WORK/bin/git" "$WORK/bin/docker" "$WORK/bin/curl"

run() { # run <SSH_ORIGINAL_COMMAND>; sets $status and $calls
  : > "$WORK/calls"
  rm -f "$WORK/built"
  SSH_ORIGINAL_COMMAND="$1" PATH="$WORK/bin:$PATH" HOME="$WORK/home" SRC_ROOT="$WORK/src" HEALTH_TIMEOUT=2 \
    bash "$WORK/vds/scripts/deploy-trigger.sh" > "$WORK/out" 2>&1
  status=$?
  calls=$(cat "$WORK/calls")
}
check() { # check <name> <condition result 0/1>
  if [ "$2" = 0 ]; then echo "ok   $1"; else echo "FAIL $1"; sed 's/^/     /' "$WORK/out"; echo "     calls:"; sed 's/^/     /' "$WORK/calls"; fails=$((fails + 1)); fi
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
  && grep -q "curl .*https://love.test/actuator/health" <<< "$calls" \
  && grep -q "deploy love done" "$WORK/out"
check "love: pulls love-site, builds love-web, applies the stack, checks health (quoted .env value), streams the log" $?

run fc-backend
[ "$status" = 0 ] \
  && grep -qx "git -C $WORK/src/FCarrierTacticBuilderBackend pull --ff-only" <<< "$calls" \
  && grep -qx "docker compose build fc-backend" <<< "$calls" \
  && grep -qx "docker compose up -d --no-deps fc-backend" <<< "$calls" \
  && grep -q "docker compose exec -T fc-backend curl -sf .*localhost:8080/actuator/health" <<< "$calls" \
  && ! grep -q "build love-web" <<< "$calls"
check "fc-backend: builds and restarts only fc-backend, checks the backend itself" $?

run fc-web
[ "$status" = 0 ] \
  && grep -qx "git -C $WORK/src/FCarrierTacticBuilderWeb pull --ff-only" <<< "$calls" \
  && grep -qx "docker compose build fc-web" <<< "$calls" \
  && grep -qx "docker compose up -d --no-deps fc-web" <<< "$calls" \
  && grep -q "curl .*https://fc.test/" <<< "$calls"
check "fc-web: builds and restarts only fc-web, checks the site" $?

FAIL_GIT=1 run love
[ "$status" != 0 ] && ! grep -q "^docker" <<< "$calls"; check "a failed pull stops before any build" $?

FAIL_BUILD=1 run love
[ "$status" = 1 ] \
  && grep -qx "git -C $WORK/src/love-site reset --hard prev123" <<< "$calls" \
  && [ "$(grep -c '^docker compose up' <<< "$calls")" = 0 ]
check "a failed build goes back to the previous commit and restarts nothing (the old image keeps running)" $?

FAIL_HEALTH=1 run fc-backend
[ "$status" = 1 ] \
  && grep -qx "git -C $WORK/src/FCarrierTacticBuilderBackend reset --hard prev123" <<< "$calls" \
  && [ "$(grep -c '^docker compose build fc-backend' <<< "$calls")" = 2 ] \
  && [ "$(grep -c '^docker compose up -d --no-deps fc-backend' <<< "$calls")" = 2 ]
check "a failed health check rebuilds and restarts the previous commit" $?

printf 'LOVE_DOMAIN=\nFC_DOMAIN=fc.test\n' > "$WORK/vds/.env"
run love
[ "$status" = 2 ] && [ -z "$calls" ]; check "an empty domain in .env stops before pulling" $?

[ $fails = 0 ] && echo "all passed" || { echo "$fails failed"; exit 1; }
