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

  body=$(curl -sS --max-time 12 "$url")
  head20=$(printf "%s" "$body" | head -c 20)
  echo "$head20" | grep -qi "<!doctype\\|<html" && fail "HTML body for $url"
  echo "$head20" | grep -q "^<" && fail "HTML-like body for $url"
  echo "$head20" | grep -q "^{\\|^\\[" || fail "non-JSON body for $url"

  if [[ "$p" == "debug-bundle" ]]; then
    if [[ "$HAS_JQ" == "1" ]]; then
      printf "%s" "$body" | jq -e '(.ok==true) or (has("schema")) or (has("schemaVersion")) or (has("schema_version") and has("metadata"))' >/dev/null || fail "debug-bundle missing ok/schema/schemaVersion/schema_version+metadata for $url"
    else
      printf "%s" "$body" | grep -Eq '"ok"[[:space:]]*:[[:space:]]*true|"schema"|\"schemaVersion\"|"schema_version"|"metadata"' || fail "debug-bundle missing ok/schema/schemaVersion/schema_version+metadata for $url"
    fi
  else
    if [[ "$HAS_JQ" == "1" ]]; then
      kind=$(printf "%s" "$body" | jq -er '
        if (has("ok") and ((has("meta")) or (has("schemaVersion")))) then
          "legacy"
        elif (has("schema_version") and has("metadata") and has("data") and has("error")) then
          "v3_maintenance"
        elif (((.schemaVersion? == "v3") or (has("blockId"))) and (has("meta")) and (has("data"))) then
          "v3_flat"
        else
          "unknown"
        end
      ' 2>/dev/null || true)

      if [[ "$kind" == "legacy" ]]; then
        printf "%s" "$body" | jq -e 'has("ok")' >/dev/null || fail "legacy envelope missing .ok for $url"
        printf "%s" "$body" | jq -e 'has("meta") or has("schemaVersion")' >/dev/null || fail "legacy envelope missing meta/schemaVersion for $url"
      elif [[ "$kind" == "v3_maintenance" ]]; then
        printf "%s" "$body" | jq -e 'has("schema_version") and has("metadata") and has("data") and has("error")' >/dev/null || fail "v3 maintenance missing schema_version/metadata/data/error for $url"
      elif [[ "$kind" == "v3_flat" ]]; then
        printf "%s" "$body" | jq -e '(has("schemaVersion") and has("blockId") and has("meta") and has("data"))' >/dev/null || fail "v3-flat missing schemaVersion/blockId/meta/data for $url"
      else
        fail "unknown contract kind for $url"
      fi
    else
      # Heuristic fallback without jq:
      # - legacy: has "ok" and ("meta" or "schemaVersion")
      # - v3-flat: has "schemaVersion":"v3" or "blockId" plus "meta" and "data"
      if printf "%s" "$body" | grep -Eq '"schema_version"[[:space:]]*:'; then
        printf "%s" "$body" | grep -Eq '"metadata"[[:space:]]*:' || fail "v3 maintenance missing metadata for $url"
        printf "%s" "$body" | grep -Eq '"data"[[:space:]]*:' || fail "v3 maintenance missing data for $url"
        printf "%s" "$body" | grep -Eq '"error"[[:space:]]*:' || fail "v3 maintenance missing error for $url"
      elif printf "%s" "$body" | grep -Eq '"schemaVersion"[[:space:]]*:[[:space:]]*"v3"|"blockId"[[:space:]]*:'; then
        printf "%s" "$body" | grep -Eq '"schemaVersion"[[:space:]]*:' || fail "v3-flat missing schemaVersion for $url"
        printf "%s" "$body" | grep -Eq '"blockId"[[:space:]]*:' || fail "v3-flat missing blockId for $url"
        printf "%s" "$body" | grep -Eq '"meta"[[:space:]]*:' || fail "v3-flat missing meta for $url"
        printf "%s" "$body" | grep -Eq '"data"[[:space:]]*:' || fail "v3-flat missing data for $url"
      else
        printf "%s" "$body" | grep -Eq '"ok"[[:space:]]*:' || fail "legacy missing ok for $url"
        printf "%s" "$body" | grep -Eq '"meta"[[:space:]]*:|"schemaVersion"[[:space:]]*:' || fail "legacy missing meta/schemaVersion for $url"
      fi
    fi
  fi
done

echo "OK"
