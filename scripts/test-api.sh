#!/usr/bin/env bash
set -euo pipefail

BASE="${1:-}"
if [[ -z "$BASE" ]]; then
  echo "Usage: bash scripts/test-api.sh <BASE_URL>"
  exit 1
fi

ENDPOINTS="health diag debug-bundle debug-matrix market-regime market-health tech-signals alpha-radar arb-risk-regime arb-liquidity-pulse arb-breadth-lite"

fail() {
  echo "FAIL: $1"
  exit 1
}

for p in $ENDPOINTS; do
  url="${BASE%/}/api/${p}"
  echo "== ${url} =="

  headers=$(curl -sS -D - --max-time 12 "$url" -o /dev/null)
  ct=$(printf "%s" "$headers" | tr -d '\r' | awk -F': ' 'tolower($1)=="content-type"{print $2}')
  [[ -n "$ct" ]] || fail "missing Content-Type for $url"
  echo "$ct" | grep -qi "^application/json" || fail "non-JSON Content-Type for $url: $ct"

  body=$(curl -sS --max-time 12 "$url" | head -c 20)
  echo "$body" | grep -qi "<!doctype\\|<html" && fail "HTML body for $url"

  curl -s --max-time 12 "$url" | jq -e '.ok' >/dev/null || fail "missing .ok for $url"
  curl -s --max-time 12 "$url" | jq -e '.feature' >/dev/null || fail "missing .feature for $url"
done

echo "OK"
