# A1 Findings (Preview: https://4f5145db.rubikvault-site.pages.dev)

## 1) /api/build-info?debug=1 returns PROOF_FAILED (schema mismatch)
**Live evidence (2026-02-04):**
```
{ "ok": false,
  "meta": { "status": "error", "provider": "unknown", "data_date": "2026-02-04", "generated_at": "2026-02-04T08:42:33.426Z" },
  "error": { "code": "PROOF_FAILED", "message": "Update provider to v3.0 schema" },
  "metadata": null,
  "schema_version": null }
```
(From curl: `/api/build-info?debug=1` on preview.)

**Root cause (repo evidence):**
- Static debug proof requires `snapshot.schema_version === "3.0"` and `snapshot.metadata` + `Array.isArray(snapshot.data)`; otherwise it sets `VALIDATION_FAILED_SCHEMA` with hint “Update provider to v3.0 schema”.
  - `functions/api/_shared/static-only.js:63-85, 137-141`
- Build-info artifacts prior to this fix were not v3 snapshots (`public/build-info.json` only had `commitSha/generatedAt`).
  - `public/build-info.json` (example) and `scripts/ops/build-build-info.mjs` previously wrote only `public/data/build-info.json` (now fixed).

**Correct behavior (owner-grade):**
- `/api/build-info?debug=1` should return HTTP 200 with `meta.status in {ok,degraded,error}` and no schema proof failure for current v3 snapshots.

---

## 2) /api/mission-control/summary returns 503 MAINTENANCE (owner endpoint must not 503)
**Live evidence (2026-02-04):**
```
HTTP/2 503
x-rv-source: MAINTENANCE
x-rv-kv: DISABLED
```
(From curl: `HEAD /api/mission-control/summary` on preview.)

**Root cause (repo evidence):**
- Static fallback serves `503` for missing snapshots under `/api/*` with MAINTENANCE headers:
  - `functions/api/_shared/static-only.js:468-511` (maintenance envelope)
- Owner endpoints must never return 503; they must degrade in-body.

**Correct behavior (owner-grade):**
- `/api/mission-control/summary` must return HTTP 200 with `meta.status` and `data.owner.overall.verdict` + `data.owner.topIssues` even when KV is disabled or assets are missing.

---

## 3) market-prices snapshot missing meta.data_date + meta.generated_at
**Live evidence (2026-02-04):**
```
meta: { "asOf": "2026-01-23T21:36:09.857Z", "kind":"bootstrap-mini", ... }
has_data_date: false
has_generated_at: false
```
(From curl: `/data/snapshots/market-prices/latest.json` on preview.)

**Root cause (repo evidence):**
- Generator wrote `meta.asOf` but did **not** populate `meta.data_date` / `meta.generated_at`:
  - `scripts/providers/market-prices-v3.mjs:1460-1479` (meta section now updated in this runbook)

**Correct behavior:**
- `meta.data_date` and `meta.generated_at` must be present and used for freshness calculations.

---

## 4) Summary baseline in preview previously marked RISK due to pipeline counts
**Root cause (repo evidence):**
- Baseline verdict used pipeline counts even when `pipelineExpected=false`:
  - `functions/api/mission-control/summary.js:762-777` (computeVerdictFromBaseline now fixed to return INFO/NOT_EXPECTED in preview)

---

## 5) P1/P7 warnings in preview due to missing UI traces
**Root cause (repo evidence):**
- Missing UI-path trace led to `WARN` even in preview:
  - `functions/api/mission-control/summary.js:358-398` (P0/P1)
  - `functions/api/mission-control/summary.js:542-565` (P7)

**Correct behavior:**
- In preview, missing UI traces should be `INFO` (not WARN/FAIL) and must not block Prices.
