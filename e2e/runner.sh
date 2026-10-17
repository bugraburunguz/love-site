#!/bin/bash
# Runs inside the Playwright container (see docker-compose.yml): installs the two tools the test needs, waits for the
# app, then runs smoke.py.
set -euo pipefail

apt-get update -qq > /dev/null
apt-get install -y -qq --no-install-recommends ffmpeg > /dev/null
pip install --quiet playwright==1.55.0

echo "waiting for the app at ${BASE_URL}"
for i in $(seq 1 90); do
  if python - <<'PY'
import os, sys, urllib.request
try:
    urllib.request.urlopen(os.environ["BASE_URL"] + "/actuator/health/readiness", timeout=3)
except Exception:
    sys.exit(1)
PY
  then
    break
  fi
  sleep 2
done

mkdir -p "${OUTPUT_DIR}"
exec python /e2e/smoke.py
