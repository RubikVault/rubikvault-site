#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { onRequestGet } from '../functions/api/resolve.js';

function assert(condition, message) {
  if (!condition) throw new Error(message || 'assertion_failed');
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
      '/data/symbol-resolve.v1.json': 'symbol-resolve.sample.json'
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
  return () => {
    globalThis.fetch = originalFetch;
  };
}

async function requestResolve(q) {
  const context = {
    request: new Request(`https://example.com/api/resolve?q=${encodeURIComponent(q)}`)
  };
  const response = await onRequestGet(context);
  return JSON.parse(await response.text());
}

async function testTickerPassThrough() {
  const restore = stubFetch();
  try {
    const result = await requestResolve('AAPL');
    assert(result.schema_version === '3.0', 'schema_version mismatch');
    assert(result.module === 'resolve', 'module mismatch');
    assert(!result.error, 'expected no error');
    assert(result.data.ticker === 'AAPL', 'ticker mismatch');
    assert(result.data.method === 'ticker', 'method mismatch');
  } finally {
    restore();
  }
  console.log('✅ resolve ticker returns AAPL');
}

async function testNameResolvesApple() {
  const restore = stubFetch();
  try {
    const result = await requestResolve('Apple');
    assert(!result.error, 'expected no error');
    assert(result.data.ticker === 'AAPL', 'expected AAPL');
    assert(result.data.method === 'name_exact', 'expected name_exact');
  } finally {
    restore();
  }
  console.log('✅ resolve Apple -> AAPL');
}

async function testNameResolvesMicrosoft() {
  const restore = stubFetch();
  try {
    const result = await requestResolve('Microsoft');
    assert(!result.error, 'expected no error');
    assert(result.data.ticker === 'MSFT', 'expected MSFT');
  } finally {
    restore();
  }
  console.log('✅ resolve Microsoft -> MSFT');
}

async function testUnknown() {
  const restore = stubFetch();
  try {
    const result = await requestResolve('NotARealCompany');
    assert(result.error?.code === 'SYMBOL_NOT_FOUND', 'expected SYMBOL_NOT_FOUND');
    assert(result.data === null, 'expected null data');
  } finally {
    restore();
  }
  console.log('✅ resolve unknown yields SYMBOL_NOT_FOUND');
}

async function main() {
  await testTickerPassThrough();
  await testNameResolvesApple();
  await testNameResolvesMicrosoft();
  await testUnknown();
  console.log('✅ resolve endpoint tests passed');
}

main().catch((err) => {
  console.error('❌ resolve endpoint tests failed');
  console.error(err.stack || err.message);
  process.exit(1);
});
