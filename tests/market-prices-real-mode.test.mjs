#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawnSync } from 'node:child_process';

import { normalizeAlphaVantageDailyAdjusted } from '../scripts/providers/market-prices-v3.mjs';

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

const tests = [test1, test2, test3];

(async () => {
  for (const t of tests) {
    await t();
  }

  console.log(`\nTests complete: ${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
})();
