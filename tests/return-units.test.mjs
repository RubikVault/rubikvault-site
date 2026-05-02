import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeReturnDecimal, normalizeChangeObject } from '../functions/api/_shared/return-units.js';

describe('normalizeReturnDecimal', () => {
  it('returns ok with value 0 when pct is null (Number(null)=0 is finite)', () => {
    const result = normalizeReturnDecimal({});
    assert.equal(result.value, 0);
    assert.equal(result.status, 'ok');
  });

  it('returns ok when pct is already decimal and matches abs/close', () => {
    // close=100, abs=2 → prevClose=98 → expected = 2/98 ≈ 0.020408
    const result = normalizeReturnDecimal({ pct: 0.020408, abs: 2, close: 100 });
    assert.equal(result.status, 'ok');
    assert.ok(Math.abs(result.value - (2 / 98)) < 0.001);
  });

  it('normalizes percent-unit to decimal when pct looks like percent', () => {
    // close=100, abs=2 → prevClose=98 → expected ≈ 0.020408
    // pct=2.0408 is percent-unit → should be normalized
    const result = normalizeReturnDecimal({ pct: 2.0408, abs: 2, close: 100 });
    assert.equal(result.status, 'normalized_percent_unit');
    assert.ok(Math.abs(result.value - (2 / 98)) < 0.001);
  });

  it('returns mismatch when pct does not match abs/close in either unit', () => {
    const result = normalizeReturnDecimal({ pct: 0.5, abs: 2, close: 100 });
    assert.equal(result.status, 'mismatch');
    assert.equal(result.value, 0.5);
  });

  it('returns ok for small decimal without abs/close', () => {
    const result = normalizeReturnDecimal({ pct: 0.015 });
    assert.equal(result.status, 'ok');
    assert.equal(result.value, 0.015);
  });

  it('flags implausible for |pct| > 1 without abs/close', () => {
    const result = normalizeReturnDecimal({ pct: 3.5 });
    assert.equal(result.status, 'implausible');
    assert.equal(result.value, 3.5);
  });

  it('handles zero abs change correctly', () => {
    const result = normalizeReturnDecimal({ pct: 0, abs: 0, close: 100 });
    assert.equal(result.status, 'ok');
    assert.equal(result.value, 0);
  });

  it('handles negative returns correctly', () => {
    // close=98, abs=-2 → prevClose=100 → expected = -2/100 = -0.02
    const result = normalizeReturnDecimal({ pct: -0.02, abs: -2, close: 98 });
    assert.equal(result.status, 'ok');
    assert.ok(Math.abs(result.value - (-0.02)) < 0.001);
  });

  it('handles NaN pct gracefully', () => {
    const result = normalizeReturnDecimal({ pct: NaN });
    assert.equal(result.value, null);
    assert.equal(result.status, 'missing');
  });

  it('handles prevClose ≤ 0 gracefully (fallback to plausibility)', () => {
    // close=1, abs=2 → prevClose=-1 → prevClose not > 0 → fallback
    const result = normalizeReturnDecimal({ pct: 0.5, abs: 2, close: 1 });
    assert.equal(result.status, 'ok');
    assert.equal(result.value, 0.5);
  });
});

describe('normalizeChangeObject', () => {
  it('enriches change object with normalized pct', () => {
    const result = normalizeChangeObject(
      { daily_change_pct: 0.015, daily_change_abs: 1.5 },
      101.5,
    );
    assert.ok(result.daily_change_pct != null);
    assert.ok(result._rv_return_integrity != null);
    assert.equal(result._rv_return_integrity.status, 'ok');
  });

  it('returns missing when pct is explicitly undefined', () => {
    const result = normalizeReturnDecimal({ pct: undefined });
    assert.equal(result.value, 0);
    assert.equal(result.status, 'ok');
  });

  it('handles empty change object', () => {
    const result = normalizeChangeObject({}, null);
    assert.equal(result._rv_return_integrity.status, 'ok');
    assert.equal(result.pct, 0);
  });
});
