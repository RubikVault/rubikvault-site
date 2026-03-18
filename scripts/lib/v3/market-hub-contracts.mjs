/**
 * Market Hub Artifact Contracts
 *
 * Defines validation contracts for all market hub artifacts.
 * Used by both producers (to promote last-good) and consumers (to validate inputs).
 */

export const MARKET_LATEST_CONTRACT = {
  path: 'public/data/v3/derived/market/latest.json',
  lastGoodPath: 'public/data/v3/derived/market/latest.last-good.json',
  dateField: 'meta.data_date',
  maxStaleDays: 2,
  maxDegradedDays: 5,
  maxFallbackDays: 10,
  tradingDayAware: true,
  minBytes: 100,
  validate(doc) {
    const errors = [];
    if (!doc?.meta?.schema_version) errors.push('meta.schema_version missing');
    if (!doc?.meta?.generated_at) errors.push('meta.generated_at missing');
    if (!doc?.data) errors.push('data missing');
    if (!doc?.data?.pulse) errors.push('data.pulse missing');
    if (!Array.isArray(doc?.data?.indices)) errors.push('data.indices must be array');
    if (!Array.isArray(doc?.data?.sectors)) errors.push('data.sectors must be array');
    return { valid: errors.length === 0, errors };
  }
};

export const GLOBAL_MARKET_CONTRACT = {
  path: 'public/data/v3/derived/market/global-latest.json',
  lastGoodPath: 'public/data/v3/derived/market/global-latest.last-good.json',
  dateField: 'meta.data_date',
  maxStaleDays: 2,
  maxDegradedDays: 5,
  maxFallbackDays: 10,
  tradingDayAware: true,
  minBytes: 500,
  validate(doc) {
    const errors = [];
    if (!doc?.meta?.schema_version) errors.push('meta.schema_version missing');
    if (!doc?.meta?.generated_at) errors.push('meta.generated_at missing');
    if (!doc?.data?.cards || typeof doc.data.cards !== 'object') errors.push('data.cards missing');
    if (doc?.data?.cards && Object.keys(doc.data.cards).length === 0) errors.push('data.cards empty');
    if (!doc?.data?.sessions) errors.push('data.sessions missing');
    return { valid: errors.length === 0, errors };
  }
};

export const MARKET_HEALTH_CONTRACT = {
  path: 'public/data/v3/pulse/market-health/latest.json',
  lastGoodPath: 'public/data/v3/pulse/market-health/latest.last-good.json',
  dateField: 'meta.data_date',
  maxStaleDays: 2,
  maxDegradedDays: 5,
  maxFallbackDays: 10,
  tradingDayAware: true,
  minBytes: 50,
  validate(doc) {
    const errors = [];
    if (!doc?.meta) errors.push('meta missing');
    if (doc?.breadth && typeof doc.breadth !== 'object') errors.push('breadth invalid');
    return { valid: errors.length === 0, errors };
  }
};

export const TOP_MOVERS_CONTRACT = {
  path: 'public/data/v3/pulse/top-movers/latest.json',
  lastGoodPath: 'public/data/v3/pulse/top-movers/latest.last-good.json',
  dateField: 'meta.data_date',
  maxStaleDays: 2,
  maxDegradedDays: 5,
  maxFallbackDays: 10,
  tradingDayAware: true,
  minBytes: 50,
  validate(doc) {
    const errors = [];
    if (!doc?.meta) errors.push('meta missing');
    if (!Array.isArray(doc?.top_movers)) errors.push('top_movers must be array');
    return { valid: errors.length === 0, errors };
  }
};

export const STOCK_ANALYSIS_CONTRACT = {
  path: 'public/data/snapshots/stock-analysis.json',
  lastGoodPath: 'public/data/snapshots/stock-analysis.last-good.json',
  dateField: '_meta.generated_at',
  maxStaleDays: 2,
  maxDegradedDays: 7,
  maxFallbackDays: 14,
  tradingDayAware: true,
  minBytes: 1000,
  validate(doc) {
    const errors = [];
    if (!doc?._meta) errors.push('_meta missing');
    if (typeof doc?._meta?.symbols_processed !== 'number' || doc._meta.symbols_processed <= 0) {
      errors.push('_meta.symbols_processed must be > 0');
    }
    if (!doc?._rankings?.top_setups) errors.push('_rankings.top_setups missing');
    return { valid: errors.length === 0, errors };
  }
};

export const EOD_LATEST_CONTRACT = {
  path: 'public/data/v3/eod/US/latest.ndjson.gz',
  lastGoodPath: 'public/data/v3/eod/US/latest.ndjson.last-good.gz',
  dateField: null,  // Binary format — freshness checked via file mtime
  maxStaleDays: 3,
  minBytes: 1000,
};

/** All market hub contracts for batch validation */
export const ALL_MARKET_CONTRACTS = [
  MARKET_LATEST_CONTRACT,
  GLOBAL_MARKET_CONTRACT,
  MARKET_HEALTH_CONTRACT,
  TOP_MOVERS_CONTRACT,
];
