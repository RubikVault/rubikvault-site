#!/usr/bin/env bash
set -euo pipefail

source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/common.sh"

STAMP="${1:-$(timestamp_utc)}"
LOCAL_DIR="$LOCAL_SYSTEM_AUDIT/$STAMP-cleanup"
SUMMARY_JSON="$LOCAL_DIR/cleanup-summary.json"
REMOTE_DIR="$REMOTE_SYSTEM_AUDIT/$STAMP-cleanup"

ensure_local_dirs
mkdir -p "$LOCAL_DIR"

if ! nas_ssh_preflight; then
  python3 - "$SUMMARY_JSON" <<'PY'
import json, sys
doc = {
    "schema_version": "nas.system-partition.cleanup.summary.v1",
    "generated_at": __import__("datetime").datetime.utcnow().isoformat() + "Z",
    "status": "blocked",
    "reason": "ssh_unavailable",
}
with open(sys.argv[1], "w", encoding="utf-8") as fh:
    json.dump(doc, fh, indent=2)
    fh.write("\n")
PY
  echo "$LOCAL_DIR"
  exit 2
fi

remote_shell "mkdir -p '$REMOTE_DIR/archive'"

"${SSH_CMD[@]}" "$NAS_HOST" "python3 - '$REMOTE_DIR' <<'PY'
import datetime as dt
import glob
import json
import os
import shutil
import subprocess
import sys
import tarfile

remote_dir = sys.argv[1]
archive_dir = os.path.join(remote_dir, 'archive')
os.makedirs(archive_dir, exist_ok=True)

update_patterns = ['synoupgrade', 'synopkg', 'pkgctl', 'upgrade', 'install']
update_running = False
try:
    ps = subprocess.check_output(['ps', '-ef'], text=True, errors='ignore')
    for line in ps.splitlines():
        if any(pat in line for pat in update_patterns) and 'grep' not in line:
            update_running = True
            break
except Exception:
    update_running = True

summary = {
    'schema_version': 'nas.system-partition.cleanup.summary.v1',
    'generated_at': dt.datetime.utcnow().isoformat() + 'Z',
    'status': 'skipped' if update_running else 'completed',
    'update_running': update_running,
    'archived_sets': [],
    'deleted_files': [],
}

if not update_running:
    groups = {
        'core_dumps': [],
        'rotated_logs': [],
        'tmp_files': [],
    }
    for root in ['/var/crash', '/var/log', '/var/tmp', '/tmp']:
        if not os.path.exists(root):
            continue
        for dirpath, _, filenames in os.walk(root):
            for name in filenames:
                path = os.path.join(dirpath, name)
                try:
                    st = os.stat(path)
                except OSError:
                    continue
                if not os.path.isfile(path):
                    continue
                age_sec = max(0, dt.datetime.now().timestamp() - st.st_mtime)
                if name == 'core' or name.endswith('.core') or name.endswith('.crash'):
                    groups['core_dumps'].append(path)
                elif root == '/var/log' and (name.endswith('.gz') or name.endswith('.xz') or name.endswith('.1') or name.endswith('.2') or name.endswith('.old')):
                    groups['rotated_logs'].append(path)
                elif root in ['/var/tmp', '/tmp'] and age_sec >= 24 * 3600:
                    groups['tmp_files'].append(path)

    for label, paths in groups.items():
        if not paths:
            continue
        tar_path = os.path.join(archive_dir, f'{label}.tar.gz')
        with tarfile.open(tar_path, 'w:gz') as tar:
            for p in paths:
                try:
                    tar.add(p, arcname=p.lstrip('/'))
                except OSError:
                    continue
        deleted = 0
        for p in paths:
            try:
                os.remove(p)
                deleted += 1
            except OSError:
                continue
        summary['archived_sets'].append({'label': label, 'count': len(paths), 'archive': tar_path})
        summary['deleted_files'].append({'label': label, 'count': deleted})

with open(os.path.join(remote_dir, 'cleanup-summary.json'), 'w', encoding='utf-8') as fh:
    json.dump(summary, fh, indent=2)
    fh.write('\n')
print(os.path.join(remote_dir, 'cleanup-summary.json'))
PY" > "$LOCAL_DIR/remote-path.txt"

rsync_from_remote "$REMOTE_DIR/" "$LOCAL_DIR" >/dev/null
echo "$LOCAL_DIR"
