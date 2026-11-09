#!/usr/bin/env bash
# Tests disk-alert.sh in a throwaway Ubuntu container (same OS as the server):
#   docker run --rm -v "$PWD/deploy/vds/scripts:/s:ro" ubuntu:24.04 bash /s/test-disk-alert.sh
set -uo pipefail

pass=0
fail=0
check() {
  if eval "$2"; then pass=$((pass + 1)); echo "ok   $1"; else fail=$((fail + 1)); echo "FAIL $1"; fi
}

work=$(mktemp -d)
mkdir -p "$work/bin"
# fake curl: records every call, succeeds unless CURL_FAIL is set
cat > "$work/bin/curl" <<'EOF'
#!/usr/bin/env bash
echo "$*" >> "$CURL_LOG"
[[ -z "${CURL_FAIL:-}" ]]
EOF
chmod +x "$work/bin/curl"
export PATH="$work/bin:$PATH" CURL_LOG="$work/curl.log" HOME="$work"
export DISK_ALERT_STATE="$work/state" DISK_ALERT_ENV="$work/alert.env"
run() { bash /s/disk-alert.sh > "$work/out" 2>&1; }

# below the threshold: nothing is sent, state is cleared
echo "old" > "$work/state"
DISK_ALERT_THRESHOLD=101 run
check "below threshold exits 0" "[[ $? -eq 0 ]]"
check "below threshold logs ok" "grep -q ' ok: disk' $work/out"
check "below threshold clears state" "[[ ! -f $work/state ]]"

# over the threshold without NTFY_URL: logged only, no curl
DISK_ALERT_THRESHOLD=0 run
check "alert without url logs" "grep -q 'DISK ALERT' $work/out"
check "alert without url does not call curl" "[[ ! -f $work/curl.log ]]"
rm -f "$work/state"

# over the threshold with NTFY_URL: one notification per day
echo 'NTFY_URL=https://ntfy.example/topic' > "$work/alert.env"
DISK_ALERT_THRESHOLD=0 run
check "alert sends one notification" "[[ \$(wc -l < $work/curl.log) -eq 1 ]]"
check "notification goes to NTFY_URL" "grep -q 'https://ntfy.example/topic' $work/curl.log"
DISK_ALERT_THRESHOLD=0 run
check "second run the same day does not resend" "[[ \$(wc -l < $work/curl.log) -eq 1 ]] && grep -q 'already notified' $work/out"

# a failed send is retried on the next run
rm -f "$work/state" "$work/curl.log"
CURL_FAIL=1 DISK_ALERT_THRESHOLD=0 run
check "failed send exits 0" "[[ $? -eq 0 ]]"
check "failed send leaves no state" "[[ ! -f $work/state ]]"
DISK_ALERT_THRESHOLD=0 run
check "retry after a failed send" "[[ \$(wc -l < $work/curl.log) -eq 2 ]]"

echo "$pass passed, $fail failed"
[[ $fail -eq 0 ]]
