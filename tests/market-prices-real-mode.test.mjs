#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawnSync } from 'node:child_process';

import {
  classifyAlphaVantagePayload,
  normalizeAlphaVantageDailyAdjusted,
  normalizeTwelveDataTimeSeries,
  buildProviderChain
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

function assertSourceChain(snapshot, expected = {}) {
  const chain = snapshot?.metadata?.source_chain;
  assert(chain && typeof chain === 'object', 'Expected metadata.source_chain to be present');
  if ('primary' in expected) assertEqual(chain.primary, expected.primary, 'source_chain.primary mismatch');
  if ('secondary' in expected) assertEqual(chain.secondary, expected.secondary, 'source_chain.secondary mismatch');
  if ('selected' in expected) assertEqual(chain.selected, expected.selected, 'source_chain.selected mismatch');
  if ('fallbackUsed' in expected) assertEqual(chain.fallbackUsed, expected.fallbackUsed, 'source_chain.fallbackUsed mismatch');
  if ('fallbackProvider' in expected) assertEqual(chain.fallbackProvider, expected.fallbackProvider, 'source_chain.fallbackProvider mismatch');
  if ('primaryFailure' in expected) {
    if (expected.primaryFailure === null) {
      assertEqual(chain.primaryFailure, null, 'source_chain.primaryFailure expected null');
    } else {
      assert(chain.primaryFailure && typeof chain.primaryFailure === 'object', 'Expected source_chain.primaryFailure object');
      if ('code' in expected.primaryFailure) {
        assertEqual(chain.primaryFailure.code, expected.primaryFailure.code, 'source_chain.primaryFailure.code mismatch');
      }
    }
  }
}

function loadProvidersRegistry() {
  const filePath = path.join(process.cwd(), 'public', 'data', 'registry', 'providers.v1.json');
  const raw = fs.readFileSync(filePath, 'utf-8');
  return JSON.parse(raw);
}

function selectPrimaryProvider(registry) {
  const chain = buildProviderChain(registry, 'prices_eod');
  if (!Array.isArray(chain) || chain.length === 0) {
    throw new Error('Missing provider chain');
  }
  return chain[0];
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
  const provider = entry.provider || '*';
  const symbol = entry.symbol || '*';
  sequences[provider] = sequences[provider] || {};
  sequences[provider][symbol] = entry.sequence || [entry];
}
const callCounts = {};
const root = process.cwd();
const defaults = {
  alphavantage: [{ status: 200, fixture: 'tests/fixtures/alphavantage-daily-adjusted.sample.json' }],
  twelvedata: [{ status: 200, fixture: 'tests/fixtures/twelvedata-time-series.sample.json' }],
  '*': [{ status: 200, fixture: 'tests/fixtures/alphavantage-daily-adjusted.sample.json' }]
};

function resolveSequence(provider, symbol) {
  const providerSeq = sequences[provider] || {};
  const starSeq = sequences['*'] || {};
  return (
    providerSeq[symbol] ||
    providerSeq['*'] ||
    starSeq[symbol] ||
    starSeq['*'] ||
    defaults[provider] ||
    defaults['*']
  );
}

function buildKey(provider, symbol) {
  return \`\${provider}:\${symbol}\`;
}

function getEntry(provider, symbol) {
  const sequence = resolveSequence(provider, symbol);
  if (!sequence || sequence.length === 0) return null;
  const key = buildKey(provider, symbol);
  callCounts[key] = callCounts[key] ?? 0;
  const idx = Math.min(callCounts[key], sequence.length - 1);
  callCounts[key] = idx + 1;
  return sequence[idx];
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
    let provider = '*';
    if (parsed.host.includes('alphavantage')) provider = 'alphavantage';
    else if (parsed.host.includes('twelvedata')) provider = 'twelvedata';
    const entry = getEntry(provider, symbol) || getEntry('*', symbol);
    if (!entry) throw new Error('Missing fetch config for ' + provider + ':' + symbol);
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
  const provider = selectPrimaryProvider(registry);
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

  const providerHealthA = fs.readFileSync(path.join(dirA, 'provider-health.json'), 'utf-8');
  const providerHealthB = fs.readFileSync(path.join(dirB, 'provider-health.json'), 'utf-8');
  assertEqual(providerHealthA, providerHealthB, 'Expected provider health artifacts to be deterministic');

  const marketHealthA = fs.readFileSync(path.join(dirA, 'market-prices-health.json'), 'utf-8');
  const marketHealthB = fs.readFileSync(path.join(dirB, 'market-prices-health.json'), 'utf-8');
  assertEqual(marketHealthA, marketHealthB, 'Expected market health artifacts to be deterministic');
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

const test3a = test('Normalize Twelve Data payload → canonical bar', async () => {
  const fixturePath = path.join(process.cwd(), 'tests', 'fixtures', 'twelvedata-time-series.sample.json');
  const payload = JSON.parse(fs.readFileSync(fixturePath, 'utf-8'));
  const { bar, warnings } = normalizeTwelveDataTimeSeries(payload, 'SPY', {
    ingestedAt: '2025-01-18T00:00:00Z',
    sourceProvider: 'twelvedata'
  });

  assert(bar, 'Expected bar to be returned');
  assertEqual(bar.symbol, 'SPY');
  assertEqual(bar.date, '2025-01-16');
  assertEqual(bar.open, 475.0);
  assertEqual(bar.high, 485.0);
  assertEqual(bar.low, 472.0);
  assertEqual(bar.close, 482.0);
  assertEqual(bar.volume, 12345678);
  assertEqual(bar.currency, 'USD');
  assertEqual(bar.source_provider, 'twelvedata');
  assertEqual(bar.ingested_at, '2025-01-18T00:00:00Z');
  assert(bar.adj_close === null, 'Expected adj_close to be null when not provided');
  assert(
    warnings.includes('MISSING_ADJ:SPY'),
    'Expected missing adj warning for twelve data payload'
  );
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
  const provider = selectPrimaryProvider(registry);
  const envVar = provider.auth_env_var;
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rv-market-prices-real-note-'));

  const fetchConfig = [
    {
      provider: 'alphavantage',
      symbol: 'SPY',
      sequence: [
        { status: 200, fixture: 'tests/fixtures/alphavantage-note.sample.json' }
      ]
    },
    {
      provider: 'alphavantage',
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

  assertEqual(snapshot.metadata.compute?.reason_code, 'COOLDOWN_ACTIVE');
  assertEqual(snapshot.metadata.upstream?.classification, 'NETWORK_ERROR');
  assert(snapshot.metadata.upstream?.note?.includes('Thank you'), 'Expected upstream note text');
  assertEqual(snapshot.metadata.upstream?.symbol_errors?.SPY?.classification, 'NETWORK_ERROR');
  assertEqual(snapshot.metadata.upstream?.symbol_errors?.SPY?.provider_id, 'twelvedata');
  assert(snapshot.metadata.upstream?.symbol_attempts?.SPY, 'Expected SYMBOL attempts log');
  assertEqual(snapshot.metadata.upstream?.symbol_attempts?.SPY[0]?.provider_id, 'alphavantage');
  assertEqual(state.status, 'error');
  assertEqual(state.failure?.class, 'COOLDOWN_ACTIVE');
});

const test7 = test('Cooldown active → fail immediately with runtime state preserved', async () => {
  const registry = loadProvidersRegistry();
  const provider = selectPrimaryProvider(registry);
  const envVar = provider.auth_env_var;
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rv-market-prices-real-cooldown-'));
  const runtimePath = path.join(tmpDir, 'provider-runtime.json');
  const future = new Date(Date.now() + 60 * 60 * 1000).toISOString();
  fs.writeFileSync(
    runtimePath,
    JSON.stringify({
      providers: {
        alphavantage: {
          provider_id: 'alphavantage',
          cooldown_until: future,
          cooldown_note: 'manual cooldown',
          last_http_status: 429
        }
      }
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

  assertEqual(snapshot.metadata.upstream?.classification, 'NETWORK_ERROR');
  assertEqual(snapshot.metadata.compute?.reason_code, 'COOLDOWN_ACTIVE');
  assertEqual(snapshot.metadata.compute?.dropped_symbols.length, 4);
  assertEqual(state.failure?.class, 'COOLDOWN_ACTIVE');
  assertEqual(runtime.providers?.alphavantage?.cooldown_until, future);
  assert(snapshot.metadata.upstream?.symbol_attempts?.SPY?.[0]?.classification === 'COOLDOWN_ACTIVE', 'Expected cooldown attempt logged');
});

const test8 = test('HTTP 429 → triggers cooldown and metadata', async () => {
  const registry = loadProvidersRegistry();
  const provider = selectPrimaryProvider(registry);
  const envVar = provider.auth_env_var;
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rv-market-prices-real-429-'));

  const fetchConfig = [
    {
      provider: 'alphavantage',
      symbol: 'SPY',
      sequence: [
        { status: 429 },
        { status: 429 },
        { status: 429 }
      ]
    },
    {
      provider: 'alphavantage',
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
  const state = JSON.parse(fs.readFileSync(path.join(tmpDir, 'module-state.json'), 'utf-8'));


  assertEqual(snapshot.metadata.upstream?.classification, 'NETWORK_ERROR');
  assertEqual(snapshot.metadata.compute?.reason_code, 'COOLDOWN_ACTIVE');
  assertEqual(snapshot.metadata.upstream?.symbol_errors?.SPY?.classification, 'NETWORK_ERROR');
  assertEqual(snapshot.metadata.upstream?.symbol_errors?.SPY?.provider_id, 'twelvedata');
  assert(runtime.providers?.alphavantage?.cooldown_until, 'Expected cooldown until timestamp');
  assertEqual(runtime.providers?.alphavantage?.last_classification, 'HTTP_429');
  assertEqual(snapshot.metadata.upstream?.symbol_attempts?.SPY?.[0]?.classification, 'HTTP_429');
  assertEqual(state.failure?.class, 'COOLDOWN_ACTIVE');
});

const test9 = test('Partial success then rate-limit note → reason PARTIAL_DUE_TO_RATE_LIMIT', async () => {
  const registry = loadProvidersRegistry();
  const provider = selectPrimaryProvider(registry);
  const envVar = provider.auth_env_var;
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rv-market-prices-real-partial-'));

  const fetchConfig = [
    {
      provider: 'alphavantage',
      symbol: 'SPY',
      sequence: [
        { status: 200, fixture: 'tests/fixtures/alphavantage-daily-adjusted.sample.json' }
      ]
    },
    {
      provider: 'alphavantage',
      symbol: 'QQQ',
      sequence: [
        { status: 200, fixture: 'tests/fixtures/alphavantage-daily-adjusted.sample.json' }
      ]
    },
    {
      provider: 'alphavantage',
      symbol: 'DIA',
      sequence: [
        { status: 200, fixture: 'tests/fixtures/alphavantage-note.sample.json' }
      ]
    },
    {
      provider: 'alphavantage',
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

  assertEqual(snapshot.metadata.upstream?.classification, 'NETWORK_ERROR');
  assertEqual(snapshot.metadata.compute?.reason_code, 'COOLDOWN_ACTIVE');
  assert(snapshot.metadata.compute?.dropped_symbols.includes('DIA'), 'Expected DIA dropped due to rate limit');
  assert(snapshot.metadata.compute?.dropped_symbols.includes('IWM'), 'Expected IWM dropped due to cooldown');
  assertEqual(snapshot.metadata.upstream?.symbol_errors?.DIA?.classification, 'NETWORK_ERROR');
  assertEqual(snapshot.metadata.upstream?.symbol_errors?.DIA?.provider_id, 'twelvedata');
  assertEqual(snapshot.metadata.upstream?.symbol_attempts?.DIA?.[0]?.classification, 'RATE_LIMIT_NOTE');
  assertEqual(state.failure?.class, 'COOLDOWN_ACTIVE');
  assert(runtime.providers?.alphavantage?.cooldown_until, 'Expected cooldown persisted');
});

const test10 = test('Twelve Data fallback yields bar when Alpha returns Note', async () => {
  const registry = loadProvidersRegistry();
  const chain = buildProviderChain(registry, 'prices_eod');
  const primary = chain[0];
  const fallback = chain.find((provider) => provider.role === 'fallback');
  if (!fallback) throw new Error('Fallback provider missing');
  const envVarPrimary = primary.auth_env_var;
  const envVarFallback = fallback.auth_env_var;
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rv-market-prices-real-fallback-'));

  const fetchConfig = [
    {
      provider: 'alphavantage',
      symbol: 'SPY',
      sequence: [
        { status: 200, fixture: 'tests/fixtures/alphavantage-note.sample.json' }
      ]
    },
    {
      provider: 'alphavantage',
      symbol: '*',
      sequence: [
        { status: 200, fixture: 'tests/fixtures/alphavantage-daily-adjusted.sample.json' }
      ]
    },
    {
      provider: 'twelvedata',
      symbol: 'SPY',
      sequence: [
        { status: 200, fixture: 'tests/fixtures/twelvedata-time-series.sample.json' }
      ]
    }
  ];

  const result = runMarketPricesWithMock({
    RV_PRICES_FORCE_REAL: '1',
    RV_PRICES_STUB: '',
    [envVarPrimary]: 'alpha-key',
    [envVarFallback]: 'td-key'
  }, tmpDir, fetchConfig);

  assertEqual(result.status, 0, 'Expected fallback run to succeed');
  const snapshot = JSON.parse(fs.readFileSync(path.join(tmpDir, 'snapshot.json'), 'utf-8'));
  const state = JSON.parse(fs.readFileSync(path.join(tmpDir, 'module-state.json'), 'utf-8'));

  assertEqual(snapshot.metadata.provider, fallback.id);
  assertSourceChain(snapshot, {
    primary: primary.id,
    secondary: fallback.id,
    selected: fallback.id,
    fallbackUsed: true,
    fallbackProvider: fallback.id,
    primaryFailure: { code: 'RATE_LIMIT_NOTE' }
  });
  assertEqual(snapshot.metadata.upstream?.symbol_sources?.SPY, fallback.id);
  assertEqual(snapshot.metadata.upstream?.symbol_attempts?.SPY?.[0]?.provider_id, primary.id);
  assertEqual(snapshot.metadata.upstream?.symbol_attempts?.SPY?.[1]?.provider_id, fallback.id);
  assertEqual(snapshot.metadata.upstream?.symbol_attempts?.SPY?.[0]?.classification, 'RATE_LIMIT_NOTE');
  assertEqual(snapshot.metadata.upstream?.symbol_attempts?.SPY?.[1]?.classification, 'OK');
  assertEqual(snapshot.metadata.compute?.done_symbols, 4);
  assertEqual(state.status, 'warn');
});

const test11 = test('Alpha HTTP 429 triggers Twelve Data fallback for symbols', async () => {
  const registry = loadProvidersRegistry();
  const chain = buildProviderChain(registry, 'prices_eod');
  const primary = chain[0];
  const fallback = chain.find((provider) => provider.role === 'fallback');
  if (!fallback) throw new Error('Fallback provider missing');
  const envVarPrimary = primary.auth_env_var;
  const envVarFallback = fallback.auth_env_var;
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rv-market-prices-real-fallback-429-'));


  const fetchConfig = [
    {
      provider: 'alphavantage',
      symbol: 'SPY',
      sequence: [
        { status: 429 },
        { status: 429 },
        { status: 429 }
      ]
    },
    {
      provider: 'alphavantage',
      symbol: '*',
      sequence: [
        { status: 200, fixture: 'tests/fixtures/alphavantage-daily-adjusted.sample.json' }
      ]
    },
    {
      provider: 'twelvedata',
      symbol: '*',
      sequence: [
        { status: 200, fixture: 'tests/fixtures/twelvedata-time-series.sample.json' }
      ]
    }
  ];

  const result = runMarketPricesWithMock({
    RV_PRICES_FORCE_REAL: '1',
    RV_PRICES_STUB: '',
    [envVarPrimary]: 'alpha-key',
    [envVarFallback]: 'td-key'
  }, tmpDir, fetchConfig);

  assertEqual(result.status, 0, 'Fallback run should recover from 429');
  const snapshot = JSON.parse(fs.readFileSync(path.join(tmpDir, 'snapshot.json'), 'utf-8'));
  const runtime = JSON.parse(fs.readFileSync(path.join(tmpDir, 'provider-runtime.json'), 'utf-8'));
  const state = JSON.parse(fs.readFileSync(path.join(tmpDir, 'module-state.json'), 'utf-8'));

  assertEqual(snapshot.metadata.provider, fallback.id);
  assertSourceChain(snapshot, {
    primary: primary.id,
    secondary: fallback.id,
    selected: fallback.id,
    fallbackUsed: true,
    fallbackProvider: fallback.id,
    primaryFailure: { code: 'HTTP_429' }
  });
  assertEqual(snapshot.metadata.upstream?.classification, 'HTTP_429');
  assertEqual(snapshot.metadata.compute?.reason_code, 'COOLDOWN_ACTIVE');
  assertEqual(snapshot.metadata.upstream?.symbol_attempts?.SPY?.[0]?.classification, 'HTTP_429');
  assertEqual(snapshot.metadata.upstream?.symbol_attempts?.SPY?.[1]?.classification, 'OK');
  assertEqual(snapshot.metadata.upstream?.symbol_sources?.SPY, fallback.id);
  assert(runtime.providers?.alphavantage?.cooldown_until, 'Expected provider cooldown after 429');
  assert(
    [null, 'COOLDOWN_ACTIVE'].includes(state.failure?.class),
    'Expected module-state failure class to be null or COOLDOWN_ACTIVE'
  );
});

const test12 = test('Fallback failure leaves run with no valid bars', async () => {
  const registry = loadProvidersRegistry();
  const chain = buildProviderChain(registry, 'prices_eod');
  const primary = chain[0];
  const fallback = chain.find((provider) => provider.role === 'fallback');
  if (!fallback) throw new Error('Fallback provider missing');
  const envVarPrimary = primary.auth_env_var;
  const envVarFallback = fallback.auth_env_var;
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rv-market-prices-real-fallback-fail-'));
  const fetchConfig = [
    {
      provider: 'alphavantage',
      symbol: '*',
      sequence: [
        { status: 200, fixture: 'tests/fixtures/alphavantage-note.sample.json' }
      ]
    },
    {
      provider: 'twelvedata',
      symbol: '*',
      sequence: [
        { status: 500 }
      ]
    }
  ];

  const result = runMarketPricesWithMock({
    RV_PRICES_FORCE_REAL: '1',
    RV_PRICES_STUB: '',
    [envVarPrimary]: 'alpha-key',
    [envVarFallback]: 'td-key'
  }, tmpDir, fetchConfig);

  assert(result.status !== 0, 'Expected fallback failure to exit non-zero');
  const snapshot = JSON.parse(fs.readFileSync(path.join(tmpDir, 'snapshot.json'), 'utf-8'));
  const state = JSON.parse(fs.readFileSync(path.join(tmpDir, 'module-state.json'), 'utf-8'));

  assertSourceChain(snapshot, {
    primary: primary.id,
    secondary: fallback.id,
    selected: fallback.id,
    fallbackUsed: false,
    fallbackProvider: null
  });
  assertEqual(snapshot.metadata.upstream?.symbol_errors?.SPY?.provider_id, fallback.id);
  assertEqual(state.status, 'error');
  assertEqual(snapshot.metadata.compute?.reason_code, 'COOLDOWN_ACTIVE');
  assertEqual(state.failure?.class, 'COOLDOWN_ACTIVE');
});

const testForceAlphaSuccess = test('RV_FORCE_PROVIDER=alphavantage forces primary only (no fallback) - success', async () => {
  const registry = loadProvidersRegistry();
  const chain = buildProviderChain(registry, 'prices_eod');
  const primary = chain[0];
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rv-market-prices-force-alpha-'));

  const fetchConfig = [
    {
      provider: 'alphavantage',
      symbol: '*',
      sequence: [{ status: 200, fixture: 'tests/fixtures/alphavantage-daily-adjusted.sample.json' }]
    }
  ];

  const result = runMarketPricesWithMock({
    RV_PRICES_FORCE_REAL: '1',
    RV_PRICES_STUB: '',
    RV_FORCE_PROVIDER: 'alphavantage',
    [primary.auth_env_var]: 'alpha-key'
  }, tmpDir, fetchConfig);

  assertEqual(result.status, 0, 'Forced alphavantage run should succeed');
  const snapshot = JSON.parse(fs.readFileSync(path.join(tmpDir, 'snapshot.json'), 'utf-8'));
  assertSourceChain(snapshot, {
    primary: primary.id,
    secondary: null,
    selected: primary.id,
    fallbackUsed: false,
    fallbackProvider: null,
    primaryFailure: null
  });
  assertEqual(snapshot.metadata.provider, primary.id);
});

const testForceAlphaFail = test('RV_FORCE_PROVIDER=alphavantage forces primary only (no fallback) - fail loud', async () => {
  const registry = loadProvidersRegistry();
  const chain = buildProviderChain(registry, 'prices_eod');
  const primary = chain[0];
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rv-market-prices-force-alpha-fail-'));

  const fetchConfig = [
    {
      provider: 'alphavantage',
      symbol: '*',
      sequence: [{ status: 200, fixture: 'tests/fixtures/alphavantage-note.sample.json' }]
    }
  ];

  const result = runMarketPricesWithMock({
    RV_PRICES_FORCE_REAL: '1',
    RV_PRICES_STUB: '',
    RV_FORCE_PROVIDER: 'alphavantage',
    [primary.auth_env_var]: 'alpha-key'
  }, tmpDir, fetchConfig);

  assert(result.status !== 0, 'Forced alphavantage failure should exit non-zero');
  const snapshot = JSON.parse(fs.readFileSync(path.join(tmpDir, 'snapshot.json'), 'utf-8'));
  assertSourceChain(snapshot, {
    primary: primary.id,
    secondary: null,
    selected: primary.id,
    fallbackUsed: false,
    fallbackProvider: null
  });
});

const testForceTwelveDataSuccess = test('RV_FORCE_PROVIDER=twelvedata forces secondary only (no fallback) - success', async () => {
  const registry = loadProvidersRegistry();
  const chain = buildProviderChain(registry, 'prices_eod');
  const primary = chain[0];
  const fallback = chain.find((provider) => provider.role === 'fallback');
  if (!fallback) throw new Error('Fallback provider missing');
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rv-market-prices-force-td-'));

  const fetchConfig = [
    {
      provider: 'twelvedata',
      symbol: '*',
      sequence: [{ status: 200, fixture: 'tests/fixtures/twelvedata-time-series.sample.json' }]
    }
  ];

  const result = runMarketPricesWithMock({
    RV_PRICES_FORCE_REAL: '1',
    RV_PRICES_STUB: '',
    RV_FORCE_PROVIDER: 'twelvedata',
    [fallback.auth_env_var]: 'td-key'
  }, tmpDir, fetchConfig);

  assertEqual(result.status, 0, 'Forced twelvedata run should succeed');
  const snapshot = JSON.parse(fs.readFileSync(path.join(tmpDir, 'snapshot.json'), 'utf-8'));
  assertSourceChain(snapshot, {
    primary: fallback.id,
    secondary: null,
    selected: fallback.id,
    fallbackUsed: false,
    fallbackProvider: null,
    primaryFailure: null
  });
  assertEqual(snapshot.metadata.provider, fallback.id);
  assert(snapshot.metadata.upstream?.symbol_attempts?.SPY?.[0]?.provider_id === fallback.id);
});

const testForceTwelveDataFail = test('RV_FORCE_PROVIDER=twelvedata forces secondary only (no fallback) - fail loud', async () => {
  const registry = loadProvidersRegistry();
  const chain = buildProviderChain(registry, 'prices_eod');
  const fallback = chain.find((provider) => provider.role === 'fallback');
  if (!fallback) throw new Error('Fallback provider missing');
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rv-market-prices-force-td-fail-'));

  const fetchConfig = [
    {
      provider: 'twelvedata',
      symbol: '*',
      sequence: [{ status: 500 }]
    }
  ];

  const result = runMarketPricesWithMock({
    RV_PRICES_FORCE_REAL: '1',
    RV_PRICES_STUB: '',
    RV_FORCE_PROVIDER: 'twelvedata',
    [fallback.auth_env_var]: 'td-key'
  }, tmpDir, fetchConfig);

  assert(result.status !== 0, 'Forced twelvedata failure should exit non-zero');
  const snapshot = JSON.parse(fs.readFileSync(path.join(tmpDir, 'snapshot.json'), 'utf-8'));
  assertSourceChain(snapshot, {
    primary: fallback.id,
    secondary: null,
    selected: fallback.id,
    fallbackUsed: false,
    fallbackProvider: null
  });
});

const test13 = test('Alpha-only run yields perfect health metrics', async () => {
  const registry = loadProvidersRegistry();
  const chain = buildProviderChain(registry, 'prices_eod');
  const primary = chain[0];
  const fallback = chain.find((provider) => provider.role === 'fallback');
  const envVarPrimary = primary.auth_env_var;
  const envVarFallback = fallback?.auth_env_var;
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rv-market-prices-real-health-alpha-'));

  const fetchConfig = [
    {
      provider: 'alphavantage',
      symbol: '*',
      sequence: [
        { status: 200, fixture: 'tests/fixtures/alphavantage-daily-adjusted.sample.json' }
      ]
    }
  ];

  const env = {
    RV_PRICES_FORCE_REAL: '1',
    RV_PRICES_STUB: '',
    [envVarPrimary]: 'alpha-key'
  };
  if (envVarFallback) env[envVarFallback] = 'td-key';

  const result = runMarketPricesWithMock(env, tmpDir, fetchConfig);
  assertEqual(result.status, 0, 'Expected alpha-only run to succeed');

  const providerHealth = JSON.parse(fs.readFileSync(path.join(tmpDir, 'provider-health.json'), 'utf-8'));
  const alphaEntry = providerHealth.providers.find((entry) => entry.provider_id === primary.id);
  assert(alphaEntry, 'Expected provider health entry for AlphaVantage');
  assertEqual(alphaEntry.success_ratio, 1);
  assertEqual(alphaEntry.run_health_score, 100);

  const marketHealth = JSON.parse(fs.readFileSync(path.join(tmpDir, 'market-prices-health.json'), 'utf-8'));
  assertEqual(marketHealth.run_quality, 'OK');
  assertEqual(marketHealth.fallback_usage_ratio, 0);
  assertEqual(Object.keys(marketHealth.reason_summary).length, 0);
});

const test14 = test('Alpha cooldown triggers Twelve Data fallback health metrics', async () => {
  const registry = loadProvidersRegistry();
  const chain = buildProviderChain(registry, 'prices_eod');
  const primary = chain[0];
  const fallback = chain.find((provider) => provider.role === 'fallback');
  if (!fallback) throw new Error('Fallback provider missing');
  const envVarPrimary = primary.auth_env_var;
  const envVarFallback = fallback.auth_env_var;
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rv-market-prices-real-health-fallback-'));

  const fetchConfig = [
    {
      provider: 'alphavantage',
      symbol: 'SPY',
      sequence: [
        { status: 200, fixture: 'tests/fixtures/alphavantage-note.sample.json' }
      ]
    },
    {
      provider: 'alphavantage',
      symbol: '*',
      sequence: [
        { status: 200, fixture: 'tests/fixtures/alphavantage-daily-adjusted.sample.json' }
      ]
    },
    {
      provider: 'twelvedata',
      symbol: '*',
      sequence: [
        { status: 200, fixture: 'tests/fixtures/twelvedata-time-series.sample.json' }
      ]
    }
  ];

  const result = runMarketPricesWithMock({
    RV_PRICES_FORCE_REAL: '1',
    RV_PRICES_STUB: '',
    [envVarPrimary]: 'alpha-key',
    [envVarFallback]: 'td-key'
  }, tmpDir, fetchConfig);

  assertEqual(result.status, 0, 'Expected fallback recovery run to succeed');
  const providerHealth = JSON.parse(fs.readFileSync(path.join(tmpDir, 'provider-health.json'), 'utf-8'));
  const alphaEntry = providerHealth.providers.find((entry) => entry.provider_id === primary.id);
  const fallbackEntry = providerHealth.providers.find((entry) => entry.provider_id === fallback.id);
  assert(alphaEntry, 'Expected AlphaVantage health entry');
  assert(fallbackEntry, 'Expected TwelveData health entry');
  assert(alphaEntry.run_health_score < 50, 'Expected Alpha score to dip below 50');
  assert(fallbackEntry.run_health_score > 80, 'Expected fallback score above 80');

  const marketHealth = JSON.parse(fs.readFileSync(path.join(tmpDir, 'market-prices-health.json'), 'utf-8'));
  assert(marketHealth.fallback_usage_ratio > 0, 'Expected fallback usage');
  assertEqual(marketHealth.run_quality, 'OK');
});

const test15 = test('Partial coverage results in DEGRADED run quality', async () => {
  const registry = loadProvidersRegistry();
  const chain = buildProviderChain(registry, 'prices_eod');
  const primary = chain[0];
  const fallback = chain.find((provider) => provider.role === 'fallback');
  if (!fallback) throw new Error('Fallback provider missing');
  const envVarPrimary = primary.auth_env_var;
  const envVarFallback = fallback.auth_env_var;
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rv-market-prices-real-health-partial-'));

  const fetchConfig = [
    {
      provider: 'alphavantage',
      symbol: 'SPY',
      sequence: [
        { status: 200, fixture: 'tests/fixtures/alphavantage-daily-adjusted.sample.json' }
      ]
    },
    {
      provider: 'alphavantage',
      symbol: 'QQQ',
      sequence: [
        { status: 200, fixture: 'tests/fixtures/alphavantage-daily-adjusted.sample.json' }
      ]
    },
    {
      provider: 'alphavantage',
      symbol: 'DIA',
      sequence: [
        { status: 200, fixture: 'tests/fixtures/alphavantage-note.sample.json' }
      ]
    },
    {
      provider: 'alphavantage',
      symbol: 'IWM',
      sequence: [
        { status: 200, fixture: 'tests/fixtures/alphavantage-note.sample.json' }
      ]
    },
    {
      provider: 'twelvedata',
      symbol: 'DIA',
      sequence: [
        { status: 500 }
      ]
    },
    {
      provider: 'twelvedata',
      symbol: 'IWM',
      sequence: [
        { status: 500 }
      ]
    }
  ];

  const result = runMarketPricesWithMock({
    RV_PRICES_FORCE_REAL: '1',
    RV_PRICES_STUB: '',
    [envVarPrimary]: 'alpha-key',
    [envVarFallback]: 'td-key'
  }, tmpDir, fetchConfig);

  assertEqual(result.status, 0, 'Expected partial run to exit zero with WARN status');
  const marketHealth = JSON.parse(fs.readFileSync(path.join(tmpDir, 'market-prices-health.json'), 'utf-8'));
  assertEqual(marketHealth.run_quality, 'DEGRADED');
  assertEqual(marketHealth.symbols_resolved, 2);
  assert(marketHealth.reason_summary.NETWORK_ERROR >= 2, 'Expected at least two network failures');
});

const test16 = test('Zero valid bars yields FAILED run quality', async () => {
  const registry = loadProvidersRegistry();
  const chain = buildProviderChain(registry, 'prices_eod');
  const primary = chain[0];
  const fallback = chain.find((provider) => provider.role === 'fallback');
  if (!fallback) throw new Error('Fallback provider missing');
  const envVarPrimary = primary.auth_env_var;
  const envVarFallback = fallback.auth_env_var;
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rv-market-prices-real-health-zero-'));

  const fetchConfig = [
    {
      provider: 'alphavantage',
      symbol: '*',
      sequence: [
        { status: 200, fixture: 'tests/fixtures/alphavantage-note.sample.json' }
      ]
    },
    {
      provider: 'twelvedata',
      symbol: '*',
      sequence: [
        { status: 500 }
      ]
    }
  ];

  const result = runMarketPricesWithMock({
    RV_PRICES_FORCE_REAL: '1',
    RV_PRICES_STUB: '',
    [envVarPrimary]: 'alpha-key',
    [envVarFallback]: 'td-key'
  }, tmpDir, fetchConfig);

  assert(result.status !== 0, 'Expected zero-bar run to fail');
  const marketHealth = JSON.parse(fs.readFileSync(path.join(tmpDir, 'market-prices-health.json'), 'utf-8'));
  assertEqual(marketHealth.run_quality, 'FAILED');
  assertEqual(marketHealth.symbols_resolved, 0);
  const providerHealth = JSON.parse(fs.readFileSync(path.join(tmpDir, 'provider-health.json'), 'utf-8'));
  assert(providerHealth.providers.length >= 1, 'Expected provider health artifact present');
});

const tests = [
  test1,
  test2,
  test3,
  test3a,
  test4,
  test5,
  test6,
  test7,
  test8,
  test9,
  test10,
  test11,
  test12,
  testForceAlphaSuccess,
  testForceAlphaFail,
  testForceTwelveDataSuccess,
  testForceTwelveDataFail,
  test13,
  test14,
  test15,
  test16
];

(async () => {
  for (const t of tests) {
    await t();
  }

  console.log(`\nTests complete: ${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
})();
