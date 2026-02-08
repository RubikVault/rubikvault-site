# 00 Repo Reality

## Command Evidence

### UTC timestamp + repo anchors
Command:
```bash
date -u +"%Y-%m-%dT%H:%M:%SZ"
pwd
git rev-parse --show-toplevel
git branch --show-current
git log -n 1 --oneline --decorate
```
Output:
```text
2026-02-08T13:38:27Z
/Users/michaelpuchowezki/Dev/rubikvault-site
/Users/michaelpuchowezki/Dev/rubikvault-site
main
c1efa100 (HEAD -> main) fix(forecast): ingest prices from SSOT bars (batch fallback)
```

### Worktree state snapshot
Command:
```bash
git status --porcelain=v1 | head -n 40
```
Output excerpt:
```text
M  .gitignore
A  Report/BreakoutAI_v2_1_Integration/contracts_and_schemas.json
A  Report/BreakoutAI_v2_1_Integration/pipeline_and_state.json
A  Report/BreakoutAI_v2_1_Integration/system_map.md
D  mirrors/forecast/ledger/forecasts/2026/02.ndjson.gz
D  mirrors/forecast/ops/baselines/feature_distributions.json
D  mirrors/forecast/ops/overnight_events.ndjson
D  mirrors/forecast/ops/overnight_status.json
D  mirrors/forecast/ops/overnight_summary.md
D  mirrors/forecast/ops/preflight_evidence.json
M  package-lock.json
MM package.json
A  policies/forecast/v6/policy.v6.json
A  schemas/forecast/v6/bars.schema.json
A  scripts/forecast/v6/run_daily_v6.mjs
```

## New v6 Anchors Present
Command:
```bash
ls -la .github/workflows/forecast-v6-publish.yml scripts/forecast/v6/run_daily_v6.mjs policies/forecast/v6/policy.v6.json schemas/forecast/v6/bars.schema.json
```
Output:
```text
-rw-r--r--@ ... .github/workflows/forecast-v6-publish.yml
-rw-r--r--@ ... policies/forecast/v6/policy.v6.json
-rw-r--r--@ ... schemas/forecast/v6/bars.schema.json
-rwxr-xr-x@ ... scripts/forecast/v6/run_daily_v6.mjs
```

## Core Inference
- Repo root/branch verified (`main`) by command output above.
- Existing worktree was already heavily dirty before/through implementation; v6 was added side-by-side under `policies/forecast/v6/`, `schemas/forecast/v6/`, `scripts/forecast/v6/`, `public/data/forecast/v6/`, `mirrors/forecast/`.
