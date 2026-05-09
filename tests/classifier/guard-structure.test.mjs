import assert from 'node:assert/strict';
import test from 'node:test';
import { guardStructure } from '../../public/js/stock-data-guard.js';

test('UP below SMA200 is structural contradiction', () => {
  const result = guardStructure({ trend: 'UP' }, { sma20: 120, sma50: 110, sma200: 100 }, 95);
  assert.equal(result.contradiction, true);
  assert.match(result.warning, /SMA200/);
});

test('STRONG_UP below any major MA remains guarded', () => {
  const result = guardStructure({ trend: 'STRONG_UP' }, { sma20: 120, sma50: 110, sma200: 100 }, 115);
  assert.equal(result.contradiction, true);
  assert.match(result.warning, /STRONG_UP/);
});

test('UP pullback above SMA200 is not a contradiction', () => {
  const result = guardStructure({ trend: 'UP' }, { sma20: 120, sma50: 110, sma200: 100 }, 105);
  assert.equal(result.contradiction, false);
});
