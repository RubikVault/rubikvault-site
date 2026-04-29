#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { onRequestGet } from '../functions/api/stock.js';

function assert(condition, message) {
  if (!condition) throw new Error(message || 'assertion_failed');
}

function loadFixture(name) {
  return JSON.parse(fs.readFileSync(path.join(process.cwd(), 'tests', 'fixtures', name), 'utf-8'));
}

function stubFetch(handler) {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = handler;
  return () => {
    globalThis.fetch = originalFetch;
  };
}

function generateEodhdBars(count, { start = '2024-01-01' } = {}) {
  const n = Number.isFinite(Number(count)) ? Number(count) : 0;
  const bars = [];
  const startDate = new Date(`${start}T00:00:00.000Z`);
  for (let i = 0; i < n; i += 1) {
    const d = new Date(startDate.getTime() + i * 24 * 60 * 60 * 1000);
    const base = 100 + i * 0.1;
    bars.push({
      date: d.toISOString().slice(0, 10),
      open: base,
      high: base + 1,
      low: base - 1,
      close: base + 0.5,
      adjusted_close: base + 0.5,
      volume: 1000000 + i,
    });
  }
  return bars;
}

async function requestStock(ticker, env = {}) {
  const context = {
    request: new Request(`https://example.com/api/stock?ticker=${encodeURIComponent(ticker)}`),
    env,
  };
  const response = await onRequestGet(context);
  assert(response.status === 200, 'expected http 200');
  return JSON.parse(await response.text());
}

function stockSnapshotFetch({ eodhd, twelvedata } = {}) {
  let twelvedataCalls = 0;
  const handler = async (url) => {
    const u = new URL(url);
    if (u.pathname === '/data/symbol-resolve.v1.json') {
      return { ok: true, status: 200, json: async () => loadFixture('symbol-resolve.sample.json') };
    }
    if (u.pathname === '/data/snapshots/universe/latest.json') {
      return { ok: true, status: 200, json: async () => loadFixture('stock-universe.sample.json') };
    }
    if (u.pathname === '/data/snapshots/market-prices/latest.json') {
      return { ok: true, status: 200, json: async () => loadFixture('market-prices-latest.sample.json') };
    }
    if (u.pathname === '/data/snapshots/market-stats/latest.json') {
      return { ok: true, status: 200, json: async () => loadFixture('stock-market-stats.sample.json') };
    }
    if (u.hostname === 'eodhd.com') {
      return eodhd ? eodhd(u) : { ok: true, status: 200, json: async () => generateEodhdBars(260) };
    }
    if (u.hostname === 'api.twelvedata.com') {
      twelvedataCalls += 1;
      return twelvedata ? twelvedata(u) : { ok: true, status: 200, json: async () => loadFixture('twelvedata-timeseries.sample.json') };
    }
    return { ok: false, status: 404, json: async () => null };
  };
  return { handler, getTwelvedataCalls: () => twelvedataCalls };
}

async function testEodhdOnlySuccess() {
  const { handler, getTwelvedataCalls } = stockSnapshotFetch();
  const restore = stubFetch(handler);
  try {
    const result = await requestStock('AAPL', { EODHD_API_KEY: 'x', TWELVEDATA_API_KEY: 'y' });
    assert(!result.error, 'expected no error');
    assert(result.metadata?.source_chain?.primary === 'eodhd', 'primary should be eodhd');
    assert(result.metadata?.source_chain?.selected === 'eodhd', 'selected provider should be eodhd');
    assert(result.metadata?.source_chain?.fallbackUsed === false, 'fallbackUsed false');
    assert(result.meta?.provider === 'eodhd', 'meta.provider should be eodhd');
    assert((result.data?.bars || []).length >= 200, 'expected bars_count >= 200');
    assert(getTwelvedataCalls() === 0, 'twelvedata should not be called');
  } finally {
    restore();
  }
  console.log('✅ EODHD-only chain succeeds without legacy provider');
}

async function testFailoverModeDoesNotUseLegacyProviders() {
  const { handler, getTwelvedataCalls } = stockSnapshotFetch({
    eodhd: () => ({ ok: false, status: 503, json: async () => ({}) }),
  });
  const restore = stubFetch(handler);
  try {
    const result = await requestStock('AAPL', {
      EODHD_API_KEY: 'x',
      TWELVEDATA_API_KEY: 'y',
      PROVIDER_MODE: 'FAILOVER_ALLOWED',
    });
    assert(result.error?.code, 'expected structured error');
    assert(result.metadata?.source_chain?.primary === 'eodhd', 'primary should be eodhd');
    assert(result.metadata?.source_chain?.secondary === 'eodhd', 'secondary should stay eodhd');
    assert(result.metadata?.source_chain?.failureReason === 'BOTH_FAILED', 'expected BOTH_FAILED');
    assert(getTwelvedataCalls() === 0, 'twelvedata must not be called');
  } finally {
    restore();
  }
  console.log('✅ FAILOVER_ALLOWED still stays EODHD-only');
}

async function testForcedEodhdFailureNoFallback() {
  const { handler, getTwelvedataCalls } = stockSnapshotFetch({
    eodhd: () => ({ ok: false, status: 500, json: async () => ({}) }),
  });
  const restore = stubFetch(handler);
  try {
    const result = await requestStock('AAPL', {
      EODHD_API_KEY: 'x',
      TWELVEDATA_API_KEY: 'y',
      RV_FORCE_PROVIDER: 'eodhd',
    });
    assert(result.error?.code, 'expected error');
    assert(result.metadata?.source_chain?.forced === 'eodhd', 'forced should be eodhd');
    assert(result.metadata?.source_chain?.selected === null, 'selected should be null on forced failure');
    assert(result.metadata?.source_chain?.fallbackUsed === false, 'fallbackUsed false on forced');
    assert(
      result.metadata?.source_chain?.failureReason === 'FORCED_PROVIDER_FAILED',
      'failureReason FORCED_PROVIDER_FAILED'
    );
    assert(getTwelvedataCalls() === 0, 'twelvedata must not be called');
  } finally {
    restore();
  }
  console.log('✅ forced EODHD fail has no legacy fallback');
}

async function testInsufficientHistory() {
  const { handler } = stockSnapshotFetch({
    eodhd: () => ({ ok: true, status: 200, json: async () => generateEodhdBars(10) }),
  });
  const restore = stubFetch(handler);
  try {
    const result = await requestStock('AAPL', { EODHD_API_KEY: 'x', TWELVEDATA_API_KEY: 'y' });
    assert(!result.error, 'expected no error');
    assert(result.metadata?.status === 'PARTIAL', 'expected status PARTIAL when INSUFFICIENT_HISTORY present');
    assert(Array.isArray(result.metadata?.reasons), 'expected reasons array');
    assert(result.metadata.reasons.includes('INSUFFICIENT_HISTORY'), 'expected INSUFFICIENT_HISTORY');
    const nulls = result.data.indicators.filter((i) => i.value === null).length;
    assert(nulls > 0, 'expected some null indicators');
  } finally {
    restore();
  }
  console.log('✅ insufficient EODHD history sets reasons + null indicators');
}

async function main() {
  await testEodhdOnlySuccess();
  await testFailoverModeDoesNotUseLegacyProviders();
  await testForcedEodhdFailureNoFallback();
  await testInsufficientHistory();
  console.log('✅ stock provider chain tests passed');
}

main().catch((err) => {
  console.error('❌ stock provider chain tests failed');
  console.error(err.stack || err.message);
  process.exit(1);
});
