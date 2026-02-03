# OPS Findings + Fix Plan (LIVE: https://638a1962.rubikvault-site.pages.dev)

## A) Executive Summary (<=10 bullets)
- **UI uses `/api/mission-control/summary`** for Ops UI; evidence: `public/ops/index.html:1082-1125` (summary fetch) and live `200` response (see Live Evidence Excerpts).
- **Prices health is OK** and checks `data.latest_bar` (SSOT per `docs/ops/ops-shapes.ssot.md:7-38`); live evidence shows `data.health.prices.checked_path = data.latest_bar`.
- **Runtime mode is deployment/hostname-based**: `functions/api/mission-control/summary.js:744-763` → `.pages.dev` => preview; live `runtime.env = "preview"` is correct.
- **Meta.status is in conflict with legacy contract doc** (`docs/ops/contract.md:34-51` vs summary `ok/degraded/error`).
- **Pipeline counts and baseline fields lack SSOT**, so correctness is **UNDECIDABLE** for those fields (P0 blocker).
- **Debug endpoints `/api/ops`, `/api/build-info`, `/api/debug-bundle`** return debug envelopes (asset-based) with schema failures; no SSOT defined for them.

---

## Live Evidence Excerpts (from required endpoints)
### 1) /api/ops?debug=1
```
{"schema_version":null,"debug":true,"module":"ops","served_from":"ASSET","kv_status":"DISABLED","kv_backend":"BOUND","asset_status":"MISS",..."proof_summary":"FAILED",..."error":{"code":"NOT_FOUND"...},"meta":{"status":"error"...}}
```

### 2) /api/build-info?debug=1
```
{"schema_version":null,"debug":true,"module":"build-info","served_from":"ASSET","asset_status":"HIT",..."proof_summary":"FAILED","failure":{"class":"VALIDATION_FAILED_SCHEMA"...},"source":{"file_path":"/data/build-info.json",...},"meta":{"status":"error"...}}
```

### 3) /api/debug-bundle?debug=1
```
{"schema_version":null,"debug":true,"module":"debug-bundle","served_from":"ASSET","asset_status":"HIT",..."proof_summary":"FAILED","failure":{"class":"VALIDATION_FAILED_SCHEMA"...},"source":{"file_path":"/data/debug-bundle.json",...},"meta":{"status":"error"...}}
```

### 4) /api/mission-control/summary?debug=1 (OPS payload)
```
"schema_version":"3.0",
"meta":{"status":"ok","reason":"CONTRACT_OK",...},
"data":{"health":{"prices":{"status":"OK","checked_path":"data.latest_bar",...},"pipeline":{"status":"INFO","reason":"NOT_EXPECTED",...}},
"runtime":{"env":"preview","hostname":"638a1962.rubikvault-site.pages.dev",...}}
```

---

## B) Proven Wrong Fields (SSOT-backed)
| field | observed | expected (SSOT) | root cause | minimal fix |
|---|---|---|---|---|
| `meta.status` (summary envelope) | `ok` | `LIVE|STALE|ERROR|EMPTY` per `docs/ops/contract.md:34-51` | Contract doc vs implementation mismatch | Decide SSOT: update contract doc OR change summary to emit legacy tokens (choose one; align tests accordingly) |

---

## C) Undecidable Fields (SSOT missing)
| field | why undecidable | minimal SSOT artifact to add | where used |
|---|---|---|---|
| `data.opsBaseline.*` | No canonical schema or semantics defined | Extend `docs/ops/ops-shapes.ssot.md` with opsBaseline schema + types | `public/ops/index.html:760-783` + `functions/api/mission-control/summary.js:1406-1431` |
| `data.budgets.*` | No SSOT for budgets/limits | Define budgets schema (units, reset cadence, required fields) | `public/ops/index.html:632-635` + `functions/api/mission-control/summary.js:1641-1642` |
| `data.pipeline.counts.*` | No SSOT for pipeline counts | Define pipeline counts contract (source + expected behavior in preview/prod) | `public/ops/index.html:686-709` + `summary.js:1643-1649` |
| `data.health.freshness.*` | No SSOT for freshness source/thresholds | Define freshness contract (source path + threshold policy) | `public/ops/index.html:734-739` + `summary.js:1477-1523` |
| `build-info.json` fields | No SSOT for env flags/fields | Define build-info schema (required fields + meaning) | `public/ops/index.html:868-883` + `scripts/ops/build-build-info.mjs` |

---

## D) Safe Removals (parallel paths) WITHOUT UI CHANGE
- **NONE proven**. No parallel paths can be safely removed with 100% certainty without a full static+runtime dependency audit.

---

## E) Fix Plan (P0/P1/P2)
### P0 — Contract alignment (correctness)
1) Resolve `meta.status` SSOT conflict (choose canonical tokens). Update either `docs/ops/contract.md` **or** summary emission, then update tests accordingly.
2) Define SSOT for `opsBaseline`, `budgets`, `pipeline.counts`, and `freshness` in a single schema doc (e.g., extend `docs/ops/ops-shapes.ssot.md`).

### P1 — Single-source alignment
1) Enforce ops UI reads only SSOT fields (add a verifier that fails if SSOT fields missing).
2) Mark debug endpoints (`/api/ops`, `/api/build-info`, `/api/debug-bundle`) as **diagnostic only**; do not use them to drive OPS UI status without SSOT.

### P2 — DX improvements
1) Add CI gate: `schema_version` + SSOT field presence checks for ops summary.
2) Add a regression test that validates `data.health.prices.checked_path == "data.latest_bar"`.

---

## F) Contract Tests to add (suggested)
- **Ops summary envelope:** `schema_version`, `meta.status`, `data.health.prices.checked_path`, `data.truthChains.prices.steps` must exist.
- **Meta status enum:** enforce chosen SSOT (legacy or new). Fail if mismatch.
- **Build-info/debug-bundle:** only enforce if SSOT is defined; otherwise keep diagnostic-only.

---

## Evidence References (line-precise)
- Summary payload assembly: `functions/api/mission-control/summary.js:1591-1678`
- Runtime mode semantics: `functions/api/mission-control/summary.js:744-763,1618-1626`
- Prices contract check: `functions/api/mission-control/summary.js:492-535,590-607`
- Ops UI render + fields: `public/ops/index.html:160-783`
- Ops SSOT (bars + truthChains): `docs/ops/ops-shapes.ssot.md:7-58`
- Legacy envelope contract: `docs/ops/contract.md:34-51`
