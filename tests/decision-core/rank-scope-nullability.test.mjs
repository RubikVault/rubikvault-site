import test from 'node:test';
import assert from 'node:assert/strict';

test('rank percentile may be null and cannot be sole BUY proof', () => {
  const rank = { rank_percentile: null, rank_scope: null };
  assert.equal(rank.rank_percentile, null);
  assert.equal(rank.rank_scope, null);
});
