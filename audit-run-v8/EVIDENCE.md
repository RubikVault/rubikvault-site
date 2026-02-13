# EVIDENCE

## Scope
- Read-only forensic audit of workflows and run history.
- No repo code/workflow modifications were made.

## Commands (exact)
```bash
pwd
git rev-parse --show-toplevel
git status --porcelain=v1
git branch --show-current
git remote -v
git log -1 --oneline
ls -la .github/workflows
find .github/workflows -maxdepth 1 -type f \( -name "*.yml" -o -name "*.yaml" \) | wc -l
command -v gh && gh --version || echo "MISSING: gh"
command -v rg && rg --version || echo "MISSING: rg"
command -v jq && jq --version || echo "MISSING: jq"
command -v yq && yq --version || echo "MISSING: yq"
command -v actionlint && actionlint -version || echo "MISSING: actionlint"
command -v node && node --version || echo "MISSING: node"
command -v npm && npm --version || echo "MISSING: npm"
gh auth status
gh workflow list --all --json name,id,state,path
```

## Key output excerpts
```text
repo: /Users/michaelpuchowezki/Dev/rubikvault-site
branch: codex/p0p1-hardening
head: 5e3bb449 fix
workflow_count: 20
tools_missing: yq, actionlint
```

## Critical evidence pointers
- Missing registry targets expected by workflows/scripts:
  - .github/workflows/v3-scrape-template.yml:65
  - scripts/providers/market-prices-v3.mjs:640
  - scripts/providers/market-stats-v3.mjs:39
  - Disk check: `public/data/registry/modules.json` missing
- WAF/403 signatures:
  - run 21894211071 (Scheduler Kick): HTTP 403 + Cloudflare challenge HTML
  - run 21895644780 (Monitor Production Artifacts): curl (22) 403
- Forecast fail-loud data interlock:
  - run 21766433410: `CIRCUIT OPEN: Missing price data 80.7% exceeds threshold 5%`

## Repo/Tool live output
```text
/Users/michaelpuchowezki/Dev/rubikvault-site
/Users/michaelpuchowezki/Dev/rubikvault-site
?? RUNBOOK.md
?? audit-evidence/
?? audit-report/
?? audit-run-v8/
?? run-audit.sh
?? workflow_ids.txt
codex/p0p1-hardening
origin	https://github.com/RubikVault/rubikvault-site.git (fetch)
origin	https://github.com/RubikVault/rubikvault-site.git (push)
5e3bb449 fix
---
total 232
drwxr-xr-x@ 22 michaelpuchowezki  staff    704 Feb  9 15:46 .
drwxr-xr-x@  4 michaelpuchowezki  staff    128 Jan  7 12:31 ..
-rw-r--r--@  1 michaelpuchowezki  staff   1069 Feb  6 18:01 ci-determinism.yml
-rw-r--r--@  1 michaelpuchowezki  staff  17676 Feb 10 22:14 ci-gates.yml
-rw-r--r--@  1 michaelpuchowezki  staff    551 Feb  5 17:01 ci-policy.yml
-rw-r--r--@  1 michaelpuchowezki  staff   2404 Jan 30 14:05 cleanup-daily-snapshots.yml
-rw-r--r--@  1 michaelpuchowezki  staff    610 Feb  8 20:25 e2e-playwright.yml
-rw-r--r--@  1 michaelpuchowezki  staff   1576 Feb  6 21:58 eod-history-refresh.yml
-rw-r--r--@  1 michaelpuchowezki  staff   3254 Feb 10 22:16 eod-latest.yml
-rw-r--r--@  1 michaelpuchowezki  staff   2959 Feb  6 11:49 forecast-daily.yml
-rw-r--r--@  1 michaelpuchowezki  staff   2803 Feb  5 00:38 forecast-monthly.yml
-rw-r--r--@  1 michaelpuchowezki  staff   2734 Feb  5 17:01 forecast-rollback.yml
-rw-r--r--@  1 michaelpuchowezki  staff   3798 Feb  5 00:38 forecast-weekly.yml
-rw-r--r--@  1 michaelpuchowezki  staff   7060 Feb 10 22:18 monitor-prod.yml
-rw-r--r--@  1 michaelpuchowezki  staff   2868 Feb  5 17:02 ops-auto-alerts.yml
-rw-r--r--@  1 michaelpuchowezki  staff   3110 Feb 10 22:16 ops-daily.yml
-rw-r--r--@  1 michaelpuchowezki  staff   1171 Jan 30 14:05 refresh-health-assets.yml
-rw-r--r--@  1 michaelpuchowezki  staff   2128 Feb  8 20:12 scheduler-kick.yml
-rw-r--r--@  1 michaelpuchowezki  staff   1347 Feb  6 20:37 universe-refresh.yml
-rw-r--r--@  1 michaelpuchowezki  staff   8871 Feb  8 20:12 v3-finalizer.yml
-rw-r--r--@  1 michaelpuchowezki  staff  10979 Feb  8 20:12 v3-scrape-template.yml
-rw-r--r--@  1 michaelpuchowezki  staff   3543 Feb  8 20:12 wp16-manual-market-prices.yml
      20
---
/opt/homebrew/bin/gh
gh version 2.86.0 (2026-01-21)
https://github.com/cli/cli/releases/tag/v2.86.0
/opt/homebrew/bin/rg
ripgrep 15.1.0
/opt/homebrew/bin/jq
jq-1.8.1
MISSING: yq
MISSING: actionlint
/opt/homebrew/bin/node
v25.2.1
/opt/homebrew/bin/npm
11.6.2
---
github.com
  ✓ Logged in to github.com account RubikVault (keyring)
  - Active account: true
  - Git operations protocol: https
  - Token: gho_************************************
  - Token scopes: 'gist', 'read:org', 'repo', 'workflow'
```
# INVENTORY

Generated: 2026-02-11T18:04:24Z

| file | name | triggers | schedules | manual | scripts | writes(public/data/mirrors) | actions | secrets | permissions | concurrency |
|---|---|---|---|---|---|---|---:|---:|---|---|
| `.github/workflows/ci-determinism.yml` |  CI Determinism Check | 4:  push:,8:  pull_request: 12:  workflow_dispatch: | NONE | yes | L43,L46 L49 | NONE | 2 | 0 | no | yes |
| `.github/workflows/ci-gates.yml` |  CI Gates - Quality & Budget Checks | 4:  pull_request:,9:  push: | NONE | no | L121,L124 L130,L133 L137,L138 L139,L140 L142,L145 L148,L427 | L6,L13 L27,L28 | 7 | 0 | no | no |
| `.github/workflows/ci-policy.yml` |  CI Policy Check | 4:  push:,8:  workflow_dispatch: | NONE | yes | L26 | L7 | 1 | 0 | no | yes |
| `.github/workflows/cleanup-daily-snapshots.yml` |  Cleanup Daily Snapshots | 4:  schedule:,7:  workflow_dispatch: | L6:    - cron: "0 2 * * 0" | yes | NONE | L46,L52 L61 | 1 | 0 | yes | no |
| `.github/workflows/e2e-playwright.yml` |  e2e-playwright | 4:  workflow_dispatch:,5:  push: | NONE | yes | NONE | NONE | 0 | 0 | no | no |
| `.github/workflows/eod-history-refresh.yml` |  EOD History Refresh | 4:  schedule:,6:  workflow_dispatch: | L5:    - cron: '20 21 * * 1-5' # 21:20 UTC, Mon-Fri (After market close) | yes | L41 | L34,L37 L47 | 1 | 1 | yes | yes |
| `.github/workflows/eod-latest.yml` |  EOD Latest (NASDAQ-100) | 4:  schedule:,6:  workflow_dispatch: | L5:    - cron: "10 22 * * 1-5" | yes | L36,L59 L71,L74 L77,L80 L83,L86 L91 | L71,L98 | 4 | 5 | yes | yes |
| `.github/workflows/forecast-daily.yml` |  'Forecast Daily Pipeline' | 4:  workflow_dispatch:,10:  schedule: | L12:    - cron: '0 21 * * 1-5' | yes | L54 | L72,L73 L74 | 3 | 0 | no | no |
| `.github/workflows/forecast-monthly.yml` |  'Forecast Monthly Report' | 4:  workflow_dispatch:,10:  schedule: | L12:    - cron: '0 8 1 * *' | yes | L56 | L72 | 3 | 0 | no | no |
| `.github/workflows/forecast-rollback.yml` |  Forecast Rollback | 4:  workflow_dispatch: | NONE | yes | NONE | L43,L58 L65 | 2 | 0 | yes | yes |
| `.github/workflows/forecast-weekly.yml` |  'Forecast Weekly Training' | 4:  workflow_dispatch:,10:  schedule: | L12:    - cron: '0 6 * * 0' | yes | L50 | L76,L77 L78,L79 | 3 | 0 | no | no |
| `.github/workflows/monitor-prod.yml` |  Monitor Production Artifacts | 4:  schedule:,6:  workflow_dispatch: | L5:    - cron: "0 6,18 * * *" | yes | NONE | NONE | 0 | 0 | no | no |
| `.github/workflows/ops-auto-alerts.yml` |  Ops Auto-Alerts | 4:  schedule:,6:  workflow_dispatch: | L5:    - cron: '0 22 * * 1-5' # Daily after market close | yes | NONE | NONE | 2 | 0 | yes | yes |
| `.github/workflows/ops-daily.yml` |  Ops Daily Snapshot | 4:  schedule:,6:  workflow_dispatch: | L5:    - cron: "5 7 * * *" | yes | L31,L55 L61,L64 L67,L73 L76,L79 L82,L87 | L94 | 4 | 7 | yes | yes |
| `.github/workflows/refresh-health-assets.yml` |  Refresh Health Assets | 4:  schedule:,6:  workflow_dispatch: | L5:    - cron: "17 6 * * *" | yes | L29 | L34,L40 | 2 | 1 | yes | no |
| `.github/workflows/scheduler-kick.yml` |  Scheduler Kick | 4:  schedule:,6:  workflow_dispatch: | L5:    - cron: "15 * * * *" | yes | L27 | NONE | 2 | 1 | yes | no |
| `.github/workflows/universe-refresh.yml` |  Universe Refresh | 4:  workflow_dispatch: | NONE | yes | L30 | L35,L38 L47 | 2 | 1 | yes | no |
| `.github/workflows/v3-finalizer.yml` |  v3 Finalizer | 4:  workflow_run:,10:  workflow_dispatch: | NONE | yes | L151,L188 | L171,L193 L199,L209 | 4 | 1 | yes | yes |
| `.github/workflows/v3-scrape-template.yml` |  v3 Scrape Template | 4:  schedule:,7:  workflow_dispatch: | L6:    - cron: "30 22 * * 1-5" | yes | L239,L241 L277 | L65 | 7 | 6 | yes | no |
| `.github/workflows/wp16-manual-market-prices.yml` |  WP16 Manual - Market Prices (Stooq) | 4:  workflow_dispatch: | NONE | yes | L38,L77 L83 | L89,L90 | 2 | 1 | yes | yes |

## Script refs existence
```text
EXISTS FILE scripts/aggregator/finalize.mjs
EXISTS FILE scripts/ci/assert-mission-control-gate.mjs
EXISTS FILE scripts/ci/check-elliott-parity.mjs
EXISTS FILE scripts/ci/forbid-kv-writes-in-api.sh
EXISTS FILE scripts/ci/verify-artifacts.mjs
EXISTS FILE scripts/cleanup-daily-snapshots.sh
EXISTS FILE scripts/eod/build-eod-latest.mjs
EXISTS FILE scripts/eod/check-eod-artifacts.mjs
EXISTS DIR  scripts/forecast/
EXISTS FILE scripts/forecast/run_daily.mjs
EXISTS FILE scripts/forecast/run_monthly.mjs
EXISTS FILE scripts/forecast/run_weekly.mjs
EXISTS FILE scripts/forecast/validate_policy.mjs
EXISTS FILE scripts/ops/build-mission-control-summary.mjs
EXISTS FILE scripts/ops/build-ops-daily.mjs
EXISTS FILE scripts/ops/build-ops-pulse.mjs
EXISTS FILE scripts/ops/build-safety-snapshot.mjs
EXISTS FILE scripts/ops/preflight-check.mjs
EXISTS FILE scripts/ops/validate-ops-summary.mjs
EXISTS FILE scripts/ops/validate-truth.sh
EXISTS FILE scripts/pipeline/build-marketphase-from-kv.mjs
EXISTS FILE scripts/pipeline/build-ndx100-pipeline-truth.mjs
EXISTS DIR  scripts/providers/
EXISTS FILE scripts/providers/eodhd-backfill-bars.mjs
EXISTS FILE scripts/providers/market-prices-v3.mjs
EXISTS FILE scripts/providers/market-stats-v3.mjs
EXISTS FILE scripts/refresh-health-assets.mjs
EXISTS FILE scripts/universe/fetch-constituents.mjs
EXISTS FILE scripts/wp16/guard-market-prices.mjs
```



## v8 runner script template (embedded)
```bash
#!/usr/bin/env bash
set -euo pipefail
ROOT_OUT="audit-run-v8"
mkdir -p "$ROOT_OUT"
# run inventory, reality, dependencies, contracts, security, decisions, summary generation
# (embedded in this audit run; persisted outputs are the 9 files in ROOT_OUT)
```
