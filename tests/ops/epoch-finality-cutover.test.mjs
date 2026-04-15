import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(new URL('../..', import.meta.url).pathname);

test('forecast same-day finality is routed through the epoch helper', () => {
  const directConsumers = [
    'scripts/forecast/run_daily.mjs',
    'scripts/forecast/maturity-lookup.mjs',
  ];
  for (const relativePath of directConsumers) {
    const filePath = path.join(ROOT, relativePath);
    const content = fs.readFileSync(filePath, 'utf8');
    assert.equal(content.includes('canEvaluateOutcomeDate'), true, relativePath);
  }
  const delegatedConsumer = fs.readFileSync(path.join(ROOT, 'scripts/forecast/backfill_outcomes.mjs'), 'utf8');
  assert.equal(delegatedConsumer.includes('resolveMaturityPricePair'), true);
});

test('finality helper is the only forecast module that reads epoch.json directly', () => {
  const forecastDir = path.join(ROOT, 'scripts/forecast');
  const entries = fs.readdirSync(forecastDir).filter((name) => name.endsWith('.mjs'));
  const allowedDirectReaders = new Set(['finality.mjs', 'build_stock_analyzer_probability_calibration.mjs']);
  for (const entry of entries) {
    const filePath = path.join(forecastDir, entry);
    const content = fs.readFileSync(filePath, 'utf8');
    if (allowedDirectReaders.has(entry)) {
      assert.equal(content.includes('public/data/pipeline/epoch.json'), true);
      continue;
    }
    assert.equal(content.includes('public/data/pipeline/epoch.json'), false, entry);
  }
});
