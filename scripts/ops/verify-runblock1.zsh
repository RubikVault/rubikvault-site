#!/usr/bin/env zsh
# verify-runblock1.zsh - Runblock 1 deterministic verification script
# Usage: zsh scripts/ops/verify-runblock1.zsh
#
# This script verifies:
# 1. All expected files exist at correct paths
# 2. Local contract tests pass
# 3. Preview API endpoints return valid envelope JSON

emulate -L zsh
set -o pipefail

# ─────────────────────────────────────────────────────────────────────────────
# Configuration
# ─────────────────────────────────────────────────────────────────────────────

PREVIEW_BASE="${PREVIEW_BASE:-https://1e178517.rubikvault-site.pages.dev}"
SCRIPT_DIR="${0:A:h}"
REPO_ROOT="${SCRIPT_DIR:h:h}"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

pass_count=0
fail_count=0

# ─────────────────────────────────────────────────────────────────────────────
# Helper Functions
# ─────────────────────────────────────────────────────────────────────────────

log_pass() {
  echo "${GREEN}✅ PASS${NC}: $1"
  ((pass_count++))
}

log_fail() {
  echo "${RED}❌ FAIL${NC}: $1"
  ((fail_count++))
}

log_skip() {
  echo "${YELLOW}⏭️  SKIP${NC}: $1"
}

log_info() {
  echo "${BLUE}ℹ️  INFO${NC}: $1"
}

log_section() {
  echo ""
  echo "${BLUE}═══════════════════════════════════════════════════════════════${NC}"
  echo "${BLUE}  $1${NC}"
  echo "${BLUE}═══════════════════════════════════════════════════════════════${NC}"
}

# ─────────────────────────────────────────────────────────────────────────────
# Step 1: Verify Expected Files Exist
# ─────────────────────────────────────────────────────────────────────────────

verify_files() {
  log_section "Step 1: Verifying Expected Files"
  
  local expected_files=(
    "config/symbols.json"
    "config/symbols.schema.json"
    "scripts/validate-symbols.mjs"
    "scripts/test-envelope.mjs"
    "functions/api/_middleware.js"
    "functions/api/_shared/envelope.js"
    "src/lib/envelope.ts"
    "src/lib/freshness.ts"
    ".github/workflows/ci-gates.yml"
  )

  local all_found=true
  for file in "${expected_files[@]}"; do
    local full_path="${REPO_ROOT}/${file}"
    if [[ -f "$full_path" ]]; then
      log_pass "Found: $file"
    else
      log_fail "Missing: $file"
      all_found=false
    fi
  done

  if $all_found; then
    log_pass "All expected files present"
  fi
}

# ─────────────────────────────────────────────────────────────────────────────
# Step 2: Run Local Contract Tests
# ─────────────────────────────────────────────────────────────────────────────

run_local_tests() {
  log_section "Step 2: Running Local Contract Tests"
  
  cd "$REPO_ROOT" || { log_fail "Could not cd to repo root"; return 1; }

  # validate:symbols
  log_info "Running npm run validate:symbols..."
  if npm run validate:symbols 2>&1; then
    log_pass "validate:symbols passed"
  else
    log_fail "validate:symbols failed"
  fi

  # test:envelope
  log_info "Running npm run test:envelope..."
  if npm run test:envelope 2>&1; then
    log_pass "test:envelope passed"
  else
    log_fail "test:envelope failed"
  fi

  # test:contracts (if exists)
  if grep -q '"test:contracts"' "${REPO_ROOT}/package.json" 2>/dev/null; then
    log_info "Running npm run test:contracts..."
    if npm run test:contracts 2>&1; then
      log_pass "test:contracts passed"
    else
      log_fail "test:contracts failed"
    fi
  else
    log_skip "test:contracts missing (not in package.json)"
  fi
}

# ─────────────────────────────────────────────────────────────────────────────
# Step 3: Verify Preview API Envelope Shape
# ─────────────────────────────────────────────────────────────────────────────

# Verify a single endpoint returns valid envelope JSON
# Args: $1 = endpoint path (e.g. /api/resolve?debug=1)
#       $2 = expected_ok ("true" or "false" or "any")
#       $3 = debug_check ("cache" to enforce debug cache checks)
verify_envelope() {
  local endpoint="$1"
  local expected_ok="${2:-any}"
  local debug_check="${3:-}"
  local url="${PREVIEW_BASE}${endpoint}"
  
  local tmp_headers=$(mktemp)
  local tmp_body=$(mktemp)
  
  # Fetch with curl
  local http_code
  http_code=$(curl -sSf -D "$tmp_headers" -o "$tmp_body" -w "%{http_code}" --max-time 30 "$url" 2>&1)
  local curl_exit=$?
  
  if [[ $curl_exit -ne 0 ]]; then
    log_fail "Endpoint $endpoint: curl failed (exit $curl_exit)"
    rm -f "$tmp_headers" "$tmp_body"
    return 1
  fi

  # Check Content-Type
  local content_type
  content_type=$(grep -i "^content-type:" "$tmp_headers" | head -1 | tr -d '\r\n')
  if [[ ! "$content_type" =~ "application/json" ]]; then
    log_fail "Endpoint $endpoint: Content-Type not JSON ($content_type)"
    rm -f "$tmp_headers" "$tmp_body"
    return 1
  fi

  if [[ "$debug_check" == "cache" ]]; then
    if grep -E "\"cache_key\"|\"swr_key\"" "$tmp_body" >/dev/null 2>&1; then
      log_fail "Endpoint $endpoint: public debug leaked cache_key/swr_key"
      rm -f "$tmp_headers" "$tmp_body"
      return 1
    fi
  fi

  local jq_err
  jq_err=$(mktemp)
  jq -e --arg expected_ok "$expected_ok" --arg debug_check "$debug_check" '
    def err($msg): ($msg | halt_error(1));
    if (.ok|type)!="boolean" then err("ok is not boolean")
    elif (.meta|type)!="object" then err("meta missing or not object")
    elif (.meta.status|type)!="string" then err("meta.status is not string")
    elif (.meta.generated_at|type)!="string" then err("meta.generated_at is not string")
    elif (.meta.data_date|type)!="string" then err("meta.data_date is not string")
    elif (.meta.data_date=="") then err("meta.data_date is empty (must be YYYY-MM-DD)")
    elif ((.meta.data_date|test("^\\d{4}-\\d{2}-\\d{2}$"))|not) then err("meta.data_date does not match YYYY-MM-DD format")
    elif (.meta.provider|type)!="string" or (.meta.provider|length)==0 then err("meta.provider is not a non-empty string")
    elif (.ok==false and ((.error|type)!="object")) then err("ok=false but error is missing")
    elif (.ok==false and ((.error.code|type)!="string")) then err("ok=false but error.code is missing")
    elif (.ok==false and .meta.status!="error") then err("ok=false but meta.status is not error")
    elif ($debug_check=="cache" and (.meta.cache|type)!="object") then err("meta.cache missing or not object")
    elif ($debug_check=="cache" and (.meta|has("timings")) and (.meta.timings|type)!="object") then err("meta.timings is not object")
    elif ($expected_ok=="true" and .ok!=true) then err("expected ok=true but got ok=" + (.ok|tostring))
    elif ($expected_ok=="false" and .ok!=false) then err("expected ok=false but got ok=" + (.ok|tostring))
    else true end
  ' "$tmp_body" 2>"$jq_err"

  local jq_exit=$?

  if [[ $jq_exit -eq 0 ]]; then
    local status data_date provider ok_val error_code
    status=$(jq -r '.meta.status' "$tmp_body")
    data_date=$(jq -r '.meta.data_date' "$tmp_body")
    provider=$(jq -r '.meta.provider' "$tmp_body")
    ok_val=$(jq -r '.ok' "$tmp_body")
    error_code=$(jq -r '.error.code // "none"' "$tmp_body")
    local summary="status=${status},data_date=${data_date},provider=${provider},http=${http_code},ok=${ok_val},error_code=${error_code}"
    log_pass "Endpoint $endpoint: envelope valid ($summary)"
  else
    local error_msg
    error_msg=$(tail -1 "$jq_err")
    log_fail "Endpoint $endpoint: BAD ENVELOPE SHAPE - $error_msg"
  fi

  rm -f "$jq_err" "$tmp_headers" "$tmp_body"
  return $jq_exit
}

# Verify a POST endpoint returns valid envelope JSON
# Args: $1 = endpoint path, $2 = expected_ok, $3 = body JSON, $4 = optional auth token
verify_post_envelope() {
  local endpoint="$1"
  local expected_ok="${2:-any}"
  local body="${3:-{}}"
  local token="${4:-}"
  local url="${PREVIEW_BASE}${endpoint}"

  local tmp_headers=$(mktemp)
  local tmp_body=$(mktemp)

  local http_code
  if [[ -n "$token" ]]; then
    http_code=$(curl -sSf -D "$tmp_headers" -o "$tmp_body" -w "%{http_code}" --max-time 30 \
      -H "Content-Type: application/json" -H "X-Admin-Token: ${token}" \
      -X POST -d "$body" "$url" 2>&1)
  else
    http_code=$(curl -sSf -D "$tmp_headers" -o "$tmp_body" -w "%{http_code}" --max-time 30 \
      -H "Content-Type: application/json" -X POST -d "$body" "$url" 2>&1)
  fi
  local curl_exit=$?
  if [[ $curl_exit -ne 0 ]]; then
    log_fail "Endpoint $endpoint (POST): curl failed (exit $curl_exit)"
    rm -f "$tmp_headers" "$tmp_body"
    return 1
  fi

  local jq_err
  jq_err=$(mktemp)
  jq -e --arg expected_ok "$expected_ok" '
    def err($msg): ($msg | halt_error(1));
    if (.ok|type)!="boolean" then err("ok is not boolean")
    elif (.meta|type)!="object" then err("meta missing or not object")
    elif (.meta.status|type)!="string" then err("meta.status is not string")
    elif (.meta.generated_at|type)!="string" then err("meta.generated_at is not string")
    elif (.meta.data_date|type)!="string" then err("meta.data_date is not string")
    elif (.meta.data_date=="") then err("meta.data_date is empty")
    elif ((.meta.data_date|test("^\\d{4}-\\d{2}-\\d{2}$"))|not) then err("meta.data_date does not match YYYY-MM-DD format")
    elif (.meta.provider|type)!="string" or (.meta.provider|length)==0 then err("meta.provider missing")
    elif (.ok==false and ((.error|type)!="object")) then err("ok=false but error missing")
    elif (.ok==false and .meta.status!="error") then err("ok=false but meta.status is not error")
    elif ($expected_ok=="true" and .ok!=true) then err("expected ok=true but got ok=" + (.ok|tostring))
    elif ($expected_ok=="false" and .ok!=false) then err("expected ok=false but got ok=" + (.ok|tostring))
    else true end
  ' "$tmp_body" 2>"$jq_err"

  local jq_exit=$?
  if [[ $jq_exit -eq 0 ]]; then
    local status data_date provider ok_val error_code
    status=$(jq -r '.meta.status' "$tmp_body")
    data_date=$(jq -r '.meta.data_date' "$tmp_body")
    provider=$(jq -r '.meta.provider' "$tmp_body")
    ok_val=$(jq -r '.ok' "$tmp_body")
    error_code=$(jq -r '.error.code // "none"' "$tmp_body")
    local summary="status=${status},data_date=${data_date},provider=${provider},http=${http_code},ok=${ok_val},error_code=${error_code}"
    log_pass "Endpoint $endpoint (POST): envelope valid ($summary)"
  else
    local error_msg
    error_msg=$(tail -1 "$jq_err")
    log_fail "Endpoint $endpoint (POST): BAD ENVELOPE SHAPE - $error_msg"
  fi

  rm -f "$jq_err" "$tmp_headers" "$tmp_body"
  return $jq_exit
}

verify_not_fresh() {
  local endpoint="$1"
  local url="${PREVIEW_BASE}${endpoint}"
  local tmp_body=$(mktemp)
  local http_code
  http_code=$(curl -sSf -o "$tmp_body" -w "%{http_code}" --max-time 30 "$url" 2>&1)
  local curl_exit=$?
  if [[ $curl_exit -ne 0 ]]; then
    log_fail "Endpoint $endpoint: curl failed (exit $curl_exit)"
    rm -f "$tmp_body"
    return 1
  fi
  local jq_err
  jq_err=$(mktemp)
  jq -e '
    def err($msg): ($msg | halt_error(1));
    if (.meta.status|type)!="string" then err("meta.status missing")
    elif ((.meta.status|ascii_downcase)=="fresh" or (.meta.status|ascii_downcase)=="live") then err("meta.status should not be fresh/live")
    else true end
  ' "$tmp_body" 2>"$jq_err"
  local jq_exit=$?
  if [[ $jq_exit -eq 0 ]]; then
    local status
    status=$(jq -r '.meta.status' "$tmp_body")
    log_pass "Endpoint $endpoint: freshness transition ok ($status)"
  else
    local error_msg
    error_msg=$(tail -1 "$jq_err")
    log_fail "Endpoint $endpoint: freshness transition check failed ($error_msg)"
  fi
  rm -f "$jq_err"
  rm -f "$tmp_body"
  return $jq_exit
}

verify_scheduler_health_payload() {
  local endpoint="/api/scheduler/health"
  local url="${PREVIEW_BASE}${endpoint}"
  local tmp_body=$(mktemp)

  local http_code
  http_code=$(curl -sSf -o "$tmp_body" -w "%{http_code}" --max-time 30 "$url" 2>&1)
  local curl_exit=$?
  if [[ $curl_exit -ne 0 ]]; then
    log_fail "Endpoint $endpoint: curl failed (exit $curl_exit)"
    rm -f "$tmp_body"
    return 1
  fi

  local jq_err
  jq_err=$(mktemp)
  jq -e '
    def err($msg): ($msg | halt_error(1));
    if (.data|type)!="object" then err("data must be an object")
    elif (.data|has("last_ok")|not) then err("data.last_ok missing")
    elif (.data|has("age_s")|not) then err("data.age_s missing")
    elif (.data.max_age_s|type)!="number" then err("data.max_age_s missing")
    else true end
  ' "$tmp_body" 2>"$jq_err"
  local jq_exit=$?
  if [[ $jq_exit -ne 0 ]]; then
    local error_msg
    error_msg=$(tail -1 "$jq_err")
    log_fail "Endpoint $endpoint: scheduler health data payload invalid ($error_msg)"
    rm -f "$jq_err" "$tmp_body"
    return 1
  fi

  log_pass "Endpoint $endpoint: scheduler health data payload includes last_ok/age_s/max_age_s"
  rm -f "$jq_err"
  rm -f "$tmp_body"
}

verify_preview_endpoints() {
  log_section "Step 3: Verifying Preview API Envelope Shape"
  log_info "Preview base URL: $PREVIEW_BASE"
  
  # Normal success endpoints
  verify_envelope "/api/resolve?debug=1" "any" "cache"
  verify_envelope "/api/stock?debug=1" "any" "cache"

  # Scheduler health
  verify_envelope "/api/scheduler/health" "any"
  verify_scheduler_health_payload
  
  # Try health endpoint, fallback to another if not found
  local health_result
  health_result=$(curl -sS -o /dev/null -w "%{http_code}" --max-time 10 "${PREVIEW_BASE}/api/health" 2>&1)
  if [[ "$health_result" =~ ^[0-9]+$ ]] && [[ "$health_result" -ne 000 ]]; then
    verify_envelope "/api/health?debug=1" "any"
  else
    log_info "No /api/health endpoint, testing /api/metrics instead"
    verify_envelope "/api/metrics?debug=1" "any"
  fi
  
  # Error path: non-existent endpoint should return envelope with ok=false
  log_info "Testing error path (404)..."
  verify_envelope "/api/does-not-exist-runblock1-test" "false"

  # Freshness transitions (error cases should not be fresh)
  verify_not_fresh "/api/stock?ticker=INVALID&debug=1"
  verify_not_fresh "/api/resolve?q=notarealcompany&debug=1"
}

verify_privileged_debug_keys() {
  local endpoint="$1"
  if [[ -z "${RV_ADMIN_TOKEN:-}" ]]; then
    log_skip "Privileged debug checks skipped (RV_ADMIN_TOKEN not set)"
    return 0
  fi
  local url="${PREVIEW_BASE}${endpoint}"
  local tmp_body=$(mktemp)
  local http_code
  http_code=$(curl -sS -o "$tmp_body" -w "%{http_code}" --max-time 30 -H "X-Admin-Token: ${RV_ADMIN_TOKEN}" "$url" 2>&1)
  local curl_exit=$?
  if [[ $curl_exit -ne 0 ]]; then
    log_fail "Privileged debug $endpoint: curl failed (exit $curl_exit)"
    rm -f "$tmp_body"
    return 1
  fi
  if grep -E "\"cache_key\"|\"swr_key\"" "$tmp_body" >/dev/null 2>&1; then
    log_pass "Privileged debug $endpoint: cache_key/swr_key present (allowed)"
  else
    log_info "Privileged debug $endpoint: cache_key/swr_key not present (allowed)"
  fi
  rm -f "$tmp_body"
  return 0
}

# ─────────────────────────────────────────────────────────────────────────────
# Main
# ─────────────────────────────────────────────────────────────────────────────

main() {
  log_section "Runblock 1 Verification Script"
  log_info "Repo root: $REPO_ROOT"
  log_info "Preview URL: $PREVIEW_BASE"
  
  verify_files
  run_local_tests
  verify_preview_endpoints
verify_privileged_debug_keys "/api/resolve?debug=1"
verify_privileged_debug_keys "/api/stock?debug=1"

  # Scheduler trigger (unauth should fail)
  verify_post_envelope "/api/scheduler/run" "false" '{"job":"eod_stock","mode":"s2","assets":[{"ticker":"SPY"}]}' ""

  # Scheduler trigger (auth required)
  if [[ -n "${RV_ADMIN_TOKEN:-}" ]]; then
    verify_post_envelope "/api/scheduler/run" "any" '{"job":"eod_stock","mode":"s2","assets":[{"ticker":"SPY"}]}' "${RV_ADMIN_TOKEN}"
  else
    log_skip "Scheduler trigger privileged check skipped (RV_ADMIN_TOKEN not set)"
  fi
  
  log_section "Summary"
  echo "Passed: ${GREEN}${pass_count}${NC}"
  echo "Failed: ${RED}${fail_count}${NC}"
  
  if [[ $fail_count -gt 0 ]]; then
    echo ""
    echo "${RED}❌ RUNBLOCK 1 VERIFICATION FAILED${NC}"
    exit 1
  else
    echo ""
    echo "${GREEN}✅ RUNBLOCK 1 VERIFICATION PASSED${NC}"
    exit 0
  fi
}

main "$@"
