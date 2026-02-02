Indicators/Pipeline Truth Chain (I0–I5) — Audit Proof
======================================================

Scope
-----
This document audits the **Indicators/Pipeline** chain. It is **observability only** and must NOT block Prices.

Authoritative Sources
---------------------
- Pipeline artifacts: `/data/pipeline/nasdaq100.*.json`.
- Indicators truth chain builder: `functions/api/mission-control/summary.js` lines 520–616.
- UI rendering: `public/ops/index.html` lines 830–900 (renderTruthChain).

Step-by-step audit
------------------

I0_PIPELINE_INPUTS — “The NASDAQ-100 universe and EOD inputs for 100 tickers are present for the run.”
- INPUTS: `/data/pipeline/nasdaq100.fetched.json` (expected, count).
- TRANSFORM: status derived via `statusForCount`.
- OUTPUTS: status OK/WARN/FAIL or INFO if NOT_EXPECTED.
- STORAGE: `/api/mission-control/summary` → `data.truthChains.indicators.steps`.
- NEXT: I1.
- SOURCE OF TRUTH: `nasdaq100.fetched.json`.

I1_EOD_VALIDATED — “All tickers have validated EOD fields required to compute indicators.”
- INPUTS: `/data/pipeline/nasdaq100.validated.json`.
- TRANSFORM: status via `statusForCount`.
- OUTPUTS: status + evidence.
- STORAGE: mission-control summary.
- NEXT: I2.
- SOURCE OF TRUTH: `nasdaq100.validated.json`.

I2_INDICATORS_COMPUTED — “Indicators (40+) are computed and validated per ticker.”
- INPUTS: `/data/pipeline/nasdaq100.computed.json` (count, expected, missing list).
- TRANSFORM: status via `statusForCount`.
- OUTPUTS: status + missing counts.
- STORAGE: mission-control summary.
- NEXT: I3.
- SOURCE OF TRUTH: `nasdaq100.computed.json`.

I3_STATIC_PERSIST_INDICATORS — “Indicator outputs are written to public/data and are UI-readable anytime.”
- INPUTS: `/data/pipeline/nasdaq100.computed.json`.
- TRANSFORM: status via `statusForCount`.
- OUTPUTS: status + evidence.
- STORAGE: mission-control summary.
- NEXT: I4.
- SOURCE OF TRUTH: `nasdaq100.computed.json`.

I4_STATIC_READY_INDEX — “A static-ready index reports how many tickers have complete static indicator artifacts.”
- INPUTS: `/data/pipeline/nasdaq100.static-ready.json`.
- TRANSFORM: status via `statusForCount`.
- OUTPUTS: status + evidence.
- STORAGE: mission-control summary.
- NEXT: I5.
- SOURCE OF TRUTH: `nasdaq100.static-ready.json`.

I5_RUNTIME_BINDINGS — “Runtime bindings (KV/scheduler) are reported but do not affect Prices verdict.”
- INPUTS: runtime info (KV present, preview/production).
- TRANSFORM: status OK/WARN if expected, INFO if NOT_EXPECTED.
- OUTPUTS: status + evidence.
- STORAGE: mission-control summary.
- SOURCE OF TRUTH: runtime environment + health profiles policy.

Preview semantics
-----------------
If `expected.pipeline` is false (preview/static), all steps are INFO/NOT_EXPECTED and **no BLOCKER** is shown.
