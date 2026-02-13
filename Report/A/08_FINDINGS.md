# 08_FINDINGS

## Findings Index

| ID | Severity | Title | Detection Step | Evidence |
|---|---|---|---|---|
| FND-P0-001 | P0 | Preview Elliott returns 100 while canonical universe is 517 | Step 44/46 | `Report/A/05_INTEGRATION_MATRIX.md`, `Report/A/02_DEPLOYED_EVIDENCE/SUMMARY.md` |
| FND-P0-002 | P0 | UI-consumed JSON endpoint `/data/marketphase/index.json` returns HTML 404 | Step 39 | `Report/A/02_DEPLOYED_EVIDENCE/SUMMARY.md`, `Report/A/04_SSOT_EVIDENCE/26_index_marketphase_fetch_snippet.txt` |
| FND-P1-003 | P1 | OPS telemetry still anchored to legacy `nasdaq100.json` path | Step 25/34/41 | `Report/A/04_SSOT_EVIDENCE/24_mission_control_universe_snippets.txt` |
| FND-P1-004 | P1 | Scheduler health stale (503) on both preview and prod | Step 41 | `Report/A/02_DEPLOYED_EVIDENCE/SUMMARY.md` |
| FND-P1-005 | P1 | Market-prices freshness semantics inconsistent (`status=OK` with weekend/stale asOf) | Step 48/49 | `Report/A/02_DEPLOYED_EVIDENCE/SUMMARY.md`, `Report/A/04_SSOT_EVIDENCE/30_market_prices_sample_dates.txt` |
| FND-P1-006 | P1 | Runtime state observability inconsistent (`runtime.env=preview` on prod summary) | Step 42 | mission-control debug payloads in `Report/A/02_DEPLOYED_EVIDENCE/` |

---

## ROOT CAUSE CHAIN: FND-P0-001 Elliott parity break (100 vs 517)
1) SYMPTOM (user-visible)
- Preview Elliott page can only render 100 setups while universe-based features operate on 517 symbols.
- Evidence: `/api/elliott-scanner` preview `count=100`, prod `count=517` (`Report/A/02_DEPLOYED_EVIDENCE/SUMMARY.md`).

2) DETECTION (which step/gate)
- Step 44 parity matrix and Step 46 universe↔feature join integrity.
- Detection artifact: `Report/A/05_INTEGRATION_MATRIX.md`.

3) TRIGGER (file:line or response)
- Deployed trigger: preview endpoint payload `{"meta":{"count":100},"setups":[...100...]}`.
- Consumer trigger: UI uses returned `setups` directly and displays filtered length only (`public/elliott.html:392`, `public/elliott.html:415-420`).

4) PROPAGATION (SSOT → Published → Deployed → UI)
- SSOT_CHECK: canonical universe is `all.json` (`public/index.html:512`, `functions/api/elliott-scanner.js:19`, `policies/forecast.v3.json:143`).
- PUBLISHED_CHECK: `public/data/universe/all.json` length 517 with KO/BRK.B (`Report/A/03_PUBLISHED_EVIDENCE/03_critical_contracts.txt`).
- DEPLOYED_CHECK: preview Elliott API returns 100, prod returns 517 (`Report/A/02_DEPLOYED_EVIDENCE/SUMMARY.md`).
- UI layer: `public/elliott.html` displays `setups.length` with no universe disclosure.

5) FIX OPTIONS (3)
- A) Minimal fix: enforce runtime check in `api/elliott-scanner` response that `meta.count == canonical universe length`; emit `meta.status=error` on mismatch.
- B) Robust fix: add `meta.universeCount` + `meta.analyzedCount`; fail CI on mismatch between `analyzedCount` and `/data/universe/all.json` unless explicitly configured.
- C) Belt+Braces: post-deploy monitor gate calls `/api/elliott-scanner` + `/data/universe/all.json` and asserts equality.

6) VERIFICATION (exact checks to rerun)
- `curl -sS "$PREVIEW_BASE/api/elliott-scanner" | jq '{count:.meta.count,setups:(.setups|length)}'`
- `curl -sS "$PREVIEW_BASE/data/universe/all.json" | jq 'length'`
- Expect equality.

7) PREVENTION (CI gate / monitor / invariant)
- Invariant: `elliott.meta.analyzedCount == len(universe/all.json)` unless UI declares subset mode.
- Add to CI + monitor-prod semantic checks.

---

## ROOT CAUSE CHAIN: FND-P0-002 `/data/marketphase/index.json` contract broken (HTML 404)
1) SYMPTOM (user-visible)
- Stock Analyzer attempts to enrich with Elliott support index but endpoint returns non-JSON 404.
- Evidence: `public/index.html:315-317` fetches `/data/marketphase/index.json`; deployed probe returns `content_type_json=FAIL`, `jq_parse=FAIL`.

2) DETECTION (which step/gate)
- Step 39 UI request reproduction + LAW 0.2 JSON-or-die checks.
- Evidence: `Report/A/02_DEPLOYED_EVIDENCE/SUMMARY.md` (`data_marketphase_index.json`).

3) TRIGGER (file:line or response)
- Response trigger: HTTP 404 + HTML body for `/data/marketphase/index.json` on both bases.
- Source trigger: UI expects JSON parsing path (`public/index.html:317-319`).

4) PROPAGATION (SSOT → Published → Deployed → UI)
- SSOT/PUBLISHED: no `public/data/marketphase` directory locally (`Report/A/03_PUBLISHED_EVIDENCE/05_marketphase_presence.txt`).
- DEPLOYED: endpoint serves HTML 404.
- UI: swallows non-OK and continues (`public/index.html:316`), resulting in silent feature degradation.

5) FIX OPTIONS (3)
- A) Minimal fix: publish a valid empty JSON index with explicit `meta.status="stale"` + reason.
- B) Robust fix: restore generator for `marketphase/index.json` and schema gate it in CI.
- C) Belt+Braces: add monitor assertion that all UI-fetched `/data/*` endpoints return JSON parseable responses.

6) VERIFICATION (exact checks to rerun)
- `curl -sS -D- "$PROD_BASE/data/marketphase/index.json" | head`
- `curl -sS "$PROD_BASE/data/marketphase/index.json" | jq .`
- Expect HTTP 200 + JSON parse success.

7) PREVENTION (CI gate / monitor / invariant)
- Invariant: every UI-fetched `/data/*` path must pass JSON contract probe in CI and monitor.

---

## ROOT CAUSE CHAIN: FND-P1-003 OPS telemetry drift to legacy `nasdaq100.json`
1) SYMPTOM (user-visible)
- Ops/mission-control reports CRITICAL reasons tied to missing legacy assets while core UI chains are healthy on canonical `all.json` + forecast artifacts.

2) DETECTION (which step/gate)
- Step 25 (universe canonical definition) and Step 34 (Elliott chain trace), with deployed mission-control evidence.

3) TRIGGER (file:line or response)
- `functions/api/mission-control/summary.js` fetches and checks `'/data/universe/nasdaq100.json'` (`1318`, `1416`, `1638`, `1712-1717`, `2058`).
- Deployed response reports `meta.reason="EOD_BATCH_MISSING"` and references legacy asset checks.

4) PROPAGATION (SSOT → Published → Deployed → UI)
- SSOT canonical code paths use `/data/universe/all.json` for UI and Elliott scanner (`public/index.html:512`, `functions/api/elliott-scanner.js:19`).
- OPS layer still enforces nasdaq100 path and legacy static assumptions.
- Deployed diagnostics show CRITICAL despite user-facing data endpoints being valid.

5) FIX OPTIONS (3)
- A) Minimal fix: replace nasdaq100 path constants in mission-control with canonical universe source.
- B) Robust fix: centralize universe source in one shared config and import from all ops modules.
- C) Belt+Braces: contract test that forbids mixed universe paths (`all.json` + `nasdaq100.json`) in critical checks.

6) VERIFICATION (exact checks to rerun)
- `rg -n "nasdaq100\.json" functions/api/mission-control/summary.js`
- `curl -sS "$PROD_BASE/api/mission-control/summary?debug=1" | jq '.meta.reason,.data.health.system.reason'`

7) PREVENTION (CI gate / monitor / invariant)
- Invariant: ops health checks must read same canonical universe source as UI.

---

## ROOT CAUSE CHAIN: FND-P1-004 Scheduler health stale on both bases
1) SYMPTOM (user-visible)
- `/api/scheduler/health` returns HTTP 503 with `SCHEDULER_STALE` and `never_ran`.

2) DETECTION (which step/gate)
- Step 41 deployed debug/bindings checks.

3) TRIGGER (file:line or response)
- Endpoint payload: `ok=false`, `error.code="SCHEDULER_STALE"`, `last_ok=null` on both bases.

4) PROPAGATION (SSOT → Published → Deployed → UI)
- Repo code checks KV heartbeat keys (`functions/api/scheduler/health.js`, referenced in `09_debug_kv_rg.txt`).
- Runtime heartbeat absent; prod runtime expects scheduler.
- Operational state is degraded even when static UI remains available.

5) FIX OPTIONS (3)
- A) Minimal fix: ensure scheduler job writes heartbeat keys.
- B) Robust fix: add dedicated heartbeat workflow with alerting and strict SLO.
- C) Belt+Braces: monitor should alert on first stale interval and include remediation hints.

6) VERIFICATION (exact checks to rerun)
- `curl -sS "$PROD_BASE/api/scheduler/health" | jq '{ok,error:.error.code,status:.data.status,last_ok:.data.last_ok}'`

7) PREVENTION (CI gate / monitor / invariant)
- Invariant: production scheduler expected => heartbeat must be recent.

---

## ROOT CAUSE CHAIN: FND-P1-005 Market-prices freshness/status mismatch
1) SYMPTOM (user-visible)
- Market-prices endpoint reports `status=OK` while `asof=2026-02-07` (weekend date) and age is ~43h in diagnostics.

2) DETECTION (which step/gate)
- Step 48 freshness check and Step 49 stale explicitness.

3) TRIGGER (file:line or response)
- `/data/snapshots/market-prices/latest.json` semantics: `asof=2026-02-07`, `meta.status="OK"`.
- sample rows also carry `date=2026-02-07` (`Report/A/04_SSOT_EVIDENCE/30_market_prices_sample_dates.txt`).

4) PROPAGATION (SSOT → Published → Deployed → UI)
- Same hash across local/published/deployed means mismatch is consistently propagated (`05_INTEGRATION_MATRIX.md`).
- Forecast endpoint is stale-aware; prices endpoint is not explicit about staleness.

5) FIX OPTIONS (3)
- A) Minimal fix: set `meta.status="stale"` when asOf violates freshness policy.
- B) Robust fix: enforce trading-calendar validation and status transition in generator.
- C) Belt+Braces: CI+monitor semantic gate for `asof` trading-day + freshness budget.

6) VERIFICATION (exact checks to rerun)
- `curl -sS "$PROD_BASE/data/snapshots/market-prices/latest.json" | jq '{asof:(.metadata.as_of//.asof),status:(.meta.status//.status),count:(.metadata.record_count//(.data|length))}'`

7) PREVENTION (CI gate / monitor / invariant)
- Invariant: finance latest endpoint must carry explicit stale/error status when freshness threshold is exceeded.

---

## ROOT CAUSE CHAIN: FND-P1-006 Runtime observability inconsistency on prod
1) SYMPTOM (user-visible)
- Mission-control payload for prod includes contradictory runtime fields (`runtime.env="preview"` while `opsBaseline.runtime.isProduction=true`).

2) DETECTION (which step/gate)
- Step 42 state semantics integration check.

3) TRIGGER (file:line or response)
- Prod `api_mission-control_summary_debug_1` payload fields show conflicting environment labels.

4) PROPAGATION (SSOT → Published → Deployed → UI)
- Diagnostics layer composes runtime info from multiple sources; conflict reduces trust in ops state outputs.

5) FIX OPTIONS (3)
- A) Minimal fix: unify environment labeling field derivation in mission-control summary.
- B) Robust fix: define typed runtime contract (`env`, `isPreview`, `isProduction`) with consistency assertion.
- C) Belt+Braces: add test that fails on contradictory runtime flags.

6) VERIFICATION (exact checks to rerun)
- `curl -sS "$PROD_BASE/api/mission-control/summary?debug=1" | jq '{runtime_env:.data.runtime.env,isPreview:.data.opsBaseline.runtime.isPreview,isProduction:.data.opsBaseline.runtime.isProduction}'`

7) PREVENTION (CI gate / monitor / invariant)
- Invariant: `(env == "production") == isProduction` and `(env == "preview") == isPreview`.

---

## Safe-to-Delete Candidates (only with proof)
Evidence: `Report/A/04_SSOT_EVIDENCE/32_delete_candidates_precise_refs.txt`

Candidates (probable, not executed):
- `functions/api/_shared/static-only-backup.js`
- `functions/api/_shared/static-only-v3.js`

Negative reference proof in runtime code/workflows:
- `rg -n "static-only-backup\.js" -S functions scripts public .github/workflows` => no hits
- `rg -n "static-only-v3\.js" -S functions scripts public .github/workflows` => no hits

Safety note:
- Deletion is **not** executed in this audit. A dedicated deletion PR should re-run full tests + deployment smoke.

## Canonical SSOT Recommendation (OPS)
- Canonical universe: `/data/universe/all.json`
- Canonical prices artifact: `/data/snapshots/market-prices/latest.json`
- Canonical forecast artifacts: `/data/forecast/latest.json` + `/data/forecast/system/status.json`
- Canonical publish path: `public/data/**` as published layer; ops checks must not depend on legacy subset artifacts unless explicitly declared.

## CI/CD Guardrails Audit (no implementation, recommendation only)
Evidence: `Report/A/04_SSOT_EVIDENCE/15_ci_guardrails_scan.txt`, `Report/A/04_SSOT_EVIDENCE/19_workflow_snippets.txt`

Observed positives:
- CI gates include semantic artifact validation (`scripts/ci/verify-artifacts.mjs`) and monitor semantic checks (`monitor-prod.yml`).

Remaining guardrail gaps:
- Missing invariant for Elliott analyzed universe parity.
- Missing JSON contract probe for optional but UI-fetched `/data/marketphase/index.json`.
- Ops telemetry still validates legacy universe path.
