import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import Ajv2020 from 'ajv/dist/2020.js';

const ROOT = path.resolve(new URL('../..', import.meta.url).pathname);

function sampleSetup(overrides = {}) {
  return {
    asset_id: 'US:TEST',
    ticker: 'TEST',
    exchange: 'US',
    region: 'US',
    asset_class: 'STOCK',
    direction: 'LONG',
    pattern_id: 'rsi14_bin_50_70',
    label: 'Rsi14 Bin 50 70',
    horizon: '20d',
    win_rate: 0.62,
    wilson_low: 0.57,
    rank_probability: 0.57,
    expected_gain_pct: 4.2,
    n: 180,
    sample_size: 180,
    avg_signed_return: 0.042,
    rank_score: 66.4,
    route: '/analyze/US:TEST',
    explanation: 'Rsi14 Bin 50 70 is active today. Historical LONG edge at 20d.',
    ...overrides,
  };
}

test('historical-setups schema accepts filterable leaderboards', () => {
  const schema = JSON.parse(fs.readFileSync(path.join(ROOT, 'schemas/historical-setups-today.v1.json'), 'utf8'));
  const ajv = new Ajv2020({ strict: false, allErrors: true });
  const validate = ajv.compile(schema);
  const payload = {
    schema: 'rv.historical_setups_today.v1',
    generated_at: '2026-05-15T07:00:00.000Z',
    regions: {
      US: { long: [sampleSetup()], short: [] },
      EU: { long: [], short: [] },
      ASIA: { long: [], short: [] },
    },
    leaderboards: {
      ALL: { ALL: { long: [sampleSetup()], short: [sampleSetup({ direction: 'SHORT', expected_gain_pct: 3.1 })] } },
      US: { STOCK: { long: [sampleSetup()], short: [] } },
      EU: { ETF: { long: [], short: [] } },
      ASIA: { INDEX: { long: [], short: [] } },
    },
  };
  assert.equal(validate(payload), true, JSON.stringify(validate.errors, null, 2));
});

test('frontpage renders historical research filters from historical-setups leaderboards', () => {
  const html = fs.readFileSync(path.join(ROOT, 'public/index.html'), 'utf8');
  assert.match(html, /Historical research insights/);
  assert.match(html, /historical-research-region-filter/);
  assert.match(html, /historical-research-class-filter/);
  assert.match(html, /payload\.leaderboards/);
  assert.match(html, /Top 20/);
  assert.match(html, /Probability/);
  assert.match(html, /Expected gain/);
  assert.match(html, /Open/);
  assert.match(html, /expected_gain_pct/);
});
