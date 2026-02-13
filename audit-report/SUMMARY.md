# CI/CD Workflow Audit Report
**Date:** 2026-02-10
**Auditor:** Codex (automated forensic runbook execution)

## Executive Summary

**Total Workflows:** 20

### Classification Breakdown

| Category | Count | Action Required |
|----------|-------|-----------------|
| ACTIVE_HEALTHY | 5 | Monitor |
| ACTIVE_BROKEN | 8 | 🔧 REPAIR (P0) |
| STALE | 3 | ⚠️ Investigate |
| MANUAL_TOOL | 1 | 📦 Archive |
| LEGACY | 0 | 🗑️ Delete (after deprecation) |
| DANGEROUS | 3 | 🚨 REPAIR or DISABLE (P0) |

## P0 Repairs Required

- **ci-determinism** (ACTIVE_BROKEN): Runs regularly but fails >20% of time
- **ci-gates** (DANGEROUS): Broken + writes prod paths without concurrency
- **e2e-playwright** (ACTIVE_BROKEN): Runs regularly but fails >20% of time
- **eod-latest** (ACTIVE_BROKEN): Runs regularly but fails >20% of time
- **forecast-daily** (DANGEROUS): Broken + writes prod paths without concurrency
- **monitor-prod** (ACTIVE_BROKEN): Runs regularly but fails >20% of time
- **ops-daily** (ACTIVE_BROKEN): Runs regularly but fails >20% of time
- **scheduler-kick** (ACTIVE_BROKEN): Runs regularly but fails >20% of time
- **v3-finalizer** (ACTIVE_BROKEN): Runs regularly but fails >20% of time
- **v3-scrape-template** (DANGEROUS): Broken + writes prod paths without concurrency
- **wp16-manual-market-prices** (ACTIVE_BROKEN): Runs regularly but fails >20% of time

## Deletion Candidates (LEGACY)

- None in this run

## Evidence Location

- Full data: `audit-evidence/`
- Repair plans: `audit-evidence/repairs/`
- Classification: `audit-evidence/classification/workflow-categories.csv`

## Next Steps

1. Review P0 repair plans in `audit-evidence/repairs/`.
2. Fix P0 workflows using the 7-point checklist.
3. Deprecate LEGACY workflows (if any appear in future runs).
4. Monitor for 14 days before deletion.
5. Re-run this audit after each repair batch.

---
**Audit Standard:** Evidence-based, file:line referenced, execution-verified
