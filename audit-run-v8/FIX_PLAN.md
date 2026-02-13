# FIX_PLAN

Generated: REPAIR plan only (no code changes executed in this audit).

## P0 (first)
1. WAF/403 blockers
- Workflows: `scheduler-kick.yml`, `monitor-prod.yml`.
- Evidence: run `21894211071` (HTTP 403 + Cloudflare challenge), run `21895644780` (curl 403).
- Minimal fix: authenticated service-token path for CI probes/triggers; explicit `User-Agent`; avoid unauthenticated admin endpoints.
- Verify:
  - `gh workflow run scheduler-kick.yml`
  - `gh workflow run monitor-prod.yml`
  - `gh run watch --exit-status`

2. Registry contract drift (legacy v3 chain)
- Workflows: `v3-scrape-template.yml`, `v3-finalizer.yml`.
- Evidence:
  - `.github/workflows/v3-scrape-template.yml:65`
  - run `21885900868` / `21885907570` ENOENT `public/data/registry/modules.json`.
- Minimal fix: either generate expected registry path before use OR migrate v3 workflows to existing canonical registry path.
- Verify:
  - run both workflows manually and confirm no `Cannot find module`/`ENOENT` lines.

3. Core pipeline instability
- Workflows: `eod-latest.yml`, `ops-daily.yml`, `forecast-daily.yml`, `ci-gates.yml`.
- Evidence:
  - `forecast-daily`: run `21766433410` circuit-open due missing price coverage.
  - `eod-latest` success rate 3%; `ops-daily` 10%; `ci-gates` 60%.
- Minimal fix: instrument first failing step per workflow and stabilize preconditions (artifact availability + schema contract).

## P1
1. Determinism/schema mismatch
- Workflow: `ci-determinism.yml`.
- Evidence: run `21806609129` missingProperty `generated_at`.
- Fix: align schema producer/validator field naming.

2. Health asset missing input
- Workflow: `refresh-health-assets.yml`.
- Evidence: ENOENT `public/data/seed-manifest.json`.
- Fix: guard + fallback or deterministic generation dependency.

3. E2E flakiness
- Workflow: `e2e-playwright.yml`.
- Evidence: timeouts/element-not-found in recent failed logs.
- Fix: stabilize env prerequisites and route waits.

## P2
1. Manual workflow readiness
- `wp16-manual-market-prices.yml`, `forecast-rollback.yml`.
- Keep as manual tools until 90d no-use evidence exists.

## P3 hardening
1. Normalize node versions (18/20 drift) with explicit policy.
2. Add explicit permissions for all workflows with `git push`.
3. Add concurrency groups for every writer (`public/data`, `mirrors`).
4. Pin high-risk actions to commit SHA (writers first).

## Ordered PR sequence (minimal blast radius)
1. PR-A: WAF/auth fixes for scheduler + monitor.
2. PR-B: v3 registry path contract fix (or archive v3 chain if superseded).
3. PR-C: eod/ops/forecast/ci-gates deterministic contract stabilization.
4. PR-D: permissions + concurrency normalization.
5. PR-E: action SHA pinning by risk tier.
6. PR-F: e2e stabilization.

## Rollback strategy
- Workflow changes only; no data rewrite in rollback.
- Revert last workflow PR, rerun affected workflow with `workflow_dispatch`.
