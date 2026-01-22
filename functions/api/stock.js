const MODULE_NAME = 'stock';
const TICKER_MAX_LENGTH = 12;
const VALID_TICKER_REGEX = /^[A-Z0-9.\-]+$/;
const SNAPSHOT_PATH_TEMPLATES = [
  '/data/snapshots/{module}/latest.json',
  '/data/snapshots/{module}.json',
  '/data/{module}.json'
];
const MODULE_PATHS = ['universe', 'market-prices', 'market-stats', 'market-score'];

function normalizeTicker(raw) {
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  if (trimmed.length > TICKER_MAX_LENGTH) return null;
  if (/\s/.test(trimmed)) return null;
  const normalized = trimmed.toUpperCase();
  if (!VALID_TICKER_REGEX.test(normalized)) return null;
  return normalized;
}

async function fetchSnapshot(moduleName, request) {
  const baseUrl = new URL(request.url);
  let lastError = null;
  const attempts = [];

  for (const template of SNAPSHOT_PATH_TEMPLATES) {
    const path = template.replace('{module}', moduleName);
    const url = new URL(path, baseUrl);
    attempts.push(path);
    try {
      const response = await fetch(url.toString());
      if (response.ok) {
        const payload = await response.json();
        return {
          snapshot: payload,
          path,
          status: response.status,
          served_from: 'ASSET'
        };
      }
      lastError = new Error(`HTTP ${response.status}`);
    } catch (error) {
      lastError = error;
    }
  }

  return {
    snapshot: null,
    path: attempts[0],
    status: null,
    served_from: null,
    error: lastError ? lastError.message : 'snapshot_missing',
    attempted: attempts
  };
}

function findRecord(snapshot, symbol) {
  if (!snapshot || !snapshot.data) return null;
  const payload = snapshot.data;
  if (Array.isArray(payload)) {
    return payload.find((entry) => entry?.symbol === symbol) || null;
  }
  if (typeof payload === 'object') {
    return payload[symbol] || null;
  }
  return null;
}

async function computeDigest(input) {
  const canonical = JSON.stringify(input);
  const encoder = new TextEncoder();
  const data = encoder.encode(canonical);
  if (globalThis.crypto?.subtle) {
    const digestBuffer = await globalThis.crypto.subtle.digest('SHA-256', data);
    const hash = Array.from(new Uint8Array(digestBuffer))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
    return `sha256:${hash}`;
  }
  const { createHash } = await import('node:crypto');
  const hash = createHash('sha256').update(data).digest('hex');
  return `sha256:${hash}`;
}

function buildUniversePayload(entry, symbol) {
  const indexes = Array.isArray(entry?.indexes) ? entry.indexes : [];
  return {
    symbol,
    exists_in_universe: Boolean(entry),
    name: entry?.name || null,
    exchange: entry?.exchange || null,
    currency: entry?.currency || null,
    country: entry?.country || null,
    sector: entry?.sector || null,
    industry: entry?.industry || null,
    indexes,
    membership: {
      in_dj30: indexes.includes('DJ30'),
      in_sp500: indexes.includes('SP500'),
      in_ndx100: indexes.includes('NDX100'),
      in_rut2000: indexes.includes('RUT2000')
    },
    updated_at: entry?.updated_at || null
  };
}

function buildMarketPricesPayload(priceEntry, symbol) {
  if (!priceEntry) return null;
  return {
    symbol,
    date: priceEntry.date || null,
    close: Number.isFinite(priceEntry.close) ? priceEntry.close : null,
    volume: Number.isFinite(priceEntry.volume) ? priceEntry.volume : null,
    currency: priceEntry.currency || null,
    source_provider: priceEntry.source_provider || null,
    raw: priceEntry
  };
}

function buildMarketStatsPayload(statsEntry, symbol) {
  if (!statsEntry) return null;
  return {
    symbol,
    as_of: statsEntry.as_of || null,
    stats: statsEntry.stats || null,
    coverage: statsEntry.coverage || null,
    warnings: Array.isArray(statsEntry.warnings) ? statsEntry.warnings : []
  };
}

function buildErrorPayload(code, message, details = {}) {
  return {
    code,
    message,
    details
  };
}

function aggregateSources(results) {
  const sources = {};
  for (const [moduleName, result] of Object.entries(results)) {
    sources[moduleName] = {
      served_from: result.served_from || 'MISSING',
      path: result.path,
      status: result.status,
      error: result.error || null
    };
  }
  return sources;
}

export async function onRequestGet(context) {
  const { request } = context;
  const url = new URL(request.url);
  const tickerParam = url.searchParams.get('ticker') || '';
  const normalizedTicker = normalizeTicker(tickerParam);
  const modulePromises = MODULE_PATHS.map((moduleName) => fetchSnapshot(moduleName, request));
  const moduleResults = await Promise.all(modulePromises);
  const snapshots = Object.fromEntries(
    MODULE_PATHS.map((moduleName, index) => [moduleName, moduleResults[index]])
  );

  const servedFrom = Object.values(snapshots).some((result) => result.snapshot) ? 'ASSET' : 'MISSING';
  const sources = aggregateSources(snapshots);

  if (!normalizedTicker) {
    const payload = {
      schema_version: '3.0',
      module: MODULE_NAME,
      metadata: {
        module: MODULE_NAME,
        tier: 'standard',
        domain: 'stocks',
        source: 'stock-api',
        fetched_at: new Date().toISOString(),
        published_at: new Date().toISOString(),
        digest: null,
        record_count: 0,
        expected_count: 1,
        validation: {
          passed: false,
          dropped_records: 0,
          drop_ratio: 0,
          drop_check_passed: false,
          drop_threshold: null,
          checks: [],
          warnings: ['INVALID_TICKER']
        },
        served_from: servedFrom,
        request: {
          ticker: tickerParam,
          normalized_ticker: null
        },
        sources
      },
      data: {
        universe: null,
        market_prices: null,
        market_stats: null
      },
      error: buildErrorPayload('BAD_REQUEST', 'Invalid ticker parameter', { ticker: tickerParam })
    };
    payload.metadata.digest = await computeDigest(payload);
    return new Response(JSON.stringify(payload, null, 2) + '\n', {
      headers: { 'Content-Type': 'application/json' }
    });
  }

  const universeEntry = findRecord(snapshots['universe']?.snapshot, normalizedTicker);
  const priceEntry = findRecord(snapshots['market-prices']?.snapshot, normalizedTicker);
  const statsEntry = findRecord(snapshots['market-stats']?.snapshot, normalizedTicker);
  const scoreEntry = findRecord(snapshots['market-score']?.snapshot, normalizedTicker);
  const universePayload = buildUniversePayload(universeEntry, normalizedTicker);
  const marketPricesPayload = buildMarketPricesPayload(priceEntry, normalizedTicker);
  const marketStatsPayload = buildMarketStatsPayload(statsEntry, normalizedTicker);

  const missingSections = [];
  if (snapshots['market-prices'].snapshot && !marketPricesPayload) missingSections.push('market_prices');
  if (snapshots['market-stats'].snapshot && !marketStatsPayload) missingSections.push('market_stats');
  if (!snapshots['market-prices'].snapshot) missingSections.push('market_prices');
  if (!snapshots['market-stats'].snapshot) missingSections.push('market_stats');

  let errorPayload = null;
  if (!universeEntry) {
    errorPayload = buildErrorPayload('UNKNOWN_TICKER', `Ticker ${normalizedTicker} is not in the universe`, {
      membership: universePayload.membership
    });
  } else if (missingSections.length) {
    errorPayload = buildErrorPayload('DATA_NOT_READY', 'Market prices/stats are not available yet', {
      missing: [...new Set(missingSections)]
    });
  }

  const data = {
    universe: universePayload,
    market_prices: marketPricesPayload,
    market_stats: marketStatsPayload,
    market_score: scoreEntry
  };

  const asOf =
    marketPricesPayload?.date ||
    marketStatsPayload?.as_of ||
    universePayload.updated_at ||
    null;

  const validationPassed = !errorPayload;
  const payload = {
    schema_version: '3.0',
    module: MODULE_NAME,
    metadata: {
      module: MODULE_NAME,
      tier: 'standard',
      domain: 'stocks',
      source: 'stock-api',
      fetched_at: new Date().toISOString(),
      published_at: new Date().toISOString(),
      digest: null,
      record_count: validationPassed ? 1 : 0,
      expected_count: 1,
      validation: {
        passed: validationPassed,
        dropped_records: validationPassed ? 0 : 1,
        drop_ratio: validationPassed ? 0 : 1,
        drop_check_passed: validationPassed,
        drop_threshold: null,
        checks: [],
        warnings: []
      },
      served_from: servedFrom,
      request: {
        ticker: tickerParam,
        normalized_ticker: normalizedTicker
      },
      as_of: asOf,
      sources
    },
    data,
    error: errorPayload
  };

  payload.metadata.digest = await computeDigest(payload);

  return new Response(JSON.stringify(payload, null, 2) + '\n', {
    headers: { 'Content-Type': 'application/json' }
  });
}
