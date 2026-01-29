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
  http_code=$(curl -sS -D "$tmp_headers" -o "$tmp_body" -w "%{http_code}" --max-time 30 "$url" 2>&1)
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

  # Parse JSON and validate envelope shape using node
  local validation_result
  validation_result=$(node -e "
    const fs = require('fs');
    try {
      const body = fs.readFileSync('$tmp_body', 'utf-8');
      const json = JSON.parse(body);
      
      const errors = [];
      
      // ok must be boolean
      if (typeof json.ok !== 'boolean') {
        errors.push('ok is not boolean');
      }
      
      // meta must be object
      if (!json.meta || typeof json.meta !== 'object') {
        errors.push('meta missing or not object');
      } else {
        // meta.status must be string
        if (typeof json.meta.status !== 'string') {
          errors.push('meta.status is not string');
        }
        // meta.generated_at must be string
        if (typeof json.meta.generated_at !== 'string') {
          errors.push('meta.generated_at is not string');
        }
        // meta.data_date must be non-empty string matching YYYY-MM-DD
        if (typeof json.meta.data_date !== 'string') {
          errors.push('meta.data_date is not string');
        } else if (json.meta.data_date === '') {
          errors.push('meta.data_date is empty (must be YYYY-MM-DD)');
        } else if (!/^\d{4}-\d{2}-\d{2}\$/.test(json.meta.data_date)) {
          errors.push('meta.data_date does not match YYYY-MM-DD format');
        }
        // meta.provider must be non-empty string (schema enforces this)
        if (typeof json.meta.provider !== 'string' || json.meta.provider.trim() === '') {
          errors.push('meta.provider is not a non-empty string');
        }
      }
      
      // When ok=false, error must be present with code
      if (json.ok === false) {
        if (!json.error || typeof json.error !== 'object') {
          errors.push('ok=false but error is missing');
        } else if (typeof json.error.code !== 'string') {
          errors.push('ok=false but error.code is missing');
        }
        // meta.status should be 'error' when ok=false
        if (json.meta && json.meta.status !== 'error') {
          errors.push('ok=false but meta.status is not error');
        }
      }
      
      const debugCheck = '$debug_check' === 'cache';
      if (debugCheck) {
        if (!json.meta.cache || typeof json.meta.cache !== 'object') {
          errors.push('meta.cache missing or not object');
        }
        if ('timings' in json.meta && (json.meta.timings === null || typeof json.meta.timings !== 'object')) {
          errors.push('meta.timings is not object');
        }
      }

      if (errors.length > 0) {
        console.log('FAIL:' + errors.join(', '));
        process.exit(1);
      }
      
      // Check expected_ok if specified
      const expectedOk = '$expected_ok';
      if (expectedOk === 'true' && json.ok !== true) {
        console.log('FAIL:expected ok=true but got ok=' + json.ok);
        process.exit(1);
      }
      if (expectedOk === 'false' && json.ok !== false) {
        console.log('FAIL:expected ok=false but got ok=' + json.ok);
        process.exit(1);
      }
      
      // Print success summary
      const errorCode = json.error ? json.error.code : 'none';
      console.log('OK:status=' + json.meta.status + ',data_date=' + json.meta.data_date + ',provider=' + json.meta.provider + ',http=' + '$http_code' + ',ok=' + json.ok + ',error_code=' + errorCode);
      process.exit(0);
    } catch (e) {
      console.log('FAIL:JSON parse error: ' + e.message);
      process.exit(1);
    }
  " 2>&1)
  
  local node_exit=$?
  
  if [[ $node_exit -eq 0 ]]; then
    local summary="${validation_result#OK:}"
    log_pass "Endpoint $endpoint: envelope valid ($summary)"
  else
    local error_msg="${validation_result#FAIL:}"
    log_fail "Endpoint $endpoint: BAD ENVELOPE SHAPE - $error_msg"
  fi
  
  rm -f "$tmp_headers" "$tmp_body"
  return $node_exit
}

verify_preview_endpoints() {
  log_section "Step 3: Verifying Preview API Envelope Shape"
  log_info "Preview base URL: $PREVIEW_BASE"
  
  # Normal success endpoints
  verify_envelope "/api/resolve?debug=1" "any" "cache"
  verify_envelope "/api/stock?debug=1" "any" "cache"
  
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
