#!/usr/bin/env bash
set -euo pipefail

source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/common.sh"

MODE="${1:-inventory}"
STAMP="${2:-$(timestamp_utc)}"
RUN_DIR="$LOCAL_DATASET_MIRRORS/$STAMP"
REPORT_TXT="$RUN_DIR/mirror-report.txt"
REPORT_JSON="$RUN_DIR/mirror-report.json"
LATEST_DIR="$LOCAL_DATASET_MIRRORS/latest"
LATEST_REPORT_TXT="$LATEST_DIR/mirror-report.txt"
LATEST_REPORT_JSON="$LATEST_DIR/mirror-report.json"

CONFIG_SOURCE="${CONFIG_SOURCE:-/Volumes/CONFIG/RubikVault/quantlab-snapshots}"
SAMSUNG_SOURCE="${SAMSUNG_SOURCE:-}"
SAMSUNG_DISCOVERY_ROOT="${SAMSUNG_DISCOVERY_ROOT:-/Volumes/SAMSUNG}"

ensure_local_dirs
ensure_remote_dirs
mkdir -p "$RUN_DIR"

discover_samsung_candidates() {
  perl -e 'alarm 8; exec @ARGV' \
    find "$SAMSUNG_DISCOVERY_ROOT" -maxdepth 4 -type d \
    \( -iname '*rubik*' -o -iname '*history*' -o -iname '*eodhd*' -o -iname '*quantlab*' \) 2>/dev/null | sed -n '1,120p'
}

path_exists_fast() {
  local target="$1"
  perl -e 'alarm 5; exec @ARGV' ls -ld "$target" >/dev/null 2>&1
}

CONFIG_STATUS="missing"
if path_exists_fast "$CONFIG_SOURCE"; then
  CONFIG_STATUS="ready"
fi

SAMSUNG_CANDIDATES="$(discover_samsung_candidates || true)"
SAMSUNG_STATUS="not_selected"
if [[ -n "$SAMSUNG_SOURCE" ]]; then
  if path_exists_fast "$SAMSUNG_SOURCE"; then
    SAMSUNG_STATUS="ready"
  else
    SAMSUNG_STATUS="missing"
  fi
elif [[ -n "$SAMSUNG_CANDIDATES" ]]; then
  SAMSUNG_STATUS="candidates_found"
fi

{
  echo "mode=$MODE"
  echo "stamp=$STAMP"
  echo "config_source=$CONFIG_SOURCE"
  echo "config_status=$CONFIG_STATUS"
  echo "samsung_source=${SAMSUNG_SOURCE:-}"
  echo "samsung_status=$SAMSUNG_STATUS"
  echo "--- samsung_candidates"
  printf '%s\n' "$SAMSUNG_CANDIDATES"
} > "$REPORT_TXT"

if [[ "$MODE" == "mirror" ]]; then
  if [[ "$CONFIG_STATUS" == "ready" ]]; then
    remote_shell "mkdir -p '$REMOTE_DATASETS/config/quantlab-snapshots/$STAMP'"
    rsync_to_remote_checksum "$CONFIG_SOURCE/" "$REMOTE_DATASETS/config/quantlab-snapshots/$STAMP" >/dev/null
  fi

  if [[ "$SAMSUNG_STATUS" == "ready" ]]; then
    remote_shell "mkdir -p '$REMOTE_DATASETS/samsung/$STAMP'"
    rsync_to_remote_checksum "$SAMSUNG_SOURCE/" "$REMOTE_DATASETS/samsung/$STAMP" >/dev/null
  fi
fi

node --input-type=module - "$REPORT_JSON" "$MODE" "$STAMP" "$CONFIG_SOURCE" "$CONFIG_STATUS" "$SAMSUNG_SOURCE" "$SAMSUNG_STATUS" "$SAMSUNG_CANDIDATES" <<'NODE'
import fs from 'node:fs/promises';
import path from 'node:path';
const [
  reportPath,
  mode,
  stamp,
  configSource,
  configStatus,
  samsungSource,
  samsungStatus,
  samsungCandidatesRaw,
] = process.argv.slice(2);

const report = {
  schema_version: 'nas.dataset.mirror.report.v1',
  generated_at: new Date().toISOString(),
  mode,
  stamp,
  bootstrap_only: true,
  benchmark_runs_must_use_nas_snapshots_only: true,
  config: {
    source: configSource || null,
    status: configStatus
  },
  samsung: {
    source: samsungSource || null,
    status: samsungStatus,
    discovered_candidates: samsungCandidatesRaw ? samsungCandidatesRaw.split('\n').filter(Boolean) : []
  }
};

await fs.mkdir(path.dirname(reportPath), { recursive: true });
await fs.writeFile(reportPath, JSON.stringify(report, null, 2) + '\n', 'utf8');
NODE

mkdir -p "$LATEST_DIR"
cp "$REPORT_TXT" "$LATEST_REPORT_TXT"
cp "$REPORT_JSON" "$LATEST_REPORT_JSON"

rsync_to_remote "$REPORT_TXT" "$REMOTE_REPORTS/datasets" >/dev/null
rsync_to_remote "$REPORT_JSON" "$REMOTE_REPORTS/datasets" >/dev/null
rsync_to_remote "$LATEST_REPORT_TXT" "$REMOTE_REPORTS/datasets" >/dev/null
rsync_to_remote "$LATEST_REPORT_JSON" "$REMOTE_REPORTS/datasets" >/dev/null
echo "$RUN_DIR"
