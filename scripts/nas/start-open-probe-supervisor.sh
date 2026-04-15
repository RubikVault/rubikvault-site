#!/usr/bin/env bash
set -euo pipefail

source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/common.sh"

REMOTE_REPO="/volume1/homes/neoboy/Dev/rubikvault-site"
REMOTE_OPS="$NAS_ROOT"
SUPERVISOR_STAMP="${SUPERVISOR_STAMP:-$(timestamp_utc)}"
END_LOCAL_DATE="${END_LOCAL_DATE:-$(python3 - <<'PY'
from datetime import datetime, timedelta
print((datetime.now().astimezone() + timedelta(days=1)).strftime("%Y-%m-%d"))
PY
)}"
END_LOCAL_HOUR="${END_LOCAL_HOUR:-23}"
END_LOCAL_MINUTE="${END_LOCAL_MINUTE:-0}"
CHECK_INTERVAL_SEC="${CHECK_INTERVAL_SEC:-1800}"
STALE_THRESHOLD_SEC="${STALE_THRESHOLD_SEC:-2700}"
RUN_WATCHDOG_EACH_CYCLE="${RUN_WATCHDOG_EACH_CYCLE:-1}"
MAX_CYCLES="${MAX_CYCLES:-480}"
SLEEP_BETWEEN_PROBES_SEC="${SLEEP_BETWEEN_PROBES_SEC:-15}"
SLEEP_BETWEEN_CYCLES_SEC="${SLEEP_BETWEEN_CYCLES_SEC:-120}"
PROBE_PLAN_VERSION="${PROBE_PLAN_VERSION:-2026-04-13a}"

bash "$ROOT/scripts/nas/deploy-native-matrix-to-nas.sh" >/dev/null

existing_supervisor="$(remote_shell "python3 - '$REMOTE_OPS' '$PROBE_PLAN_VERSION' <<'PY'
import glob
import json
import os
import subprocess
import sys
from datetime import datetime

ops_root = sys.argv[1]
expected_plan = sys.argv[2]
root = os.path.join(ops_root, 'runtime', 'open-probes', 'supervisors')
files = glob.glob(os.path.join(root, '*', 'status.json'))
now = datetime.now().astimezone()
best = None
for path in files:
    try:
        doc = json.load(open(path, 'r', encoding='utf-8'))
    except Exception:
        continue
    if str(doc.get('probe_plan_version') or '') != expected_plan:
        continue
    phase = str(doc.get('phase') or '')
    target_end = doc.get('target_end_local')
    stamp = doc.get('supervisor_stamp') or os.path.basename(os.path.dirname(path))
    pid = str(doc.get('current_pid') or '').strip()
    if phase != 'monitoring' or not target_end or not pid:
        continue
    try:
        end = datetime.fromisoformat(target_end)
    except Exception:
        continue
    if end <= now:
        continue
    alive = subprocess.call(['kill', '-0', pid], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL) == 0
    if not alive:
        continue
    candidate = (end.isoformat(), stamp)
    if best is None or candidate > best:
        best = candidate
print(best[1] if best else '')
PY")"

if [[ -n "$existing_supervisor" ]]; then
  printf '%s\n' "$existing_supervisor"
  exit 0
fi

remote_shell "mkdir -p '$REMOTE_OPS/runtime/open-probes/launch'"
remote_shell "python3 - '$REMOTE_REPO' '$REMOTE_OPS' '$SUPERVISOR_STAMP' '$END_LOCAL_DATE' '$END_LOCAL_HOUR' '$END_LOCAL_MINUTE' '$CHECK_INTERVAL_SEC' '$STALE_THRESHOLD_SEC' '$RUN_WATCHDOG_EACH_CYCLE' '$MAX_CYCLES' '$SLEEP_BETWEEN_PROBES_SEC' '$SLEEP_BETWEEN_CYCLES_SEC' '$PROBE_PLAN_VERSION' <<'PY'
import os
import subprocess
import sys

repo_root, ops_root, stamp, end_date, end_hour, end_minute, check_interval, stale_threshold, run_watchdog, max_cycles, sleep_probes, sleep_cycles, plan_version = sys.argv[1:14]
launch_dir = os.path.join(ops_root, 'runtime', 'open-probes', 'launch')
os.makedirs(launch_dir, exist_ok=True)
log_path = os.path.join(launch_dir, f'open-probe-supervisor-{stamp}.log')
pid_path = os.path.join(launch_dir, f'open-probe-supervisor-{stamp}.pid')
env = os.environ.copy()
env.update({
    'OPS_ROOT': ops_root,
    'SUPERVISOR_STAMP': stamp,
    'END_LOCAL_DATE': end_date,
    'END_LOCAL_HOUR': end_hour,
    'END_LOCAL_MINUTE': end_minute,
    'CHECK_INTERVAL_SEC': check_interval,
    'STALE_THRESHOLD_SEC': stale_threshold,
    'RUN_WATCHDOG_EACH_CYCLE': run_watchdog,
    'MAX_CYCLES': max_cycles,
    'SLEEP_BETWEEN_PROBES_SEC': sleep_probes,
    'SLEEP_BETWEEN_CYCLES_SEC': sleep_cycles,
    'PROBE_PLAN_VERSION': plan_version,
})
with open(log_path, 'ab', buffering=0) as log_fh, open(os.devnull, 'rb') as devnull:
    proc = subprocess.Popen(
        ['bash', 'scripts/nas/run-open-probe-supervisor.sh'],
        cwd=repo_root,
        env=env,
        stdin=devnull,
        stdout=log_fh,
        stderr=subprocess.STDOUT,
        start_new_session=True,
        close_fds=True,
    )
with open(pid_path, 'w', encoding='utf-8') as fh:
    fh.write(str(proc.pid) + '\n')
PY"

printf '%s\n' "$SUPERVISOR_STAMP"
