import { sha256Hex } from './_shared/digest.mjs';
import { resolveSymbol, normalizeTicker as normalizeTickerStrict } from './_shared/symbol-resolver.mjs';
import { fetchBarsWithProviderChain } from './_shared/eod-providers.mjs';
import { computeIndicators } from './_shared/eod-indicators.mjs';
import { getTiingoKeyInfo } from './_shared/tiingo-key.mjs';
import { createCache } from './_shared/cache-law.js';
import { evaluateQuality } from './_shared/quality.js';

const MODULE_NAME = 'stock';
const TICKER_MAX_LENGTH = 12;
const VALID_TICKER_REGEX = /^[A-Z0-9.\-]+$/;
const SNAPSHOT_PATH_TEMPLATES = [
  '/data/snapshots/{module}/latest.json',
  '/data/snapshots/{module}.json',
  '/data/{module}.json'
];
const MODULE_PATHS = ['universe', 'market-prices', 'market-stats', 'market-score'];
const DEFAULT_EOD_CACHE_TTL_SECONDS = 6 * 60 * 60;
const DEFAULT_EOD_LOCK_TTL_SECONDS = 60;
const DEFAULT_MAX_STALE_DAYS = 14;
const DEFAULT_PENDING_WINDOW_MINUTES = 120;

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

function buildSourceChainMetadata(chain) {
  if (!chain || typeof chain !== 'object') {
    return {
      primary: 'tiingo',
      secondary: 'twelvedata',
      forced: null,
      selected: null,
      fallbackUsed: false,
      failureReason: null,
      primaryFailure: null
    };
  }
  return {
    primary: chain.primary || 'tiingo',
    secondary: chain.secondary || 'twelvedata',
    forced: chain.forced || null,
    selected: chain.selected || null,
    fallbackUsed: Boolean(chain.fallbackUsed),
    failureReason: chain.failureReason || null,
    primaryFailure: chain.primaryFailure || null
  };
}

function pickLatestBar(bars) {
  if (!Array.isArray(bars) || bars.length === 0) return null;
  return bars[bars.length - 1] || null;
}

function computeDayChange(bars) {
  if (!Array.isArray(bars) || bars.length < 2) {
    return { abs: null, pct: null };
  }
  const latest = bars[bars.length - 1];
  const prev = bars[bars.length - 2];
  if (!Number.isFinite(latest?.close) || !Number.isFinite(prev?.close) || prev.close === 0) {
    return { abs: null, pct: null };
  }
  const abs = latest.close - prev.close;
  return { abs, pct: abs / prev.close };
}

function computeStartDateISO(daysBack) {
  const days = Number.isFinite(Number(daysBack)) ? Number(daysBack) : 0;
  if (days <= 0) return null;
  const ms = Date.now() - days * 24 * 60 * 60 * 1000;
  const d = new Date(ms);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

function isoDay(date = new Date()) {
  return date.toISOString().slice(0, 10);
}

function parseIsoDay(value) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;
  const parsed = Date.parse(trimmed);
  if (Number.isNaN(parsed)) return null;
  return new Date(parsed).toISOString().slice(0, 10);
}

function diffDays(fromDay, toDay) {
  const from = Date.UTC(
    Number(fromDay.slice(0, 4)),
    Number(fromDay.slice(5, 7)) - 1,
    Number(fromDay.slice(8, 10))
  );
  const to = Date.UTC(
    Number(toDay.slice(0, 4)),
    Number(toDay.slice(5, 7)) - 1,
    Number(toDay.slice(8, 10))
  );
  return Math.floor((to - from) / 86400000);
}

function minutesSinceUtcMidnight(date) {
  return date.getUTCHours() * 60 + date.getUTCMinutes();
}

function computeStatusFromDataDate(dataDate, now, maxStaleDays, pendingWindowMinutes) {
  const today = isoDay(now);
  const normalized = parseIsoDay(dataDate);
  if (!normalized) {
    return minutesSinceUtcMidnight(now) <= pendingWindowMinutes ? 'pending' : 'error';
  }
  if (normalized === today) return 'fresh';
  const ageDays = diffDays(normalized, today);
  if (ageDays === 1 && minutesSinceUtcMidnight(now) <= pendingWindowMinutes) return 'pending';
  if (ageDays <= maxStaleDays) return 'stale';
  return 'error';
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
  const hex = await sha256Hex(canonical);
  return `sha256:${hex}`;
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
  const env = context?.env || {};
  const url = new URL(request.url);
  const tickerParam = url.searchParams.get('ticker') || '';
  const normalizedTicker = normalizeTicker(tickerParam);

  const startedAt = new Date().toISOString();

  // Phase 2: resolve name + fetch EOD history via provider chain.
  // This is independent of the legacy snapshot join below (kept for backwards compatibility).
  let resolvedName = null;
  let resolvedMethod = null;
  try {
    const resolved = await resolveSymbol(normalizedTicker || tickerParam, request);
    if (resolved?.ok && resolved?.data?.ticker) {
      const strictTicker = normalizeTickerStrict(resolved.data.ticker);
      if (strictTicker) {
        resolvedName = resolved.data.name || null;
        resolvedMethod = resolved.data.method || null;
      }
    }
  } catch {
    // ignore
  }

  let eodBars = [];
  let eodError = null;
  let eodStatus = null;
  let eodProvider = null;
  let sourceChain = buildSourceChainMetadata(null);
  let reasons = [];
  let eodAttempted = false;
  const qualityFlags = new Set();

  const cache = createCache(env);
  const now = new Date();
  const cacheId = normalizedTicker || null;
  const cacheTtlSeconds = Number(env?.EOD_CACHE_TTL_SECONDS) || DEFAULT_EOD_CACHE_TTL_SECONDS;
  const lockTtlSeconds = Number(env?.EOD_LOCK_TTL_SECONDS) || DEFAULT_EOD_LOCK_TTL_SECONDS;
  const maxStaleDays = Number(env?.EOD_MAX_STALE_DAYS) || DEFAULT_MAX_STALE_DAYS;
  const pendingWindowMinutes = Number(env?.EOD_PENDING_WINDOW_MINUTES) || DEFAULT_PENDING_WINDOW_MINUTES;

  let cachedBars = [];
  let cachedMeta = null;
  let cachedStatus = null;
  let cachedProvider = null;
  let cachedDataDate = '';

  if (cacheId) {
    const cached = await cache.readCached(cacheId);
    const cachedPayload = cached?.data;
    cachedBars = Array.isArray(cachedPayload?.bars)
      ? cachedPayload.bars
      : Array.isArray(cachedPayload)
      ? cachedPayload
      : [];
    cachedMeta = cached?.metaLike || null;
    cachedProvider = cachedMeta?.provider || null;
    cachedDataDate = cachedMeta?.data_date || pickLatestBar(cachedBars)?.date || '';
    cachedStatus = cachedBars.length
      ? computeStatusFromDataDate(cachedDataDate, now, maxStaleDays, pendingWindowMinutes)
      : null;
  }

  const forcedProvider = String(env?.RV_FORCE_PROVIDER || '').trim();
  const hasEodKeys = Boolean(getTiingoKeyInfo(env).key || env?.TWELVEDATA_API_KEY);
  const canFetchProvider = Boolean(forcedProvider || hasEodKeys);

  async function fetchProviderBars() {
    const startDate = computeStartDateISO(365 * 3);
    const chainResult = await fetchBarsWithProviderChain(normalizedTicker, env, {
      outputsize: '300',
      startDate,
      allowFailover: true
    });
    sourceChain = buildSourceChainMetadata(chainResult.chain);
    if (!chainResult.ok) {
      return { ok: false, error: chainResult.error || { code: 'EOD_FETCH_FAILED', message: 'Unable to fetch EOD history' } };
    }
    const bars = Array.isArray(chainResult.bars) ? chainResult.bars : [];
    const quality = evaluateQuality({ bars }, env);
    if (quality.reject) {
      return { ok: false, error: { code: 'QUALITY_REJECT', message: quality.reject.message, details: quality.reject } };
    }
    if (Array.isArray(quality.flags)) {
      quality.flags.forEach((flag) => qualityFlags.add(flag));
    }
    return { ok: true, bars, provider: chainResult.provider || sourceChain?.selected || null };
  }

  async function refreshCacheInBackground() {
    if (!cacheId || !normalizedTicker) return;
    const gotLock = await cache.acquireLock(cacheId, lockTtlSeconds);
    if (!gotLock) {
      qualityFlags.add('LOCKED_REFRESH');
      return;
    }
    try {
      const result = await fetchProviderBars();
      if (result.ok && result.bars.length) {
        const latest = pickLatestBar(result.bars);
        const dataDate = latest?.date || '';
        await cache.writeCached(cacheId, { bars: result.bars }, cacheTtlSeconds, {
          provider: result.provider || 'tiingo',
          data_date: dataDate
        });
      }
    } finally {
      await cache.releaseLock(cacheId);
    }
  }

  if (normalizedTicker && cachedBars.length) {
    const cachedQuality = evaluateQuality({ bars: cachedBars }, env);
    if (cachedQuality.reject) {
      cachedBars = [];
      cachedStatus = null;
      cachedProvider = null;
      cachedDataDate = '';
      qualityFlags.add('CACHE_REJECTED');
    } else if (Array.isArray(cachedQuality.flags)) {
      cachedQuality.flags.forEach((flag) => qualityFlags.add(flag));
    }
  }

  if (normalizedTicker && cachedBars.length && cachedStatus === 'fresh') {
    eodBars = cachedBars;
    eodProvider = cachedProvider || 'tiingo';
    eodStatus = 'fresh';
    eodAttempted = true;
  } else if (normalizedTicker && cachedBars.length && cachedStatus === 'error' && canFetchProvider) {
    eodAttempted = true;
    const gotLock = await cache.acquireLock(cacheId, lockTtlSeconds);
    if (!gotLock) {
      eodBars = cachedBars;
      eodProvider = cachedProvider || 'tiingo';
      eodStatus = 'pending';
      qualityFlags.add('LOCKED_REFRESH');
    } else {
      try {
        const result = await fetchProviderBars();
        if (result.ok) {
          eodBars = result.bars;
          eodProvider = result.provider || 'tiingo';
          const latest = pickLatestBar(eodBars);
          const dataDate = latest?.date || '';
          eodStatus = computeStatusFromDataDate(dataDate, now, maxStaleDays, pendingWindowMinutes);
          await cache.writeCached(cacheId, { bars: eodBars }, cacheTtlSeconds, {
            provider: eodProvider,
            data_date: dataDate
          });
        } else {
          eodBars = cachedBars;
          eodProvider = cachedProvider || 'tiingo';
          eodStatus = 'stale';
          qualityFlags.add('PROVIDER_FAIL');
          qualityFlags.add('CACHE_TOO_OLD');
          eodError = null;
        }
      } finally {
        await cache.releaseLock(cacheId);
      }
    }
  } else if (normalizedTicker && cachedBars.length) {
    eodBars = cachedBars;
    eodProvider = cachedProvider || 'tiingo';
    eodStatus = cachedStatus || 'stale';
    eodAttempted = true;
    if (canFetchProvider) {
      const refreshPromise = refreshCacheInBackground();
      if (typeof context?.waitUntil === 'function') {
        context.waitUntil(refreshPromise);
      } else {
        refreshPromise.catch(() => {});
      }
    } else {
      qualityFlags.add('EOD_KEYS_MISSING');
    }
  } else if (normalizedTicker) {
    if (!canFetchProvider) {
      reasons = ['EOD_KEYS_MISSING'];
      qualityFlags.add('EOD_KEYS_MISSING');
      eodStatus = 'error';
      eodAttempted = false;
    } else {
      eodAttempted = true;
      const gotLock = await cache.acquireLock(cacheId, lockTtlSeconds);
      if (!gotLock) {
        eodError = { code: 'LOCKED_REFRESH', message: 'EOD refresh already in progress' };
        eodStatus = 'pending';
        qualityFlags.add('LOCKED_REFRESH');
      } else {
        try {
          const result = await fetchProviderBars();
          if (result.ok) {
            eodBars = result.bars;
            eodProvider = result.provider || 'tiingo';
            const latest = pickLatestBar(eodBars);
            const dataDate = latest?.date || '';
            eodStatus = computeStatusFromDataDate(dataDate, now, maxStaleDays, pendingWindowMinutes);
            await cache.writeCached(cacheId, { bars: eodBars }, cacheTtlSeconds, {
              provider: eodProvider,
              data_date: dataDate
            });
          } else {
            eodError = result.error || { code: 'EOD_FETCH_FAILED', message: 'Unable to fetch EOD history' };
            eodStatus = eodError?.code === 'CB_OPEN' ? 'stale' : 'error';
            qualityFlags.add(eodError?.code === 'CB_OPEN' ? 'CB_OPEN' : 'PROVIDER_FAIL');
          }
        } finally {
          await cache.releaseLock(cacheId);
        }
      }
    }
  }

  const modulePromises = MODULE_PATHS.map((moduleName) => fetchSnapshot(moduleName, request));
  const moduleResults = await Promise.all(modulePromises);
  const snapshots = Object.fromEntries(
    MODULE_PATHS.map((moduleName, index) => [moduleName, moduleResults[index]])
  );

  const servedFrom = Object.values(snapshots).some((result) => result.snapshot) ? 'ASSET' : 'MISSING';
  const sources = aggregateSources(snapshots);

  if (!normalizedTicker) {
    const metaNow = new Date().toISOString();
    const payload = {
      schema_version: '3.0',
      meta: {
        status: 'error',
        generated_at: metaNow,
        data_date: '',
        provider: 'stock-api',
        quality_flags: ['INVALID_TICKER']
      },
      metadata: {
        module: MODULE_NAME,
        tier: 'standard',
        domain: 'stocks',
        source: 'stock-api',
        fetched_at: startedAt,
        published_at: startedAt,
        digest: null,
        status: 'ERROR',
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
        source_chain: sourceChain,
        telemetry: {
          provider: {
            primary: sourceChain?.primary || 'tiingo',
            selected: sourceChain?.selected || null,
            forced: Boolean(sourceChain?.forced),
            fallbackUsed: Boolean(sourceChain?.fallbackUsed),
            primaryFailure: sourceChain?.primaryFailure?.code || null
          },
          latencyMs: null,
          ok: false,
          httpStatus: 400
        },
        reasons: ['INVALID_TICKER'],
        sources
      },
      data: {
        ticker: null,
        name: null,
        bars: [],
        latest_bar: null,
        change: { abs: null, pct: null },
        indicators: [],
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

  // Attribute DATA_NOT_READY to concrete lookup outcomes.
  for (const moduleName of MODULE_PATHS) {
    if (!sources[moduleName]) continue;
    sources[moduleName].lookup_key = normalizedTicker;
  }
  sources.universe.record_found = Boolean(universeEntry);
  sources['market-prices'].record_found = Boolean(priceEntry);
  sources['market-stats'].record_found = Boolean(statsEntry);
  sources['market-score'].record_found = Boolean(scoreEntry);

  if (snapshots['market-stats']?.snapshot?.data == null && snapshots['market-stats']?.snapshot?.error) {
    sources['market-stats'].note = 'snapshot_placeholder_or_empty_data';
  }
  if (snapshots['market-prices']?.snapshot && snapshots['market-prices']?.snapshot?.data && !priceEntry) {
    sources['market-prices'].note = 'entry_not_found_for_symbol';
  }

  const universePayload = buildUniversePayload(universeEntry, normalizedTicker);
  const marketPricesPayload = buildMarketPricesPayload(priceEntry, normalizedTicker);
  const marketStatsPayload = buildMarketStatsPayload(statsEntry, normalizedTicker);

  const missingSections = [];
  if (snapshots['market-prices'].snapshot && !marketPricesPayload) missingSections.push('market_prices');
  if (snapshots['market-stats'].snapshot && !marketStatsPayload) missingSections.push('market_stats');
  if (!snapshots['market-prices'].snapshot) missingSections.push('market_prices');
  if (!snapshots['market-stats'].snapshot) missingSections.push('market_stats');

  let errorPayload = null;
  if (!universeEntry && !eodAttempted) {
    errorPayload = buildErrorPayload('UNKNOWN_TICKER', `Ticker ${normalizedTicker} is not in the universe`, {
      membership: universePayload.membership
    });
  }
  if (!errorPayload && !eodAttempted && universeEntry && missingSections.length) {
    errorPayload = buildErrorPayload('DATA_NOT_READY', 'Market prices/stats are not available yet', {
      missing: [...new Set(missingSections)]
    });
  }
  if (missingSections.length) {
    reasons = [...new Set([...(Array.isArray(reasons) ? reasons : []), 'DATA_NOT_READY'])];
  }

  if (eodAttempted && !eodError && eodBars.length === 0) {
    eodError = {
      code: 'EOD_EMPTY',
      message: 'No EOD bars returned',
      details: { ticker: normalizedTicker }
    };
  }

  // Prefer EOD provider chain errors over legacy data readiness errors.
  if (eodError) {
    const isQualityReject = eodError?.code === 'QUALITY_REJECT';
    const isLocked = eodError?.code === 'LOCKED_REFRESH';
    const code = isQualityReject ? 'QUALITY_REJECT' : isLocked ? 'LOCKED_REFRESH' : 'EOD_FETCH_FAILED';
    const message = isQualityReject
      ? 'Quality gate rejected data'
      : isLocked
      ? eodError.message || 'Refresh already in progress'
      : 'Unable to fetch EOD history';
    errorPayload = buildErrorPayload(code, message, {
      upstream: eodError,
      source_chain: sourceChain
    });
  }

  if (eodProvider && (!sourceChain?.selected || sourceChain.selected === 'unknown')) {
    sourceChain = buildSourceChainMetadata({
      ...sourceChain,
      selected: eodProvider,
      fallbackUsed: eodProvider && sourceChain?.primary ? eodProvider !== sourceChain.primary : Boolean(sourceChain?.fallbackUsed)
    });
  }

  const latestBar = pickLatestBar(eodBars);
  const dayChange = computeDayChange(eodBars);
  const indicatorOut = computeIndicators(eodBars);
  reasons = [...new Set([...(Array.isArray(reasons) ? reasons : []), ...(indicatorOut.issues || [])])];

  const indicatorList = Array.isArray(indicatorOut.indicators) ? indicatorOut.indicators : [];
  const indicatorNullCount = indicatorList.reduce((acc, item) => {
    const value = item?.value;
    if (value == null) return acc + 1;
    const num = Number(value);
    if (!Number.isFinite(num)) return acc + 1;
    return acc;
  }, 0);

  const data = {
    ticker: normalizedTicker,
    name: resolvedName || universePayload?.name || null,
    resolution: {
      ticker: normalizedTicker,
      name: resolvedName || universePayload?.name || null,
      method: resolvedMethod || null
    },
    bars: eodBars,
    latest_bar: latestBar,
    change: dayChange,
    indicators: indicatorOut.indicators,
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

  const envelopeProvider = eodProvider || sourceChain?.selected || sourceChain?.primary || 'unknown';
  const envelopeDataDate = parseIsoDay(latestBar?.date) || parseIsoDay(asOf) || '';
  const derivedStatus = envelopeDataDate
    ? computeStatusFromDataDate(envelopeDataDate, now, maxStaleDays, pendingWindowMinutes)
    : errorPayload
    ? 'error'
    : 'fresh';
  const envelopeStatus = eodStatus || derivedStatus;

  const validationPassed = !errorPayload;
  const status = errorPayload
    ? 'ERROR'
    : reasons.includes('INSUFFICIENT_HISTORY')
    ? 'PARTIAL'
    : 'OK';
  const payload = {
    schema_version: '3.0',
    meta: {
      status: envelopeStatus,
      generated_at: new Date().toISOString(),
      data_date: envelopeDataDate || '',
      provider: envelopeProvider,
      quality_flags: Array.from(qualityFlags)
    },
    metadata: {
      module: MODULE_NAME,
      tier: 'standard',
      domain: 'stocks',
      source: 'stock-api',
      fetched_at: startedAt,
      published_at: startedAt,
      digest: null,
      status,
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
      source_chain: sourceChain,
      telemetry: {
        provider: {
          primary: sourceChain?.primary || 'tiingo',
          selected: envelopeProvider || sourceChain?.selected || null,
          forced: Boolean(sourceChain?.forced),
          fallbackUsed: Boolean(sourceChain?.fallbackUsed),
          primaryFailure: errorPayload ? (sourceChain?.primaryFailure?.code || errorPayload?.code || null) : null
        },
        latencyMs: null,
        ok: !errorPayload,
        httpStatus: errorPayload ? 502 : 200
      },
      indicators: {
        count: indicatorList.length,
        nullCount: indicatorNullCount
      },
      reasons,
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
