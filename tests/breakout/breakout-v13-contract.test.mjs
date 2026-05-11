import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';
import Ajv from 'ajv';

const ROOT = path.resolve(new URL('../..', import.meta.url).pathname);

const STATUSES = [
  'UNELIGIBLE',
  'DATA_INSUFFICIENT',
  'NO_SETUP',
  'EARLY_ACCUMULATION',
  'RIGHT_SIDE_BASE',
  'BREAKOUT_READY',
  'BREAKOUT_CONFIRMED',
  'FAILED_BREAKOUT',
  'INVALIDATED',
];

const LEGACY_BY_STATUS = {
  UNELIGIBLE: 'NONE',
  DATA_INSUFFICIENT: 'NONE',
  NO_SETUP: 'NONE',
  EARLY_ACCUMULATION: 'SETUP',
  RIGHT_SIDE_BASE: 'SETUP',
  BREAKOUT_READY: 'ARMED',
  BREAKOUT_CONFIRMED: 'CONFIRMED',
  FAILED_BREAKOUT: 'FAILED',
  INVALIDATED: 'FAILED',
};

function itemFor(status, index) {
  const supportZone = index % 2 === 0 ? {
    detected: true,
    center: 100,
    low: 98,
    high: 102,
    width_pct: 0.04,
    test_count: 3,
    base_age_bars: 54,
    failed_low_count: 1,
    method: 'pivot_cluster_atr_adjusted',
  } : null;
  return {
    event_id: `US:T${index}|2026-04-22|breakout_scoring_v1.3`,
    asset_id: `US:T${index}`,
    symbol: `T${index}`,
    as_of: '2026-04-22',
    asset_class: 'stock',
    region: 'US',
    score_version: 'breakout_scoring_v1.3',
    status,
    breakout_status: status,
    legacy_state: LEGACY_BY_STATUS[status],
    status_reasons: ['contract_fixture'],
    status_explanation: 'Fixture explanation.',
    support_zone: supportZone,
    invalidation: supportZone ? { close_below: 96.5, method: 'support_zone_low_minus_0.5_atr' } : null,
    scores: {
      structure_score: 0.7,
      volume_score: 0.6,
      compression_score: 0.5,
      relative_strength_score: 0.55,
      liquidity_score: 0.9,
      selling_exhaustion_score: 0.4,
      accumulation_proxy_score: 0.45,
      regime_multiplier: 1.0,
      final_signal_score: 0.66,
    },
    features: {},
    risk: {},
    ui: {
      label: 'breakout_candidate',
      rank: index + 1,
      rank_percentile: 1 - index / STATUSES.length,
      status,
      legacy_state: LEGACY_BY_STATUS[status],
    },
    reasons: [],
    warnings: [],
  };
}

test('breakout v1.3 schema locks 9-state status, legacy buckets, support zone, invalidation', () => {
  const ajv = new Ajv({ allErrors: true, strict: false, validateSchema: false });
  const schema = JSON.parse(fs.readFileSync(path.join(ROOT, 'schemas/breakout-v13/top500.schema.json'), 'utf8'));
  const validate = ajv.compile(schema);
  const payload = {
    schema_version: 'breakout_top_scores_v1',
    as_of: '2026-04-22',
    generated_at: '2026-04-22T22:00:00Z',
    score_version: 'breakout_scoring_v1.3',
    count: STATUSES.length + 1,
    items: [...STATUSES.map(itemFor), { ...itemFor('BREAKOUT_READY', STATUSES.length), legacy_state: 'TRIGGERED', ui: { ...itemFor('BREAKOUT_READY', STATUSES.length).ui, legacy_state: 'TRIGGERED' } }],
  };
  assert.equal(validate(payload), true, JSON.stringify(validate.errors || []));
  assert.deepEqual([...new Set(payload.items.map((item) => item.breakout_status))], STATUSES);
  assert.deepEqual(new Set(payload.items.map((item) => item.legacy_state)), new Set(['NONE', 'SETUP', 'ARMED', 'TRIGGERED', 'CONFIRMED', 'FAILED']));
  assert.ok(payload.items.some((item) => item.support_zone?.detected === true));
  assert.ok(payload.items.some((item) => item.invalidation?.close_below));
});

test('legacy_state_from_v13 maps confirmed buckets and transient triggered case', () => {
  const script = `
from scripts.breakout_compute.lib.breakout_math import legacy_state_from_v13
cases = [
  ("UNELIGIBLE", None, None, None, None, "NONE"),
  ("DATA_INSUFFICIENT", None, None, None, None, "NONE"),
  ("NO_SETUP", None, None, None, None, "NONE"),
  ("EARLY_ACCUMULATION", None, None, None, None, "SETUP"),
  ("RIGHT_SIDE_BASE", None, None, None, None, "SETUP"),
  ("BREAKOUT_READY", 99, 100, 2, 1.0, "ARMED"),
  ("BREAKOUT_READY", 101, 100, 2, 1.2, "TRIGGERED"),
  ("BREAKOUT_CONFIRMED", None, None, None, None, "CONFIRMED"),
  ("FAILED_BREAKOUT", None, None, None, None, "FAILED"),
  ("INVALIDATED", None, None, None, None, "FAILED"),
]
for status, close, resistance, atr14, rvol, expected in cases:
    actual = legacy_state_from_v13(status, close, resistance, atr14, rvol)
    assert actual == expected, (status, actual, expected)
`;
  const res = spawnSync('python3', ['-c', script], { cwd: ROOT, encoding: 'utf8' });
  assert.equal(res.status, 0, res.stderr || res.stdout);
});

test('static reader passes V1.3 fields and V2 compat keeps legacy bucket state', async () => {
  const mod = await import(pathToFileURL(path.join(ROOT, 'functions/api/_shared/breakout-v12-static.mjs')).href);
  const item = itemFor('BREAKOUT_READY', 0);
  item.legacy_state = 'ARMED';
  item.ui.legacy_state = 'ARMED';
  const shaped = mod.shapeBreakoutV12Result({
    manifest: { as_of: '2026-04-22', content_hash: 'abc', score_version: 'breakout_scoring_v1.3' },
    top500: { as_of: '2026-04-22', score_version: 'breakout_scoring_v1.3', items: [item] },
    item,
  });
  assert.equal(shaped.breakout_status, 'BREAKOUT_READY');
  assert.equal(shaped.legacy_state, 'ARMED');
  assert.equal(shaped.support_zone.detected, true);
  assert.equal(shaped.invalidation.close_below, 96.5);
  const compat = mod.toBreakoutV2Compat(shaped);
  assert.equal(compat.state, 'ARMED');
  assert.equal(compat.breakout_status, 'BREAKOUT_READY');
  assert.equal(compat.legacy_state, 'ARMED');
});
