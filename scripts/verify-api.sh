#!/usr/bin/env bash
set -euo pipefail

# Usage:
#   ./scripts/verify-api.sh https://<pages>.pages.dev
# or BASE=https://... ./scripts/verify-api.sh
BASE="${BASE:-${1:-}}"
if [[ -z "${BASE}" ]]; then
  echo "ERR: BASE required. Usage: ./scripts/verify-api.sh https://example.pages.dev" >&2
  exit 2
fi
BASE="${BASE%/}"

need() { command -v "$1" >/dev/null 2>&1 || { echo "ERR: missing dep: $1" >&2; exit 2; }; }
need curl
need python3

tmpdir="$(mktemp -d)"
trap 'rm -rf "$tmpdir"' EXIT

fetch_to_file() {
  local url="$1"
  local out="$2"
  local code ctype
  code="$(curl -sS -L -o "$out" -w "%{http_code}" -H 'accept: application/json' "$url" || true)"
  ctype="$(curl -sSI -L -H 'accept: application/json' "$url" | tr -d '\r' | awk -F': ' 'tolower($1)=="content-type"{print $2}' | tail -n1)"
  echo "FETCH $url"
  echo "HTTP $code ctype=${ctype:-unknown}"
  [[ "$code" == "200" ]] || { echo "ERR: HTTP $code for $url" >&2; return 1; }
  if [[ "${ctype:-}" != application/json* && "${ctype:-}" != */json* ]]; then
    echo "ERR: non-JSON content-type for $url: ${ctype:-unknown}" >&2
    echo "SNIP: $(head -c 160 "$out" | tr '\n' ' ')" >&2
    return 1
  fi
  return 0
}

ensure_json_parse() {
  local path="$1"
  python3 - "$path" <<'PY'
import json,sys
p=sys.argv[1]
with open(p,'rb') as f:
  b=f.read()
s=b.decode('utf-8','replace').lstrip("\ufeff").strip()
try:
  json.loads(s)
except Exception as e:
  print("ERR non-JSON:", str(e))
  print("SNIP:", s[:240].replace("\n"," "))
  sys.exit(2)
print("OK JSON")
PY
}

# Option A (static-first): verify SSOT assets, NOT /api/* debug endpoints
ENDPOINTS=(
  "/data/bundle.json"
  "/data/render-plan.json"
)

echo "# Verify API Report (static-only)" 
echo ""

fail=0
for ep in "${ENDPOINTS[@]}"; do
  out="$tmpdir/$(echo "$ep" | tr '/?&=' '_' ).json"
  if ! fetch_to_file "${BASE}${ep}" "$out"; then fail=1; continue; fi
  if ! ensure_json_parse "$out"; then fail=1; continue; fi
done

echo ""
if [[ "$fail" -ne 0 ]]; then
  echo "Blocking issues detected" >&2
  exit 1
fi
echo "OK: verify-api passed (static-only)."
