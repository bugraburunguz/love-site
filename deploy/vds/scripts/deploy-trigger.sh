#!/usr/bin/env bash
# The only thing the GitHub Actions deploy key can do on this server. ~deploy/.ssh/authorized_keys pins that key to this
# script (command="...",restrict), so the key never gets a shell: the workflow's ssh command line arrives here as
# $SSH_ORIGINAL_COMMAND and must be exactly one of the targets below.
#
#   love         love-site (master)                 -> builds love-web (love-worker uses the same image), applies the
#                                                       whole stack (compose.yml and the Caddyfile live in this repo)
#   fc-backend   FCarrierTacticBuilderBackend (main) -> builds and restarts fc-backend only
#   fc-web       FCarrierTacticBuilderWeb (main)     -> builds and restarts fc-web only
#
# pull (fast-forward only) -> build -> up -> wait until healthy. A failed build goes back to the previous commit and
# restarts nothing (the old image keeps running); a failed health check goes back, rebuilds and restarts the previous
# commit. Either way the job fails, so the Actions run shows it.
#
# The deploy itself runs detached from the SSH connection (its own session, log in ~/deploy-logs) and the log is
# streamed back: a dropped connection or a cancelled job never stops it halfway. One deploy at a time (flock).
set -euo pipefail
cd "$(dirname "$0")/.."

SRC_ROOT=${SRC_ROOT:-/srv/src}
HEALTH_TIMEOUT=${HEALTH_TIMEOUT:-240}
LOG_DIR="$HOME/deploy-logs"

# value of KEY in .env, without surrounding quotes
env_value() { awk -v k="$1" 'index($0, k "=") == 1 { v = substr($0, length(k) + 2); gsub(/^["\047]|["\047]$/, "", v); print v; exit }' .env; }

target=${SSH_ORIGINAL_COMMAND:-}
case "$target" in
  love)
    repo=love-site; service=love-web; up=(up -d); domain=$(env_value LOVE_DOMAIN); reload_caddy=1 ;;
  fc-backend)
    repo=FCarrierTacticBuilderBackend; service=fc-backend; up=(up -d --no-deps fc-backend); domain=$(env_value FC_DOMAIN) ;;
  fc-web)
    repo=FCarrierTacticBuilderWeb; service=fc-web; up=(up -d --no-deps fc-web); domain=$(env_value FC_DOMAIN) ;;
  *)
    echo "unknown deploy target; allowed: love, fc-backend, fc-web" >&2
    exit 2 ;;
esac
[ -n "$domain" ] || { echo ".env has no domain for $target, nothing done" >&2; exit 2; }

if [ -z "${DEPLOY_DETACHED:-}" ]; then
  mkdir -p "$LOG_DIR"
  log="$LOG_DIR/$(date +%Y%m%d-%H%M%S)-$target.log"
  DEPLOY_DETACHED=1 setsid bash "$0" > "$log" 2>&1 < /dev/null &
  pid=$!
  tail -n +1 --pid="$pid" -f "$log" || true
  status=0
  wait "$pid" || status=$?
  # keep the last 30 logs
  ls -1t "$LOG_DIR"/*.log 2>/dev/null | tail -n +31 | xargs -r rm -f
  exit $status
fi

healthy() {
  if [ "$service" = fc-backend ]; then
    # the web container answers / by itself; only the backend's own health endpoint proves the backend is up
    docker compose exec -T fc-backend curl -sf -o /dev/null --max-time 5 http://localhost:8080/actuator/health
  elif [ "$service" = love-web ]; then
    curl -sf -o /dev/null --max-time 5 "https://$domain/actuator/health"
  else
    curl -sf -o /dev/null --max-time 5 "https://$domain/"
  fi
}
wait_healthy() {
  local deadline=$((SECONDS + HEALTH_TIMEOUT))
  until healthy; do
    [ $SECONDS -ge $deadline ] && return 1
    sleep 5
  done
}

# love-site carries the Caddyfile: `up -d` never restarts a running Caddy for a changed file, so it is reloaded (graceful,
# no dropped connections). A Caddyfile Caddy refuses leaves the config it runs untouched.
caddy_reload() {
  [ -n "${reload_caddy:-}" ] || return 0
  docker compose exec -T caddy caddy reload --config /etc/caddy/Caddyfile --adapter caddyfile
}

exec 9> "$HOME/.vds-deploy.lock"
if ! flock -n 9; then
  echo "== waiting for another deploy to finish"
  flock -w 3600 9 || { echo "another deploy has been running for an hour, giving up" >&2; exit 1; }
fi

dir="$SRC_ROOT/$repo"
echo "== $(date '+%F %T') deploy $target"
prev=$(git -C "$dir" rev-parse HEAD)
git -C "$dir" pull --ff-only
echo "== now at $(git -C "$dir" log -1 --format='%h %s' 2>/dev/null || true)"

if ! docker compose build "$service"; then
  echo "== build failed: back to $prev, nothing was restarted" >&2
  git -C "$dir" reset --hard "$prev"
  exit 1
fi
echo "== waiting for $service"
if ! docker compose "${up[@]}" || ! wait_healthy; then
  echo "== $service did not start or is not healthy after ${HEALTH_TIMEOUT}s; last log lines:" >&2
  docker compose logs --tail 40 "$service" >&2 || true
  echo "== going back to $prev" >&2
  git -C "$dir" reset --hard "$prev"
  docker compose build "$service" && docker compose "${up[@]}" && wait_healthy && caddy_reload \
    && echo "== previous version is back up" >&2 \
    || echo "== previous version did not come back either: the site needs a look" >&2
  exit 1
fi

if ! caddy_reload; then
  echo "== Caddy refused the Caddyfile of this commit; Caddy keeps the config it was running (the app is up)" >&2
  exit 1
fi

docker image prune -f > /dev/null
echo "== $(date '+%F %T') deploy $target done"
