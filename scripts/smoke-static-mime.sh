#!/usr/bin/env bash
set -euo pipefail

TARGET="${PREVIEW_URL:-${1:-}}"
if [[ -z "$TARGET" ]]; then
  echo "Usage: PREVIEW_URL=https://<preview>.pages.dev bash scripts/smoke-static-mime.sh"
  echo "   or: bash scripts/smoke-static-mime.sh https://<preview>.pages.dev"
  exit 2
fi

check_url() {
  local path="$1"
  local full_url="${TARGET}${path}"
  local status_code
  local curl_exit_code

  set +e
  status_code="$(curl -fsS -L --max-time 20 -o /dev/null -w "%{http_code}" "$full_url")"
  curl_exit_code=$?
  set -e

  if [[ $curl_exit_code -ne 0 ]]; then
    echo "FAIL: curl error (${curl_exit_code}) for ${path}"
    exit 1
  fi
  if [[ "$status_code" != "200" ]]; then
    echo "FAIL: HTTP ${status_code} for ${path}"
    exit 1
  fi
  echo "OK: ${path}"
}

check_url "/style.css"
check_url "/rv-loader.js"
check_url "/rv-config.js"
check_url "/market-clock.js"
check_url "/rv-debug-console.js"
check_url "/diagnose.js"
check_url "/features/blocks-registry.js"
check_url "/features/utils/api.js"
check_url "/features/utils/flags.js"
check_url "/features/rv-market-health.js"
check_url "/debug/rv-debug.js"
check_url "/debug/rv-debug-console.js"
check_url "/assets/rv-icon.png"
check_url "/assets/rv-logo.png"
check_url "/assets/logo.png"
