# OPS Findings + Fix Plan (LIVE_URL: https://638a1962.rubikvault-site.pages.dev)

## Executive Summary (<=10 bullets)
- Ops UI reads `/api/mission-control/summary` and renders **Prices OK** but still shows non-green signals due to **baseline RISK** and **pipeline coverage**. (UI: `public/ops/index.html:705-770`; Summary: `functions/api/mission-control/summary.js:1406-1431`).
- **Prices chain is OK**: live `health.prices.checked_path = data.latest_bar`, matching SSOT (`docs/ops/ops-shapes.ssot.md:7-38`).
- **meta.status token conflict**: summary emits `ok/degraded/error`, legacy contract expects `LIVE|STALE|ERROR|EMPTY` (`docs/ops/contract.md:34-51`).
- **Debug endpoints failing schema**: `/api/build-info?debug=1` and `/api/debug-bundle?debug=1` report `VALIDATION_FAILED_SCHEMA` (live evidence below), indicating legacy artifact schemas.
- **/api/ops?debug=1** returns `NOT_FOUND` for `/data/snapshots/ops/latest.json` (live evidence below) and should be treated as optional or published.
- **Deploy metadata mismatch**: summary `deploy.gitSha/buildTs` null because `/build-info.json` uses `commitSha/generatedAt` while summary only maps `gitSha/git_sha/sha/commit` + `buildTs/build_ts/...` (`functions/api/mission-control/summary.js:935-943`).

---

## Live Evidence Excerpts (required endpoints)
### /api/mission-control/summary?debug=1 (excerpt)
```
"meta":{"status":"ok","reason":"CONTRACT_OK"},
"data":{"health":{"prices":{"status":"OK","checked_path":"data.latest_bar"},
"pipeline":{"status":"INFO","reason":"NOT_EXPECTED","counts":{"expected":100,"fetched":100,"validated":100,"computed":2,"static_ready":2}}},
"runtime":{"env":"preview","pipelineExpected":false}}}
```

### /api/ops?debug=1 (excerpt)
```
"asset_status":"MISS", "proof_summary":"FAILED", "error":{"code":"NOT_FOUND"},
"links":{"snapshot":"/data/snapshots/ops/latest.json"}
```

### /api/build-info?debug=1 (excerpt)
```
"proof_summary":"FAILED", "failure":{"class":"VALIDATION_FAILED_SCHEMA"},
"source":{"file_path":"/data/build-info.json","type":"legacy"}
```

### /api/debug-bundle?debug=1 (excerpt)
```
"proof_summary":"FAILED", "failure":{"class":"VALIDATION_FAILED_SCHEMA"},
"source":{"file_path":"/data/debug-bundle.json","type":"legacy"}
```

### /build-info.json (used by summary fetchBuildInfo)
```
{"commitSha":"b68b50be1b6215eafc20da5f462be457966f691c","generatedAt":"2026-01-19T10:08:46.231Z"}
```

---

## Non-Green Indicators in Ops UI (with cause + fix)
| UI indicator | observed value | root cause (code + evidence) | minimal fix |
|---|---|---|---|
| Baseline verdict | `RISK` (PIPELINE_STATIC_READY=2/100) | `computeVerdictFromBaseline` ignores preview policy and uses pipeline staticReady (`functions/api/mission-control/summary.js:730-741,1406-1431`) | In preview (`expectedFlags.pipeline=false`), set baseline verdict to INFO/NOT_EXPECTED or exclude pipeline from baseline verdict. |
| Pipeline tile | `INFO / NOT_EXPECTED` | Preview policy (`computePipelineStatus` uses expectedFlags) is applied; this is **not a bug**, but still not green | If desired, treat INFO as acceptable in preview (UI note) rather than error; no code change required if policy accepted. |
| Freshness tile | `INFO / NOT_EXPECTED` | Freshness uses market-prices snapshot mini; preview policy (`computeFreshnessStatus`) marks INFO (`functions/api/mission-control/summary.js:1482-1495`) | Accept INFO in preview or define SSOT for freshness source/thresholds. |
| Prices truth chain P1/P7 | `WARN` (missing UI traces) | UI-path traces missing for current origin; trace base mismatch (`summary.js:1117-1125`, live `priceTruth.artifacts.traces`) | Ensure UI-path traces are generated for current base or treat missing traces as INFO (non-blocking). |

---

## Proven Wrong Fields (SSOT-backed)
| field | observed | expected (SSOT) | root cause | fix |
|---|---|---|---|---|
| `meta.status` | `ok` | `LIVE|STALE|ERROR|EMPTY` per `docs/ops/contract.md:34-51` | SSOT conflict between legacy contract doc and implementation | Choose canonical tokens and align doc or output. |

---

## Undecidable Fields (missing SSOT)
| field | why undecidable | minimal SSOT artifact to add | where used |
|---|---|---|---|
| `data.opsBaseline.*` | No schema/semantics defined | Extend `docs/ops/ops-shapes.ssot.md` with opsBaseline schema | UI: `public/ops/index.html:760-770` / Summary: `summary.js:1406-1431` |
| `data.pipeline.counts.*` | No SSOT for pipeline counts | Define pipeline counts contract + preview behavior | UI: `public/ops/index.html:686-709` |
| `data.coverage.*` | No SSOT for coverage | Define coverage derivation + units | UI: `public/ops/index.html:771-779` |
| `data.budgets.*` | No SSOT for budgets | Define budgets schema | UI: `public/ops/index.html:632-635` |
| `build-info.json` fields | No SSOT for build-info | Define build-info schema + field names | UI: `public/ops/index.html:868-883` |

---

## Fix Plan (P0/P1/P2)
### P0 — Correctness / Semantics
1) **Resolve `meta.status` contract**: align `docs/ops/contract.md` with summary output OR change summary output tokens. (Files: `docs/ops/contract.md:34-51`, `functions/api/mission-control/summary.js:1540-1545`).
2) **Preview baseline verdict**: if pipelineExpected=false, do not derive baseline verdict from staticReady; mark as INFO/NOT_EXPECTED to avoid RISK in preview. (Files: `summary.js:730-741,1406-1431`).
3) **Deploy metadata mapping**: summary uses `/build-info.json` but maps only `gitSha/git_sha/sha/commit` and `buildTs/...` (`summary.js:935-943`). Live file uses `commitSha/generatedAt`. **Option A:** add alias mapping (`commitSha→gitSha`, `generatedAt→buildTs`). **Option B:** update generator to emit canonical v3 fields.

### P1 — Remove parallel paths / refactor to single-source
1) Decide SSOT for **build-info/debug-bundle**: either upgrade artifacts to v3 schema or mark debug endpoints as diagnostic-only (no schema validation enforced).
2) For UI-path traces: generate per-deployment traces or relax P1/P7 to INFO when trace base mismatch (prevent false WARNs).

### P2 — DX improvements (tests, CI guards)
1) Contract tests: validate `data.health.prices.checked_path == data.latest_bar` and required fields exist.
2) Add CI guard for `meta.status` token enum once SSOT is finalized.
3) Add build-info schema validation if adopting v3; fail CI on legacy schema.

---

## Contract/CI Tests to add
- Ops summary envelope: `schema_version`, `meta.status`, `data.health.prices.checked_path`, `data.truthChains.prices.steps` must exist.
- If `meta.status` SSOT uses legacy tokens, enforce with jq/validator.
- If build-info v3 enforced, validate schema in `scripts/ops/validate-truth.sh`.

---

DONE ✅ 2026-02-03T16:30:00Z
