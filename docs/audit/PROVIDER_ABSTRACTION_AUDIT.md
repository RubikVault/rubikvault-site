# ⚙️ DATA PROVIDER ABSTRACTION AUDIT (MODUS B)
**Date**: 2026-02-04  
**Context**: RubikVault | Static-first | EOD / Forecast / Charts | Provider-Switch-Ready  
**Role**: Senior Systems Archaeologist + Data Architect

---

## 1) IST-ZUSTAND SUMMARY

### A) Data Ingest

**Primary Pipeline (Tiingo/TwelveData)**:
- **Location**: `functions/api/_shared/eod-providers.mjs`
- **Functions**: `fetchTiingoBars()`, `fetchTwelveDataBars()`, `fetchBarsWithProviderChain()`
- **Provider Selection**: Chain-based (primary: Tiingo, secondary: TwelveData)
- **Normalization**: Inline normalization to canonical format `{date, open, high, low, close, volume}`
- **Provider Hardcoding**: YES — provider names hardcoded in function names and chain logic

**Batch Pipeline (Registry-Driven)**:
- **Location**: `scripts/providers/market-prices-v3.mjs`
- **Registry**: `public/data/registry/providers.v1.json`
- **Current Providers**: Alpha Vantage (primary), Twelve Data (fallback)
- **Normalization**: `normalizeTwelveDataTimeSeries()`, `normalizeAlphaVantageDailyAdjusted()`
- **Provider Hardcoding**: PARTIAL — registry-driven but normalization functions are provider-specific

**Legacy Pipeline (Stooq)**:
- **Locations**: 
  - `scripts/providers/stooq.js` (seeder)
  - `scripts/utils/stooq-fetch.mjs` (utilities)
  - `scripts/utils/eod-market-symbols.mjs` (uses Stooq)
- **Usage**: Powers `public/mirrors/` artifacts (price-snapshot, quotes, market-cockpit)
- **Provider Hardcoding**: YES — Stooq URLs and CSV parsing hardcoded

**API Endpoint**:
- **Location**: `functions/api/stock.js`
- **Uses**: `fetchBarsWithProviderChain()` from `eod-providers.mjs`
- **Provider Hardcoding**: YES — chain hardcoded to Tiingo/TwelveData

### B) Data Format

**Canonical OHLCV Model** (EXISTS):
```javascript
{
  symbol: string,
  date: "YYYY-MM-DD",
  open: number,
  high: number,
  low: number,
  close: number,
  volume: number | null,
  adj_close: number | null,
  currency: "USD",
  source_provider: string,
  ingested_at: ISO-8601 string
}
```

**Evidence**:
- `functions/api/_shared/eod-providers.mjs:116-128` (Tiingo normalization)
- `functions/api/_shared/eod-providers.mjs:191-203` (TwelveData normalization)
- `scripts/providers/market-prices-v3.mjs:817-829` (TwelveData batch normalization)
- `public/data/snapshots/market-prices/latest.json` (stored format)

**Date Normalization**: YES — all providers normalize to `YYYY-MM-DD` via `toIsoDate()`

**Adjustment Tracking**: PARTIAL — `adj_close` field exists but:
- Tiingo: Not populated (no adjustment data in API response)
- TwelveData: Populated if available (`adj_close` or `adjusted_close`)
- Alpha Vantage: Populated (`TIME_SERIES_DAILY_ADJUSTED`)

### C) Storage

**Normalized Data**:
- **Path**: `public/data/snapshots/market-prices/latest.json`
- **Format**: Array of canonical OHLCV objects
- **Metadata**: Includes `source_provider` per bar

**Raw Provider Data**: NOT STORED — only normalized bars persisted

**Legacy Mirrors** (Stooq-based):
- **Path**: `public/mirrors/`
- **Files**: `price-snapshot.json`, `quotes.json`, `market-cockpit.json`
- **Format**: Derived summaries (not raw bars)
- **Provider**: Hardcoded to Stooq (`sourceUpstream: "stooq"`)

### D) Usage

**Downstream Consumers**:

1. **API Endpoints**:
   - `/api/stock` → Uses `fetchBarsWithProviderChain()` → Tiingo/TwelveData
   - `/api/market-cockpit` → Reads `public/mirrors/market-cockpit.json` → Stooq

2. **UI Features**:
   - Charts: Read from `/api/stock` → Provider-agnostic (uses canonical format)
   - Market Cockpit: Reads Stooq mirrors → **PROVIDER-COUPLED**
   - Scientific Analyzer: Uses `marketphase` artifacts → Stooq-based

3. **Indicators/Calculations**:
   - `scripts/utils/eod-market-symbols.mjs` → Uses Stooq directly
   - `functions/api/_shared/eod-indicators.mjs` → Provider-agnostic (consumes canonical bars)

4. **Reports/Forecasts**:
   - `backend/rvci/run_daily.py` → Uses Yahoo Finance (yfinance) → **EXTERNAL DEPENDENCY**

**Provider-Specific Semantics**: YES — Stooq mirrors assume Stooq date format and field names

---

## 2) COUPLING & RISK ANALYSIS

### Is provider implicitly assumed to be EODHD?
**NO** — EODHD is NOT implemented. Current providers:
- Tiingo (primary in API)
- TwelveData (fallback in API)
- Alpha Vantage (primary in batch)
- Stooq (legacy mirrors)

### Would switching to Twelve Data break parsing?
**NO** — TwelveData already supported:
- `fetchTwelveDataBars()` exists
- `normalizeTwelveDataTimeSeries()` exists
- Already in fallback chain

### Would switching to Marketstack break adjustments?
**UNKNOWN** — Marketstack not implemented. Risk assessment:
- If Marketstack provides `adj_close` → Safe (canonical format supports it)
- If Marketstack uses different field names → **BREAKS** (normalization function needed)

### Would switching require re-backfilling historical data?
**NO** — Historical data stored in canonical format with `source_provider` metadata. Switching providers only affects new fetches.

### Is there a single choke point for provider logic?
**NO** — Multiple entry points:
1. `eod-providers.mjs` (API runtime)
2. `market-prices-v3.mjs` (batch processing)
3. `stooq.js` / `stooq-fetch.mjs` (legacy)

### Hard Coupling (MUST FIX)

1. **Provider-Specific Function Names**:
   - `fetchTiingoBars()`, `fetchTwelveDataBars()` → Hardcoded provider names
   - **Location**: `functions/api/_shared/eod-providers.mjs:70,141`
   - **Risk**: Adding new provider requires modifying chain logic

2. **Stooq Hardcoding in Mirrors**:
   - `scripts/utils/eod-market-symbols.mjs:20` → `fetchStooqDaily()`
   - `public/mirrors/*.json` → `sourceUpstream: "stooq"`
   - **Risk**: Mirrors cannot switch providers without code changes

3. **Provider Chain Hardcoding**:
   - `eod-providers.mjs:220-221` → `primary: 'tiingo', secondary: 'twelvedata'`
   - **Risk**: Cannot change primary/secondary without code changes

4. **Normalization Function Names**:
   - `normalizeTwelveDataTimeSeries()`, `normalizeAlphaVantageDailyAdjusted()` → Provider-specific
   - **Location**: `scripts/providers/market-prices-v3.mjs:779,716`
   - **Risk**: Adding provider requires new normalization function

### Soft Coupling (SHOULD FIX)

1. **Registry Not Used in API Runtime**:
   - `eod-providers.mjs` does not read `providers.v1.json`
   - **Risk**: Two sources of truth (registry vs hardcoded chain)

2. **Provider Metadata Inconsistency**:
   - API uses `provider` field
   - Batch uses `source_provider` field
   - **Risk**: Confusion when debugging

3. **No Provider Interface**:
   - Each provider implemented as separate function
   - **Risk**: Inconsistent error handling, retry logic

### Acceptable Coupling (CAN STAY)

1. **Provider-Specific Normalization Logic**:
   - Each provider has unique field names → Normalization functions must be provider-aware
   - **Acceptable**: Cannot be abstracted further without losing flexibility

2. **Provider Registry Schema**:
   - `providers.v1.json` includes provider-specific config (base_url, endpoints)
   - **Acceptable**: Registry is configuration, not abstraction layer

---

## 3) CANONICAL MODEL STATUS

**STATUS**: ✅ **EXISTS AND SUFFICIENT**

**Canonical OHLCV Schema**:
```typescript
{
  symbol: string,           // Required
  date: "YYYY-MM-DD",       // Required, ISO date
  open: number,             // Required
  high: number,             // Required
  low: number,              // Required
  close: number,            // Required
  volume: number | null,    // Optional
  adj_close: number | null, // Optional
  currency: "USD",          // Required (default)
  source_provider: string,  // Required (for traceability)
  ingested_at: ISO-8601     // Required (for freshness)
}
```

**Validation**:
- ✅ Trading date: `YYYY-MM-DD` format enforced
- ✅ OHLC: All required, numeric
- ✅ Volume: Optional (some providers don't provide)
- ✅ Adjustment metadata: `adj_close` field exists
- ✅ Source/provider: `source_provider` field exists
- ✅ Timestamp: `ingested_at` field exists

**Gaps for EODHD/Marketstack**:
- ✅ EODHD: Compatible (standard OHLCV + adj_close)
- ✅ Marketstack: Compatible (standard OHLCV + adj_close)

**Verdict**: Canonical model is sufficient. No changes needed.

---

## 4) PROVIDER ADAPTER STATUS

**STATUS**: ⚠️ **PARTIAL — NOT A TRUE INTERFACE**

### Current State

**API Runtime** (`eod-providers.mjs`):
- Functions: `fetchTiingoBars()`, `fetchTwelveDataBars()`
- Chain Logic: `fetchBarsWithProviderChain()` hardcodes provider selection
- **NOT an interface** — direct function calls

**Batch Runtime** (`market-prices-v3.mjs`):
- Registry-driven provider selection
- Provider-specific fetch functions: `fetchTwelveDataBar()`, `fetchAlphaVantageBar()`
- Normalization functions: `normalizeTwelveDataTimeSeries()`, `normalizeAlphaVantageDailyAdjusted()`
- **NOT an interface** — registry maps to provider-specific functions

### What Exists vs What's Needed

**Exists**:
- Provider registry (`providers.v1.json`)
- Provider-specific fetch functions
- Provider-specific normalization functions
- Chain/failover logic

**Missing**:
- Unified `ProviderAdapter` interface
- Standardized error handling contract
- Standardized retry/throttle contract
- Provider-agnostic fetch entry point

### Proposed Minimal ProviderAdapter Interface

```typescript
interface ProviderAdapter {
  id: string;
  fetchBars(symbol: string, options: FetchOptions): Promise<FetchResult>;
}

interface FetchOptions {
  startDate?: string;      // YYYY-MM-DD
  outputsize?: number;     // For providers that support it
  targetDate?: string;     // YYYY-MM-DD (for historical)
}

interface FetchResult {
  ok: boolean;
  provider: string;
  bars: CanonicalBar[];   // Already normalized
  error?: ErrorPayload;
  circuit?: CircuitMeta;
}
```

**Location**: `functions/api/_shared/provider-adapter.mjs`

**Implementation Size** (per provider):
- Tiingo: ~50 LOC (existing `fetchTiingoBars` + normalization)
- TwelveData: ~50 LOC (existing `fetchTwelveDataBars` + normalization)
- EODHD: ~60 LOC (new implementation)
- Marketstack: ~60 LOC (new implementation)

**Total**: ~220 LOC for 4 providers (excluding shared utilities)

---

## 5) DELTA REPORT

### 🔴 MUST DO NOW (NON-NEGOTIABLE)

#### 1. Create ProviderAdapter Interface
- **What**: Unified interface for all providers
- **Where**: `functions/api/_shared/provider-adapter.mjs`
- **Why**: Without this, adding EODHD/Marketstack requires modifying chain logic in multiple places
- **Fix**: 
  - Define `ProviderAdapter` interface
  - Wrap existing Tiingo/TwelveData functions as adapters
  - Update `fetchBarsWithProviderChain()` to use adapters

#### 2. Make Provider Chain Registry-Driven (API Runtime)
- **What**: Read provider chain from registry instead of hardcoding
- **Where**: `functions/api/_shared/eod-providers.mjs:215-300`
- **Why**: Currently hardcoded `primary: 'tiingo', secondary: 'twelvedata'`. Adding EODHD requires code changes.
- **Fix**:
  - Load `providers.v1.json` in `fetchBarsWithProviderChain()`
  - Build chain from registry (same as batch pipeline)
  - Fallback to hardcoded chain if registry missing

#### 3. Standardize Provider Metadata Field Name
- **What**: Use `source_provider` consistently (not `provider`)
- **Where**: 
  - `functions/api/_shared/eod-providers.mjs` (uses `provider`)
  - `functions/api/stock.js` (uses `provider`)
- **Why**: Inconsistency causes confusion. Batch uses `source_provider`.
- **Fix**: Change `provider` → `source_provider` in API responses

#### 4. Decouple Stooq from Mirrors (or Deprecate Mirrors)
- **What**: Either make mirrors provider-agnostic or deprecate them
- **Where**: 
  - `scripts/utils/eod-market-symbols.mjs:20`
  - `scripts/utils/eod-market-mirrors.mjs`
  - `public/mirrors/*.json`
- **Why**: Mirrors hardcode Stooq. If Stooq fails, mirrors break.
- **Fix**: 
  - Option A: Read from `market-prices` snapshot instead of Stooq
  - Option B: Mark mirrors as deprecated, migrate UI to snapshots

### 🟡 SHOULD DO SOON

#### 5. Add EODHD Provider Implementation
- **What**: Implement EODHD adapter
- **Where**: `functions/api/_shared/provider-adapter.mjs` (new adapter)
- **Why**: EODHD mentioned in docs but not implemented. Needed for provider switching.
- **Fix**: 
  - Add EODHD to `providers.v1.json`
  - Implement `EodhdAdapter` (~60 LOC)
  - Add normalization function

#### 6. Add Marketstack Provider Implementation
- **What**: Implement Marketstack adapter
- **Where**: `functions/api/_shared/provider-adapter.mjs` (new adapter)
- **Why**: Marketstack is target provider. Must be implemented before switching.
- **Fix**: 
  - Add Marketstack to `providers.v1.json`
  - Implement `MarketstackAdapter` (~60 LOC)
  - Add normalization function

#### 7. Unify Batch and API Provider Logic
- **What**: Use same adapter interface in batch pipeline
- **Where**: `scripts/providers/market-prices-v3.mjs`
- **Why**: Currently batch has separate provider logic. Duplication increases maintenance cost.
- **Fix**: 
  - Refactor batch to use `ProviderAdapter` interface
  - Share adapters between API and batch

#### 8. Add Provider Switching Test Suite
- **What**: Tests that verify provider switching works
- **Where**: `tests/provider-switching.test.mjs` (new file)
- **Why**: Without tests, provider switching is risky.
- **Fix**: 
  - Test: Switch primary provider via registry
  - Test: Fallback chain works
  - Test: Canonical format consistent across providers

### 🟢 OPTIONAL / NICE TO HAVE

#### 9. Provider Health Dashboard
- **What**: UI showing provider status, usage, errors
- **Why**: Useful for ops but not required for switching

#### 10. Provider Cost Tracking
- **What**: Track API costs per provider
- **Why**: Useful for budgeting but not required for switching

#### 11. Historical Provider Migration Tool
- **What**: Script to re-fetch historical data from new provider
- **Why**: Useful if switching providers mid-project, but not required if starting fresh

---

## 6) IMPLEMENTATION CHECKLIST

### Files to Add

- [ ] `functions/api/_shared/provider-adapter.mjs`
  - Define `ProviderAdapter` interface
  - Implement `TiingoAdapter`, `TwelveDataAdapter`
  - Export adapter registry

- [ ] `functions/api/_shared/eodhd-adapter.mjs` (optional, for EODHD)
  - Implement `EodhdAdapter`
  - Normalization function

- [ ] `functions/api/_shared/marketstack-adapter.mjs` (optional, for Marketstack)
  - Implement `MarketstackAdapter`
  - Normalization function

- [ ] `tests/provider-switching.test.mjs`
  - Test provider chain selection
  - Test fallback logic
  - Test canonical format consistency

### Files to Modify

- [ ] `functions/api/_shared/eod-providers.mjs`
  - Replace `fetchTiingoBars()` → `TiingoAdapter.fetchBars()`
  - Replace `fetchTwelveDataBars()` → `TwelveDataAdapter.fetchBars()`
  - Update `fetchBarsWithProviderChain()` to:
    - Load `providers.v1.json`
    - Build chain from registry
    - Use adapter interface

- [ ] `functions/api/stock.js`
  - Change `provider` → `source_provider` in response metadata

- [ ] `public/data/registry/providers.v1.json`
  - Add EODHD entry (if implementing)
  - Add Marketstack entry (if implementing)

- [ ] `scripts/providers/market-prices-v3.mjs` (optional, for unification)
  - Refactor to use `ProviderAdapter` interface
  - Share adapters with API runtime

- [ ] `scripts/utils/eod-market-symbols.mjs` (if decoupling Stooq)
  - Replace `fetchStooqDaily()` → Read from `market-prices` snapshot

### Interfaces to Introduce

- [ ] `ProviderAdapter` interface
  - `id: string`
  - `fetchBars(symbol, options): Promise<FetchResult>`

- [ ] `FetchOptions` interface
  - `startDate?: string`
  - `outputsize?: number`
  - `targetDate?: string`

- [ ] `FetchResult` interface
  - `ok: boolean`
  - `provider: string`
  - `bars: CanonicalBar[]`
  - `error?: ErrorPayload`
  - `circuit?: CircuitMeta`

### Tests or Validation Hooks

- [ ] Provider switching test
  - Verify chain selection from registry
  - Verify fallback works
  - Verify canonical format

- [ ] Canonical format validation
  - Schema validation for `CanonicalBar`
  - Date format validation (`YYYY-MM-DD`)
  - Numeric validation (OHLC > 0)

### One-Time Migrations

- [ ] Update existing snapshots (if changing `provider` → `source_provider`)
  - **NOT REQUIRED** — can be done incrementally

---

## 7) FINAL VERDICT

### Is provider switching safe today? **NO**

**Reasons**:

1. **Hard Coupling**: Provider chain hardcoded in `eod-providers.mjs`. Adding EODHD/Marketstack requires code changes.

2. **No Unified Interface**: Each provider implemented as separate function. No adapter pattern.

3. **Registry Not Used**: API runtime ignores `providers.v1.json`. Two sources of truth.

4. **Stooq Legacy**: Mirrors hardcode Stooq. Cannot switch without breaking mirrors.

5. **Inconsistent Metadata**: `provider` vs `source_provider` field names cause confusion.

**What Must Be Done First**:

1. ✅ Create `ProviderAdapter` interface (MUST)
2. ✅ Make chain registry-driven (MUST)
3. ✅ Standardize metadata field names (MUST)
4. ✅ Decouple Stooq from mirrors (MUST)

**After Fixes**: Provider switching becomes **LOW-RISK** — change registry config, deploy.

**Estimated Effort**: 
- Must-do items: ~200 LOC, 1-2 days
- Should-do items: ~300 LOC, 2-3 days
- **Total**: ~500 LOC, 3-5 days

---

**END OF AUDIT**
