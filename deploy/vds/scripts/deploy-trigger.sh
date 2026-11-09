#!/usr/bin/env bash
# The only thing the GitHub Actions deploy key can do on this server. ~deploy/.ssh/authorized_keys pins that key to this
# script (command="...",restrict), so the key never gets a shell: the workflow's ssh command line arrives here as
# $SSH_ORIGINAL_COMMAND and must be exactly one of the targets below.
#
#   love         love-site (master)                 -> builds love-web (love-worker uses the same image)
#   fc-backend   FCarrierTacticBuilderBackend (main) -> builds fc-backend
#   fc-web       FCarrierTacticBuilderWeb (main)     -> builds fc-web
#
# Steps: pull (fast-forward only) -> build that one image -> `docker compose up -d` (restarts only what changed, also
# picks up compose.yml changes) -> wait until the site answers -> drop dangling images. One deploy at a time (flock);
# a second one waits for the first. Log: stdout, which the workflow shows.
set -euo pipefail
cd "$(dirname "$0")/.."

SRC_ROOT=${SRC_ROOT:-/srv/src}
LOCK_FILE=${LOCK_FILE:-/tmp/vds-deploy.lock}
HEALTH_TIMEOUT=${HEALTH_TIMEOUT:-240}

env_value() { awk -F= -v k="$1" '$1 == k {print $2}' .env; }

case "${SSH_ORIGINAL_COMMAND:-}" in
  love)
    repo=love-site; service=love-web
    health="https://$(env_value LOVE_DOMAIN)/actuator/health" ;;
  fc-backend)
    repo=FCarrierTacticBuilderBackend; service=fc-backend
    health="https://$(env_value FC_DOMAIN)/" ;;
  fc-web)
    repo=FCarrierTacticBuilderWeb; service=fc-web
    health="https://$(env_value FC_DOMAIN)/" ;;
  *)
    echo "unknown deploy target; allowed: love, fc-backend, fc-web" >&2
    exit 2 ;;
esac

exec 9> "$LOCK_FILE"
flock 9

echo "== $(date '+%F %T') deploy $SSH_ORIGINAL_COMMAND"
git -C "$SRC_ROOT/$repo" pull --ff-only
echo "== now at $(git -C "$SRC_ROOT/$repo" log -1 --format='%h %s' 2>/dev/null || true)"
docker compose build "$service"
docker compose up -d

echo "== waiting for $health"
deadline=$((SECONDS + HEALTH_TIMEOUT))
until curl -sf -o /dev/null --max-time 5 "$health"; do
  if [ $SECONDS -ge $deadline ]; then
    echo "not answering after ${HEALTH_TIMEOUT}s; last log lines:" >&2
    docker compose logs --tail 40 "$service" >&2 || true
    exit 1
  fi
  sleep 5
done

docker image prune -f > /dev/null
echo "== $(date '+%F %T') deploy $SSH_ORIGINAL_COMMAND done"
