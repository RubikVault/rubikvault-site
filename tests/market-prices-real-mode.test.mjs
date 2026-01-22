#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawnSync } from 'node:child_process';

import {
  classifyAlphaVantagePayload,
  normalizeAlphaVantageDailyAdjusted
} from '../scripts/providers/market-prices-v3.mjs';

let passed = 0;
let failed = 0;

function test(name, fn) {
  return async () => {
    try {
      await fn();
      console.log(`✅ ${name}`);
      passed++;
    } catch (err) {
      console.error(`❌ ${name}`);
      console.error(`   ${err.message}`);
      if (err.stack) {
        console.error(`   ${err.stack.split('\n').slice(1, 3).join('\n')}`);
      }
      failed++;
    }
  };
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message || 'Assertion failed');
  }
}

function assertEqual(actual, expected, message) {
  if (actual !== expected) {
    throw new Error(message || `Expected ${expected}, got ${actual}`);
  }
}

function loadProvidersRegistry() {
  const filePath = path.join(process.cwd(), 'public', 'data', 'registry', 'providers.v1.json');
  const raw = fs.readFileSync(filePath, 'utf-8');
  return JSON.parse(raw);
}

function selectProviderConfig(registry) {
  const chain = registry?.chains?.prices_eod || [];
  const selected = chain.find((entry) => entry && entry.enabled !== false) || chain[0];
  if (!selected || !selected.id) {
    throw new Error('Missing provider in registry chain');
  }
  const providers = Array.isArray(registry?.providers) ? registry.providers : [];
  const provider = providers.find((entry) => entry && entry.id === selected.id);
  if (!provider || typeof provider !== 'object') {
    throw new Error('Missing provider config in registry');
  }
  return provider;
}

function runMarketPrices(envOverrides, outDir) {
  const env = { ...process.env, ...envOverrides };
  if (outDir) env.RV_ARTIFACT_OUT_DIR = outDir;
  return spawnSync('node', ['scripts/providers/market-prices-v3.mjs'], {
    env,
    encoding: 'utf-8'
  });
}

function runMarketPricesWithMock(envOverrides, outDir, fetchConfig = []) {
  const env = { ...process.env, ...envOverrides };
  if (outDir) env.RV_ARTIFACT_OUT_DIR = outDir;
  env.RV_TEST_FETCH_CONFIG = JSON.stringify(fetchConfig);
  const inlineScript = `
import fs from 'node:fs';
import path from 'node:path';
const config = JSON.parse(process.env.RV_TEST_FETCH_CONFIG || '[]');
const sequences = {};
for (const entry of config) {
  const key = entry.symbol || '*';
  sequences[key] = entry.sequence || [entry];
}
const callCounts = {};
const root = process.cwd();
const defaultSequence = sequences['*'] || [{
  status: 200,
  fixture: 'tests/fixtures/alphavantage-daily-adjusted.sample.json'
}];

function getEntry(symbol) {
  const seq = sequences[symbol] || sequences['*'] || defaultSequence;
  const idx = Math.min(callCounts[symbol] || 0, seq.length - 1);
  callCounts[symbol] = idx + 1;
  return seq[idx] || seq[seq.length - 1];
}

function buildResponse(entry) {
  const status = entry.status ?? 200;
  const fixtureContent = entry.fixture
    ? fs.readFileSync(path.join(root, entry.fixture), 'utf-8')
    : (entry.body || '');

  return {
    ok: entry.ok ?? (status >= 200 && status < 300),
    status,
    headers: {
      get: (name) => (entry.headers?.[name.toLowerCase()] || null)
    },
    text: async () => fixtureContent
  };
}

  global.fetch = async (url) => {
    const parsed = new URL(url);
    const symbol = parsed.searchParams.get('symbol') || '*';
    const entry = getEntry(symbol);
    if (!entry) throw new Error('Missing fetch config for ' + symbol);
    return buildResponse(entry);
  };

const mod = await import('./scripts/providers/market-prices-v3.mjs');
await mod.main();
`;
  return spawnSync('node', ['--input-type=module', '-e', inlineScript], {
    env,
    encoding: 'utf-8'
  });
}

const test1 = test('REAL mode without key → fails with REAL_FETCH_MISSING_API_KEY', async () => {
  const registry = loadProvidersRegistry();
  const provider = selectProviderConfig(registry);
  const envVar = provider.auth_env_var;

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rv-market-prices-real-'));
  const result = runMarketPrices({
    RV_PRICES_FORCE_REAL: '1',
    RV_PRICES_STUB: '',
    [envVar]: ''
  }, tmpDir);

  assert(result.status !== 0, 'Expected non-zero exit code');
  const output = `${result.stdout || ''}\n${result.stderr || ''}`;
  assert(output.includes('REAL_FETCH_MISSING_API_KEY'), 'Expected REAL_FETCH_MISSING_API_KEY in output');
});

const test2 = test('STUB mode → deterministic digest', async () => {
  const dirA = fs.mkdtempSync(path.join(os.tmpdir(), 'rv-market-prices-stub-a-'));
  const dirB = fs.mkdtempSync(path.join(os.tmpdir(), 'rv-market-prices-stub-b-'));

  const resultA = runMarketPrices({ RV_PRICES_STUB: '1', RV_PRICES_FORCE_REAL: '' }, dirA);
  const resultB = runMarketPrices({ RV_PRICES_STUB: '1', RV_PRICES_FORCE_REAL: '' }, dirB);

  assertEqual(resultA.status, 0, 'Expected stub run A to succeed');
  assertEqual(resultB.status, 0, 'Expected stub run B to succeed');

  const snapA = JSON.parse(fs.readFileSync(path.join(dirA, 'snapshot.json'), 'utf-8'));
  const snapB = JSON.parse(fs.readFileSync(path.join(dirB, 'snapshot.json'), 'utf-8'));

  assertEqual(snapA.metadata.digest, snapB.metadata.digest, 'Expected digests to match');
});

const test3 = test('Normalize Provider A payload → canonical bar', async () => {
  const fixturePath = path.join(process.cwd(), 'tests', 'fixtures', 'alphavantage-daily-adjusted.sample.json');
  const payload = JSON.parse(fs.readFileSync(fixturePath, 'utf-8'));

  const { bar, warnings } = normalizeAlphaVantageDailyAdjusted(payload, 'SPY', {
    targetDate: '2025-01-16',
    ingestedAt: '2025-01-18T00:00:00Z',
    sourceProvider: 'A'
  });

  assert(bar, 'Expected bar to be returned');
  assertEqual(bar.symbol, 'SPY');
  assertEqual(bar.date, '2025-01-16');
  assertEqual(bar.open, 475.0);
  assertEqual(bar.high, 482.3);
  assertEqual(bar.low, 472.85);
  assertEqual(bar.close, 479.65);
  assertEqual(bar.adj_close, 479.65);
  assertEqual(bar.volume, 98765432);
  assertEqual(bar.currency, 'USD');
  assertEqual(bar.source_provider, 'A');
  assertEqual(bar.ingested_at, '2025-01-18T00:00:00Z');
  assertEqual(warnings.length, 0, 'Expected no warnings for fixture payload');
});

const test4 = test('Classify AlphaVantage Note payload → error payload', async () => {
  const fixturePath = path.join(process.cwd(), 'tests', 'fixtures', 'alphavantage-note.sample.json');
  const payload = JSON.parse(fs.readFileSync(fixturePath, 'utf-8'));
  const classified = classifyAlphaVantagePayload(payload);
  assert(classified, 'Expected classification');
  assertEqual(classified.kind, 'Note');
  assertEqual(classified.classification, 'RATE_LIMIT_NOTE');
  assertEqual(classified.note, payload.Note.trim());
});

const test5 = test('Classify AlphaVantage Error Message payload → error payload', async () => {
  const fixturePath = path.join(process.cwd(), 'tests', 'fixtures', 'alphavantage-error-message.sample.json');
  const payload = JSON.parse(fs.readFileSync(fixturePath, 'utf-8'));
  const classified = classifyAlphaVantagePayload(payload);
  assert(classified, 'Expected classification');
  assertEqual(classified.kind, 'Error Message');
  assertEqual(classified.classification, 'UPSTREAM_ERROR_MESSAGE');
  assertEqual(classified.note, payload['Error Message'].trim());
});

const test6 = test('REAL mode error payload → fail loud with upstream metadata', async () => {
  const registry = loadProvidersRegistry();
  const provider = selectProviderConfig(registry);
  const envVar = provider.auth_env_var;
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rv-market-prices-real-note-'));

  const fetchConfig = [
    {
      symbol: 'SPY',
      sequence: [
        { status: 200, fixture: 'tests/fixtures/alphavantage-note.sample.json' }
      ]
    },
    {
      symbol: '*',
      sequence: [
        { status: 200, fixture: 'tests/fixtures/alphavantage-daily-adjusted.sample.json' }
      ]
    }
  ];

  const result = runMarketPricesWithMock({
    RV_PRICES_FORCE_REAL: '1',
    RV_PRICES_STUB: '',
    [envVar]: 'dummy'
  }, tmpDir, fetchConfig);

  assert(result.status !== 0, 'Expected non-zero exit code');
  const snapshot = JSON.parse(fs.readFileSync(path.join(tmpDir, 'snapshot.json'), 'utf-8'));
  const state = JSON.parse(fs.readFileSync(path.join(tmpDir, 'module-state.json'), 'utf-8'));

  assertEqual(snapshot.metadata.provider, 'alphavantage');
  assertEqual(snapshot.metadata.compute?.reason_code, 'RATE_LIMIT_NOTE');
  assertEqual(snapshot.metadata.upstream?.classification, 'RATE_LIMIT_NOTE');
  assert(snapshot.metadata.upstream?.note?.includes('Thank you'), 'Expected upstream note text');
  assertEqual(snapshot.metadata.upstream?.symbol_errors?.SPY?.classification, 'RATE_LIMIT_NOTE');
  assertEqual(state.status, 'error');
  assertEqual(state.failure?.class, 'RATE_LIMIT_NOTE');
});

const test7 = test('Cooldown active → fail immediately with runtime state preserved', async () => {
  const registry = loadProvidersRegistry();
  const provider = selectProviderConfig(registry);
  const envVar = provider.auth_env_var;
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rv-market-prices-real-cooldown-'));
  const runtimePath = path.join(tmpDir, 'provider-runtime.json');
  const future = new Date(Date.now() + 60 * 60 * 1000).toISOString();
  fs.writeFileSync(
    runtimePath,
    JSON.stringify({
      provider_id: 'alphavantage',
      cooldown_until: future,
      cooldown_note: 'manual cooldown',
      last_http_status: 429
    }, null, 2),
    'utf-8'
  );

  const result = runMarketPrices({
    RV_PRICES_FORCE_REAL: '1',
    RV_PRICES_STUB: '',
    [envVar]: 'dummy'
  }, tmpDir);

  assert(result.status !== 0, 'Expected cooldown exit code');
  assert(result.stderr.includes('REAL_FETCH_COOLDOWN_ACTIVE'), 'Expected cooldown error logged');
  const snapshot = JSON.parse(fs.readFileSync(path.join(tmpDir, 'snapshot.json'), 'utf-8'));
  const state = JSON.parse(fs.readFileSync(path.join(tmpDir, 'module-state.json'), 'utf-8'));
  const runtime = JSON.parse(fs.readFileSync(runtimePath, 'utf-8'));

  assertEqual(snapshot.metadata.upstream?.classification, 'COOLDOWN_ACTIVE');
  assertEqual(snapshot.metadata.compute?.reason_code, 'COOLDOWN_ACTIVE');
  assertEqual(snapshot.metadata.compute?.dropped_symbols.length, 4);
  assertEqual(state.failure?.class, 'COOLDOWN_ACTIVE');
  assertEqual(runtime.cooldown_until, future);
});

const test8 = test('HTTP 429 → triggers cooldown and metadata', async () => {
  const registry = loadProvidersRegistry();
  const provider = selectProviderConfig(registry);
  const envVar = provider.auth_env_var;
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rv-market-prices-real-429-'));

  const fetchConfig = [
    {
      symbol: 'SPY',
      sequence: [
        { status: 429 },
        { status: 429 },
        { status: 429 }
      ]
    },
    {
      symbol: '*',
      sequence: [
        { status: 200, fixture: 'tests/fixtures/alphavantage-daily-adjusted.sample.json' }
      ]
    }
  ];

  const result = runMarketPricesWithMock({
    RV_PRICES_FORCE_REAL: '1',
    RV_PRICES_STUB: '',
    [envVar]: 'dummy'
  }, tmpDir, fetchConfig);

  assert(result.status !== 0, 'Expected rate-limit exit');
  const snapshot = JSON.parse(fs.readFileSync(path.join(tmpDir, 'snapshot.json'), 'utf-8'));
  const runtime = JSON.parse(fs.readFileSync(path.join(tmpDir, 'provider-runtime.json'), 'utf-8'));

  assertEqual(snapshot.metadata.upstream?.classification, 'HTTP_429');
  assertEqual(snapshot.metadata.compute?.reason_code, 'HTTP_429');
  assertEqual(snapshot.metadata.upstream?.symbol_errors?.SPY?.classification, 'HTTP_429');
  assert(runtime.cooldown_until, 'Expected cooldown until timestamp');
  assertEqual(runtime.last_classification, 'HTTP_429');
});

const test9 = test('Partial success then rate-limit note → reason PARTIAL_DUE_TO_RATE_LIMIT', async () => {
  const registry = loadProvidersRegistry();
  const provider = selectProviderConfig(registry);
  const envVar = provider.auth_env_var;
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rv-market-prices-real-partial-'));

  const fetchConfig = [
    {
      symbol: 'SPY',
      sequence: [
        { status: 200, fixture: 'tests/fixtures/alphavantage-daily-adjusted.sample.json' }
      ]
    },
    {
      symbol: 'QQQ',
      sequence: [
        { status: 200, fixture: 'tests/fixtures/alphavantage-daily-adjusted.sample.json' }
      ]
    },
    {
      symbol: 'DIA',
      sequence: [
        { status: 200, fixture: 'tests/fixtures/alphavantage-note.sample.json' }
      ]
    },
    {
      symbol: '*',
      sequence: [
        { status: 200, fixture: 'tests/fixtures/alphavantage-daily-adjusted.sample.json' }
      ]
    }
  ];

  const result = runMarketPricesWithMock({
    RV_PRICES_FORCE_REAL: '1',
    RV_PRICES_STUB: '',
    [envVar]: 'dummy'
  }, tmpDir, fetchConfig);

  assertEqual(result.status, 0, 'Partial run should exit 0 (module state failure)');
  const snapshot = JSON.parse(fs.readFileSync(path.join(tmpDir, 'snapshot.json'), 'utf-8'));
  const state = JSON.parse(fs.readFileSync(path.join(tmpDir, 'module-state.json'), 'utf-8'));
  const runtime = JSON.parse(fs.readFileSync(path.join(tmpDir, 'provider-runtime.json'), 'utf-8'));

  assertEqual(snapshot.metadata.upstream?.classification, 'RATE_LIMIT_NOTE');
  assertEqual(snapshot.metadata.compute?.reason_code, 'PARTIAL_DUE_TO_RATE_LIMIT');
  assert(snapshot.metadata.compute?.dropped_symbols.includes('DIA'), 'Expected DIA dropped due to rate limit');
  assert(snapshot.metadata.compute?.dropped_symbols.includes('IWM'), 'Expected IWM dropped due to cooldown');
  assertEqual(snapshot.metadata.upstream?.symbol_errors?.DIA?.classification, 'RATE_LIMIT_NOTE');
  assertEqual(state.failure?.class, 'PARTIAL_DUE_TO_RATE_LIMIT');
  assert(runtime.cooldown_until, 'Expected cooldown persisted');
});

const tests = [test1, test2, test3, test4, test5, test6, test7, test8, test9];

(async () => {
  for (const t of tests) {
    await t();
  }

  console.log(`\nTests complete: ${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
})();
