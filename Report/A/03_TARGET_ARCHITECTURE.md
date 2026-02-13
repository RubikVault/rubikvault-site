# 03_TARGET_ARCHITECTURE

## 1) Target Principles (Constrained by Current Repo + Tier)

1. UI contract remains stable on existing paths until controlled switch.
2. New data plane writes to shadow namespace first.
3. EODHD-only usage restricted to allowed plan endpoints.
4. Fundamentals remain on existing Tiingo/FMP path.
5. Never publish empty artifacts; preserve `last_good` and emit explicit stale/fallback metadata.

## 2) Current Compatible Structure to Reuse

Evidence-based existing roots:
- `public/data/eod/*`
- `public/data/pipeline/*`
- `public/data/forecast/*`
- `public/data/snapshots/*`
- `public/data/universe/*`
- `public/data/ops/*`

Evidence:
- `find public/data -maxdepth 2 -type d` output includes these directories.

## 3) Proposed Data Plane Layout (Additive, Shadow-first)

### New shadow namespace (no immediate UI switch)
- `public/data/v2/eod/**`
- `public/data/v2/corporate-actions/**`
- `public/data/v2/news/**`
- `public/data/v2/pulse/**`
- `public/data/v2/quality/latest.json`
- `public/data/v2/_meta/latest.json`

### Canonical metadata pointers
- `public/data/_meta/latest.json` (global pointer for active version)
- `public/data/quality/latest.json` (publish gate summary)

### Existing paths preserved during migration
- `/data/snapshots/stock-analysis.json`
- `/data/universe/all.json`
- `/data/forecast/latest.json`
- `/data/forecast/system/status.json`
- `/api/stock`, `/api/fundamentals`, `/api/elliott-scanner`

## 4) Data Products (Tier-safe)

| Product | Source | Output Path (Shadow) | Notes |
|---|---|---|---|
| DP1 EOD snapshot/batches | EODHD primary, Tiingo fallback | `public/data/v2/eod/batches/eod.latest.*.json` + manifest | Reuse existing `build-eod-latest` semantics |
| DP2 Corporate actions | EODHD splits + dividends | `public/data/v2/corporate-actions/{splits,dividends}/` | New dedicated product required |
| DP3 Adjusted series | Local compute from DP1+DP2 | `public/data/v2/eod/adjusted/{symbol}.json` | Incremental affected-symbol rebuild |
| DP4 Market pulse | Local compute from DP1(+DP2) | `public/data/v2/pulse/latest.json` | Deterministic derived summary |
| DP5 News pack | EODHD news (optional in this phase) | `public/data/v2/news/{top-movers,watchlist}.json` | Triggered/cached only |
| Fundamentals | Tiingo/FMP existing API path | `/api/fundamentals` response only | EODHD fundamentals forbidden by tier |
| Exchanges list | EODHD exchanges list API | `public/data/v2/reference/exchanges.json` | Validation/reference only |

## 5) Core Contracts (Target)

### Required meta fields for every new published artifact
```json
{
  "schema_version": "...",
  "meta": {
    "build_id": "...",
    "commit": "...",
    "run_id": "...",
    "generatedAt": "...",
    "asOf": "...",
    "status": "ok|stale|error",
    "reason": "...",
    "usingFallback": false
  }
}
```

### Global pointer contract (`public/data/_meta/latest.json`)
```json
{
  "currentVersion": "v1|v2",
  "lastGoodVersion": "v1|v2",
  "usingFallback": false,
  "staleSince": null,
  "reason": null,
  "runId": "...",
  "commitSha": "..."
}
```

## 6) Tier Safety Controls (Architecture-level)

1. Provider endpoint allowlist for EODHD usage:
- `/api/eod/*`
- `/api/splits/*`
- `/api/dividends/*`
- `/api/exchanges-list/*`
- `/api/news/*`

2. Forbidden EODHD endpoints:
- `/api/fundamentals/*`
- `/api/technical/*`
- `/api/calendar/*`
- `/api/tick/*`
- `/api/exchange-details/*`

3. Build-time gate rejects new calls outside allowlist.

## 7) Known Current Conflicts Against Target

1. Universe producer uses EODHD fundamentals (must be replaced):
- `scripts/universe/fetch-constituents.mjs:50`
2. `market-prices/latest.json` active producer is not clearly wired in active workflows; path currently appears monitored, not generated in active set:
- `.github/workflows/monitor-prod.yml:105` (read)
- no workflow invocation found for `scripts/providers/market-prices-v3.mjs` in active workflow grep.
3. Cross-workflow write overlap on `public/data/pipeline` and `public/data/ops`:
- `.github/workflows/eod-latest.yml:116`
- `.github/workflows/ops-daily.yml:112`

## 8) Architecture Decision

Adopt **parallel/shadow architecture** first, keep v1 read paths stable, and promote v2 only after 30-day parity proofs. This is the lowest-risk route consistent with current repo and UI contracts.
