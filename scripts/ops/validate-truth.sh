#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
DATA="$ROOT/public/data"

fail() { echo "FAIL: $*" >&2; exit 1; }
pass() { echo "OK: $*"; }
warn() { echo "WARN: $*"; }

if ! command -v jq >/dev/null 2>&1; then
  fail "jq not found"
fi

# build-info
if [ ! -f "$DATA/build-info.json" ]; then
  fail "missing public/data/build-info.json"
fi
jq -e '(.git_sha|type=="string" or .git_sha==null) and (.build_time_utc|type=="string")' "$DATA/build-info.json" >/dev/null
pass "build-info.json present"

# pipeline latest
if [ ! -f "$DATA/pipeline/nasdaq100.latest.json" ]; then
  fail "missing pipeline latest"
fi
jq -e '(.counts.expected|type=="number") and (.counts.fetched|type=="number") and (.counts.validated|type=="number")' "$DATA/pipeline/nasdaq100.latest.json" >/dev/null
pass "pipeline latest counts present"

# pipeline stage artifacts
for stage in fetched validated computed static-ready; do
  f="$DATA/pipeline/nasdaq100.${stage}.json"
  if [ ! -f "$f" ]; then
    fail "missing pipeline stage ${stage}"
  fi
  jq -e '(.expected|type=="number") and (.count|type=="number") and (.missing|type=="array")' "$f" >/dev/null
  pass "pipeline stage ${stage} schema ok"
 done

# ops summary
if [ ! -f "$DATA/ops/summary.latest.json" ]; then
  fail "missing ops summary latest"
fi
jq -e '.schema_version=="ops.summary.v1" and (.ops_daily.ref|type=="string")' "$DATA/ops/summary.latest.json" >/dev/null
pass "ops summary schema ok"

# ops-daily
if [ ! -f "$DATA/ops-daily.json" ]; then
  fail "missing ops-daily"
fi
jq -e '(.baseline.pipeline.expected|type=="number") and (.baseline.pipeline.staticReady|type=="number")' "$DATA/ops-daily.json" >/dev/null
pass "ops-daily baseline pipeline ok"

# warn-only coverage (non-blocking by design)
missing=$(jq -r '.baseline.pipeline.missing|length' "$DATA/ops-daily.json" 2>/dev/null || echo "")
if [ -n "$missing" ] && [ "$missing" -gt 50 ]; then
  warn "coverage degraded (missing=$missing)"
fi

pass "truth validation complete"
