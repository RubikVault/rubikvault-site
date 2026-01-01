#!/usr/bin/env bash
set -euo pipefail

BASE="${1:-}"
if [[ -z "$BASE" ]]; then
  echo "Usage: bash scripts/test-api.sh <BASE_URL>"
  exit 1
fi

ENDPOINTS="health diag debug-bundle debug-matrix arb-risk-regime arb-liquidity-pulse arb-breadth-lite"
HAS_JQ=0
if command -v jq >/dev/null 2>&1; then
  HAS_JQ=1
fi

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
  echo "$body" | grep -q "^{\\|^\\[" || fail "non-JSON body for $url"

  if [[ "$p" == "debug-bundle" ]]; then
    if [[ "$HAS_JQ" == "1" ]]; then
      curl -s --max-time 12 "$url" | jq -e '(.ok==true) or (has("schema")) or (has("schemaVersion"))' >/dev/null || fail "debug-bundle missing ok/schema/schemaVersion for $url"
    else
      curl -s --max-time 12 "$url" | grep -Eq '"ok"[[:space:]]*:[[:space:]]*true|"schema"|\"schemaVersion\"' || fail "debug-bundle missing ok/schema/schemaVersion for $url"
    fi
  else
    if [[ "$HAS_JQ" == "1" ]]; then
      curl -s --max-time 12 "$url" | jq -e '.ok' >/dev/null || fail "missing .ok for $url"
      curl -s --max-time 12 "$url" | jq -e '.feature' >/dev/null || fail "missing .feature for $url"
    else
      curl -s --max-time 12 "$url" | grep -Eq '"ok"[[:space:]]*:' || fail "missing .ok for $url"
      curl -s --max-time 12 "$url" | grep -Eq '"feature"[[:space:]]*:' || fail "missing .feature for $url"
    fi
  fi
done

echo "OK"
