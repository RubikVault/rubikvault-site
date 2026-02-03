# Audit Summary (v5.0)

## 1) UI is correct because
- UI `/analyze/<T>` fetches `/api/stock?ticker=<T>` and renders `data.latest_bar` fields (close/volume/date). Evidence: `public/index.html:1448-1467`, `public/index.html:931-934`.
- `/api/stock` constructs `data.latest_bar` from EOD bars and returns it in the response. Evidence: `functions/api/stock.js:855-865`.

## 2) OPS is incorrect because
- OPS price truth chain reads `/data/snapshots/market-prices/latest.json`, which is a bootstrap mini-universe (SPY/QQQ/DIA/IWM) and not the UI SSOT. Evidence: `functions/api/mission-control/summary.js:1327-1345`, `public/data/snapshots/market-prices/latest.json:35-38`.
- OPS evaluates pipeline artifacts (`/data/pipeline/*.json`) for health and counts, which are not on the UI price path. Evidence: `functions/api/mission-control/summary.js:1201-1215`, `public/ops/index.html:686-713`.

## 3) Safe cleanup candidates (none)
- No RED candidates identified in this run. Negative proof requires runtime telemetry and dependency impact checks. See `docs/audit/05-cleanup-candidates.json` and `docs/audit/05.5-dependency-impact.json`.

## 4) SSOT violations (top concepts)
- **Prices**: SSOT is `/api/stock` → `data.latest_bar` (UI). Parallel path in OPS: `/data/snapshots/market-prices/latest.json` (mini snapshot). Evidence: `public/index.html:931-934`, `functions/api/mission-control/summary.js:1327-1345`.
- **Indicators/Marketphase**: SSOT for UI uses `/data/marketphase/index.json` + `/data/marketphase/<T>.json`. OPS pipeline uses `/data/pipeline/*` as health indicators. Evidence: `public/index.html:351-360`, `public/index.html:1321-1322`, `functions/api/mission-control/summary.js:1201-1215`.

## 5) Next steps (instructions only)
- Align OPS price truth chain to validate `/api/stock` response at `data.latest_bar` and demote market-prices snapshot to informational cache. See `docs/audit/08-ops-remediation-plan.json`.
- Run validation commands listed in remediation plan; ensure `data.truthChains.prices` uses checked_path `data.latest_bar` and that OPS no longer blocks on the mini snapshot.

## Gaps
- Runtime probes were not executed (BASE_URL unset). Evidence: `evidence/06-ui-runtime-baseline.json`, `evidence/06-ops-runtime-baseline.json`.
