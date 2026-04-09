#!/usr/bin/env bash
set -euo pipefail

source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/common.sh"

STAMP="${1:-$(timestamp_utc)}"
LOCAL_FILE="$LOCAL_CHECKPOINTS/checkpoint-$STAMP.txt"

ensure_local_dirs
ensure_remote_dirs

LOCAL_ARTIFACTS=(
  "public/data/reports/system-status-latest.json"
  "public/data/reports/stock-analyzer-universe-audit-latest.json"
  "public/dashboard_v6_meta_data.json"
  "public/data/ops/safety.latest.json"
  "public/data/ops/summary.latest.json"
  "public/data/ops/pulse.json"
)

{
  echo "checkpoint=$STAMP"
  echo "repo_root=$ROOT"
  echo "git_head=$(git -C "$ROOT" rev-parse HEAD 2>/dev/null || true)"
  echo "git_branch=$(git -C "$ROOT" rev-parse --abbrev-ref HEAD 2>/dev/null || true)"
  echo "git_status_lines=$(git -C "$ROOT" status --short | wc -l | awk '{print $1}')"
  echo "--- local_listener_8788"
  lsof -nP -iTCP:8788 -sTCP:LISTEN 2>/dev/null || true
  echo "--- local_processes"
  pgrep -af "wrangler pages dev|rubikvault|QuantLab|quantlab" || true
  echo "--- local_launchd"
  launchctl list 2>/dev/null | egrep "rubikvault|quantlab" || true
  echo "--- local_artifacts"
  for rel in "${LOCAL_ARTIFACTS[@]}"; do
    abs="$ROOT/$rel"
    if [[ -e "$abs" ]]; then
      stat -f "artifact=%N|size=%z|mtime=%Sm" -t "%Y-%m-%dT%H:%M:%S%z" "$abs"
      jq -c --arg path "$rel" '{
        path: $path,
        generated_at: (.generated_at // .generatedAt // .meta.generated_at // .meta.generatedAt // null),
        status: (.summary.severity // .overall.status // .pipelineOk // .meta.status // .status // null)
      }' "$abs" 2>/dev/null || true
    else
      echo "artifact_missing=$rel"
    fi
  done
  echo "--- nas_toolchain"
  remote_shell ". '$NAS_ROOT/tooling/env.sh' && echo \"node=\$(node -v)\" && echo \"npm=\$(npm -v)\" && echo \"python=\$(python3 --version 2>&1)\" && echo \"uv=\$(uv --version)\""
  echo "--- nas_services"
  remote_shell "ps -ef | egrep 'synorelayd|synofoto|nginx: master|smbd -F --no-process-group' | grep -v egrep || true"
  echo "--- nas_mem"
  remote_shell "grep -E 'MemTotal|MemAvailable|SwapTotal|SwapFree' /proc/meminfo"
} > "$LOCAL_FILE"

rsync_to_remote "$LOCAL_FILE" "$REMOTE_CHECKPOINTS" >/dev/null

echo "$LOCAL_FILE"
