#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/../nas/common.sh"

REMOTE_REPO="${REMOTE_REPO:-/volume1/homes/neoboy/Dev/rubikvault-site}"
BACKUP_ROOT="${BACKUP_ROOT:-$NAS_ROOT/runtime/checkpoints/pipeline-master-deploy}"
RESTART_AFTER_DEPLOY=1

while [[ $# -gt 0 ]]; do
  case "$1" in
    --no-restart)
      RESTART_AFTER_DEPLOY=0
      shift
      ;;
    --restart)
      RESTART_AFTER_DEPLOY=1
      shift
      ;;
    *)
      echo "Unknown argument: $1" >&2
      exit 2
      ;;
  esac
done

CODE_FILES=(
  "functions/api/_shared/data-interface.js"
  "functions/api/_shared/decision-bundle-reader.js"
  "functions/api/_shared/history-store.mjs"
  "public/stock.html"
  "scripts/generate_meta_dashboard_data.mjs"
  "scripts/lib/pipeline_authority/gates/readiness-contracts.json"
  "scripts/ops/approved-node.mjs"
  "scripts/ops/final-integrity-seal.mjs"
  "scripts/ops/pipeline-artifact-contract.mjs"
  "scripts/ops/resolve-node20-bin.sh"
  "scripts/ops/run-dashboard-green-recovery.mjs"
  "scripts/ops/run-pipeline-master-supervisor.mjs"
  "scripts/ops/run-pipeline-master-supervisor-node20.sh"
  "scripts/ops/run-stock-analyzer-publish-chain.mjs"
  "scripts/ops/runtime-preflight.mjs"
  "scripts/ops/verify-ui-completeness.mjs"
  "scripts/ops/nas-setup-fd-limit.sh"
)

STATE_FILES=(
  "public/data/ops/final-integrity-seal-latest.json"
  "public/data/ops/publish-chain-latest.json"
  "public/data/ops/release-state-latest.json"
  "mirrors/ops/pipeline-master/supervisor-heartbeat.json"
  "scripts/lib/pipeline_authority/gates/readiness-contracts.json"
)

STAMP="$(timestamp_utc)"
BACKUP_DIR="$BACKUP_ROOT/$STAMP"

ensure_local_dirs
ensure_remote_dirs
nas_ssh_preflight

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
  mkdir -p '$REMOTE_REPO' '$REMOTE_REPO/logs' '$REMOTE_REPO/mirrors/ops/pipeline-master' '$BACKUP_DIR/files'
  pid=\$(jq -r '.pid // empty' '$REMOTE_REPO/mirrors/ops/pipeline-master/supervisor-heartbeat.json' 2>/dev/null || true)
  {
    echo stamp='$STAMP'
    echo remote_repo='$REMOTE_REPO'
    echo restart_after_deploy='$RESTART_AFTER_DEPLOY'
    echo pid=\${pid:-}
    if [ -n \"\$pid\" ]; then
      ps -p \"\$pid\" -o pid=,lstart=,command= 2>/dev/null || true
    fi
  } > '$BACKUP_DIR/active-writer.txt'
"

for relative_path in "${STATE_FILES[@]}"; do
  backup_remote_file "$relative_path"
done

for relative_path in "${CODE_FILES[@]}"; do
  backup_remote_file "$relative_path"
done

for relative_path in "${CODE_FILES[@]}"; do
  sync_copy_path "$ROOT/$relative_path" "$REMOTE_REPO/$(dirname "$relative_path")" >/dev/null
done

remote_shell "
  chmod 755 '$REMOTE_REPO/scripts/ops/resolve-node20-bin.sh' '$REMOTE_REPO/scripts/ops/run-pipeline-master-supervisor-node20.sh' 2>/dev/null || true
"

if [[ "$RESTART_AFTER_DEPLOY" -eq 1 ]]; then
  remote_shell "
    cd '$REMOTE_REPO'
    pid=\$(jq -r '.pid // empty' mirrors/ops/pipeline-master/supervisor-heartbeat.json 2>/dev/null || true)
    if [ -n \"\$pid\" ] && kill -0 \"\$pid\" 2>/dev/null; then
      kill \"\$pid\" 2>/dev/null || true
      sleep 2
      if kill -0 \"\$pid\" 2>/dev/null; then
        kill -9 \"\$pid\" 2>/dev/null || true
      fi
    fi
    rm -f mirrors/ops/pipeline-master/lock.json
    nohup bash scripts/ops/run-pipeline-master-supervisor-node20.sh >> logs/pipeline-master-supervisor.log 2>&1 < /dev/null &
    echo \$! > mirrors/ops/pipeline-master/last-started.pid
  "
fi

printf 'remote_repo=%s\n' "$REMOTE_REPO"
printf 'backup_dir=%s\n' "$BACKUP_DIR"
printf 'restart_after_deploy=%s\n' "$RESTART_AFTER_DEPLOY"
