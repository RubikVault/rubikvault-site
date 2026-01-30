#!/bin/zsh
# verify-truth-artifacts.sh
# Verifies that required truth artifacts exist locally and/or are served live.
#
# Usage:
#   ./scripts/ops/verify-truth-artifacts.sh           # Check local files only
#   ./scripts/ops/verify-truth-artifacts.sh --live    # Check live URLs (requires BASE env var)

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

LOCAL_ARTIFACTS=(
  "public/data/pipeline/missing.json"
  "public/data/pipeline/nasdaq100.pipeline-truth.json"
  "public/data/pipeline/nasdaq100.latest.json"
  "public/data/pipeline/nasdaq100.static-ready.json"
  "public/data/pipeline/nasdaq100.computed.json"
  "public/data/pipeline/nasdaq100.validated.json"
  "public/data/pipeline/nasdaq100.fetched.json"
)

LIVE_PATHS=(
  "/data/pipeline/missing.json"
  "/data/pipeline/nasdaq100.pipeline-truth.json"
  "/data/pipeline/nasdaq100.latest.json"
  "/data/pipeline/nasdaq100.static-ready.json"
)

echo "=== Truth Artifacts Verification ==="

# Local file check
echo ""
echo "Checking local files..."
local_pass=0
local_fail=0

for artifact in "${LOCAL_ARTIFACTS[@]}"; do
  full_path="$REPO_ROOT/$artifact"
  if [[ -f "$full_path" ]]; then
    size=$(stat -f%z "$full_path" 2>/dev/null || stat --printf="%s" "$full_path" 2>/dev/null || echo "?")
    echo "  ✓ $artifact ($size bytes)"
    local_pass=$((local_pass + 1))
  else
    echo "  ✗ $artifact (MISSING)"
    local_fail=$((local_fail + 1))
  fi
done

echo ""
echo "Local: $local_pass passed, $local_fail failed"

# Live check
if [[ "$1" == "--live" ]]; then
  if [[ -z "$BASE" ]]; then
    echo ""
    echo "ERROR: BASE environment variable required for --live check"
    echo "Example: BASE=https://d90a2286.rubikvault-site.pages.dev ./scripts/ops/verify-truth-artifacts.sh --live"
    exit 1
  fi

  echo ""
  echo "Checking live URLs at $BASE..."
  live_pass=0
  live_fail=0

  for path in "${LIVE_PATHS[@]}"; do
    url="${BASE}${path}"
    status=$(curl -s -o /dev/null -w "%{http_code}" "$url" 2>/dev/null || echo "000")
    if [[ "$status" == "200" ]]; then
      echo "  ✓ $path (HTTP $status)"
      live_pass=$((live_pass + 1))
    else
      echo "  ✗ $path (HTTP $status)"
      live_fail=$((live_fail + 1))
    fi
  done

  echo ""
  echo "Live: $live_pass passed, $live_fail failed"
  
  if [[ $live_fail -gt 0 ]]; then
    exit 1
  fi
fi

if [[ $local_fail -gt 0 ]]; then
  exit 1
fi

echo ""
echo "✓ All checks passed"
