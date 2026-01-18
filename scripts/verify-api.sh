#!/usr/bin/env bash
set -o pipefail

BASE="${BASE:-${1:-}}"
if [[ -z "${BASE}" ]]; then
  echo "ERR: BASE is required. Usage: BASE=https://example.com ./scripts/verify-api.sh"
  exit 1
fi

need() { command -v "$1" >/dev/null 2>&1 || { echo "ERR: missing dep: $1"; exit 1; }; }
need curl
need python3

fetch_json() {
  local url="$1"
  local tmp
  tmp="$(mktemp)"
  # Follow redirects; capture headers + body
  local code ctype
  code="$(curl -sS -L -o "$tmp" -w "%{http_code}" -H 'accept: application/json' "$url" || true)"
  ctype="$(curl -sSI -L -H 'accept: application/json' "$url" | tr -d '\r' | awk -F': ' 'tolower($1)=="content-type"{print $2}' | tail -n1)"
  echo "FETCH $url"
  echo "HTTP $code ctype=${ctype:-unknown}"

  python3 - <<PY 2>/dev/null || {
import json,sys
p=sys.argv[1]
try:
  with open(p,'rb') as f: b=f.read()
  # allow UTF-8 BOM / weird whitespace
  s=b.decode('utf-8','replace').lstrip("\ufeff").strip()
  json.loads(s)
  print("OK JSON")
except Exception as e:
  print("ERR non-JSON:", str(e))
  print("SNIP:", (s[:240].replace("\n"," ") if 's' in locals() else "<no body>"))
  sys.exit(2)
PY
"$tmp" || { rm -f "$tmp"; return 1; }

  rm -f "$tmp"
  return 0
}

echo "# Verify API Report"
echo ""

# Prefer API endpoints (debug), but tolerate redirects/non-JSON with useful diagnostics.
fetch_json "${BASE}/api/bundle?debug=1" || exit 1
fetch_json "${BASE}/api/render-plan?debug=1" || exit 1

# Optional static-first confirmations (won't fail build if absent; comment in if you want strict)
# fetch_json "${BASE}/data/bundle.json" || exit 1
# fetch_json "${BASE}/data/render-plan.json" || exit 1

echo ""
echo "OK: verify-api passed."
