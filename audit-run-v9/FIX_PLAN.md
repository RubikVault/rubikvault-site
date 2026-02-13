# FIX_PLAN

Generated: 2026-02-11T18:36:43Z

## P0 (immediate)
1. WAF/403 unblock for scheduler/monitor: add authenticated headers (`x-admin-token`, explicit `User-Agent`) and if needed Cloudflare Access service token path.
2. Stabilize `eod-latest` + `ops-daily`: enforce deterministic diagnostics (provider, fetch counts, env preflight) and convert opaque exit(1) into explicit signatures.
3. Writer concurrency for all public/data or mirrors writers (group by workflow+ref, cancel-in-progress false).
4. Resolve `refresh-health-assets` ENOENT seed-manifest risk by creating/validating manifest pre-step.

## P1 (this week)
1. `ci-determinism`: align generated output with schema (`generated_at`) or policy schema update with justification.
2. Legacy v3 chain (`v3-*`): archive-first if not part of current single-path; if needed, repair modules path drift.
3. Explicit least-privilege permissions for all workflows.

## P2/P3
1. Archive manual or stale utilities after 14-day monitor window and dependency re-check.
2. Incremental SHA pinning prioritizing writer workflows first.

## Verification commands
```bash
gh workflow run eod-latest.yml && gh run watch --exit-status
gh workflow run monitor-prod.yml && gh run watch --exit-status
gh run list --workflow scheduler-kick.yml --limit 5
curl -sS -H 'cache-control: no-cache' https://rubikvault.com/api/mission-control/summary?debug=1 | jq '.meta'
curl -sS -H 'cache-control: no-cache' https://rubikvault.com/api/elliott-scanner | jq '.meta'
```