# Security / Reliability Hardening Summary

## Implemented
1. Explicit permissions on writer workflows.
- Examples:
  - `.github/workflows/scheduler-kick.yml:13-15`
  - `.github/workflows/forecast-daily.yml:14-15`
  - `.github/workflows/forecast-weekly.yml:14-15`
  - `.github/workflows/forecast-monthly.yml:21-22`

2. Concurrency locks on writer/orchestrator workflows.
- Added per-ref groups to prevent cross-branch collisions:
  - `scheduler-kick.yml:17-19`
  - `eod-latest.yml:16-18`
  - `ops-daily.yml:11-13`
  - `forecast-daily.yml:17-19`
  - `forecast-weekly.yml:17-19`
  - `forecast-monthly.yml:24-26`
  - `refresh-health-assets.yml:8-10`
  - `universe-refresh.yml:11-13`
  - `v3-scrape-template.yml:14-16`

3. Secret hygiene / typo-safe API keys.
- EOD preflight supports both `TIINGO_API_KEY` and alias `TIIANGO_API_KEY` with degrading warning.
- Evidence: `scripts/ops/preflight-check.mjs:57-76`.

4. Fail-loud secret behavior.
- Missing critical secret yields explicit blocker and non-zero exit.
- Evidence:
  - `scripts/ops/preflight-check.mjs:85-91` and `117-123`
  - run `21921377474` (`CF_API_TOKEN is missing`).

## Remaining security debt (P1)
1. Action SHA pinning is still incomplete.
- Many workflows still use tag refs (`actions/checkout@v4`, `actions/setup-node@v4`, etc.).
- Plan: pin high-risk writer workflows first, then remaining readers.

2. Optional remote probes require managed token hygiene.
- If enabling `monitor-prod` remote mode, `RV_ADMIN_TOKEN` must be maintained and rotated.
