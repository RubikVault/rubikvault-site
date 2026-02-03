Price vs Indicators Truth Chains (Ops)
======================================

This page documents the **separated** truth chains used by `/ops`:

- **Prices**: only the proven UI → API path for price data.
- **Indicators/Pipeline**: the NASDAQ-100 indicators pipeline (non-blocking for prices).
- Market-prices snapshot is **cache only** (mini universe) and must not block Prices.

Prices Chain (P0–P7)
--------------------
Each step is a single-sentence check. If any step **FAILS**, Prices status is **ERROR**.

P0_UI_START  
“User opens /analyze/<T> and the page JS loads.”

P1_UI_CALLS_API  
“The page triggers the winning request to /api/stock?ticker=<T>.”

P2_API_RECEIVES_RAW  
“The backend receives upstream/cache data (HTTP ok + body) before any validation.”

P3_API_PARSES_VALIDATES  
“Backend parses and validates required fields (close, volume, date) for sanity.”

P4_CANONICAL_FORMAT  
“Backend maps raw data into canonical latest_bar + change format.”

P5_STATIC_PERSIST  
“If configured, the canonical data is written to public/data and is fetchable as static; otherwise this is INFO.”

P6_API_CONTRACT  
“/api/stock returns JSON that satisfies the contract (latest_bar.close/volume/date present).”

P7_UI_RENDERS  
“The UI displays values matching the API response.”

P5 Policy (Static Persist)
--------------------------
Policy is defined in `public/data/ops/health-profiles.v1.json` as:

- `profiles.production.prices_static_required`
- `profiles.preview.prices_static_required`

Rules:
1) If `prices_static_required = false`, P5 is **INFO** with reason “not required”.
2) If `prices_static_required = true`, P5 is **OK** only when static artifacts contain the sample tickers.
3) P5 never affects Indicators/Pipeline status.

Indicators/Pipeline Chain (I0–I5)
---------------------------------
This chain is **informational** for prices. It may WARN/FAIL without blocking price truth.

I0_PIPELINE_INPUTS  
“The NASDAQ-100 universe and EOD inputs for 100 tickers are present for the run.”

I1_EOD_VALIDATED  
“All tickers have validated EOD fields required to compute indicators.”

I2_INDICATORS_COMPUTED  
“Indicators (40+) are computed and validated per ticker.”

I3_STATIC_PERSIST_INDICATORS  
“Indicator outputs are written to public/data and are UI-readable anytime.”

I4_STATIC_READY_INDEX  
“A static-ready index reports how many tickers have complete static indicator artifacts.”

I5_RUNTIME_BINDINGS  
“Runtime bindings (KV/scheduler) are reported but do not affect Prices verdict.”

Notes
-----
- Prices chain reads `/debug/ui-path/<T>.ui-path.trace.json` when present; fallback is `/debug/truth-chain/<T>.trace.json`.
- Indicators chain reads `/data/pipeline/nasdaq100.*.json` artifacts.
- `/ops` displays both chains separately; only Prices can declare price correctness.
