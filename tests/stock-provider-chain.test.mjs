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

async function requestStock(ticker, env = {}) {
  const context = {
    request: new Request(`https://example.com/api/stock?ticker=${encodeURIComponent(ticker)}`),
    env
  };
  const response = await onRequestGet(context);
  assert(response.status === 200, 'expected http 200');
  return JSON.parse(await response.text());
}

async function testTiingoOnlySuccess() {
  let twelvedataCalls = 0;
  const restore = stubFetch(async (url) => {
    const u = new URL(url);
    if (u.pathname === '/data/symbol-resolve.v1.json') {
      return { ok: true, status: 200, json: async () => loadFixture('symbol-resolve.sample.json') };
    }
    if (u.hostname === 'api.tiingo.com' && u.pathname.includes('/prices')) {
      return { ok: true, status: 200, json: async () => loadFixture('tiingo-prices.sample.json') };
    }
    if (u.hostname === 'api.twelvedata.com') {
      twelvedataCalls += 1;
      return { ok: false, status: 500, json: async () => ({ status: 'error' }) };
    }
    return { ok: false, status: 404, json: async () => null };
  });

  try {
    const result = await requestStock('AAPL', { TIINGO_API_KEY: 'x', TWELVEDATA_API_KEY: 'y' });
    assert(!result.error, 'expected no error');
    assert(result.metadata?.source_chain?.forced === null, 'forced should be null in default chain');
    assert(result.metadata?.source_chain?.selected === 'tiingo', 'selected provider should be tiingo');
    assert(result.metadata?.source_chain?.fallbackUsed === false, 'fallbackUsed false');
    assert(Array.isArray(result.data?.indicators), 'indicators should be array');
    assert(result.data.indicators.length >= 20, 'expected 20+ indicators');
    assert(twelvedataCalls === 0, 'twelvedata should not be called');
  } finally {
    restore();
  }
  console.log('✅ tiingo-only success');
}

async function testFallbackToTwelveData() {
  const restore = stubFetch(async (url) => {
    const u = new URL(url);
    if (u.pathname === '/data/symbol-resolve.v1.json') {
      return { ok: true, status: 200, json: async () => loadFixture('symbol-resolve.sample.json') };
    }
    if (u.hostname === 'api.tiingo.com') {
      return { ok: false, status: 503, json: async () => ({}) };
    }
    if (u.hostname === 'api.twelvedata.com') {
      return { ok: true, status: 200, json: async () => loadFixture('twelvedata-timeseries.sample.json') };
    }
    return { ok: false, status: 404, json: async () => null };
  });

  try {
    const result = await requestStock('AAPL', { TIINGO_API_KEY: 'x', TWELVEDATA_API_KEY: 'y' });
    assert(!result.error, 'expected no error');
    assert(result.metadata?.source_chain?.selected === 'twelvedata', 'expected selected twelvedata');
    assert(result.metadata?.source_chain?.fallbackUsed === true, 'expected fallbackUsed true');
    assert(result.metadata?.source_chain?.primaryFailure, 'expected primaryFailure');
  } finally {
    restore();
  }
  console.log('✅ fallback to twelvedata');
}

async function testForcedProviderNoFallbackFail() {
  let twelvedataCalls = 0;
  const restore = stubFetch(async (url) => {
    const u = new URL(url);
    if (u.pathname === '/data/symbol-resolve.v1.json') {
      return { ok: true, status: 200, json: async () => loadFixture('symbol-resolve.sample.json') };
    }
    if (u.hostname === 'api.tiingo.com') {
      return { ok: false, status: 500, json: async () => ({}) };
    }
    if (u.hostname === 'api.twelvedata.com') {
      twelvedataCalls += 1;
      return { ok: true, status: 200, json: async () => loadFixture('twelvedata-timeseries.sample.json') };
    }
    return { ok: false, status: 404, json: async () => null };
  });

  try {
    const result = await requestStock('AAPL', {
      TIINGO_API_KEY: 'x',
      TWELVEDATA_API_KEY: 'y',
      RV_FORCE_PROVIDER: 'tiingo'
    });
    assert(result.error?.code, 'expected error');
    assert(result.metadata?.source_chain?.forced === 'tiingo', 'forced should be tiingo');
    assert(result.metadata?.source_chain?.selected === null, 'selected should be null on forced failure');
    assert(result.metadata?.source_chain?.fallbackUsed === false, 'fallbackUsed false on forced');
    assert(
      result.metadata?.source_chain?.failureReason === 'FORCED_PROVIDER_FAILED',
      'failureReason FORCED_PROVIDER_FAILED'
    );
    assert(result.metadata?.source_chain?.primaryFailure, 'primaryFailure must be present');
    assert(twelvedataCalls === 0, 'twelvedata must not be called');
  } finally {
    restore();
  }
  console.log('✅ forced provider fail has no fallback');
}

async function testBothFail() {
  const restore = stubFetch(async (url) => {
    const u = new URL(url);
    if (u.pathname === '/data/symbol-resolve.v1.json') {
      return { ok: true, status: 200, json: async () => loadFixture('symbol-resolve.sample.json') };
    }
    if (u.hostname === 'api.tiingo.com') {
      return { ok: false, status: 500, json: async () => ({}) };
    }
    if (u.hostname === 'api.twelvedata.com') {
      return { ok: false, status: 500, json: async () => ({ status: 'error', message: 'down' }) };
    }
    return { ok: false, status: 404, json: async () => null };
  });

  try {
    const result = await requestStock('AAPL', { TIINGO_API_KEY: 'x', TWELVEDATA_API_KEY: 'y' });
    assert(result.error?.code === 'EOD_FETCH_FAILED', 'expected EOD_FETCH_FAILED');
    assert(result.metadata?.source_chain?.failureReason === 'BOTH_FAILED', 'expected BOTH_FAILED');
    assert(result.metadata?.source_chain?.selected === null, 'selected should be null on both fail');
  } finally {
    restore();
  }
  console.log('✅ both fail returns structured error');
}

async function testInsufficientHistory() {
  const restore = stubFetch(async (url) => {
    const u = new URL(url);
    if (u.pathname === '/data/symbol-resolve.v1.json') {
      return { ok: true, status: 200, json: async () => loadFixture('symbol-resolve.sample.json') };
    }
    if (u.hostname === 'api.tiingo.com' && u.pathname.includes('/prices')) {
      return { ok: true, status: 200, json: async () => loadFixture('tiingo-prices.short.sample.json') };
    }
    return { ok: false, status: 404, json: async () => null };
  });

  try {
    const result = await requestStock('AAPL', { TIINGO_API_KEY: 'x', TWELVEDATA_API_KEY: 'y' });
    assert(!result.error, 'expected no error');
    assert(Array.isArray(result.metadata?.reasons), 'expected reasons array');
    assert(result.metadata.reasons.includes('INSUFFICIENT_HISTORY'), 'expected INSUFFICIENT_HISTORY');
    const nulls = result.data.indicators.filter((i) => i.value === null).length;
    assert(nulls > 0, 'expected some null indicators');
  } finally {
    restore();
  }
  console.log('✅ insufficient history sets reasons + null indicators');
}

async function main() {
  await testTiingoOnlySuccess();
  await testFallbackToTwelveData();
  await testForcedProviderNoFallbackFail();
  await testBothFail();
  await testInsufficientHistory();
  console.log('✅ stock provider chain tests passed');
}

main().catch((err) => {
  console.error('❌ stock provider chain tests failed');
  console.error(err.stack || err.message);
  process.exit(1);
});
