#!/bin/sh
set -eu

if [ -n "${BASE_URL:-}" ]; then
  BASE="$BASE_URL"
elif [ -n "${1:-}" ]; then
  BASE="$1"
else
  DEFAULT_PORT=5173
  if [ -f package.json ] && grep -q "wrangler pages dev" package.json; then
    DEFAULT_PORT=8788
  fi
  BASE="http://127.0.0.1:${DEFAULT_PORT}"
fi

BASE="${BASE%/}"

fail() {
  echo "FAIL: $1" >&2
  exit 1
}

head_status() {
  url="$1"
  status=$(curl -sS -o /dev/null -I -w "%{http_code}" "$url" || true)
  echo "$status"
}

check_head_200() {
  path="$1"
  url="$BASE$path"
  status=$(head_status "$url")
  if [ "$status" != "200" ]; then
    fail "$path expected 200, got $status"
  fi
}

check_api() {
  path="$1"
  url="$BASE$path"
  hdr=$(mktemp)
  body=$(mktemp)
  curl -sS -D "$hdr" -o "$body" "$url" || true
  status=$(awk 'NR==1{print $2}' "$hdr")
  ctype=$(awk -F': ' 'tolower($1)=="content-type"{print tolower($2)}' "$hdr" | tail -n 1)
  first=$(sed -e 's/^[[:space:]]*//' "$body" | head -c 1)
  rm -f "$hdr" "$body"
  case "$status" in
    2*|4*) : ;; 
    *) fail "$path expected 2xx/4xx, got $status" ;;
  esac
  if printf '%s' "$ctype" | grep -qi "text/html"; then
    fail "$path returned text/html"
  fi
  if [ "$first" = "<" ]; then
    fail "$path returned HTML body"
  fi
}

# Static assets
check_head_200 "/rv-loader.js"
check_head_200 "/rv-config.js"
check_head_200 "/diagnose.js"
check_head_200 "/features/health"
check_head_200 "/debug/"
check_head_200 "/index.html"

# API endpoint
if [ -f functions/api/health.js ]; then
  check_api "/api/health"
elif [ -f functions/api/top-movers.js ]; then
  check_api "/api/top-movers?debug=1"
else
  first_api=$(ls functions/api/*.js 2>/dev/null | head -n 1 | sed 's#.*/##' | sed 's/\.js$//')
  if [ -n "$first_api" ]; then
    check_api "/api/$first_api"
  fi
fi

# Mirror path
if [ -f public/mirrors/top-movers.json ] || [ -f mirrors/top-movers.json ]; then
  check_head_200 "/mirror/top-movers.json"
fi

echo "OK: redirect smoke passed for $BASE"
