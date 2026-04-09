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
END_LOCAL_HOUR="${END_LOCAL_HOUR:-20}"
END_LOCAL_MINUTE="${END_LOCAL_MINUTE:-0}"
CHECK_INTERVAL_SEC="${CHECK_INTERVAL_SEC:-600}"
STALE_THRESHOLD_SEC="${STALE_THRESHOLD_SEC:-1800}"
RUN_WATCHDOG_EACH_CYCLE="${RUN_WATCHDOG_EACH_CYCLE:-0}"

bash "$ROOT/scripts/nas/deploy-native-matrix-to-nas.sh" >/dev/null

existing_supervisor="$(remote_shell "python3 - '$REMOTE_OPS' <<'PY'
import glob
import json
import os
import subprocess
import sys
from datetime import datetime

ops_root = sys.argv[1]
root = os.path.join(ops_root, 'runtime', 'native-matrix', 'supervisors')
files = glob.glob(os.path.join(root, '*', 'status.json'))
now = datetime.now().astimezone()
best = None
for path in files:
    try:
        doc = json.load(open(path, 'r', encoding='utf-8'))
    except Exception:
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

remote_shell "mkdir -p '$REMOTE_OPS/runtime/native-matrix/launch'"
remote_shell "python3 - '$REMOTE_REPO' '$REMOTE_OPS' '$SUPERVISOR_STAMP' '$END_LOCAL_DATE' '$END_LOCAL_HOUR' '$END_LOCAL_MINUTE' <<'PY'
import os
import subprocess
import sys

repo_root, ops_root, stamp, end_date, end_hour, end_minute = sys.argv[1:7]
launch_dir = os.path.join(ops_root, 'runtime', 'native-matrix', 'launch')
os.makedirs(launch_dir, exist_ok=True)
log_path = os.path.join(launch_dir, f'supervisor-{stamp}.log')
pid_path = os.path.join(launch_dir, f'supervisor-{stamp}.pid')
env = os.environ.copy()
env.update({
    'OPS_ROOT': ops_root,
    'SUPERVISOR_STAMP': stamp,
    'END_LOCAL_DATE': end_date,
    'END_LOCAL_HOUR': end_hour,
    'END_LOCAL_MINUTE': end_minute,
    'CHECK_INTERVAL_SEC': os.environ.get('CHECK_INTERVAL_SEC', '600'),
    'STALE_THRESHOLD_SEC': os.environ.get('STALE_THRESHOLD_SEC', '1800'),
    'RUN_WATCHDOG_EACH_CYCLE': os.environ.get('RUN_WATCHDOG_EACH_CYCLE', '0'),
})
with open(log_path, 'ab', buffering=0) as log_fh, open(os.devnull, 'rb') as devnull:
    proc = subprocess.Popen(
        ['bash', 'scripts/nas/run-native-matrix-supervisor.sh'],
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
