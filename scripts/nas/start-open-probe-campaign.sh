#!/usr/bin/env bash
set -euo pipefail

source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/common.sh"

REMOTE_REPO="/volume1/homes/neoboy/Dev/rubikvault-site"
OPEN_ROOT="$NAS_ROOT/runtime/open-probes"
CAMPAIGN_STAMP="${CAMPAIGN_STAMP:-$(timestamp_utc)}"
END_LOCAL_DATE="${END_LOCAL_DATE:-$(python3 - <<'PY'
from datetime import datetime, timedelta
print((datetime.now().astimezone() + timedelta(days=1)).strftime("%Y-%m-%d"))
PY
)}"
END_LOCAL_HOUR="${END_LOCAL_HOUR:-8}"
END_LOCAL_MINUTE="${END_LOCAL_MINUTE:-0}"
MAX_CYCLES="${MAX_CYCLES:-240}"
SLEEP_BETWEEN_PROBES_SEC="${SLEEP_BETWEEN_PROBES_SEC:-15}"
SLEEP_BETWEEN_CYCLES_SEC="${SLEEP_BETWEEN_CYCLES_SEC:-120}"
AUTO_DEPLOY="${AUTO_DEPLOY:-1}"
PROBE_PLAN_VERSION="${PROBE_PLAN_VERSION:-2026-04-22-node-date}"

if [[ "$AUTO_DEPLOY" == "1" ]]; then
  bash "$ROOT/scripts/nas/deploy-native-matrix-to-nas.sh" >/dev/null
fi

remote_shell "python3 - '$OPEN_ROOT' '$PROBE_PLAN_VERSION' <<'PY'
import glob
import json
import os
import signal
import subprocess
import sys
from datetime import datetime

open_root = sys.argv[1]
expected_probe_plan_version = sys.argv[2]
root = os.path.join(open_root, 'campaigns')
now = datetime.now().astimezone()
for path in glob.glob(os.path.join(root, '*', 'status.json')):
    try:
        doc = json.load(open(path, 'r', encoding='utf-8'))
    except Exception:
        continue
    target_end = doc.get('target_end_local')
    pid = str(doc.get('current_pid') or '').strip()
    status = str(doc.get('last_status') or '')
    plan_version = str(doc.get('probe_plan_version') or '')
    if not target_end or not pid or status not in {'running', 'completed'}:
        continue
    try:
        end = datetime.fromisoformat(target_end)
    except Exception:
        continue
    if end <= now or plan_version == expected_probe_plan_version:
        continue
    alive = subprocess.call(['kill', '-0', pid], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL) == 0
    if not alive:
        continue
    try:
        os.kill(int(pid), signal.SIGTERM)
    except Exception:
        continue
PY" >/dev/null 2>&1 || true

existing_campaign="$(remote_shell "python3 - '$OPEN_ROOT' '$PROBE_PLAN_VERSION' <<'PY'
import glob
import json
import os
import subprocess
import sys
from datetime import datetime

open_root = sys.argv[1]
expected_probe_plan_version = sys.argv[2]
root = os.path.join(open_root, 'campaigns')
files = glob.glob(os.path.join(root, '*', 'status.json'))
now = datetime.now().astimezone()
best = None
for path in files:
    try:
        doc = json.load(open(path, 'r', encoding='utf-8'))
    except Exception:
        continue
    target_end = doc.get('target_end_local')
    stamp = doc.get('campaign_stamp') or os.path.basename(os.path.dirname(path))
    pid = str(doc.get('current_pid') or '').strip()
    status = str(doc.get('last_status') or '')
    if str(doc.get('probe_plan_version') or '') != expected_probe_plan_version:
        continue
    if not target_end or not pid or status not in {'running', 'completed'}:
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
    sample_ok = True
    for key in ('sample_ids_path', 'sample_tickers_path'):
        sample_path = doc.get(key)
        if not sample_path:
            continue
        try:
            sample_doc = json.load(open(sample_path, 'r', encoding='utf-8'))
        except Exception:
            sample_ok = False
            break
        values = []
        if isinstance(sample_doc, dict):
            for candidate_key in ('canonical_ids', 'symbols', 'stocks', 'etfs'):
                candidate = sample_doc.get(candidate_key)
                if isinstance(candidate, list):
                    values.extend([value for value in candidate if str(value).strip()])
        if not values:
            sample_ok = False
            break
    if not sample_ok:
        continue
    candidate = (end.isoformat(), stamp)
    if best is None or candidate > best:
        best = candidate
print(best[1] if best else '')
PY")"

if [[ -n "$existing_campaign" ]]; then
  printf '%s\n' "$existing_campaign"
  exit 0
fi

remote_shell "mkdir -p '$OPEN_ROOT/launch'"
remote_shell "python3 - '$REMOTE_REPO' '$NAS_ROOT' '$CAMPAIGN_STAMP' '$END_LOCAL_DATE' '$END_LOCAL_HOUR' '$END_LOCAL_MINUTE' '$MAX_CYCLES' '$SLEEP_BETWEEN_PROBES_SEC' '$SLEEP_BETWEEN_CYCLES_SEC' '$PROBE_PLAN_VERSION' <<'PY'
import os
import subprocess
import sys

repo_root, ops_root, stamp, end_date, end_hour, end_minute, max_cycles, sleep_probes, sleep_cycles, probe_plan_version = sys.argv[1:11]
launch_dir = os.path.join(ops_root, 'runtime', 'open-probes', 'launch')
os.makedirs(launch_dir, exist_ok=True)
log_path = os.path.join(launch_dir, f'open-probe-campaign-{stamp}.log')
pid_path = os.path.join(launch_dir, f'open-probe-campaign-{stamp}.pid')
env = os.environ.copy()
env.update({
    'OPS_ROOT': ops_root,
    'CAMPAIGN_STAMP': stamp,
    'END_LOCAL_DATE': end_date,
    'END_LOCAL_HOUR': end_hour,
    'END_LOCAL_MINUTE': end_minute,
    'MAX_CYCLES': max_cycles,
    'SLEEP_BETWEEN_PROBES_SEC': sleep_probes,
    'SLEEP_BETWEEN_CYCLES_SEC': sleep_cycles,
    'PROBE_PLAN_VERSION': probe_plan_version,
})
with open(log_path, 'ab', buffering=0) as log_fh, open(os.devnull, 'rb') as devnull:
    proc = subprocess.Popen(
        ['bash', 'scripts/nas/run-open-probe-campaign.sh'],
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

printf '%s\n' "$CAMPAIGN_STAMP"
