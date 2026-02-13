# 01_EODHD_TIER_COMPATIBILITY

## 1) Tier Constraints Used (Input Evidence)

### User-provided plan screenshot + prompt constraints
Allowed in current EODHD plan:
- ✅ EOD Historical Data
- ✅ Split Data Feed
- ✅ Dividends Data Feed
- ✅ Exchanges List API Data
- ✅ News API Data

Locked / not available:
- 🔒 Technical API Data
- 🔒 Fundamental Data
- 🔒 Calendar Data
- 🔒 Tick Data
- 🔒 Exchange Details API Data
- 🔒 All-in-one package

Policy for this blueprint:
- EODHD may only be used for allowed products above.
- Fundamentals must remain on existing non-EODHD provider path (Tiingo already present in repo).

## 2) Repo Reality vs Tier (Evidence)

### Current EODHD usage that is compatible
- EOD bars fetch in active pipeline:
  - `scripts/eod/build-eod-latest.mjs:195`
  - `functions/api/_shared/eodhd-adapter.mjs:40`
- EOD historical backfill workflow:
  - `.github/workflows/eod-history-refresh.yml:48`
  - `scripts/providers/eodhd-backfill-bars.mjs:56`

### Current usage that conflicts with tier
- Universe refresh uses EODHD fundamentals endpoint:
  - `scripts/universe/fetch-constituents.mjs:50`
  - URL pattern: `${BASE_URL}/fundamentals/...`
- This violates locked EODHD fundamentals for this plan.

### Current fundamentals path already available outside EODHD
- Stock UI calls `/api/fundamentals`:
  - `public/index.html:1802`
- Fundamentals API primary = Tiingo, fallback = FMP:
  - `functions/api/fundamentals.js:121` (Tiingo endpoint)
  - `functions/api/fundamentals.js:311-316` (fallback to FMP)
  - `functions/api/fundamentals.js:356-360` (telemetry primary=tiingo, fallbackUsed)

## 3) Plan-vs-Tier Matrix (Adjusted)

| Data Product / Dependency | Current Source in Repo | Tier Fit | Decision |
|---|---|---|---|
| DP1 EOD snapshot/batches | EODHD + Tiingo fallback (`build-eod-latest`) | ✅ | KEEP + harden |
| DP2 splits/dividends feed | Not implemented as dedicated active feed (only fields in bars) | ✅ (available) | ADD as new dedicated ingestion |
| DP5 news pack | Non-EODHD RSS/MarketAux patterns exist; no active EODHD news integration for core 4 features | ✅ (available) | OPTIONAL ADD (triggered, cached) |
| Exchanges list sync | Not implemented in active path | ✅ (available) | ADD as validator-only sync |
| Fundamentals (DP6) | Tiingo/FMP in `functions/api/fundamentals.js` | EODHD 🔒, Tiingo ✅ | KEEP Tiingo/FMP, do not move to EODHD |
| EODHD technical indicators | Local compute paths exist in app | EODHD 🔒 | COMPUTE LOCAL only |
| Calendar/earnings from EODHD | No tier support | EODHD 🔒 | OUT OF SCOPE unless other provider already exists |
| Tick/intraday from EODHD | Not used by 4-feature scope | EODHD 🔒 | OUT OF SCOPE |
| Exchange details from EODHD | Not used | EODHD 🔒 | OUT OF SCOPE |

## 4) Mandatory Corrections (No-ambiguity)

1. Replace universe constituent ingestion away from EODHD fundamentals endpoint.
- Evidence of violation: `scripts/universe/fetch-constituents.mjs:50`.
- Tier-safe alternatives:
  - use existing canonical universe artifact as SSOT and stop live constituent fetch in this plan, or
  - replace with tier-safe source outside EODHD fundamentals.

2. Keep fundamentals path on Tiingo/FMP; do not introduce EODHD fundamentals.
- Evidence: `functions/api/fundamentals.js:121`, `311-316`.

3. For any new EODHD additions, whitelist endpoint families to allowed plan scope only.

## 5) Explicit “Do Not Implement” List for Next Execution Agent

Do not add or depend on:
- EODHD `/fundamentals/*`
- EODHD technical endpoints
- EODHD calendar endpoints
- EODHD tick endpoints
- EODHD exchange-details endpoints

## 6) Tier-safe Source Contract for This Blueprint

- Equities EOD + history: EODHD primary, Tiingo fallback only when EODHD fails.
- Fundamentals: existing Tiingo/FMP path.
- Corporate actions (splits/dividends): EODHD allowed, add dedicated ingestion.
- Exchanges list: EODHD allowed, use for validation/coverage only.
- News: EODHD allowed; optional additive integration for top-movers/watchlist triggers.
