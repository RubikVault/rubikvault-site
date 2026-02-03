# RUNBLOCK — RV AUDIT v2.1 “NO QUESTIONS LEFT” (Repo-Connected)

## A) “Repo State Snapshot”
- **Origin**: `https://github.com/RubikVault/rubikvault-site.git` (main)
- **Root**: `/Users/michaelpuchowezki/Dev/rubikvault-site`
- **Head**: `4d4b047 chore(audit): add truth-path audit artifacts (2026-02-02)`
- **Key Dirs**: `functions/` (API), `public/data/` (SSOT), `scripts/` (Ops), `docs/` (Policy)
- **Config**: `wrangler.toml` (Pages), `.github/workflows/` (CI/CD)

## B) Already Covered vs Missing (15-Item Matrix)

| Item | Verdict | Evidence | What’s missing |
|---|---|---|---|
| 1) Visibility | D (Partial) | `functions/api/_middleware.js` (error masking), `public/_redirects` (allows /debug/) | Explicit blocking of `/debug` in prod; Middleware auth/IP checks. |
| 2) Backup | A (Implemented) | `scripts/ops/build-safety-snapshot.mjs`, `public/data/snapshots`, Git History | Restore script (manual `git checkout` relies on human). |
| 3) Silent Wrong | A (Implemented) | `functions/api/stock.js:464` (evaluateQuality), `scripts/ops/rv_verify_truth_summary.mjs` | - |
| 4) Cost/Limits | B (Concept) | `functions/_shared/provider_budget.js` (code exists but unlinked in `eod-providers.mjs`) | Runtime integration: budget logic is NOT called in `eod-providers.mjs`. |
| 5) Trading Date | A (Implemented) | `functions/api/stock.js:134` (computeStatusFromDataDate), `market_days_only` policy | - |
| 6) Retention | A (Implemented) | `scripts/cleanup-daily-snapshots.sh`, `.github/workflows/cleanup-daily-snapshots.yml` | - |
| 7) Versioning | A (Implemented) | `schema_version: "3.0"` (pervasive), `docs/schema-versioning-policy.v6.md` | - |
| 8) Rollback | D (Implicit) | No scripts found. Relies on `git revert`. | Automated rollback script for data artifacts. |
| 9) Monitoring | A (Implemented) | `/ops/index.html`, `/api/mission-control/summary`, `internal-health.js` | - |
| 10) Security | C (Missing) | `public/_headers` (No CORS), `functions/api/_middleware.js` (No Security Headers) | CORS headers, Security headers (HSTS, CSP), Rate Limiting. |
| 11) Licensing | D (Implicit) | `functions/_shared/budget.js` implies terms awareness. No LICENSE file. | Explicit LICENSE file for data redistribution. |
| 12) SSOT | A (Implemented) | `docs/ops-shapes.ssot.md`, `mirrors/` vs `public/data/` structure. | - |
| 13) Ops Routine | A (Implemented) | `docs/ops/runbook.md`, `.github/workflows/ops-daily.yml` | - |
| 14) Data Quality | A (Implemented) | `functions/api/stock.js` (lines 465-468 `QUALITY_REJECT`), `evaluateQuality` | - |
| 15) Scale | B (Concept) | `scripts/eod/build-eod-latest.mjs` (chunking), `KV_BACKEND_UNAVAILABLE` checks | Full 5000-ticker loop implementation (currently NQ100 only). |

## C) Concrete Deltas to reach FULL v2.1 compliance

**P0: Security & Visibility (Critical)**
1.  **Add CORS & Security Headers**: Edit `public/_headers` to strict `Access-Control-Allow-Origin`.
2.  **Block Debug in Prod**: Update `functions/api/_middleware.js` to return 403 for `/debug/*` unless authorized/preview.

**P1: Integrity & Cost**
3.  **Link Budget Logic**: Import and call `checkAndIncrementProviderBudget` in `functions/api/_shared/eod-providers.mjs`.
4.  **Fix Budget Writes**: Resolve `// KV_WRITE_DISABLED` in `provider_budget.js` or move budget counting to a Worker (outside Pages strict read-only mode if applicable).

**P2: Operations**
5.  **Restore Script**: Create `scripts/ops/restore-snapshot.sh` wrapping `git checkout` interactions.

## D) Manual Actions Checklist (Only what cannot be proven from repo)

**GitHub**
- [ ] **Secrets**: Verify `TIINGO_API_KEY`, `TWELVEDATA_API_KEY`, `CF_API_TOKEN` in [Settings > Secrets].
- [ ] **Permissions**: Confirm "Read and write permissions" for GITHUB_TOKEN in Actions settings (for data commits).

**Cloudflare (Pages)**
- [ ] **KV Binding**: Verify `RV_KV` is bound to ID `323d53e7...` (Prod) and `30c57392...` (Preview).
- [ ] **Vars**: Ensure no sensitive vars are exposed in "Environment variables" UI.
- [ ] **Access Policy**: Manually restrict `*.pages.dev` visibility if private (Repo is public, but deployment might need Access).

**Providers**
- [ ] **Tiingo/TwelveData**: Log in to dashboards, check current usage vs limits to calibrate `provider_budget.js` config.

## E) No-Questions-Left Summary
- **Correct**: Data SSOT, Versioning, Retention, and Quality Gates are fully verified and implemented.
- **Risky**: **Zero** security headers (CORS/HSTS) and **unprotected** `/debug/` routes in production.
- **Next**: Apply P0 Deltas immediately (headers + middleware blocking).
- **Optional**: Scaling to 4000 tickers (P2).
- **Out-of-Scope**: Changing the underlying Cloudflare Pages architecture.
