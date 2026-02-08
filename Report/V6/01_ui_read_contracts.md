# 01 UI Read Contracts (No-Change Guardrail)

## Primary Forecast UI Read Path (Existing)
Evidence:
- `public/forecast.html:428` sets `API_BASE = '/data/forecast'`.
- `public/forecast.html:432-435` fetches `${API_BASE}/${path}`.
- `public/forecast.html:574-579` loads `system/status.json` then `latest.json`.
- `public/forecast.html:587` reads `latest.data.forecasts`.
- `public/forecast.html:592-596` expects report refs in form `public/data/forecast/...` and strips prefix.

## Existing UI Field Expectations
Evidence:
- `public/forecast.html:454` expects nested `status.circuit?.state`.
- `public/forecast.html:471` expects `status.message` for circuit reason text.
- `public/forecast.html:475-478` expects `latest.data.maturity_phase` and `latest.meta.status`.

## Runtime Smoke Contract (Existing Test)
Evidence:
- `tests/forecast-ui-smoke.test.mjs:45` waits for forecast rows.
- `tests/forecast-ui-smoke.test.mjs:58-61` asserts bootstrap notice hidden when forecasts exist.
- `tests/forecast-ui-smoke.test.mjs:68-71` asserts >=100 table rows.

## v6 UI-Safety Conclusion
- No UI file was modified.
- v6 publish target is isolated under `public/data/forecast/v6/**` (new path), so legacy UI reads from `/data/forecast/**` remain unchanged by default.
