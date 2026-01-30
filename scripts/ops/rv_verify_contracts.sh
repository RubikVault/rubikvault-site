#!/usr/bin/env bash
set -euo pipefail

PROD_BASE="${PROD_BASE:-https://rubikvault.com}"
PREVIEW_BASE="${PREVIEW_BASE:-}"
ASSERTS="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/rv_contract_asserts.jq"

if ! command -v curl >/dev/null 2>&1; then
  echo "FAIL: curl not found" >&2
  exit 2
fi
if ! command -v jq >/dev/null 2>&1; then
  echo "FAIL: jq not found" >&2
  exit 2
fi

fail_count=0

pass() { echo "PASS: $*"; }
warn() { echo "WARN: $*"; }
fail() { echo "FAIL: $*"; fail_count=$((fail_count+1)); }

fetch_json() {
  local url="$1"
  curl -fsS --max-time 20 "$url"
}

assert_jq() {
  local filter="$1"
  local json="$2"
  echo "$json" | jq -e -f "$ASSERTS" "$filter" >/dev/null
}

check_endpoint() {
  local base="$1"
  local label="$2"
  local path="$3"
  local filter="$4"
  local url="${base%/}${path}"
  local json
  if ! json=$(fetch_json "$url"); then
    fail "$label $path fetch failed"
    return
  fi
  if assert_jq "$filter" "$json"; then
    pass "$label $path"
  else
    fail "$label $path contract assert failed"
  fi
}

run_checks() {
  local base="$1"
  local label="$2"
  echo "== $label ($base) =="
  check_endpoint "$base" "$label" "/data/manifest.json" 'manifest_assert'
  check_endpoint "$base" "$label" "/api/mission-control/summary" 'mission_control_assert'
  check_endpoint "$base" "$label" "/api/health?debug=1" 'debug_probe_assert("health")'
  check_endpoint "$base" "$label" "/api/render-plan?debug=1" 'debug_probe_assert("render-plan")'
  check_endpoint "$base" "$label" "/data/render-plan.json" 'render_plan_asset_assert'
  check_endpoint "$base" "$label" "/data/snapshots/render-plan/latest.json" 'render_plan_snapshot_assert'
  check_endpoint "$base" "$label" "/data/state/modules/render-plan.json" 'render_plan_state_assert'
  echo
}

run_checks "$PROD_BASE" "PROD"

if [ -n "$PREVIEW_BASE" ]; then
  run_checks "$PREVIEW_BASE" "PREVIEW"
else
  warn "PREVIEW_BASE not set; skipping preview checks"
  echo
fi

echo "== DIFF (PROD vs PREVIEW) =="
if [ -n "$PREVIEW_BASE" ]; then
  prod_manifest=$(fetch_json "${PROD_BASE%/}/data/manifest.json") || prod_manifest='{}'
  prev_manifest=$(fetch_json "${PREVIEW_BASE%/}/data/manifest.json") || prev_manifest='{}'
  prod_build_id=$(echo "$prod_manifest" | jq -r '.build_id // ""')
  prev_build_id=$(echo "$prev_manifest" | jq -r '.build_id // ""')
  prod_manifest_ref=$(echo "$prod_manifest" | jq -r '.manifest_ref // ""')
  prev_manifest_ref=$(echo "$prev_manifest" | jq -r '.manifest_ref // ""')

  echo "manifest.build_id: prod=${prod_build_id:-""} preview=${prev_build_id:-""}"
  echo "manifest.manifest_ref: prod=${prod_manifest_ref:-""} preview=${prev_manifest_ref:-""}"

  prod_mc=$(fetch_json "${PROD_BASE%/}/api/mission-control/summary" || echo '{}')
  prev_mc=$(fetch_json "${PREVIEW_BASE%/}/api/mission-control/summary" || echo '{}')

  prod_truth_chain=$(echo "$prod_mc" | jq -r '(.data.opsBaseline.truthChain|type) // "missing"')
  prev_truth_chain=$(echo "$prev_mc" | jq -r '(.data.opsBaseline.truthChain|type) // "missing"')
  prod_sched=$(echo "$prod_mc" | jq -r '(.data.opsBaseline.runtime.schedulerExpected|type) // "missing"')
  prev_sched=$(echo "$prev_mc" | jq -r '(.data.opsBaseline.runtime.schedulerExpected|type) // "missing"')

  echo "truthChain present: prod=${prod_truth_chain} preview=${prev_truth_chain}"
  echo "schedulerExpected present: prod=${prod_sched} preview=${prev_sched}"
else
  warn "DIFF skipped (PREVIEW_BASE not set)"
fi

echo
if [ "$fail_count" -gt 0 ]; then
  echo "FAIL: $fail_count contract check(s) failed"
  exit 1
fi

echo "OK: all contract checks passed"
