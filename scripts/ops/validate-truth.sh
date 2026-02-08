#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
DATA="$ROOT/public/data"

fail() { echo "FAIL: $*" >&2; exit 1; }
pass() { echo "OK: $*"; }
warn() { echo "WARN: $*"; }

validate_json_file() {
  local label="$1"
  local file="$2"
  local jq_expr="$3"
  if [ ! -f "$file" ]; then
    warn "missing ${label} at ${file#$ROOT/}"
    return 1
  fi
  jq -e "$jq_expr" "$file" >/dev/null || fail "${label} schema invalid at ${file#$ROOT/}"
  pass "${label} schema ok (${file#$ROOT/})"
  return 0
}

if ! command -v jq >/dev/null 2>&1; then
  fail "jq not found"
fi

# build-info (prefer published snapshot; fallback to SSOT root artifact)
if [ -f "$DATA/snapshots/build-info/latest.json" ]; then
  validate_json_file \
    "build-info snapshot" \
    "$DATA/snapshots/build-info/latest.json" \
    '(.schema_version=="3.0") and (.meta.version=="3.0") and ((.data.commitSha|type=="string") or (.data.commitSha==null)) and (.data.generatedAt|type=="string")'
elif [ -f "$ROOT/build-info.json" ]; then
  validate_json_file \
    "build-info ssot" \
    "$ROOT/build-info.json" \
    '((.commit|type=="string") or (.commitSha|type=="string") or (.git_sha|type=="string") or (.gitSha|type=="string") or (.commit==null) or (.commitSha==null) or (.git_sha==null) or (.gitSha==null)) and ((.timestamp|type=="string") or (.generatedAt|type=="string") or (.build_time_utc|type=="string") or (.timestamp==null) or (.generatedAt==null) or (.build_time_utc==null))'
else
  warn "missing build-info artifacts (attempted: public/data/snapshots/build-info/latest.json, build-info.json)"
fi

# pipeline latest
validate_json_file \
  "pipeline latest" \
  "$DATA/pipeline/nasdaq100.latest.json" \
  '(.counts.expected|type=="number") and (.counts.fetched|type=="number") and (.counts.validated|type=="number")' || true

# pipeline stage artifacts
for stage in fetched validated computed static-ready; do
  f="$DATA/pipeline/nasdaq100.${stage}.json"
  validate_json_file \
    "pipeline stage ${stage}" \
    "$f" \
    '(.expected|type=="number") and (.count|type=="number") and (.missing|type=="array")' || true
 done

# ops summary
validate_json_file \
  "ops summary latest" \
  "$DATA/ops/summary.latest.json" \
  '.schema_version=="ops.summary.v1" and (.ops_daily.ref|type=="string")' || true

# ops-daily
validate_json_file \
  "ops-daily" \
  "$DATA/ops-daily.json" \
  '(.baseline.pipeline.expected|type=="number") and (.baseline.pipeline.staticReady|type=="number")' || true

# health snapshot latest (envelope)
if [ -f "$DATA/snapshots/health/latest.json" ]; then
  jq -e '(.schema_version=="3.0") and (.metadata|type=="object") and (.data|type=="array")' \
    "$DATA/snapshots/health/latest.json" >/dev/null
  pass "health latest snapshot envelope ok"
else
  warn "missing health latest snapshot envelope"
fi

# warn-only coverage (non-blocking by design)
if [ -f "$DATA/ops-daily.json" ]; then
  missing=$(jq -r '.baseline.pipeline.missing|length' "$DATA/ops-daily.json" 2>/dev/null || echo "")
  if [ -n "$missing" ] && [ "$missing" -gt 50 ]; then
    warn "coverage degraded (missing=$missing)"
  fi
fi

pass "truth validation complete"
