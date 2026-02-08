# 04_FORECAST_CONTRACT

## Canonical producer(s)
- `scripts/forecast/report_generator.mjs`
  - Status contract written at `scripts/forecast/report_generator.mjs:320-329`
    - keys: `schema`, `status`, `reason`, `generated_at`, `circuit_state`, `last_run`, `last_good`, `capabilities`
  - Latest envelope written at `scripts/forecast/report_generator.mjs:340-349`
    - uses `rv_envelope_v1` and validates before write
  - Last-good fallback publish at `scripts/forecast/report_generator.mjs:369-402`
    - fallback to `public/data/forecast/last_good.json`, bootstrap if missing

- `scripts/forecast/run_daily.mjs`
  - Circuit-open branch uses fallback publish + status update at `scripts/forecast/run_daily.mjs:225-240`
  - Success branch updates latest + last_good at `scripts/forecast/run_daily.mjs:359-374`

## Consumer(s): Forecast UI
- `public/forecast.html`
  - Reads `/data/forecast/system/status.json` and `/data/forecast/latest.json` at `public/forecast.html:589-608`
  - Status parser accepts both old and new shapes:
    - `status.circuit.state` OR `status.circuit_state` at `public/forecast.html:453`
    - `status.reason` OR `status.message` OR `status.meta.reason` at `public/forecast.html:455`
  - Empty-forecast notice now state-aware (`BOOTSTRAP`/`CIRCUIT_OPEN`/`STALE`) at `public/forecast.html:548-571`

## Contract closure: expected vs produced
- Produced status field is `reason` (not only `message`):
  - Producer: `scripts/forecast/report_generator.mjs:323`
  - Consumer support: `public/forecast.html:455`
- Produced circuit field is `circuit_state` (flat string):
  - Producer: `scripts/forecast/report_generator.mjs:325`
  - Consumer support: `public/forecast.html:453`
- Produced latest empty state has `data.forecasts=[]` and `meta.reason`:
  - Example file: `public/data/forecast/latest.json`
  - Consumer renders explanation notice when empty: `public/forecast.html:553-571`

## Current artifact evidence
- `public/data/forecast/latest.json` contains:
  - `meta.status: "circuit_open"`
  - `meta.reason: "Missing price data 100.0% exceeds threshold 5%"`
  - `data.forecasts: []`
- `public/data/forecast/system/status.json` contains:
  - `status: "circuit_open"`, `reason: ...`, `circuit_state: "open"`
