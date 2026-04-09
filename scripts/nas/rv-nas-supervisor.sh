#!/usr/bin/env bash
# rv-nas-supervisor.sh — RubikVault NAS Production Supervisor v1.0
set -uo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$REPO_ROOT"

source "$REPO_ROOT/tooling/env.sh" 2>/dev/null || true
source "$REPO_ROOT/scripts/nas/common.sh" 2>/dev/null || true

NAS_CONFIG="$REPO_ROOT/config/rv-nas.env"
[[ -f "$NAS_CONFIG" ]] && source "$NAS_CONFIG"

NAS_OPS_ROOT="/volume1/homes/neoboy/RepoOps/rubikvault-site"
NAS_STATUS_FILE="$NAS_OPS_ROOT/runtime/STATUS.json"
NAS_JOURNAL_DIR="$NAS_OPS_ROOT/runtime/journal"
NAS_LOG_DIR="$NAS_OPS_ROOT/runtime/logs"
NAS_LOCK_FILE="$NAS_OPS_ROOT/runtime/locks/rv-nas-supervisor.lock"
NAS_REPORTS_DIR="$NAS_OPS_ROOT/runtime/reports/supervisor"

STAMP="${STAMP:-$(date -u +%Y%m%dT%H%M%SZ)}"
LOG_FILE="$NAS_LOG_DIR/supervisor-$STAMP.log"
JOURNAL_FILE="$NAS_JOURNAL_DIR/$(date -u +%Y-%m-%d).ndjson"

SUPERVISOR_VERSION="1.0"
NODE_OPTS_LIGHT="${NODE_OPTS_LIGHT:---max-old-space-size=512}"
NODE_OPTS_MEDIUM="${NODE_OPTS_MEDIUM:---max-old-space-size=512}"
SWAP_ABORT_MB="${SWAP_ABORT_MB:-2700}"
RAM_MIN_MB="${RAM_MIN_MB:-200}"
DISK_MIN_GB="${DISK_MIN_GB:-2}"
STAGE_TIMEOUT_SHORT="${STAGE_TIMEOUT_SHORT:-90}"
STAGE_TIMEOUT_MEDIUM="${STAGE_TIMEOUT_MEDIUM:-180}"
STAGE_TIMEOUT_HEAVY="${STAGE_TIMEOUT_HEAVY:-360}"
STAGE_RETRY_WAIT_SEC="${STAGE_RETRY_WAIT_SEC:-30}"
INTER_STAGE_SLEEP_SEC="${INTER_STAGE_SLEEP_SEC:-5}"
MAC_HOST="${MAC_HOST:-}"
MAC_REPO_PATH="${MAC_REPO_PATH:-/Users/michaelpuchowezki/Dev/rubikvault-site}"
MAC_SSH_KEY="${MAC_SSH_KEY:-$HOME/.ssh/id_ed25519}"

declare -A ST
for s in preflight repo_sync eod_fetch stage1 stage2 stage4a stage3 reports; do
  ST[$s]="pending"
done
declare -A DUR

mkdir -p "$NAS_LOG_DIR" "$NAS_JOURNAL_DIR" "$NAS_OPS_ROOT/runtime/locks" "$NAS_REPORTS_DIR"
: > "$LOG_FILE"

log()      { echo "[$(date -u +%H:%M:%S)] $*" | tee -a "$LOG_FILE"; }
log_ok()   { log "OK   $*"; }
log_fail() { log "FAIL $*"; }
log_skip() { log "SKIP $*"; }
log_info() { log "INFO $*"; }

journal_event() {
  local event="$1"; shift
  python3 -c "
import json, sys
from datetime import datetime
d={'ts': datetime.utcnow().isoformat()+'Z', 'event': '$event', 'stamp': '$STAMP'}
d.update(dict(a.split('=',1) for a in sys.argv[1:] if '=' in a))
print(json.dumps(d))
" "$@" >> "$JOURNAL_FILE" 2>/dev/null || true
}

ram_available_mb() {
  python3 -c "
with open('/proc/meminfo') as f:
  for l in f:
    if l.startswith('MemAvailable'): print(int(l.split()[1])//1024); break
" 2>/dev/null || echo 9999
}

swap_used_mb() {
  python3 -c "
t=f=0
with open('/proc/meminfo') as fh:
  for l in fh:
    if l.startswith('SwapTotal'): t=int(l.split()[1])
    elif l.startswith('SwapFree'):  f=int(l.split()[1])
print((t-f)//1024)
" 2>/dev/null || echo 0
}

disk_free_gb() {
  python3 -c "
import os
s=os.statvfs('$REPO_ROOT')
print(int(s.f_bavail*s.f_frsize/1024**3))
" 2>/dev/null || echo 9999
}

write_status() {
  local overall="$1"
  local explanation="${2:-}"
  python3 - <<PY
import json, os
from datetime import datetime, timedelta

now = datetime.utcnow()
nxt = now.replace(hour=18, minute=0, second=0, microsecond=0)
if nxt <= now: nxt += timedelta(days=1)

stages = {
$(for s in preflight repo_sync eod_fetch stage1 stage2 stage4a stage3 reports; do
    echo "    '$s': {'status': '${ST[$s]}', 'duration_sec': ${DUR[$s]:-0}},";
done)
}

doc = {
    "schema":          "rv.nas.status.v1",
    "supervisor_version": "$SUPERVISOR_VERSION",
    "generated_at":    now.isoformat() + "Z",
    "stamp":           "$STAMP",
    "overall":         "$overall",
    "explanation":     "$explanation",
    "stages":          stages,
    "system": {
        "ram_available_mb": $(ram_available_mb),
        "swap_used_mb":     $(swap_used_mb),
        "disk_free_gb":     $(disk_free_gb),
    },
    "scheduled_next_run": nxt.isoformat() + "Z",
    "mac_primary_override": False,
    "repo_path": "$REPO_ROOT",
    "ops_path":  "$NAS_OPS_ROOT",
}

os.makedirs(os.path.dirname("$NAS_STATUS_FILE"), exist_ok=True)
with open("$NAS_STATUS_FILE", "w") as fh:
    json.dump(doc, fh, indent=2)
    fh.write("\n")
PY
}

run_stage() {
  local key="$1"
  local cmd="$2"
  local timeout_sec="${3:-$STAGE_TIMEOUT_MEDIUM}"
  local node_opts="${4:-$NODE_OPTS_LIGHT}"

  local ram; ram="$(ram_available_mb)"
  if (( ram < RAM_MIN_MB )); then
    log_skip "$key — RAM ${ram}MB < ${RAM_MIN_MB}MB"
    ST[$key]="skipped_ram"; DUR[$key]=0; return 1
  fi

  local swap; swap="$(swap_used_mb)"
  if (( swap > SWAP_ABORT_MB )); then
    log_skip "$key — swap ${swap}MB > ${SWAP_ABORT_MB}MB"
    ST[$key]="skipped_swap"; DUR[$key]=0; return 1
  fi

  log "START $key (timeout=${timeout_sec}s ram=${ram}MB swap=${swap}MB)"
  journal_event "stage_start" "key=$key"

  local t0; t0="$(python3 -c 'import time; print(int(time.time()*1000))')"
  local rc=0
  NODE_OPTIONS="$node_opts" nice -n 10 \
    timeout "$timeout_sec" bash -c "$cmd" >> "$LOG_FILE" 2>&1 || rc=$?

  local t1; t1="$(python3 -c 'import time; print(int(time.time()*1000))')"
  local dur; dur="$(python3 -c "print(round(($t1-$t0)/1000,1))")"
  DUR[$key]="$dur"

  if (( rc == 0 )); then
    log_ok "$key (${dur}s)"
    ST[$key]="ok"
    journal_event "stage_ok" "key=$key" "duration_sec=$dur"
    return 0
  fi

  log_fail "$key first attempt (${dur}s exit=$rc) — retrying in ${STAGE_RETRY_WAIT_SEC}s"
  sleep "$STAGE_RETRY_WAIT_SEC"
  local swap2; swap2="$(swap_used_mb)"
  if (( swap2 > SWAP_ABORT_MB )); then
    log_skip "$key retry aborted — swap still ${swap2}MB"
    ST[$key]="failed_swap"; return 1
  fi

  local rc2=0
  NODE_OPTIONS="$node_opts" nice -n 10 \
    timeout "$timeout_sec" bash -c "$cmd" >> "$LOG_FILE" 2>&1 || rc2=$?

  local t2; t2="$(python3 -c 'import time; print(int(time.time()*1000))')"
  local dur2; dur2="$(python3 -c "print(round(($t2-$t0)/1000,1))")"
  DUR[$key]="$dur2"

  if (( rc2 == 0 )); then
    log_ok "$key retry OK (${dur2}s total)"
    ST[$key]="ok_retry"
    journal_event "stage_ok_retry" "key=$key" "duration_sec=$dur2"
    return 0
  fi

  log_fail "$key FAILED after retry (exit=$rc2)"
  ST[$key]="failed"
  journal_event "stage_failed" "key=$key" "exit=$rc2" "duration_sec=$dur2"
  return 1
}

if [[ -f "$NAS_LOCK_FILE" ]]; then
  existing_pid="$(cat "$NAS_LOCK_FILE" 2>/dev/null || echo '')"
  if [[ -n "$existing_pid" ]] && kill -0 "$existing_pid" 2>/dev/null; then
    echo "supervisor_already_running pid=$existing_pid" >&2
    exit 90
  fi
  rm -f "$NAS_LOCK_FILE"
fi
echo $$ > "$NAS_LOCK_FILE"
trap 'rm -f "$NAS_LOCK_FILE"; write_status "${OVERALL:-UNKNOWN}" "Supervisor exited (trap)" 2>/dev/null || true' EXIT

log "═══════════════════════════════════════════════════════════"
log "rv-nas-supervisor v$SUPERVISOR_VERSION  stamp=$STAMP"
log "repo=$REPO_ROOT"
log "═══════════════════════════════════════════════════════════"
journal_event "supervisor_start" "version=$SUPERVISOR_VERSION"
write_status "RUNNING" "Supervisor gestartet"

RAM="$(ram_available_mb)"; SWAP="$(swap_used_mb)"; DISK="$(disk_free_gb)"
log_info "Preflight: RAM=${RAM}MB  SWAP=${SWAP}MB  DISK=${DISK}GB"

if (( RAM < RAM_MIN_MB )); then
  log_fail "Preflight ABORT — RAM ${RAM}MB < ${RAM_MIN_MB}MB minimum"
  ST[preflight]="failed_ram"; OVERALL="RED"
  write_status "RED" "Preflight: RAM kritisch ${RAM}MB"
  journal_event "preflight_abort" "reason=ram" "ram_mb=$RAM"
  exit 1
fi
if (( DISK < DISK_MIN_GB )); then
  log_fail "Preflight ABORT — Disk ${DISK}GB < ${DISK_MIN_GB}GB minimum"
  ST[preflight]="failed_disk"; OVERALL="RED"
  write_status "RED" "Preflight: Disk kritisch ${DISK}GB frei"
  journal_event "preflight_abort" "reason=disk" "disk_gb=$DISK"
  exit 1
fi
ST[preflight]="ok"; DUR[preflight]=0

if [[ -n "$MAC_HOST" ]]; then
  log_info "Repo sync from Mac ($MAC_HOST) ..."
  t0s="$(python3 -c 'import time; print(int(time.time()*1000))')"
  if ping -c 1 -W 2 "$MAC_HOST" > /dev/null 2>&1; then
    /usr/bin/rsync -a --protect-args \
      --rsync-path=/usr/bin/rsync \
      --exclude='.git/' --exclude='node_modules/' --exclude='tmp/' \
      --exclude='logs/' --exclude='.wrangler/' \
      -e "ssh -i $MAC_SSH_KEY" \
      "${MAC_HOST}:${MAC_REPO_PATH}/scripts/" "$REPO_ROOT/scripts/" \
      >> "$LOG_FILE" 2>&1 && \
    /usr/bin/rsync -a --protect-args \
      --rsync-path=/usr/bin/rsync \
      --exclude='.git/' --exclude='node_modules/' --exclude='tmp/' \
      --exclude='logs/' --exclude='.wrangler/' \
      -e "ssh -i $MAC_SSH_KEY" \
      "${MAC_HOST}:${MAC_REPO_PATH}/config/" "$REPO_ROOT/config/" \
      >> "$LOG_FILE" 2>&1 && ST[repo_sync]="ok" || ST[repo_sync]="failed"
  else
    ST[repo_sync]="skipped_mac_offline"
  fi
  t1s="$(python3 -c 'import time; print(int(time.time()*1000))')"
  DUR[repo_sync]="$(python3 -c "print(round(($t1s-$t0s)/1000,1))")"
else
  ST[repo_sync]="skipped_no_mac_host"; DUR[repo_sync]=0
fi

sleep "$INTER_STAGE_SLEEP_SEC"

EOD_SCRIPTS=(
  "scripts/generate-eod-market.mjs"
  "scripts/generate-eod-mirrors.mjs"
)
EOD_ANY_OK=false
for eod_script in "${EOD_SCRIPTS[@]}"; do
  if [[ -f "$REPO_ROOT/$eod_script" ]]; then
    run_stage "eod_fetch" "node $eod_script" "$STAGE_TIMEOUT_HEAVY" "$NODE_OPTS_MEDIUM" && EOD_ANY_OK=true || true
    break
  fi
done
if [[ "$EOD_ANY_OK" == false ]]; then
  [[ "${ST[eod_fetch]}" == "pending" ]] && ST[eod_fetch]="skipped_no_script" && DUR[eod_fetch]=0
fi

sleep "$INTER_STAGE_SLEEP_SEC"
run_stage "stage1" "node scripts/ops/build-safety-snapshot.mjs && node scripts/ops/build-mission-control-summary.mjs && node scripts/ops/build-ops-pulse.mjs" "$STAGE_TIMEOUT_SHORT" "$NODE_OPTS_LIGHT" || true
sleep "$INTER_STAGE_SLEEP_SEC"
run_stage "stage2" "node scripts/generate_meta_dashboard_data.mjs" "$STAGE_TIMEOUT_SHORT" "$NODE_OPTS_LIGHT" || true
sleep "$INTER_STAGE_SLEEP_SEC"
run_stage "stage4a" "node scripts/build-scientific-summary.mjs" "$STAGE_TIMEOUT_MEDIUM" "$NODE_OPTS_MEDIUM" || true
sleep 10
run_stage "stage3" "node scripts/ops/build-system-status-report.mjs" "$STAGE_TIMEOUT_HEAVY" "$NODE_OPTS_MEDIUM" || true
sleep "$INTER_STAGE_SLEEP_SEC"

log_info "Building benchmark reports ..."
ST[reports]="pending"
t0r="$(python3 -c 'import time; print(int(time.time()*1000))')"
(NODE_OPTIONS="$NODE_OPTS_LIGHT" npm run nas:benchmark:build) >> "$LOG_FILE" 2>&1 && \
(npm run nas:benchmark:publish) >> "$LOG_FILE" 2>&1 && \
(npm run nas:publish-docs) >> "$LOG_FILE" 2>&1 && \
ST[reports]="ok" || ST[reports]="partial"
t1r="$(python3 -c 'import time; print(int(time.time()*1000))')"
DUR[reports]="$(python3 -c "print(round(($t1r-$t0r)/1000,1))")"

s1="${ST[stage1]}"; s2="${ST[stage2]}"; s3="${ST[stage3]}"; s4="${ST[stage4a]}"
s1_ok=false; s2_ok=false; s3_ok=false; s4_ok=false
[[ "$s1" == ok* ]] && s1_ok=true
[[ "$s2" == ok* ]] && s2_ok=true
[[ "$s3" == ok* ]] && s3_ok=true
[[ "$s4" == ok* ]] && s4_ok=true

if $s1_ok && $s2_ok && ($s3_ok || $s4_ok); then
  OVERALL="GREEN"
  EXPLANATION="Alle Kernstufen OK. Stage1=${s1} Stage2=${s2} Stage3=${s3} Stage4a=${s4}"
elif $s1_ok && $s2_ok; then
  OVERALL="YELLOW"
  EXPLANATION="Operative Basis OK. Stage3=${s3} Stage4a=${s4} benoetigen Aufmerksamkeit."
elif $s1_ok || $s2_ok; then
  OVERALL="YELLOW"
  EXPLANATION="Teilweise OK. Stage1=${s1} Stage2=${s2}. Review noetig."
else
  OVERALL="RED"
  EXPLANATION="Stage1 und Stage2 fehlgeschlagen. Sofortiger Review erforderlich."
fi

write_status "$OVERALL" "$EXPLANATION"
journal_event "supervisor_done" "overall=$OVERALL" "s1=$s1" "s2=$s2" "s3=$s3" "s4a=$s4"
