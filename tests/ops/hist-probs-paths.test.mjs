import test from 'node:test';
import assert from 'node:assert/strict';

import { buildHistProbsCandidatePaths } from '../../functions/api/_shared/hist-probs-paths.js';

test('hist-probs readers prefer bucket shard before stale flat compatibility path', () => {
  assert.deepEqual(buildHistProbsCandidatePaths('AAPL'), [
    '/data/hist-probs/AA/AAPL.json',
    '/public/data/hist-probs/AA/AAPL.json',
    '/data/hist-probs/AAPL.json',
    '/public/data/hist-probs/AAPL.json',
  ]);
});
