#!/usr/bin/env bash
set -euo pipefail

BASE_DEFAULT="https://b2f2d030.rubikvault-site.pages.dev"
BASE="${BASE:-$BASE_DEFAULT}"
if [ -n "${1:-}" ]; then
  BASE="$1"
fi
BASE="${BASE%/}"

if command -v jq >/dev/null 2>&1; then
  HAS_JQ=1
else
  HAS_JQ=0
fi

if command -v python3 >/dev/null 2>&1; then
  HAS_PY=1
else
  HAS_PY=0
fi

if [ "$HAS_JQ" -eq 0 ] && [ "$HAS_PY" -eq 0 ]; then
  echo "ERROR: jq or python3 required for JSON parsing" >&2
  exit 4
fi

NON_JSON_SNIPPET=""

fetch_json_strict() {
  local url="$1"
  local body
  if ! body=$(curl -fsSL --max-time 20 "$url" 2>/dev/null); then
    return 10
  fi
  local trimmed
  trimmed="$(printf '%s' "$body" | sed -e 's/^[[:space:]]*//')"
  local first="${trimmed:0:1}"
  if [ "$first" != "{" ] && [ "$first" != "[" ]; then
    NON_JSON_SNIPPET="$(printf '%s' "$trimmed" | head -c 120)"
    return 11
  fi
  printf '%s' "$body"
}

extract_latest() {
  if [ "$HAS_JQ" -eq 1 ]; then
    jq -r '
      def v(x): if x==null then "" else x end;
      "status=" + (v(.meta.status)|tostring),
      "generatedAt=" + (v(.meta.generatedAt)|tostring),
      "path_short=" + (v(.data.paths.short)|tostring),
      "path_mid=" + (v(.data.paths.mid)|tostring),
      "path_long=" + (v(.data.paths.long)|tostring),
      "path_triggers=" + (v(.data.paths.triggers)|tostring),
      "path_health=" + (v(.data.paths.health)|tostring)
    '
  else
    python3 - <<'PY'
import json, sys
payload = json.load(sys.stdin)
meta = payload.get("meta") or {}
paths = (payload.get("data") or {}).get("paths") or {}

def out(key, value):
    if value is None:
        value = ""
    print(f"{key}={value}")

out("status", meta.get("status"))
out("generatedAt", meta.get("generatedAt"))
for key in ("short", "mid", "long", "triggers", "health"):
    out(f"path_{key}", paths.get(key))
PY
  fi
}

items_len() {
  if [ "$HAS_JQ" -eq 1 ]; then
    jq -r 'if (.data.items|type)=="array" then (.data.items|length) else 0 end'
  else
    python3 - <<'PY'
import json, sys
payload = json.load(sys.stdin)
items = (payload.get("data") or {}).get("items")
print(len(items) if isinstance(items, list) else 0)
PY
  fi
}

normalize_path() {
  local raw="$1"
  if [ -z "$raw" ]; then
    echo ""
    return
  fi
  if [[ "$raw" =~ ^https?:// ]]; then
    echo "$raw"
    return
  fi
  local cleaned="${raw#./}"
  if [[ "$cleaned" != /* ]]; then
    cleaned="/$cleaned"
  fi
  echo "${BASE}${cleaned}"
}

LATEST_JSON=""
SOURCE_URL=""
SOURCE_ERRORS=()

for url in "$BASE/api/rvci-engine?debug=1" "$BASE/mirrors/rvci_latest.json" "$BASE/data/rvci_latest.json"; do
  if LATEST_JSON=$(fetch_json_strict "$url"); then
    SOURCE_URL="$url"
    break
  else
    rc=$?
    if [ "$rc" -eq 11 ]; then
      SOURCE_ERRORS+=("NON_JSON:$url")
    else
      SOURCE_ERRORS+=("FETCH_FAIL:$url")
    fi
  fi
done

if [ -z "$SOURCE_URL" ]; then
  if printf '%s\n' "${SOURCE_ERRORS[@]}" | rg -q "NON_JSON"; then
    echo "NON_JSON detected for latest payload" >&2
    echo "Snippet: $NON_JSON_SNIPPET" >&2
    exit 1
  fi
  echo "ERROR: no latest payload available" >&2
  exit 4
fi

status=""
generatedAt=""
path_short=""
path_mid=""
path_long=""
path_triggers=""
path_health=""

while IFS='=' read -r key value; do
  case "$key" in
    status) status="$value" ;;
    generatedAt) generatedAt="$value" ;;
    path_short) path_short="$value" ;;
    path_mid) path_mid="$value" ;;
    path_long) path_long="$value" ;;
    path_triggers) path_triggers="$value" ;;
    path_health) path_health="$value" ;;
  esac
done < <(printf '%s' "$LATEST_JSON" | extract_latest)

missing=()
[ -n "$path_short" ] || missing+=("short")
[ -n "$path_mid" ] || missing+=("mid")
[ -n "$path_long" ] || missing+=("long")
[ -n "$path_triggers" ] || missing+=("triggers")

has_paths=0
if [ ${#missing[@]} -lt 4 ]; then
  has_paths=1
fi

missing_str="${missing[*]:-}"

printf 'source=%s\n' "$SOURCE_URL"
printf 'status=%s\n' "$status"
printf 'generatedAt=%s\n' "$generatedAt"
printf 'hasPaths=%s missing=%s\n' "$has_paths" "$missing_str"

if [ -z "$status" ] || [ -z "$generatedAt" ]; then
  echo "ERROR: missing meta.status or meta.generatedAt" >&2
  exit 4
fi

if [ ${#missing[@]} -eq 4 ]; then
  if [ "$status" = "SKIPPED_MARKET_CLOSED" ] || [ "$status" = "MARKET_NOT_CLOSED" ]; then
    echo "SKIPPED with no last-good paths available" >&2
    exit 0
  fi
  echo "ERROR: missing all required paths" >&2
  exit 4
fi

if [ ${#missing[@]} -gt 0 ]; then
  if [ "$status" = "SKIPPED_MARKET_CLOSED" ] || [ "$status" = "MARKET_NOT_CLOSED" ]; then
    echo "ERROR: SKIPPED but paths incomplete" >&2
    exit 3
  fi
  echo "ERROR: paths incomplete" >&2
  exit 4
fi

short_url=$(normalize_path "$path_short")
mid_url=$(normalize_path "$path_mid")
long_url=$(normalize_path "$path_long")
triggers_url=$(normalize_path "$path_triggers")

fetch_error=0
non_json_error=0

short_len=0
mid_len=0
long_len=0
triggers_len=0

for key in short mid long triggers; do
  url_var="${key}_url"
  url="${!url_var}"
  if json=$(fetch_json_strict "$url"); then
    len=$(printf '%s' "$json" | items_len)
    case "$key" in
      short) short_len=$len ;;
      mid) mid_len=$len ;;
      long) long_len=$len ;;
      triggers) triggers_len=$len ;;
    esac
  else
    rc=$?
    fetch_error=1
    if [ "$rc" -eq 11 ]; then
      non_json_error=1
      echo "NON_JSON for $key: $NON_JSON_SNIPPET" >&2
    else
      echo "FETCH_FAIL for $key" >&2
    fi
  fi
done

printf 'items short=%s mid=%s long=%s triggers=%s\n' "$short_len" "$mid_len" "$long_len" "$triggers_len"

if [ "$non_json_error" -eq 1 ]; then
  exit 1
fi

if [ "$fetch_error" -eq 1 ] && { [ "$status" = "SKIPPED_MARKET_CLOSED" ] || [ "$status" = "MARKET_NOT_CLOSED" ]; }; then
  echo "SKIPPED but paths failed to load" >&2
  exit 3
fi

if [ "$short_len" -eq 0 ] && [ "$mid_len" -eq 0 ] && [ "$long_len" -eq 0 ] && [ "$triggers_len" -eq 0 ]; then
  if [ "$status" = "SKIPPED_MARKET_CLOSED" ] || [ "$status" = "MARKET_NOT_CLOSED" ] || [ "$status" = "LIVE" ]; then
    echo "ZOMBIE: no items in any tab" >&2
    exit 2
  fi
fi

exit 0
