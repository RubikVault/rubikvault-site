#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { onRequestGet } from '../functions/api/stock.js';
import { onRequest as apiMiddleware } from '../functions/api/_middleware.js';

function assert(condition, message) {
  if (!condition) throw new Error(message || 'assertion_failed');
}

function assertHasMetaStatus(result) {
  assert(result.meta && typeof result.meta.status === 'string', 'meta.status missing');
}

function loadFixture(name) {
  return JSON.parse(fs.readFileSync(path.join(process.cwd(), 'tests', 'fixtures', name), 'utf-8'));
}

function stubFetch(overrides = {}) {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url) => {
    const pathname = new URL(url).pathname;
    if (overrides[pathname]) {
      return overrides[pathname]();
    }
    const mapping = {
      '/data/snapshots/universe/latest.json': 'stock-universe.sample.json',
      '/data/snapshots/market-prices/latest.json': 'market-prices-latest.sample.json',
      '/data/snapshots/market-stats/latest.json': 'stock-market-stats.sample.json'
    };
    const fixtureName = mapping[pathname];
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

async function requestTicker(ticker) {
  const request = new Request(`https://example.com/api/stock?ticker=${encodeURIComponent(ticker)}`);
  const env = {};
  const context = {
    request,
    env,
    next: () => onRequestGet({ request, env })
  };
  const response = await apiMiddleware(context);
  return JSON.parse(await response.text());
}

async function testKnownTicker() {
  const restore = stubFetch();
  try {
    const result = await requestTicker('SPY');
    assert(result.schema_version === '3.0', 'schema_version mismatch');
    assert(result.module === 'stock', 'module mismatch');
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
  const restore = stubFetch();
  try {
    const result = await requestTicker('ZZZZ');
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
    '/data/snapshots/market-stats/latest.json': () => ({ ok: false, status: 404, json: async () => null })
  });
  try {
    const result = await requestTicker('SPY');
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

async function main() {
  await testKnownTicker();
  await testUnknownTicker();
  await testMissingStats();
  console.log('✅ stock endpoint smoke tests passed');
}

main().catch((err) => {
  console.error('❌ stock endpoint smoke tests failed');
  console.error(err.stack || err.message);
  process.exit(1);
});
