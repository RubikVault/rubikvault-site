# 06_UI_INTEGRATION_PLAN

## UI Safety Rule
Do not break existing feature fetch paths. Integrate new data plane via shadow artifacts + resolver logic first.

## Shared Integration Strategy

1. Preserve current UI fetch endpoints/paths.
2. Add compatibility resolver in function/static serving layer that can source from v1 or v2.
3. Expose active version through `public/data/_meta/latest.json`.
4. Add additive data-age/fallback UI component only (no layout rewrite).

---

## Feature 1: Stock Analyzer

### Current proven read path
- `public/index.html:285` -> `/data/snapshots/stock-analysis.json`
- `public/index.html:315` -> `/data/marketphase/index.json`
- `public/index.html:512` -> `/data/universe/all.json`
- `public/index.html:1801` -> `/api/stock?ticker=...`
- `public/index.html:1802` -> `/api/fundamentals?ticker=...`

### Current provider reality
- `/api/stock` uses provider chain + static fallbacks:
  - `functions/api/stock.js:3,487-499,640-683,706-737`
- `/api/fundamentals` is Tiingo primary with fallback:
  - `functions/api/fundamentals.js:121,290-316,356-360`

### Shadow integration plan
- Keep UI requests unchanged.
- Add resolver in `/api/stock` static-source reads to prefer v2 when pointer says activeVersion=v2, else v1.
- Add additive “Data health” strip sourced from `public/data/_meta/latest.json`.

### New fields to surface (additive)
- `asOf`
- `generatedAt`
- `usingFallback`
- `reason`
- `build_id`

### Layout constraints
- Reuse existing card components and typography classes in `public/index.html`.
- No new page-level theme or spacing system.

---

## Feature 2: Elliott Waves

### Current proven read path
- `public/elliott.html:415` -> `/api/elliott-scanner`

### Current backend file dependencies
- Universe path selection:
  - `functions/api/elliott-scanner.js:107-111` (`full` => `/data/universe/all.json`)
- Data dependencies:
  - `functions/api/elliott-scanner.js:226` (`/data/eod/batches/eod.latest.000.json`)
  - `functions/api/elliott-scanner.js:230` (`/data/marketphase/index.json`)

### Shadow integration plan
- Keep `/api/elliott-scanner` contract unchanged.
- Update function internals to read v2 eod/marketphase paths behind resolver while preserving response shape.
- Add meta fields for lineage/fallback from global pointer.

### Optional enhancement
- Adjusted/unadjusted toggle only after DP3 (adjusted series) parity passes.

---

## Feature 3: Scientific Analyzer

### Current proven read path
- `public/scientific.html:671` -> `/data/snapshots/stock-analysis.json`

### Current producer chain
- `scientific-daily` workflow invokes generator:
  - `.github/workflows/scientific-daily.yml:43`
- Generator writes canonical artifact:
  - `scripts/scientific-analyzer/generate-analysis.mjs:535`

### Shadow integration plan
- Keep existing `stock-analysis.json` for v1.
- Generate `public/data/v2/snapshots/stock-analysis.json` in parallel.
- Maintain compatibility copy step only after v2 quality gate pass.

### UI field additions (non-breaking)
- Add footer line with data lineage from `_meta/latest` and snapshot `_meta`.

---

## Feature 4: Forecast System

### Current proven read path
- `public/forecast.html:421` -> `/data/forecast/*`
- `public/forecast.html:703` -> `system/status.json`
- `public/forecast.html:707` -> `latest.json`

### Current resilience behavior
- UI handles `BOOTSTRAP`, `STALE`, `CIRCUIT_OPEN`:
  - `public/forecast.html:655-680`
- Writer maintains last_good fallback:
  - `scripts/forecast/report_generator.mjs:411-505`

### Shadow integration plan
- Keep v1 forecast endpoints unchanged.
- Add v2 forecast mirror artifacts in parallel (if forecasting logic changes later).
- Extend status payload with global pointer + build lineage fields.

---

## Global Banner Plan (all 4 pages)

### Data source
- `public/data/_meta/latest.json`
- Per-feature status docs (`forecast/system/status.json`, stock/fundamentals metadata, etc.)

### Display rules
- `OK`: normal timestamp
- `STALE`: amber badge + staleSince
- `FALLBACK`: explicit “last_good in use”
- `ERROR`: red badge with reason (no silent fail)

### Non-goals in this phase
- No redesign
- No route changes
- No direct provider calls from UI

---

## Feature Flag / Switch Strategy

1. Add `activeVersion` in `public/data/_meta/latest.json` (`v1` default).
2. Resolver layer (API/static) uses `activeVersion` to select source path.
3. UI continues same fetch URLs.
4. Promote to v2 only after 30-day parity checks and quality pass history.

This approach preserves current correct UI behavior while enabling safe integration.
