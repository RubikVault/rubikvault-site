#!/usr/bin/env bash
set -euo pipefail

source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/common.sh"

REMOTE_REPO="/volume1/homes/neoboy/Dev/rubikvault-site"
REMOTE_OPS="$NAS_ROOT"
LOCAL_QUANT_ROOT="${LOCAL_QUANT_ROOT:-/Users/michaelpuchowezki/QuantLabHot/rubikvault-quantlab}"
LOCAL_DELTA_SUCCESS="$LOCAL_QUANT_ROOT/ops/q1_daily_delta_ingest/latest_success.json"
BASELINE_ROOT_REMOTE="$REMOTE_OPS/datasets/baselines/current"

ensure_local_dirs
ensure_remote_dirs
nas_ssh_preflight

remote_shell "mkdir -p '$REMOTE_REPO' '$REMOTE_OPS/runtime/native-matrix' '$BASELINE_ROOT_REMOTE'"

"$RSYNC_BIN" -a \
  --protect-args \
  --rsync-path=/usr/bin/rsync \
  -e "$RSYNC_SHELL" \
  --exclude '.git' \
  --exclude 'node_modules' \
  --exclude '.venv' \
  --exclude 'quantlab/.venv' \
  --exclude '.wrangler' \
  --exclude 'tmp' \
  --exclude 'mirrors' \
  --exclude 'public/data' \
  --exclude 'Report' \
  --exclude 'output' \
  --exclude 'data' \
  "$ROOT/" "$NAS_HOST:$REMOTE_REPO/" </dev/null

remote_shell "mkdir -p '$REMOTE_REPO/scripts/nas' '$REMOTE_REPO/docs/ops'"
rsync_to_remote "$ROOT/scripts/nas/" "$REMOTE_REPO/scripts/nas" >/dev/null
rsync_to_remote "$ROOT/docs/ops/" "$REMOTE_REPO/docs/ops" >/dev/null
remote_shell "
mkdir -p '$REMOTE_REPO/public/data/universe/v7/ssot' '$REMOTE_REPO/public/data/universe/v7/registry' '$REMOTE_REPO/public/data/eod/history' '$REMOTE_REPO/mirrors/universe-v7/state'
if [ -L '$REMOTE_REPO/mirrors/universe-v7/history' ] && [ ! -e '$REMOTE_REPO/mirrors/universe-v7/history' ]; then
  rm -f '$REMOTE_REPO/mirrors/universe-v7/history'
fi
if [ ! -e '$REMOTE_REPO/mirrors/universe-v7/history' ] && [ ! -L '$REMOTE_REPO/mirrors/universe-v7/history' ]; then
  mkdir -p '$REMOTE_REPO/mirrors/universe-v7/history'
fi
"
if [[ -f "$ROOT/public/data/universe/v7/ssot/stocks_etfs.us_eu.canonical.ids.json" ]]; then
  rsync_to_remote "$ROOT/public/data/universe/v7/ssot/stocks_etfs.us_eu.canonical.ids.json" "$REMOTE_REPO/public/data/universe/v7/ssot" >/dev/null
fi
if [[ -f "$ROOT/public/data/universe/v7/ssot/stocks_etfs.us_eu.symbols.json" ]]; then
  rsync_to_remote "$ROOT/public/data/universe/v7/ssot/stocks_etfs.us_eu.symbols.json" "$REMOTE_REPO/public/data/universe/v7/ssot" >/dev/null
fi
if [[ -f "$ROOT/public/data/universe/v7/registry/registry.ndjson.gz" ]]; then
  rsync_to_remote "$ROOT/public/data/universe/v7/registry/registry.ndjson.gz" "$REMOTE_REPO/public/data/universe/v7/registry" >/dev/null
fi
if [[ -f "$ROOT/public/data/eod/history/pack-manifest.us-eu.json" ]]; then
  rsync_to_remote "$ROOT/public/data/eod/history/pack-manifest.us-eu.json" "$REMOTE_REPO/public/data/eod/history" >/dev/null
fi
if [[ -f "$ROOT/public/data/eod/history/pack-manifest.us-eu.lookup.json" ]]; then
  rsync_to_remote "$ROOT/public/data/eod/history/pack-manifest.us-eu.lookup.json" "$REMOTE_REPO/public/data/eod/history" >/dev/null
fi

remote_shell "mkdir -p '$BASELINE_ROOT_REMOTE/stage1/public/data/ops' '$BASELINE_ROOT_REMOTE/stage2/public' '$BASELINE_ROOT_REMOTE/stage3/public/data/reports' '$BASELINE_ROOT_REMOTE/stage3/quant-root/ops/q1_daily_delta_ingest' '$BASELINE_ROOT_REMOTE/stage4-scientific_summary/public/data/supermodules'"

rsync_to_remote "$ROOT/public/data/ops/safety.latest.json" "$BASELINE_ROOT_REMOTE/stage1/public/data/ops" >/dev/null
rsync_to_remote "$ROOT/public/data/ops/summary.latest.json" "$BASELINE_ROOT_REMOTE/stage1/public/data/ops" >/dev/null
rsync_to_remote "$ROOT/public/data/ops/pulse.json" "$BASELINE_ROOT_REMOTE/stage1/public/data/ops" >/dev/null
rsync_to_remote "$ROOT/public/dashboard_v6_meta_data.json" "$BASELINE_ROOT_REMOTE/stage2/public" >/dev/null
rsync_to_remote "$ROOT/public/data/reports/system-status-latest.json" "$BASELINE_ROOT_REMOTE/stage3/public/data/reports" >/dev/null
if [[ -f "$LOCAL_DELTA_SUCCESS" ]]; then
  rsync_to_remote "$LOCAL_DELTA_SUCCESS" "$BASELINE_ROOT_REMOTE/stage3/quant-root/ops/q1_daily_delta_ingest" >/dev/null
fi
rsync_to_remote "$ROOT/public/data/supermodules/scientific-summary.json" "$BASELINE_ROOT_REMOTE/stage4-scientific_summary/public/data/supermodules" >/dev/null

if [[ -f "$ROOT/public/data/snapshots/best-setups-v4.json" ]]; then
  remote_shell "mkdir -p '$BASELINE_ROOT_REMOTE/stage4-best_setups_v4/public/data/snapshots'"
  rsync_to_remote "$ROOT/public/data/snapshots/best-setups-v4.json" "$BASELINE_ROOT_REMOTE/stage4-best_setups_v4/public/data/snapshots" >/dev/null
fi
if [[ -f "$ROOT/public/data/reports/quantlab-v1-latest.json" ]]; then
  remote_shell "mkdir -p '$BASELINE_ROOT_REMOTE/stage4-daily_audit_report/public/data/reports'"
  rsync_to_remote "$ROOT/public/data/reports/quantlab-v1-latest.json" "$BASELINE_ROOT_REMOTE/stage4-daily_audit_report/public/data/reports" >/dev/null
fi
TODAY_UTC="$(date -u +%Y-%m-%d)"
if [[ -f "$ROOT/mirrors/learning/quantlab-v1/reports/${TODAY_UTC}-internal.json" ]]; then
  remote_shell "mkdir -p '$BASELINE_ROOT_REMOTE/stage4-daily_audit_report/mirrors/learning/quantlab-v1/reports'"
  rsync_to_remote "$ROOT/mirrors/learning/quantlab-v1/reports/${TODAY_UTC}-internal.json" "$BASELINE_ROOT_REMOTE/stage4-daily_audit_report/mirrors/learning/quantlab-v1/reports" >/dev/null
fi
if [[ -f "$ROOT/mirrors/learning/quantlab-v1/reports/cutover-readiness-${TODAY_UTC}.json" ]]; then
  remote_shell "mkdir -p '$BASELINE_ROOT_REMOTE/stage4-cutover_readiness_report/mirrors/learning/quantlab-v1/reports'"
  rsync_to_remote "$ROOT/mirrors/learning/quantlab-v1/reports/cutover-readiness-${TODAY_UTC}.json" "$BASELINE_ROOT_REMOTE/stage4-cutover_readiness_report/mirrors/learning/quantlab-v1/reports" >/dev/null
fi
if [[ -f "$ROOT/public/data/reports/best-setups-etf-diagnostic-latest.json" ]]; then
  remote_shell "mkdir -p '$BASELINE_ROOT_REMOTE/stage4-etf_diagnostic/public/data/reports'"
  rsync_to_remote "$ROOT/public/data/reports/best-setups-etf-diagnostic-latest.json" "$BASELINE_ROOT_REMOTE/stage4-etf_diagnostic/public/data/reports" >/dev/null
fi
if [[ -f "$ROOT/mirrors/learning/reports/best-setups-etf-diagnostic-latest.json" ]]; then
  remote_shell "mkdir -p '$BASELINE_ROOT_REMOTE/stage4-etf_diagnostic/mirrors/learning/reports'"
  rsync_to_remote "$ROOT/mirrors/learning/reports/best-setups-etf-diagnostic-latest.json" "$BASELINE_ROOT_REMOTE/stage4-etf_diagnostic/mirrors/learning/reports" >/dev/null
fi

printf '%s\n' "$REMOTE_REPO"
