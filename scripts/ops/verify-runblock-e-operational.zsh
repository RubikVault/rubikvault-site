#!/usr/bin/env zsh
set -euo pipefail

BASE_URL="${PROD_BASE:-${BASE_URL:-https://rubikvault.com}}"
ALLOW_NO_COMPUTED_ANALYSIS="${ALLOW_NO_COMPUTED_ANALYSIS:-0}"

fail() {
  echo "FAIL: $1" >&2
  exit 1
}

pass() {
  echo "OK: $1"
}

if ! command -v jq >/dev/null 2>&1; then
  fail "jq is required"
fi

health_tmp=$(mktemp)
trap 'rm -f "$health_tmp"' EXIT

curl -fsS "${BASE_URL%/}/api/scheduler/health" > "$health_tmp" || fail "scheduler health fetch failed"

health_status=$(jq -r '.data.status // empty' "$health_tmp")
if [ -z "$health_status" ]; then
  fail "scheduler health missing data.status"
fi
if [ "$health_status" = "never_ran" ]; then
  fail "scheduler health status is never_ran (prod should be running)"
fi
pass "scheduler health status=${health_status}"

pipeline_tmp=$(mktemp)
trap 'rm -f "$health_tmp" "$pipeline_tmp"' EXIT

curl -fsS "${BASE_URL%/}/data/pipeline/nasdaq100.static-ready.json" > "$pipeline_tmp" || fail "pipeline static-ready fetch failed"

expected=$(jq -r '.expected // 0' "$pipeline_tmp")
count=$(jq -r '.count // 0' "$pipeline_tmp")

if [ "$count" -lt "$expected" ]; then
  if [ "$ALLOW_NO_COMPUTED_ANALYSIS" = "1" ]; then
    pass "pipeline static-ready below expected but allowed (ALLOW_NO_COMPUTED_ANALYSIS=1)"
  else
    if jq -e '([.missing[]?.reason] | length > 0) and (all(. == "NO_COMPUTED_ANALYSIS"))' "$pipeline_tmp" >/dev/null; then
      fail "pipeline static-ready missing due to NO_COMPUTED_ANALYSIS (count=${count} expected=${expected})"
    else
      pass "pipeline static-ready below expected with mixed reasons (count=${count} expected=${expected})"
    fi
  fi
else
  pass "pipeline static-ready count=${count} expected=${expected}"
fi
