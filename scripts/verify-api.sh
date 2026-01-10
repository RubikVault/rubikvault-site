#!/usr/bin/env bash

set -euo pipefail

BASE_URL="${PREVIEW:-http://localhost:8788}"
REPORT_DIR="debug"
TMP_DIR="$(mktemp -d)"
ENDPOINTS=(
  "/api/bundle?debug=1"
  "/api/render-plan?debug=1"
)

cleanup() {
  rm -rf "$TMP_DIR"
}
trap cleanup EXIT

maybe_make_report_dir() {
  if [ ! -d "$REPORT_DIR" ]; then
    mkdir -p "$REPORT_DIR" || true
  fi
}

fetch_endpoint() {
  local endpoint="$1"
  local outfile="$2"
  curl -sS -L "${BASE_URL}${endpoint}" -o "$outfile"
}

ensure_json() {
  local file="$1"
  jq . >/dev/null <"$file"
}

ensure_envelope() {
  local file="$1"
  local has_keys
  has_keys=$(jq 'has("ok") and has("feature") and has("meta") and has("data")' <"$file")
  if [ "$has_keys" != "true" ]; then
    echo "Envelope missing required keys" >&2
    return 1
  fi
  local meta_null
  meta_null=$(jq '.meta == null' <"$file")
  if [ "$meta_null" = "true" ]; then
    echo "meta is null" >&2
    return 1
  fi
  local data_undefined
  data_undefined=$(jq 'has("data")' <"$file")
  if [ "$data_undefined" != "true" ]; then
    echo "data undefined" >&2
    return 1
  fi
}

secrets_scan() {
  local file="$1"
  if grep -Eqi "(sk-[a-z0-9]{8,}|bearer[[:space:]]+[a-z0-9._\\-]{8,}|token=\\s*[a-z0-9._\\-]{8,}|api[_-]?key=\\s*[a-z0-9._\\-]{8,}|authorization\\s*:\\s*[a-z0-9+\\/.=:_\\-]{8,})" "$file"; then
    echo "Secret-like pattern detected" >&2
    return 1
  fi
}

build_report_entry() {
  local file="$1"
  jq -c '{ok, feature, meta, error}' <"$file"
}

main() {
  maybe_make_report_dir

  local markdown_report="# Verify API Report\n\n"
  local json_report="[]"
  local blocking_fail=0

  for ep in "${ENDPOINTS[@]}"; do
    local outfile="${TMP_DIR}/$(echo "$ep" | tr '/?&=' '_').json"
    if ! fetch_endpoint "$ep" "$outfile"; then
      echo "Failed to fetch $ep" >&2
      blocking_fail=1
      continue
    fi

    if ! ensure_json "$outfile"; then
      echo "Invalid JSON for $ep" >&2
      blocking_fail=1
      continue
    fi

    if ! ensure_envelope "$outfile"; then
      echo "Envelope check failed for $ep" >&2
      blocking_fail=1
    fi

    if ! secrets_scan "$outfile"; then
      echo "Secrets detected in $ep" >&2
      blocking_fail=1
    fi

    local entry
    entry=$(build_report_entry "$outfile")
    json_report=$(echo "$json_report" | jq --argjson e "$entry" '. + [$e]')
    markdown_report+="- ${ep}: \`$(echo "$entry" | jq -r '.feature')\` ok=$(echo "$entry" | jq -r '.ok') status=$(echo "$entry" | jq -r '.meta.status // "UNKNOWN"') emptyReason=$(echo "$entry" | jq -r '.meta.emptyReason // "none"')\n"
  done

  markdown_report+="\n"

  echo -e "$markdown_report"
  echo "$json_report" | jq '.' >"${TMP_DIR}/verify-report.json"
  echo -e "$markdown_report" >"${TMP_DIR}/verify-report.md"

  cp "${TMP_DIR}/verify-report.json" "${REPORT_DIR}/verify-report.json" 2>/dev/null || true
  cp "${TMP_DIR}/verify-report.md" "${REPORT_DIR}/verify-report.md" 2>/dev/null || true

  if [ "$blocking_fail" -ne 0 ]; then
    echo "Blocking issues detected" >&2
    exit 1
  fi

  exit 0
}

main "$@"
