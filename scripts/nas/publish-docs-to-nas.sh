#!/usr/bin/env bash
set -euo pipefail

source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/common.sh"

ensure_local_dirs
ensure_remote_dirs

REMOTE_DOCS="$NAS_ROOT/docs/repo"
remote_shell "mkdir -p '$REMOTE_DOCS'"

DOCS=(
  "README.md"
  "AI_CONTEXT.md"
  "docs/ops/nas-runbook.md"
  "docs/ops/nas-evidence-hub.md"
  "docs/ops/nas-solution-attempt-log.md"
  "docs/ops/nas-variant-catalog.md"
  "docs/ops/nas-transfer-status.md"
  "docs/ops/nas-native-matrix.md"
  "docs/ops/nas-benchmark-plan.md"
  "docs/ops/nas-migration-journal.md"
  "docs/ops/nas-night-supervisor.md"
  "docs/ops/nas-open-probes.md"
  "docs/ops/nas-automation-audit.md"
  "docs/ops/nas-master-plan-v3.md"
  "scripts/nas/stage-manifest.json"
)

for rel in "${DOCS[@]}"; do
  src="$ROOT/$rel"
  dst_parent="$REMOTE_DOCS/$(dirname "$rel")"
  sync_copy_path "$src" "$dst_parent" >/dev/null
done

echo "$REMOTE_DOCS"
