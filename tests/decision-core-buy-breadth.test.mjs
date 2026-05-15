import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveBreadthTargets } from '../scripts/decision-core/build-buy-breadth-proof.mjs';

const ENV_KEYS = [
  'RV_BUY_BREADTH_AVAILABLE_REGION_TARGET',
  'RV_BUY_BREADTH_DISPLAY_REGION_TARGET',
  'RV_BUY_BREADTH_AVAILABLE_US_TARGET',
  'RV_BUY_BREADTH_AVAILABLE_EU_TARGET',
  'RV_BUY_BREADTH_AVAILABLE_ASIA_TARGET',
  'RV_BUY_BREADTH_DISPLAY_US_TARGET',
  'RV_BUY_BREADTH_DISPLAY_EU_TARGET',
  'RV_BUY_BREADTH_DISPLAY_ASIA_TARGET',
];

function withEnv(envOverrides, fn) {
  const saved = {};
  for (const k of ENV_KEYS) {
    saved[k] = process.env[k];
    delete process.env[k];
  }
  for (const [k, v] of Object.entries(envOverrides)) {
    if (v === null || v === undefined) delete process.env[k];
    else process.env[k] = String(v);
  }
  try {
    return fn();
  } finally {
    for (const k of ENV_KEYS) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
  }
}

test('default unset env returns global defaults (avail=10, display=5)', () => {
  withEnv({}, () => {
    const r = resolveBreadthTargets({ availableUs: 50, availableEu: 50, availableAsia: 50 });
    assert.equal(r.availableRegionTargets.US, 10);
    assert.equal(r.availableRegionTargets.EU, 10);
    assert.equal(r.availableRegionTargets.ASIA, 10);
    assert.equal(r.displayRegionTargets.US, 5);
    assert.equal(r.displayRegionTargets.EU, 5);
    assert.equal(r.displayRegionTargets.ASIA, 5);
  });
});

test('target clamped by available count', () => {
  withEnv({}, () => {
    const r = resolveBreadthTargets({ availableUs: 20, availableEu: 3, availableAsia: 10 });
    // Display target=5 but EU only has 3 available → min(5,3)=3
    assert.equal(r.displayRegionTargets.EU, 3);
    assert.equal(r.displayRegionTargets.US, 5);
    assert.equal(r.displayRegionTargets.ASIA, 5);
  });
});

test('per-region DISPLAY_EU_TARGET overrides global default', () => {
  withEnv({ RV_BUY_BREADTH_DISPLAY_EU_TARGET: 2 }, () => {
    const r = resolveBreadthTargets({ availableUs: 50, availableEu: 50, availableAsia: 50 });
    assert.equal(r.displayRegionTargets.EU, 2);
    // others stay at global default 5
    assert.equal(r.displayRegionTargets.US, 5);
    assert.equal(r.displayRegionTargets.ASIA, 5);
  });
});

test('per-region AVAILABLE_ASIA_TARGET overrides global default', () => {
  withEnv({ RV_BUY_BREADTH_AVAILABLE_ASIA_TARGET: 3 }, () => {
    const r = resolveBreadthTargets({ availableUs: 20, availableEu: 20, availableAsia: 20 });
    assert.equal(r.availableRegionTargets.ASIA, 3);
    assert.equal(r.availableRegionTargets.US, 10);
    assert.equal(r.availableRegionTargets.EU, 10);
  });
});

test('global RV_BUY_BREADTH_DISPLAY_REGION_TARGET propagates to all regions when per-region unset', () => {
  withEnv({ RV_BUY_BREADTH_DISPLAY_REGION_TARGET: 3 }, () => {
    const r = resolveBreadthTargets({ availableUs: 50, availableEu: 50, availableAsia: 50 });
    assert.equal(r.displayRegionTargets.US, 3);
    assert.equal(r.displayRegionTargets.EU, 3);
    assert.equal(r.displayRegionTargets.ASIA, 3);
  });
});

test('per-region env wins over global default', () => {
  withEnv({
    RV_BUY_BREADTH_DISPLAY_REGION_TARGET: 5,
    RV_BUY_BREADTH_DISPLAY_EU_TARGET: 2,
    RV_BUY_BREADTH_DISPLAY_ASIA_TARGET: 1,
  }, () => {
    const r = resolveBreadthTargets({ availableUs: 50, availableEu: 50, availableAsia: 50 });
    assert.equal(r.displayRegionTargets.US, 5);
    assert.equal(r.displayRegionTargets.EU, 2);
    assert.equal(r.displayRegionTargets.ASIA, 1);
  });
});

test('zero available leaves target=0 (NONE_AVAILABLE path)', () => {
  withEnv({}, () => {
    const r = resolveBreadthTargets({ availableUs: 0, availableEu: 0, availableAsia: 0 });
    assert.equal(r.availableRegionTargets.US, 0);
    assert.equal(r.availableRegionTargets.EU, 0);
    assert.equal(r.availableRegionTargets.ASIA, 0);
    assert.equal(r.displayRegionTargets.US, 0);
    assert.equal(r.displayRegionTargets.EU, 0);
    assert.equal(r.displayRegionTargets.ASIA, 0);
  });
});

test('invalid env (negative / NaN) falls back to global', () => {
  withEnv({ RV_BUY_BREADTH_DISPLAY_EU_TARGET: '-1' }, () => {
    const r = resolveBreadthTargets({ availableUs: 50, availableEu: 50, availableAsia: 50 });
    // Negative ignored → falls back to global default 5
    assert.equal(r.displayRegionTargets.EU, 5);
  });
  withEnv({ RV_BUY_BREADTH_DISPLAY_EU_TARGET: 'not_a_number' }, () => {
    const r = resolveBreadthTargets({ availableUs: 50, availableEu: 50, availableAsia: 50 });
    assert.equal(r.displayRegionTargets.EU, 5);
  });
});

test('Sprint F F3 catchup scenario: EU display target lowered to 2', () => {
  // Real scenario from 2026-05-14: best-setups-v4 emitted 22 rows total,
  // EU best_setups_present=0 → global display=5 fails. With EU=2, gate passes
  // as long as best-setups produces at least 2 EU display rows.
  withEnv({
    RV_BUY_BREADTH_DISPLAY_EU_TARGET: 2,
    RV_BUY_BREADTH_DISPLAY_ASIA_TARGET: 3,
  }, () => {
    const r = resolveBreadthTargets({ availableUs: 200, availableEu: 50, availableAsia: 80 });
    assert.equal(r.displayRegionTargets.EU, 2);
    assert.equal(r.displayRegionTargets.ASIA, 3);
    assert.equal(r.displayRegionTargets.US, 5);
  });
});
