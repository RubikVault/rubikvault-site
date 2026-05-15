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

test('historical active setups keeps private stats scan opt-in for nightly safety', () => {
  const builder = fs.readFileSync(path.join(ROOT, 'scripts/historical-insights/build-active-setups.mjs'), 'utf8');
  const supervisor = fs.readFileSync(path.join(ROOT, 'scripts/nas/rv-nas-night-supervisor.sh'), 'utf8');
  assert.match(builder, /RV_HISTORICAL_ACTIVE_SETUPS_PRIVATE_SCAN === '1'/);
  assert.match(builder, /private_stats_scan_enabled/);
  assert.match(supervisor, /RV_HISTORICAL_ACTIVE_SETUPS_PRIVATE_SCAN='\$\{RV_HISTORICAL_ACTIVE_SETUPS_PRIVATE_SCAN:-0\}'/);
});

test('historical active setups reads page-core object-map shards', () => {
  const builder = fs.readFileSync(path.join(ROOT, 'scripts/historical-insights/build-active-setups.mjs'), 'utf8');
  assert.match(builder, /Object\.values\(doc \|\| \{\}\)/);
  assert.match(builder, /row\?\.display_ticker \|\| row\?\.provider_ticker/);
});

test('historical research ranking supports SHORT edges from negative returns', () => {
  const builder = fs.readFileSync(path.join(ROOT, 'scripts/historical-insights/build-active-setups.mjs'), 'utf8');
  const projection = fs.readFileSync(path.join(ROOT, 'scripts/historical-insights/build-projection-from-parquet.mjs'), 'utf8');
  assert.match(builder, /function directionalExpectedReturn/);
  assert.match(builder, /normalizedDirection\(rule\) === 'SHORT' \? Math\.abs\(avg\) : avg/);
  assert.match(projection, /CASE WHEN .* < 0 THEN 'SHORT' ELSE 'LONG' END/);
  assert.match(projection, /ABS\(\$\{rawSignedReturnExpr\}\) > 0/);
});
