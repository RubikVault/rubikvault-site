# P0/P1 Hardening — Diff Summary (v2)

**Branch merged**: `codex/workflow-green-finalizer-v12` → `main`
**Merge commit**: `7a67d63d`
**Previous main HEAD**: `da23428e`
**Files changed vs pre-merge main**: 57

## Key Changed Files (this fix pack)

| File | Change | Phase |
|---|---|---|
| `scripts/ops/build-ops-daily.mjs` | build-meta write + marketphase index gen + git fallback | 1,3,4 |
| `scripts/ops/build-ops-pulse.mjs` | reads shared build-meta | 3 |
| `functions/data/marketphase/[asset].js` | meta.url in all response paths | 2 |
| `functions/api/mission-control/summary.js` | async computeBuildMeta + build-meta fetch | 3 |
| `functions/api/elliott-scanner.js` | build-meta fetch for cohesion | 3 |
| `.gitignore` | allow marketphase/index.json | 1 |
| `public/data/marketphase/index.json` | new static artifact (517 symbols) | 1 |
| `public/data/ops/build-meta.json` | new static artifact (SSOT) | 3 |
| `Report/A/FIX_REPORT.md` | evidence pack | 4 |
| `Report/A/EVIDENCE.md` | evidence pack | 4 |
| `Report/A/DIFF_SUMMARY.md` | evidence pack | 4 |
