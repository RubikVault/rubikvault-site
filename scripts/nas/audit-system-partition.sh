#!/usr/bin/env bash
set -euo pipefail

source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/common.sh"

STAMP="${1:-$(timestamp_utc)}"
LOCAL_DIR="$LOCAL_SYSTEM_AUDIT/$STAMP"
RAW_DIR="$LOCAL_DIR/raw"
REMOTE_DIR="$REMOTE_SYSTEM_AUDIT/$STAMP"
REMOTE_REPO="${REMOTE_REPO:-/volume1/homes/neoboy/Dev/rubikvault-site}"

ensure_local_dirs
mkdir -p "$RAW_DIR"

write_meta() {
  local status="$1"
  local blocked_reason="${2:-}"
  python3 - "$LOCAL_DIR/meta.json" "$STAMP" "$status" "$blocked_reason" "$REMOTE_DIR" <<'PY'
import json
import os
import sys

out_path, stamp, status, blocked_reason, remote_dir = sys.argv[1:6]
doc = {
    "schema_version": "nas.system-partition.audit.meta.v1",
    "generated_at": __import__("datetime").datetime.utcnow().isoformat() + "Z",
    "stamp": stamp,
    "status": status,
    "blocked_reason": blocked_reason or None,
    "remote_report_dir": remote_dir,
}
os.makedirs(os.path.dirname(out_path), exist_ok=True)
with open(out_path, "w", encoding="utf-8") as fh:
    json.dump(doc, fh, indent=2)
    fh.write("\n")
PY
}

run_remote_capture() {
  local output_file="$1"
  shift
  "${SSH_CMD[@]}" "$NAS_HOST" "$@" > "$output_file"
}

if ! nas_ssh_preflight; then
  write_meta "blocked" "ssh_unavailable"
  node "$ROOT/scripts/nas/build-system-partition-audit-summary.mjs" --audit-dir "$LOCAL_DIR" >/dev/null
  echo "$LOCAL_DIR"
  exit 2
fi

write_meta "ok"

run_remote_capture "$RAW_DIR/identity.txt" "set -euo pipefail; hostname; date; echo 'kernel='; uname -a"
run_remote_capture "$RAW_DIR/df-h.txt" "set -euo pipefail; df -h / /volume1"
run_remote_capture "$RAW_DIR/df-i.txt" "set -euo pipefail; df -i / /volume1"
run_remote_capture "$RAW_DIR/rootfs-dir-sizes-kb.txt" "set -euo pipefail; { for p in /var /usr /etc /tmp /var/tmp /var/log /var/packages; do if [ -e \"\$p\" ]; then du -skx \"\$p\" 2>/dev/null || true; fi; done; } | sort -nr"
run_remote_capture "$RAW_DIR/active-update-processes.txt" "set -euo pipefail; ps -ef | egrep 'synoupgrade|synopkg|pkgctl|upgrade|install' | grep -v grep || true; if ! ps -ef | egrep 'synoupgrade|synopkg|pkgctl|upgrade|install' | grep -v grep >/dev/null 2>&1; then echo none; fi"
run_remote_capture "$RAW_DIR/largest-root-files.txt" "set -euo pipefail; python3 '$REMOTE_REPO/scripts/nas/system-partition-probe.py' largest-root-files"
run_remote_capture "$RAW_DIR/var-log-candidates.txt" "set -euo pipefail; python3 '$REMOTE_REPO/scripts/nas/system-partition-probe.py' var-log-candidates"
run_remote_capture "$RAW_DIR/tmp-candidates.txt" "set -euo pipefail; python3 '$REMOTE_REPO/scripts/nas/system-partition-probe.py' tmp-candidates"
run_remote_capture "$RAW_DIR/core-dump-candidates.txt" "set -euo pipefail; python3 '$REMOTE_REPO/scripts/nas/system-partition-probe.py' core-dump-candidates"

node "$ROOT/scripts/nas/build-system-partition-audit-summary.mjs" --audit-dir "$LOCAL_DIR" >/dev/null

remote_shell "mkdir -p '$REMOTE_DIR'"
rsync_to_remote "$LOCAL_DIR/" "$REMOTE_DIR" >/dev/null

echo "$LOCAL_DIR"
