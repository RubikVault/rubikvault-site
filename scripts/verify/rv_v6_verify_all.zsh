# v6 system verifier (CI-correct, Option-A aware)
rv_v6_verify_all() {
  emulate -L zsh
  set -o pipefail
  set +H || true

  local repo="/Users/michaelpuchowezki/Dev/rubikvault-site"
  cd "$repo" || return 1

  echo "==[0] repo + branch ==" || return 1
  git rev-parse --show-toplevel || return 1
  git rev-parse --abbrev-ref HEAD || return 1
  echo ""

  echo "==[1] show v6 commits present locally ==" || return 1
  git --no-pager log --oneline -n 8 || return 1
  echo ""
  git show --name-status --oneline effe539a -- 2>/dev/null || { echo "ERR: commit effe539a not found locally"; return 1; }
  echo ""
  git show --name-status --oneline 70e71f7a -- 2>/dev/null || { echo "ERR: commit 70e71f7a not found locally"; return 1; }
  echo ""

  echo "==[2] required files exist ==" || return 1
  test -f ".github/workflows/forecast-v6-publish.yml" || { echo "ERR: missing .github/workflows/forecast-v6-publish.yml"; return 1; }
  test -d "tests/forecast" || { echo "ERR: missing tests/forecast"; return 1; }
  test -f "scripts/forecast/v6/run_daily_v6.mjs" || { echo "ERR: missing scripts/forecast/v6/run_daily_v6.mjs"; return 1; }
  test -d "policies/forecast/v6" || { echo "ERR: missing policies/forecast/v6"; return 1; }
  test -d "schemas/forecast/v6" || { echo "ERR: missing schemas/forecast/v6"; return 1; }
  echo "OK: v6 core assets present"
  echo ""

  echo "==[3] .gitignore hygiene lines present ==" || return 1
  for line in \
    "public/data/forecast/v6/" \
    "mirrors/forecast/ledgers/" \
    "mirrors/forecast/last_good/" \
    "public/data/forecast/system/" \
    "proof.html"
  do
    grep -qxF "$line" .gitignore || { echo "ERR: .gitignore missing line: $line"; return 1; }
  done
  echo "OK: .gitignore has v6 hygiene lines"
  echo ""

  echo "==[4] verify artifacts are NOT tracked (should output nothing) ==" || return 1
  git ls-files "public/data/forecast/v6/**" "mirrors/forecast/ledgers/**" "mirrors/forecast/last_good/**" "public/data/forecast/system/**" "proof.html" | sed 's/^/TRACKED: /'
  echo "If you see any TRACKED lines above => STOP (should be empty)."
  echo ""

  echo "==[5] verify the workflow+tests are tracked ==" || return 1
  git ls-files ".github/workflows/forecast-v6-publish.yml" "tests/forecast/**" | sed 's/^/OK: /' || return 1
  echo ""

  echo "==[6] verify v6 stack is tracked ==" || return 1
  git ls-files "scripts/forecast/v6/**" "policies/forecast/v6/**" "schemas/forecast/v6/**" | wc -l | awk '{print "tracked v6 files:", $1}'
  echo ""

  echo "==[7] quick UI read-contract smoke: ensure UI does NOT read mirrors/ (best-effort) ==" || return 1
  (rg -n "mirrors/forecast" src public scripts 2>/dev/null || true) | head -n 60
  echo ""

  echo "==[8] run tests (includes v6 tests) ==" || return 1
  if command -v npm >/dev/null 2>&1; then
    npm -s test || return 1
  else
    echo "ERR: npm not found"
    return 1
  fi
  echo ""

  echo "==[9] run v6 local validation commands if present (best-effort) ==" || return 1
  if [ -f "scripts/forecast/v6/secrecy_scan.mjs" ]; then
    node "scripts/forecast/v6/secrecy_scan.mjs" --mode=CI || return 1
  else
    echo "NOTE: scripts/forecast/v6/secrecy_scan.mjs not found (skipping)"
  fi

  if [ -f "scripts/forecast/v6/test_determinism.mjs" ]; then
    node "scripts/forecast/v6/test_determinism.mjs" --date "2026-02-06" || return 1
  else
    echo "NOTE: scripts/forecast/v6/test_determinism.mjs not found (skipping)"
  fi

  if [ -f "scripts/forecast/v6/validate_published_v6.mjs" ]; then
    node "scripts/forecast/v6/validate_published_v6.mjs" --date "2026-02-06" || return 1
  else
    echo "NOTE: scripts/forecast/v6/validate_published_v6.mjs not found (skipping)"
  fi
  echo ""

  echo "==[10] run v6 daily in CI-degrade mode (dry-run if supported) ==" || return 1
  if node "scripts/forecast/v6/run_daily_v6.mjs" --help 2>/dev/null | rg -q -- "--dry-run"; then
    node "scripts/forecast/v6/run_daily_v6.mjs" --date "2026-02-06" --mode=CI --dry-run || return 1
  else
    node "scripts/forecast/v6/run_daily_v6.mjs" --date "2026-02-06" --mode=CI || return 1
  fi
  echo ""

  echo "==[11] final git status (tell me if there is unrelated noise) ==" || return 1
  git status --short || return 1
  echo ""

  echo "OK: v6 verify pass (as far as these checks can assert)."
}

rv_v6_verify_all
