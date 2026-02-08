# 02_LIVE_PROBE

## Preview Probe (dece36c6)
Commands:
- `curl -sS -I https://dece36c6.rubikvault-site.pages.dev/data/snapshots/market-prices/latest.json | sed -n '1,20p'`
- `curl -sS -I https://dece36c6.rubikvault-site.pages.dev/data/forecast/latest.json | sed -n '1,20p'`
- `curl -sS https://dece36c6.rubikvault-site.pages.dev/data/forecast/system/status.json | head -c 600`

Observed:
- `/data/snapshots/market-prices/latest.json` -> `HTTP/2 404`
- `/data/forecast/latest.json` -> `HTTP/2 200`
- `/data/forecast/system/status.json` -> `404 Not found` body
- `/data/forecast/latest.json` body (head) shows:
  - `meta.status: "circuit_open"`
  - `meta.reason: "Missing price data 100.0% exceeds threshold 5%"`
  - `data.forecasts: []`

## Production Probe (rubikvault.com)
Commands:
- `curl -sS -I https://rubikvault.com/data/snapshots/market-prices/latest.json | sed -n '1,20p'`
- `curl -sS -I https://rubikvault.com/data/forecast/latest.json | sed -n '1,20p'`
- `curl -sS -I https://rubikvault.com/data/forecast/system/status.json | sed -n '1,20p'`
- `curl -sS https://rubikvault.com/data/forecast/latest.json | head -c 500`
- `curl -sS https://rubikvault.com/data/forecast/system/status.json | head -c 300`

Observed:
- `/data/snapshots/market-prices/latest.json` -> `HTTP/2 404`
- `/data/forecast/latest.json` -> `HTTP/2 200` (`meta.status: circuit_open`, `forecasts: []`)
- `/data/forecast/system/status.json` -> `HTTP/2 200` (content exists)

## Interpretation
- Primary failure is artifact availability/consistency (missing `market-prices/latest.json`, missing preview `forecast/system/status.json`), not static route availability for `forecast/latest.json`.
- This is a pipeline/publish contract issue; forecast payload exists but indicates degraded/circuit state with zero forecasts.
