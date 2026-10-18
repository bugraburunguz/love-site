#!/bin/bash
# Builds the production image, starts it with Postgres and an S3 stand-in, runs the browser smoke test and tears
# everything down. Needs Docker with the compose plugin. Exit code 0 = the whole journey worked.
#
#   ./e2e/run.sh            run once, remove the containers afterwards
#   KEEP=1 ./e2e/run.sh     leave the stack running (app on http://localhost:18081) for a look around
set -uo pipefail
cd "$(dirname "$0")"

compose() { MSYS_NO_PATHCONV=1 docker compose -f docker-compose.yml "$@"; }

compose up -d --build app worker || { compose logs app worker | tail -40; exit 1; }
compose --profile run run --rm runner
status=$?

if [ $status -ne 0 ]; then
  echo "--- app log (last lines) ---"
  compose logs --no-color --tail 60 app
  echo "--- worker log (last lines) ---"
  compose logs --no-color --tail 80 worker
fi
if [ -z "${KEEP:-}" ]; then
  compose --profile run down -v --remove-orphans > /dev/null 2>&1
fi
exit $status
