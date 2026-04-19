#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/../nas/common.sh"

REMOTE_REPO="${REMOTE_REPO:-/volume1/homes/neoboy/Dev/rubikvault-site}"
BACKUP_ROOT="${BACKUP_ROOT:-$NAS_ROOT/runtime/checkpoints/runtime-canary-history-sync}"
RESTART_RUNTIME=1

SYMBOLS=()
while [[ $# -gt 0 ]]; do
  case "$1" in
    --symbol)
      SYMBOLS+=("${2:-}")
      shift 2
      ;;
    --no-restart-runtime)
      RESTART_RUNTIME=0
      shift
      ;;
    --restart-runtime)
      RESTART_RUNTIME=1
      shift
      ;;
    *)
      echo "Unknown argument: $1" >&2
      exit 2
      ;;
  esac
done

if [[ "${#SYMBOLS[@]}" -eq 0 ]]; then
  SYMBOLS=(AAPL SPY)
fi

STAMP="$(timestamp_utc)"
BACKUP_DIR="$BACKUP_ROOT/$STAMP"
LOCAL_FILES=()

ensure_local_dirs
ensure_remote_dirs
nas_ssh_preflight

resolve_symbol_files() {
  python3 - "$ROOT" "${SYMBOLS[@]}" <<'PY'
import json
import pathlib
import sys

root = pathlib.Path(sys.argv[1])
symbols = [str(arg).strip().upper() for arg in sys.argv[2:] if str(arg).strip()]
manifest_path = root / 'public/data/eod/history/pack-manifest.us-eu.json'
lookup_path = root / 'public/data/eod/history/pack-manifest.us-eu.lookup.json'
manifest = json.loads(manifest_path.read_text())

print('public/data/eod/history/pack-manifest.us-eu.json')
print('public/data/eod/history/pack-manifest.us-eu.lookup.json')
seen = set()
for symbol in symbols:
    entry = (manifest.get('by_symbol') or {}).get(symbol)
    if not entry:
        raise SystemExit(f'missing manifest entry for {symbol}')
    pack = str(entry.get('pack') or '').strip()
    if not pack:
        raise SystemExit(f'missing pack path for {symbol}')
    pack_rel = f'mirrors/universe-v7/history/{pack}'
    if pack_rel not in seen:
        print(pack_rel)
        seen.add(pack_rel)
PY
}

while IFS= read -r line; do
  [[ -n "$line" ]] && LOCAL_FILES+=("$line")
done < <(resolve_symbol_files)

backup_remote_file() {
  local relative_path="$1"
  remote_shell "
    if [ -e '$REMOTE_REPO/$relative_path' ]; then
      mkdir -p '$BACKUP_DIR/files/$(dirname "$relative_path")'
      cp -p '$REMOTE_REPO/$relative_path' '$BACKUP_DIR/files/$relative_path'
    fi
  "
}

remote_shell "
  mkdir -p '$REMOTE_REPO' '$BACKUP_DIR/files'
  {
    echo stamp='$STAMP'
    echo remote_repo='$REMOTE_REPO'
    echo symbols='${SYMBOLS[*]}'
    echo restart_runtime='$RESTART_RUNTIME'
  } > '$BACKUP_DIR/context.txt'
"

for relative_path in "${LOCAL_FILES[@]}"; do
  backup_remote_file "$relative_path"
done

for relative_path in "${LOCAL_FILES[@]}"; do
  sync_copy_path "$ROOT/$relative_path" "$REMOTE_REPO/$(dirname "$relative_path")" >/dev/null
done

if [[ "$RESTART_RUNTIME" -eq 1 ]]; then
  remote_shell "
    pids=\$(ps -axo pid=,command= | awk '/\\/volume1\\/homes\\/neoboy\\/Dev\\/rubikvault-site/ && /wrangler|workerd/ && !/awk/ {print \$1}')
    if [ -n \"\$pids\" ]; then
      echo \"\$pids\" | xargs -r kill 2>/dev/null || true
      sleep 2
      echo \"\$pids\" | xargs -r kill -9 2>/dev/null || true
    fi
  "
fi

printf 'remote_repo=%s\n' "$REMOTE_REPO"
printf 'backup_dir=%s\n' "$BACKUP_DIR"
printf 'symbols=%s\n' "${SYMBOLS[*]}"
printf 'restart_runtime=%s\n' "$RESTART_RUNTIME"
