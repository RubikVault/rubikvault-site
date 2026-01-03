#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${PREVIEW_URL:-${1:-}}"
if [[ -z "$BASE_URL" ]]; then
  echo "Usage: PREVIEW_URL=https://<preview>.pages.dev bash scripts/smoke-static-mime.sh"
  echo "   or: bash scripts/smoke-static-mime.sh https://<preview>.pages.dev"
  exit 2
fi

check_asset() {
  local path="$1"
  echo "== $path =="
  local headers
  headers=$(curl -fsSI "${BASE_URL}${path}" | tr -d '\r')
  echo "$headers" | sed -n '1,10p'
  local ctype
  ctype=$(echo "$headers" | awk -F': ' 'tolower($1)=="content-type"{print tolower($2)}' | head -n 1)
  if [[ -z "$ctype" ]]; then
    echo "FAIL: missing Content-Type for ${path}"
    exit 1
  fi
  if echo "$ctype" | grep -q "text/html"; then
    echo "FAIL: HTML Content-Type for ${path}"
    exit 1
  fi
  local body
  body=$(curl -fsS "${BASE_URL}${path}" | head -n 2)
  if echo "$body" | grep -qi "<!doctype\|<html"; then
    echo "FAIL: HTML body for ${path}"
    exit 1
  fi
  echo "OK"
}

check_asset "/style.css"
check_asset "/rv-loader.js"
check_asset "/rv-config.js"
check_asset "/market-clock.js"
check_asset "/rv-debug-console.js"
check_asset "/diagnose.js"
check_asset "/features/blocks-registry.js"
check_asset "/features/utils/api.js"
check_asset "/features/utils/flags.js"
check_asset "/features/rv-market-health.js"
check_asset "/debug/rv-debug.js"
check_asset "/debug/rv-debug-console.js"
check_asset "/assets/rv-icon.png"
