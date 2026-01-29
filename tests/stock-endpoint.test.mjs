#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { onRequestGet } from '../functions/api/stock.js';
import { onRequest as apiMiddleware } from '../functions/api/_middleware.js';
import { createCache } from '../functions/api/_shared/cache-law.js';

function assert(condition, message) {
  if (!condition) throw new Error(message || 'assertion_failed');
}

function assertHasMetaStatus(result) {
  assert(result.meta && typeof result.meta.status === 'string', 'meta.status missing');
}

function loadFixture(name) {
  return JSON.parse(fs.readFileSync(path.join(process.cwd(), 'tests', 'fixtures', name), 'utf-8'));
}

function isoDayOffset(days) {
  const d = new Date(Date.now() + days * 24 * 60 * 60 * 1000);
  return d.toISOString().slice(0, 10);
}

function makeBars({ startOffset = -2, count = 2, base = 100, jumpPct = 0, zeroVolume = false, invalid = false } = {}) {
  const bars = [];
  let prevClose = base;
  for (let i = 0; i < count; i += 1) {
    const date = isoDayOffset(startOffset + i);
    let close = prevClose + 1;
    if (i === count - 1 && jumpPct) {
      close = prevClose * (1 + jumpPct / 100);
    }
    const open = prevClose;
    const high = Math.max(open, close) + 1;
    const low = Math.min(open, close) - 1;
    const volume = zeroVolume && i === count - 1 ? 0 : 1000 + i;
    const bar = { date, open, high, low, close, volume };
    bars.push(invalid && i === count - 1 ? { ...bar, close: 0 } : bar);
    prevClose = close;
  }
  return bars;
}

function tiingoPayload(bars) {
  return bars.map((bar) => ({
    date: bar.date,
    open: bar.open,
    high: bar.high,
    low: bar.low,
    close: bar.close,
    volume: bar.volume
  }));
}

function twelveDataPayload(bars) {
  return {
    status: 'ok',
    values: bars.map((bar) => ({
      datetime: bar.date,
      open: String(bar.open),
      high: String(bar.high),
      low: String(bar.low),
      close: String(bar.close),
      volume: String(bar.volume)
    }))
  };
}

function createKv() {
  const store = new Map();
  return {
    async get(key, opts) {
      if (!store.has(key)) return null;
      const value = store.get(key);
      if (opts === 'json' || opts?.type === 'json') {
        return JSON.parse(value);
      }
      return value;
    },
    async put(key, value) {
      store.set(key, value);
    },
    async delete(key) {
      store.delete(key);
    }
  };
}

function makeEnv(extra = {}) {
  return { RV_KV: createKv(), TIINGO_API_KEY: 'test', RV_ALLOW_WRITE_ON_VIEW: '1', ...extra };
}

function stubFetch({ overrides = {}, tiingo, twelvedata } = {}) {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url) => {
    const u = new URL(url);

    if (overrides[u.pathname]) {
      return overrides[u.pathname]();
    }

    if (u.hostname === 'api.tiingo.com') {
      return tiingo ? tiingo(u) : { ok: false, status: 500, json: async () => ({}) };
    }

    if (u.hostname === 'api.twelvedata.com') {
      return twelvedata ? twelvedata(u) : { ok: false, status: 500, json: async () => ({}) };
    }

    const mapping = {
      '/data/snapshots/universe/latest.json': 'stock-universe.sample.json',
      '/data/snapshots/market-prices/latest.json': 'market-prices-latest.sample.json',
      '/data/snapshots/market-stats/latest.json': 'stock-market-stats.sample.json'
    };
    const fixtureName = mapping[u.pathname];
    if (fixtureName) {
      const payload = loadFixture(fixtureName);
      return {
        ok: true,
        status: 200,
        json: async () => payload
      };
    }

    return {
      ok: false,
      status: 404,
      json: async () => null
    };
  };
  return () => { globalThis.fetch = originalFetch; };
}

async function requestTicker(ticker, env) {
  const request = new Request(`https://example.com/api/stock?ticker=${encodeURIComponent(ticker)}`);
  const context = {
    request,
    env: env || {},
    next: () => onRequestGet({ request, env: env || {} })
  };
  const response = await apiMiddleware(context);
  return JSON.parse(await response.text());
}

async function testKnownTicker() {
  const restore = stubFetch({
    tiingo: () => ({ ok: true, status: 200, json: async () => tiingoPayload(makeBars()) })
  });
  try {
    const result = await requestTicker('SPY', makeEnv({ TIINGO_API_KEY: '' }));
    assert(result.schema_version === '3.0', 'schema_version mismatch');
    assert(!result.error, 'expected no error for SPY');
    assert(result.data.universe.exists_in_universe === true, 'universe flag');
    assert(result.data.market_prices, 'market prices section');
    assert(result.data.market_stats, 'market stats section');
    assertHasMetaStatus(result);
  } finally {
    restore();
  }
  console.log('✅ known ticker returns joined data');
}

async function testUnknownTicker() {
  const restore = stubFetch({
    tiingo: () => ({ ok: true, status: 200, json: async () => tiingoPayload(makeBars()) })
  });
  try {
    const result = await requestTicker('ZZZZ', makeEnv({ TIINGO_API_KEY: '' }));
    assert(result.error?.code === 'UNKNOWN_TICKER', 'unknown ticker code');
    assert(result.data.universe.exists_in_universe === false, 'universe miss');
    assert(result.data.market_prices === null, 'prices should be null');
    assert(result.data.market_stats === null, 'stats should be null');
    assertHasMetaStatus(result);
  } finally {
    restore();
  }
  console.log('✅ unknown ticker returns UNKNOWN_TICKER');
}

async function testMissingStats() {
  const restore = stubFetch({
    overrides: {
      '/data/snapshots/market-stats/latest.json': () => ({ ok: false, status: 404, json: async () => null })
    },
    tiingo: () => ({ ok: true, status: 200, json: async () => tiingoPayload(makeBars()) })
  });
  try {
    const result = await requestTicker('SPY', makeEnv({ TIINGO_API_KEY: '' }));
    assert(result.error?.code === 'DATA_NOT_READY', 'expected data not ready');
    assert(result.error?.details?.missing?.includes('market_stats'), 'missing stats noted');
    assert(result.data.market_prices, 'prices still present');
    assert(result.data.market_stats === null, 'stats null');
    assertHasMetaStatus(result);
  } finally {
    restore();
  }
  console.log('✅ missing stats triggers DATA_NOT_READY');
}

async function testProviderFailReturnsStaleCache() {
  const kv = createKv();
  const env = makeEnv({ RV_KV: kv, PROVIDER_MODE: 'PRIMARY_ONLY' });
  const cache = createCache(env);
  const bars = makeBars({ startOffset: -30, count: 3 });
  await cache.writeCached('SPY', { bars }, 3600, { provider: 'tiingo', data_date: bars[bars.length - 1].date });

  const restore = stubFetch({
    tiingo: () => ({ ok: false, status: 500, json: async () => ({}) })
  });
  try {
    const result = await requestTicker('SPY', env);
    assert(result.meta.status === 'stale', 'expected stale when provider fails');
    assert(Array.isArray(result.meta.quality_flags) && result.meta.quality_flags.includes('PROVIDER_FAIL'), 'missing PROVIDER_FAIL flag');
    assert(result.data.bars.length === bars.length, 'expected cached bars');
  } finally {
    restore();
  }
  console.log('✅ provider failure returns stale cache');
}

async function testNoCacheProviderFailure() {
  const kv = createKv();
  const env = makeEnv({ RV_KV: kv, PROVIDER_MODE: 'PRIMARY_ONLY' });
  const restore = stubFetch({
    tiingo: () => ({ ok: false, status: 500, json: async () => ({}) })
  });
  try {
    const result = await requestTicker('SPY', env);
    assert(result.error?.code === 'EOD_FETCH_FAILED', 'expected EOD_FETCH_FAILED');
    assert(result.meta.status === 'error', 'expected meta.status error');
  } finally {
    restore();
  }
  console.log('✅ provider failure without cache returns error');
}

async function testHardRejectBlocksInvalidData() {
  const kv = createKv();
  const env = makeEnv({ RV_KV: kv });
  const badBars = makeBars({ invalid: true });
  const restore = stubFetch({
    tiingo: () => ({ ok: true, status: 200, json: async () => tiingoPayload(badBars) })
  });
  try {
    const result = await requestTicker('SPY', env);
    assert(result.error?.code === 'QUALITY_REJECT', 'expected QUALITY_REJECT');
    assert(result.meta.status === 'error', 'expected meta.status error');
  } finally {
    restore();
  }
  console.log('✅ quality reject blocks invalid data');
}

async function testSoftWarnFlags() {
  const kv = createKv();
  const env = makeEnv({ RV_KV: kv, WARN_JUMP_PCT: '20' });
  const jumpBars = makeBars({ jumpPct: 50 });
  const restore = stubFetch({
    tiingo: () => ({ ok: true, status: 200, json: async () => tiingoPayload(jumpBars) })
  });
  try {
    const result = await requestTicker('SPY', env);
    assert(result.ok === true, 'expected ok true');
    assert(Array.isArray(result.meta.quality_flags) && result.meta.quality_flags.includes('JUMP_GT_20PCT'), 'missing jump flag');
  } finally {
    restore();
  }
  console.log('✅ soft warn flags appear in meta');
}

async function testFailoverProvider() {
  const kv = createKv();
  const env = makeEnv({ RV_KV: kv, PROVIDER_MODE: 'FAILOVER_ALLOWED', TWELVEDATA_API_KEY: 'test' });
  const secondaryBars = makeBars({ base: 200 });
  const restore = stubFetch({
    tiingo: () => ({ ok: false, status: 500, json: async () => ({}) }),
    twelvedata: () => ({ ok: true, status: 200, json: async () => twelveDataPayload(secondaryBars) })
  });
  try {
    const result = await requestTicker('SPY', env);
    assert(result.meta.provider === 'twelvedata', 'expected provider twelvedata');
    assert(result.data.bars[0].close === secondaryBars[0].close, 'expected twelvedata bars only');
  } finally {
    restore();
  }
  console.log('✅ failover provider selected without mixing');
}

async function testCircuitOpenReturnsError() {
  const kv = createKv();
  const circuitState = {
    state: 'open',
    failures: 3,
    opened_at: Date.now(),
    last_failure_at: Date.now()
  };
  await kv.put('cb:tiingo', JSON.stringify(circuitState));

  const env = makeEnv({ RV_KV: kv, PROVIDER_MODE: 'PRIMARY_ONLY' });
  const restore = stubFetch({
    tiingo: () => ({ ok: false, status: 500, json: async () => ({}) })
  });
  try {
    const result = await requestTicker('SPY', env);
    assert(result.meta?.circuit?.state === 'open', 'expected circuit state open in meta');
    assert(result.error || result.meta.status === 'error', 'expected error when circuit open');
  } finally {
    restore();
  }
  console.log('✅ circuit open returns error with circuit state in meta');
}

async function testQualityRejectRecordsCircuitFailure() {
  const kv = createKv();
  const env = makeEnv({ RV_KV: kv });
  const badBars = makeBars({ invalid: true });
  const restore = stubFetch({
    tiingo: () => ({ ok: true, status: 200, json: async () => tiingoPayload(badBars) })
  });
  try {
    await requestTicker('SPY', env);
    const circuitRaw = await kv.get('cb:tiingo', 'json');
    assert(circuitRaw?.failures >= 1, 'expected circuit failure recorded');
    assert(circuitRaw?.last_error_code === 'QUALITY_REJECT', 'expected QUALITY_REJECT error code');
  } finally {
    restore();
  }
  console.log('✅ quality reject records circuit failure');
}

async function main() {
  await testKnownTicker();
  await testUnknownTicker();
  await testMissingStats();
  await testProviderFailReturnsStaleCache();
  await testNoCacheProviderFailure();
  await testHardRejectBlocksInvalidData();
  await testSoftWarnFlags();
  await testFailoverProvider();
  await testCircuitOpenReturnsError();
  await testQualityRejectRecordsCircuitFailure();
  console.log('✅ stock endpoint smoke tests passed');
}

main().catch((err) => {
  console.error('❌ stock endpoint smoke tests failed');
  console.error(err.stack || err.message);
  process.exit(1);
});
