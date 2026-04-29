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
  const bars = [];
  const startDate = new Date(`${start}T00:00:00.000Z`);
  for (let i = 0; i < count; i += 1) {
    const d = new Date(startDate.getTime() + i * 24 * 60 * 60 * 1000);
    const base = 100 + i * 0.1;
    bars.push({
      date: d.toISOString().slice(0, 10),
      open: base,
      high: base + 1,
      low: base - 1,
      close: base + 0.5,
      volume: 1000000 + i,
    });
  }
  return bars;
}

function staticFixtureForPath(pathname) {
  const mapping = {
    '/data/symbol-resolve.v1.json': 'symbol-resolve.sample.json',
    '/data/snapshots/universe/latest.json': 'stock-universe.sample.json',
    '/data/snapshots/market-prices/latest.json': 'market-prices-latest.sample.json',
    '/data/snapshots/market-stats/latest.json': 'stock-market-stats.sample.json',
  };
  const fixture = mapping[pathname];
  return fixture ? loadFixture(fixture) : null;
}

async function requestStock(ticker, env = {}) {
  const response = await onRequestGet({
    request: new Request(`https://example.com/api/stock?ticker=${encodeURIComponent(ticker)}`),
    env,
  });
  assert(response.status === 200, 'expected http 200');
  return JSON.parse(await response.text());
}

function baseFetch({ eodhd, staticOverride = {} } = {}) {
  return async (url) => {
    const u = new URL(url);
    if (Object.hasOwn(staticOverride, u.pathname)) return staticOverride[u.pathname]();
    const fixture = staticFixtureForPath(u.pathname);
    if (fixture) return { ok: true, status: 200, json: async () => fixture };
    if (u.hostname.includes('eodhd.com') || u.hostname.includes('eodhistoricaldata.com')) {
      return eodhd ? eodhd(u) : { ok: false, status: 503, json: async () => ({}) };
    }
    if (u.hostname === 'api.tiingo.com' || u.hostname === 'api.twelvedata.com') {
      throw new Error(`obsolete_provider_called:${u.hostname}`);
    }
    return { ok: false, status: 404, json: async () => null };
  };
}

async function testEodhdOnlySuccess() {
  const restore = stubFetch(baseFetch({
    eodhd: () => ({ ok: true, status: 200, json: async () => generateEodhdBars(260) }),
  }));

  try {
    const result = await requestStock('SPY', { EODHD_API_KEY: 'x' });
    assert(!result.error, 'expected no error');
    assert(result.metadata?.status === 'OK', 'expected status OK');
    assert(result.metadata?.source_chain?.primary === 'eodhd', 'primary should be eodhd');
    assert(result.metadata?.source_chain?.selected === 'eodhd', 'selected provider should be eodhd');
    assert(result.metadata?.source_chain?.fallbackUsed === false, 'fallbackUsed false');
    assert(typeof result.data?.latest_bar?.close === 'number', 'expected latest_bar.close number');
    assert((result.data?.bars || []).length >= 200, 'expected bars_count >= 200');
    assert(result.data.indicators.filter((item) => item.value === null).length === 0, 'expected no null indicators');
  } finally {
    restore();
  }
  console.log('✅ eodhd-only chain succeeds without obsolete providers');
}

async function testEodhdFailure() {
  const restore = stubFetch(baseFetch({
    eodhd: () => ({ ok: false, status: 503, json: async () => ({}) }),
  }));

  try {
    const result = await requestStock('SPY', { EODHD_API_KEY: 'x' });
    assert(result.error?.code === 'EOD_FETCH_FAILED', 'expected EOD_FETCH_FAILED');
    assert(result.metadata?.status === 'ERROR', 'expected status ERROR');
    assert(result.metadata?.source_chain?.selected === null, 'selected should be null');
    assert(result.metadata?.source_chain?.primaryFailure?.code === 'HTTP_ERROR', 'expected HTTP_ERROR primary failure');
  } finally {
    restore();
  }
  console.log('✅ eodhd failure returns structured error');
}

async function testInsufficientHistory() {
  const restore = stubFetch(baseFetch({
    eodhd: () => ({ ok: true, status: 200, json: async () => loadFixture('tiingo-prices.short.sample.json') }),
  }));

  try {
    const result = await requestStock('SPY', { EODHD_API_KEY: 'x' });
    assert(!result.error, 'expected no error');
    assert(result.metadata?.status === 'PARTIAL', 'expected status PARTIAL');
    assert(result.metadata.reasons.includes('INSUFFICIENT_HISTORY'), 'expected INSUFFICIENT_HISTORY');
    assert(result.data.indicators.filter((item) => item.value === null).length > 0, 'expected null indicators');
  } finally {
    restore();
  }
  console.log('✅ insufficient history sets reasons + null indicators');
}

async function main() {
  await testEodhdOnlySuccess();
  await testEodhdFailure();
  await testInsufficientHistory();
  console.log('✅ stock provider chain tests passed');
}

main().catch((err) => {
  console.error('❌ stock provider chain tests failed');
  console.error(err.stack || err.message);
  process.exit(1);
});
