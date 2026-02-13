# Stock UI Value Pack

## Scope
Adds per-ticker value panels on `/analyze/:ticker` with fail-soft behavior and no changes to the core `/api/stock` contract.

## Thin Adapter
- File: `public/js/rv-stock-ui-extras.js`
- Exposes global `RVStockUIExtras` with pure helpers:
  - `normalizeStockEnvelope(apiStockResp)`
  - `safeGet(obj, path, fallback)`
  - `computeReturns(bars, windows)`
  - `computeDistribution(bars, windowDays)`
  - `computeSeasonality(bars, years)`
  - `computeSupportResistance(bars, window)`
  - `computeGapStats(bars, threshold, window)`

## New Artifacts

### 1) `public/data/ui/benchmarks/latest.json`
```json
{
  "schema_version": "ui.benchmarks.v1",
  "meta": {
    "generated_at": "ISO-8601",
    "data_date": "YYYY-MM-DD|null",
    "as_of": "YYYY-MM-DD|null",
    "provider": "local-artifacts",
    "source_chain": ["..."],
    "schema_version": "ui.benchmarks.v1"
  },
  "data": {
    "benchmarks": {
      "SPY": {
        "bars_ref": "/data/eod/bars/SPY.json|null",
        "as_of": "YYYY-MM-DD|null",
        "source": "eod-bars|mirror-market-health|missing",
        "returns": { "d1": 0.0, "ytd": 0.0, "y1": 0.0, "y5": 0.0 }
      }
    }
  }
}
```

### 2) `public/data/ui/peers/latest.json`
```json
{
  "schema_version": "ui.peers.v1",
  "meta": {
    "generated_at": "ISO-8601",
    "data_date": "YYYY-MM-DD|null",
    "as_of": "YYYY-MM-DD|null",
    "provider": "local-artifacts",
    "source_chain": ["..."],
    "schema_version": "ui.peers.v1"
  },
  "data": {
    "peers": {
      "F": ["GM", "STLA", "TM", "TSLA"]
    }
  }
}
```

### 3) `public/data/ui/correlations/latest.json`
```json
{
  "schema_version": "ui.correlations.v1",
  "meta": {
    "generated_at": "ISO-8601",
    "data_date": "YYYY-MM-DD|null",
    "as_of": "YYYY-MM-DD|null",
    "provider": "local-artifacts",
    "source_chain": ["..."],
    "schema_version": "ui.correlations.v1",
    "window": 90,
    "min_overlap": 30
  },
  "data": {
    "correlations": {
      "F": {
        "window": 90,
        "items": [
          { "symbol": "SPY", "corr": 0.81, "overlap_days": 90 }
        ]
      }
    }
  }
}
```

## Build Commands
- `node scripts/ui/build-benchmarks-latest.mjs`
- `node scripts/ui/build-peers-latest.mjs`
- `node scripts/ui/build-correlations-latest.mjs`

## Contract Verification
- `node scripts/ci/verify-stock-ui-artifacts.mjs`

## Degradation Rules
- If benchmark bars are missing, `benchmarks` rows are published with null returns and `source: "missing"`.
- If correlations cannot be computed, ticker rows are omitted (UI must show `—` instead of crashing).
- UI blocks never block chart rendering; all extra fetches are asynchronous.
- No secrets are exposed in UI provenance details.
