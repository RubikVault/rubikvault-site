# UI-TRUTH EODHD-ONLY FIX v13.1 — Final Report

## Single Source of Truth Statement
> All equity EOD data now originates from `EODHD_API_KEY` via:
> `stock.js → eod-providers.mjs → eodhd-adapter.mjs → eodhd.com/api/eod/{SYMBOL}.US`

---

## Root Cause

The `EOD_FETCH_FAILED` error occurred when the provider chain defaulted to **tiingo** (no api key) or **twelvedata** (no key). The registry `providers.v1.json` had no `eod_chain` key, so `eod-providers.mjs` fell back to hardcoded `primary: 'tiingo'`. Meanwhile `stock.js:488` checked only `getTiingoKeyInfo(env).key || env?.TWELVEDATA_API_KEY` to determine if provider fetch was possible, ignoring `EODHD_API_KEY`.

| Component | Before | After |
|---|---|---|
| `providers.v1.json` eod_chain | absent | `primary: "eodhd"` |
| `eod-providers.mjs` fallback | `tiingo / twelvedata` | `eodhd / eodhd` |
| `stock.js` hasEodKeys | `getTiingoKeyInfo \|\| TWELVEDATA` | `env?.EODHD_API_KEY` |
| `stock.js` provider fallback (14 refs) | `'tiingo'` | `'eodhd'` |

---

## Fixes Applied

### `functions/api/_shared/registry/providers.v1.json`
- Added `eod_chain: { primary: "eodhd", secondary: "eodhd" }`
- EODHD provider: `enabled: true, role: "primary"`
- AlphaVantage: `enabled: false, role: "legacy_disabled"`
- TwelveData: `enabled: false, role: "legacy_disabled"`

### `functions/api/_shared/eod-providers.mjs`
- Line 51-52: default `primary`/`secondary` → `'eodhd'`

### `functions/api/stock.js`
- Line 6: removed `import { getTiingoKeyInfo }` (no longer needed)
- Line 488: `hasEodKeys = Boolean(env?.EODHD_API_KEY)`
- Lines 53-54, 64-65, 506, 528, 565, 573, 581, 589, 600, 614, 709, 835, 1061: all `'tiingo'`/`'twelvedata'` → `'eodhd'`

---

## UI Verification (PROD)

| Feature | Ticker | Status | Close | Volume | Indicators | Chart |
|---|---|---|---|---|---|---|
| Stock Analyzer | IDXX | ✅ OK | $646.53 | 491,110 | RSI=25.3, MACD=-15.8, SMAs ✅ | 1Y ✅ |
| Stock Analyzer | AAPL | ✅ OK | $273.68 | 34.4M | ✅ | ✅ |
| Stock Analyzer | MSFT | ✅ OK | $413.27 | — | ✅ | ✅ |

Data updated: 2026-02-11 (10-02-2026 data date, 751 bars)

---

## Workflow Matrix (20/20)

| Workflow | UI-Chain | Provider Refs | Classification |
|---|---|---|---|
| `ci-determinism.yml` | — | — | INFRA |
| `ci-gates.yml` | — | eod(2) | INFRA |
| `ci-policy.yml` | — | — | INFRA |
| `cleanup-daily-snapshots.yml` | — | — | INFRA |
| `e2e-playwright.yml` | — | — | INFRA |
| `eod-history-refresh.yml` | ✅ | eodhd(2) | UI-CHAIN GREEN |
| `eod-latest.yml` | ✅ | eodhd(5)+tiingo(7)* | UI-CHAIN GREEN |
| `forecast-daily.yml` | ✅ | — | UI-CHAIN GREEN |
| `forecast-monthly.yml` | ✅ | — | UI-CHAIN GREEN |
| `forecast-rollback.yml` | — | — | OPS |
| `forecast-weekly.yml` | ✅ | — | UI-CHAIN GREEN |
| `monitor-prod.yml` | — | — | OPS |
| `ops-auto-alerts.yml` | — | — | OPS |
| `ops-daily.yml` | ✅ | — | UI-CHAIN GREEN |
| `refresh-health-assets.yml` | — | — | OPS |
| `scheduler-kick.yml` | ✅ | eod(4) | UI-CHAIN GREEN |
| `universe-refresh.yml` | ✅ | eodhd(1) | UI-CHAIN GREEN |
| `v3-finalizer.yml` | ✅ | — | UI-CHAIN GREEN |
| `v3-scrape-template.yml` | ✅ | eodhd+tiingo* | UI-CHAIN GREEN |
| `wp16-manual-market-prices.yml` | ✅ | eodhd+tiingo* | UI-CHAIN GREEN |

*`eod-latest.yml`, `v3-scrape-template.yml`, `wp16-manual-market-prices.yml` still export TIINGO_API_KEY as env var for backward compatibility, but the runtime provider chain (`eod-providers.mjs`) now selects EODHD. Tiingo key is no longer used unless `RV_FORCE_PROVIDER=tiingo` is explicitly set.

---

## Git History

| Commit | Description |
|---|---|
| `728bdf9f` | EODHD sole equity EOD provider (registry, chain defaults, stock.js hasEodKeys) |

Final main HEAD: `728bdf9f`
Branch: `main`
