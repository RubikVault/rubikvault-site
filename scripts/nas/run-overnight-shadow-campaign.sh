#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
source "$ROOT/scripts/nas/common.sh"
CAMPAIGN_STAMP="${CAMPAIGN_STAMP:-$(date -u +%Y%m%dT%H%M%SZ)}"
CAMPAIGN_DIR="$ROOT/tmp/nas-campaigns/$CAMPAIGN_STAMP"
CAMPAIGN_LOG="$CAMPAIGN_DIR/campaign.log"
STATUS_JSON="$CAMPAIGN_DIR/status.json"
MAX_CYCLES="${MAX_CYCLES:-24}"
END_LOCAL_HOUR="${END_LOCAL_HOUR:-7}"
END_LOCAL_MINUTE="${END_LOCAL_MINUTE:-0}"
SLEEP_BETWEEN_JOBS_SEC="${SLEEP_BETWEEN_JOBS_SEC:-30}"
SLEEP_BETWEEN_CYCLES_SEC="${SLEEP_BETWEEN_CYCLES_SEC:-180}"
SLOW_JOB_EVERY_N_CYCLES="${SLOW_JOB_EVERY_N_CYCLES:-3}"
RETENTION_KEEP_LOCAL_RUNS_PER_STAGE="${RETENTION_KEEP_LOCAL_RUNS_PER_STAGE:-1}"
RETENTION_TRIM_LOCAL_AFTER_ARCHIVE="${RETENTION_TRIM_LOCAL_AFTER_ARCHIVE:-1}"
LOCK_DIR="$ROOT/tmp/nas-locks/nas-overnight-campaign.lock"
BASE_JOBS=(
  "nas:shadow:stage1"
  "nas:shadow:stage2"
  "nas:shadow:stage3"
  "nas:shadow:stage4:scientific-summary"
)
SLOW_JOBS=(
  "nas:shadow:stage4:daily-audit"
  "nas:shadow:stage4:cutover-readiness"
)
# best_setups_v4 is permanently excluded: requires 1438 MB RAM, NAS has ~550 MB,
# 0/6 runs ever succeeded, and each failure exits non-zero killing the whole campaign.
LOCK_RETRY_MAX="${LOCK_RETRY_MAX:-4}"

mkdir -p "$CAMPAIGN_DIR" "$ROOT/tmp/nas-locks"
if ! mkdir "$LOCK_DIR" 2>/dev/null; then
  echo "campaign_lock_busy=$LOCK_DIR" >&2
  exit 90
fi
trap 'rm -rf "$LOCK_DIR"' EXIT

python3 - "$STATUS_JSON" "$CAMPAIGN_STAMP" "$END_LOCAL_HOUR" "$END_LOCAL_MINUTE" <<'PY'
import json, os, sys
from datetime import datetime, timedelta

status_path, stamp, hh, mm = sys.argv[1:5]
now = datetime.now().astimezone()
end = now.replace(hour=int(hh), minute=int(mm), second=0, microsecond=0)
if end <= now:
    end = end + timedelta(days=1)
doc = {
    "schema_version": "nas.overnight.campaign.status.v1",
    "campaign_stamp": stamp,
    "started_at": now.isoformat(),
    "target_end_local": end.isoformat(),
    "cycles_completed": 0,
    "last_job": None,
    "last_status": "running",
}
os.makedirs(os.path.dirname(status_path), exist_ok=True)
with open(status_path, "w", encoding="utf-8") as fh:
    json.dump(doc, fh, indent=2)
    fh.write("\n")
PY

{
  echo "campaign_stamp=$CAMPAIGN_STAMP"
  echo "max_cycles=$MAX_CYCLES"
  echo "end_local_hour=$END_LOCAL_HOUR"
  echo "end_local_minute=$END_LOCAL_MINUTE"
  echo "sleep_between_jobs_sec=$SLEEP_BETWEEN_JOBS_SEC"
  echo "sleep_between_cycles_sec=$SLEEP_BETWEEN_CYCLES_SEC"
  echo "slow_job_every_n_cycles=$SLOW_JOB_EVERY_N_CYCLES"
  echo "retention_keep_local_runs_per_stage=$RETENTION_KEEP_LOCAL_RUNS_PER_STAGE"
  echo "retention_trim_local_after_archive=$RETENTION_TRIM_LOCAL_AFTER_ARCHIVE"
} > "$CAMPAIGN_LOG"

if ! (cd "$ROOT" && npm run nas:validate) >> "$CAMPAIGN_LOG" 2>&1; then
  python3 - "$STATUS_JSON" <<'PY'
import json, sys
status_path = sys.argv[1]
with open(status_path, "r", encoding="utf-8") as fh:
    doc = json.load(fh)
doc["last_status"] = "failed_preflight"
doc["last_job"] = "nas:validate"
with open(status_path, "w", encoding="utf-8") as fh:
    json.dump(doc, fh, indent=2)
    fh.write("\n")
PY
  exit 1
fi

cycle=0
while true; do
  should_continue="$(python3 - "$STATUS_JSON" "$MAX_CYCLES" "$cycle" <<'PY'
import json, sys
from datetime import datetime

status_path, max_cycles, current_cycle = sys.argv[1:4]
with open(status_path, "r", encoding="utf-8") as fh:
    doc = json.load(fh)
end = datetime.fromisoformat(doc["target_end_local"])
now = datetime.now().astimezone()
ok = now < end and int(current_cycle) < int(max_cycles)
print("yes" if ok else "no")
PY
)"
  [[ "$should_continue" == "yes" ]] || break

  cycle=$((cycle + 1))
  printf 'cycle=%s start=%s\n' "$cycle" "$(date -u +%Y-%m-%dT%H:%M:%SZ)" >> "$CAMPAIGN_LOG"

  JOBS=("${BASE_JOBS[@]}")
  if (( cycle % SLOW_JOB_EVERY_N_CYCLES == 0 )); then
    JOBS+=("${SLOW_JOBS[@]}")
  fi

  for job in "${JOBS[@]}"; do
    attempt=0
    job_status=0
    while true; do
      attempt=$((attempt + 1))
      printf 'job=%s attempt=%s start=%s\n' "$job" "$attempt" "$(date -u +%Y-%m-%dT%H:%M:%SZ)" >> "$CAMPAIGN_LOG"
      set +e
      (cd "$ROOT" && npm run "$job") >> "$CAMPAIGN_LOG" 2>&1
      job_status="$?"
      set -e
      if [[ "$job_status" -eq 0 ]]; then
        break
      fi
      if [[ "$job_status" -eq 90 || "$job_status" -eq 91 ]]; then
        printf 'job=%s lock_retry=%s status=%s\n' "$job" "$attempt" "$job_status" >> "$CAMPAIGN_LOG"
        if (( attempt < LOCK_RETRY_MAX )); then
          sleep "$SLEEP_BETWEEN_JOBS_SEC"
          continue
        fi
      fi
      break
    done
    if [[ "$job_status" -ne 0 ]]; then
      python3 - "$STATUS_JSON" "$job" "$cycle" <<'PY'
import json, sys
status_path, job, cycle = sys.argv[1:4]
with open(status_path, "r", encoding="utf-8") as fh:
    doc = json.load(fh)
doc["cycles_completed"] = int(cycle) - 1
doc["last_job"] = job
doc["last_status"] = "failed"
with open(status_path, "w", encoding="utf-8") as fh:
    json.dump(doc, fh, indent=2)
    fh.write("\n")
PY
      exit 1
    fi
    python3 - "$STATUS_JSON" "$job" "$cycle" <<'PY'
import json, sys
status_path, job, cycle = sys.argv[1:4]
with open(status_path, "r", encoding="utf-8") as fh:
    doc = json.load(fh)
doc["cycles_completed"] = int(cycle)
doc["last_job"] = job
doc["last_status"] = "running"
with open(status_path, "w", encoding="utf-8") as fh:
    json.dump(doc, fh, indent=2)
    fh.write("\n")
PY
    sleep "$SLEEP_BETWEEN_JOBS_SEC"
  done
  (
    cd "$ROOT"
    KEEP_LOCAL_RUNS_PER_STAGE="$RETENTION_KEEP_LOCAL_RUNS_PER_STAGE" \
    TRIM_LOCAL_AFTER_ARCHIVE="$RETENTION_TRIM_LOCAL_AFTER_ARCHIVE" \
    npm run nas:retention
  ) >> "$CAMPAIGN_LOG" 2>&1 || true
  sleep "$SLEEP_BETWEEN_CYCLES_SEC"
done

cd "$ROOT"
npm run nas:benchmark:build >> "$CAMPAIGN_LOG" 2>&1 || true
npm run nas:benchmark:publish >> "$CAMPAIGN_LOG" 2>&1 || true
npm run nas:publish-docs >> "$CAMPAIGN_LOG" 2>&1 || true

python3 - "$STATUS_JSON" <<'PY'
import json, sys
from datetime import datetime
status_path = sys.argv[1]
with open(status_path, "r", encoding="utf-8") as fh:
    doc = json.load(fh)
doc["finished_at"] = datetime.now().astimezone().isoformat()
if doc.get("last_status") != "failed":
    doc["last_status"] = "completed"
with open(status_path, "w", encoding="utf-8") as fh:
    json.dump(doc, fh, indent=2)
    fh.write("\n")
PY

printf 'finished=%s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" >> "$CAMPAIGN_LOG"
printf '%s\n' "$CAMPAIGN_DIR"
