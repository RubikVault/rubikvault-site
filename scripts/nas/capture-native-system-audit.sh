#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="${REPO_ROOT:-$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)}"
OPS_ROOT="${OPS_ROOT:-/volume1/homes/neoboy/RepoOps/rubikvault-site}"
if [[ -f "$OPS_ROOT/tooling/env.sh" ]]; then
  # shellcheck disable=SC1090
  . "$OPS_ROOT/tooling/env.sh"
fi

STAMP="${1:-$(date -u +%Y%m%dT%H%M%SZ)}"
AUDIT_DIR="$OPS_ROOT/runtime/native-matrix/system-audits/$STAMP"
RAW_DIR="$AUDIT_DIR/raw"

mkdir -p "$RAW_DIR"

python3 - "$AUDIT_DIR/meta.json" "$STAMP" <<'PY'
import json
import os
import sys

out_path, stamp = sys.argv[1:3]
doc = {
    "schema_version": "nas.system-partition.audit.meta.v1",
    "generated_at": __import__("datetime").datetime.utcnow().isoformat() + "Z",
    "stamp": stamp,
    "status": "ok",
    "blocked_reason": None,
    "remote_report_dir": os.path.dirname(out_path),
}
os.makedirs(os.path.dirname(out_path), exist_ok=True)
with open(out_path, "w", encoding="utf-8") as fh:
    json.dump(doc, fh, indent=2)
    fh.write("\n")
PY

{
  hostname
  date
  echo "kernel="
  uname -a
} > "$RAW_DIR/identity.txt"
df -h / /volume1 > "$RAW_DIR/df-h.txt"
df -i / /volume1 > "$RAW_DIR/df-i.txt"
for p in /var /usr /etc /tmp /var/tmp /var/log /var/packages; do
  if [[ -e "$p" ]]; then
    du -skx "$p" 2>/dev/null || true
  fi
done | sort -nr > "$RAW_DIR/rootfs-dir-sizes-kb.txt"
ps -ef | egrep 'synoupgrade|synopkg|pkgctl|upgrade|install' | grep -v grep > "$RAW_DIR/active-update-processes.txt" || true
if [[ ! -s "$RAW_DIR/active-update-processes.txt" ]]; then
  echo none > "$RAW_DIR/active-update-processes.txt"
fi
python3 - <<'PY' > "$RAW_DIR/largest-root-files.txt"
import heapq
import os

skip = {"/proc", "/sys", "/dev", "/run", "/volume1"}
root_dev = os.stat("/").st_dev
best = []
for dirpath, dirnames, filenames in os.walk("/", topdown=True):
    if any(dirpath == prefix or dirpath.startswith(prefix + "/") for prefix in skip):
        dirnames[:] = []
        continue
    try:
        if os.stat(dirpath).st_dev != root_dev:
            dirnames[:] = []
            continue
    except OSError:
        dirnames[:] = []
        continue
    keep = []
    for name in dirnames:
        full = os.path.join(dirpath, name)
        try:
            if os.stat(full).st_dev == root_dev and not any(full == prefix or full.startswith(prefix + "/") for prefix in skip):
                keep.append(name)
        except OSError:
            continue
    dirnames[:] = keep
    for name in filenames:
        full = os.path.join(dirpath, name)
        try:
            stat = os.stat(full)
        except OSError:
            continue
        if stat.st_dev != root_dev:
            continue
        item = (stat.st_size, full)
        if len(best) < 200:
            heapq.heappush(best, item)
        else:
            heapq.heappushpop(best, item)
for size, path in sorted(best, reverse=True):
    print(f"{size}\t{path}")
PY
python3 - <<'PY' > "$RAW_DIR/var-log-candidates.txt"
import heapq
import os

best = []
root = "/var/log"
if os.path.exists(root):
    for dirpath, _, filenames in os.walk(root):
        for name in filenames:
            full = os.path.join(dirpath, name)
            try:
                size = os.stat(full).st_size
            except OSError:
                continue
            item = (size, full)
            if len(best) < 200:
                heapq.heappush(best, item)
            else:
                heapq.heappushpop(best, item)
for size, path in sorted(best, reverse=True):
    print(f"{size}\t{path}")
PY
python3 - <<'PY' > "$RAW_DIR/tmp-candidates.txt"
import heapq
import os

best = []
for root in ("/tmp", "/var/tmp"):
    if not os.path.exists(root):
        continue
    for dirpath, _, filenames in os.walk(root):
        for name in filenames:
            full = os.path.join(dirpath, name)
            try:
                size = os.stat(full).st_size
            except OSError:
                continue
            item = (size, full)
            if len(best) < 200:
                heapq.heappush(best, item)
            else:
                heapq.heappushpop(best, item)
for size, path in sorted(best, reverse=True):
    print(f"{size}\t{path}")
PY
python3 - <<'PY' > "$RAW_DIR/core-dump-candidates.txt"
import heapq
import os

best = []
for root in ("/var/crash", "/var/log", "/tmp", "/var/tmp"):
    if not os.path.exists(root):
        continue
    for dirpath, _, filenames in os.walk(root):
        for name in filenames:
            if name == "core" or name.endswith(".core") or name.endswith(".crash"):
                full = os.path.join(dirpath, name)
                try:
                    size = os.stat(full).st_size
                except OSError:
                    continue
                item = (size, full)
                if len(best) < 200:
                    heapq.heappush(best, item)
                else:
                    heapq.heappushpop(best, item)
for size, path in sorted(best, reverse=True):
    print(f"{size}\t{path}")
PY

node "$REPO_ROOT/scripts/nas/build-system-partition-audit-summary.mjs" --audit-dir "$AUDIT_DIR" >/dev/null
printf '%s\n' "$AUDIT_DIR"
