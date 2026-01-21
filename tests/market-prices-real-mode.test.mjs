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

function runMarketPricesWithMock(envOverrides, outDir, payloadPath) {
  const env = { ...process.env, ...envOverrides };
  if (outDir) env.RV_ARTIFACT_OUT_DIR = outDir;
  env.RV_TEST_PAYLOAD_PATH = payloadPath;
  const inlineScript = `
import fs from 'node:fs';
const payload = fs.readFileSync(process.env.RV_TEST_PAYLOAD_PATH, 'utf-8');
global.fetch = async () => ({
  ok: true,
  status: 200,
  headers: { get: () => null },
  text: async () => payload
});
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
  assertEqual(classified.note, payload.Note.trim());
});

const test5 = test('Classify AlphaVantage Error Message payload → error payload', async () => {
  const fixturePath = path.join(process.cwd(), 'tests', 'fixtures', 'alphavantage-error-message.sample.json');
  const payload = JSON.parse(fs.readFileSync(fixturePath, 'utf-8'));
  const classified = classifyAlphaVantagePayload(payload);
  assert(classified, 'Expected classification');
  assertEqual(classified.kind, 'Error Message');
  assertEqual(classified.note, payload['Error Message'].trim());
});

const test6 = test('REAL mode error payload → fail loud with upstream metadata', async () => {
  const registry = loadProvidersRegistry();
  const provider = selectProviderConfig(registry);
  const envVar = provider.auth_env_var;
  const fixturePath = path.join(process.cwd(), 'tests', 'fixtures', 'alphavantage-note.sample.json');

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rv-market-prices-real-note-'));
  const result = runMarketPricesWithMock({
    RV_PRICES_FORCE_REAL: '1',
    RV_PRICES_STUB: '',
    [envVar]: 'dummy'
  }, tmpDir, fixturePath);

  assert(result.status !== 0, 'Expected non-zero exit code');
  const snapshot = JSON.parse(fs.readFileSync(path.join(tmpDir, 'snapshot.json'), 'utf-8'));
  const state = JSON.parse(fs.readFileSync(path.join(tmpDir, 'module-state.json'), 'utf-8'));

  assertEqual(snapshot.metadata.provider, 'alphavantage');
  assertEqual(snapshot.metadata.compute?.reason, 'NO_VALID_BARS');
  assertEqual(snapshot.metadata.upstream?.error, 'ALPHAVANTAGE_ERROR_PAYLOAD');
  assertEqual(snapshot.metadata.upstream?.http_status, 200);
  assert(snapshot.metadata.upstream?.symbol_errors?.SPY, 'Expected symbol error for SPY');
  assertEqual(state.status, 'error');
  assertEqual(state.failure?.class, 'NO_VALID_BARS');
});

const tests = [test1, test2, test3, test4, test5, test6];

(async () => {
  for (const t of tests) {
    await t();
  }

  console.log(`\nTests complete: ${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
})();
