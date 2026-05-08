import test from 'node:test';
import assert from 'node:assert/strict';
import { evidenceBootstrap } from '../../scripts/decision-core/evidence-bootstrap-v1.mjs';

test('long horizon evidence missing blocks long BUY proof', () => {
  const evidence = evidenceBootstrap({ assetId: 'US:TEST', horizon: 'long_term', setup: { primary_setup: 'trend_continuation' }, histProbs: { available: true, latest: { shard_count: 0 }, profiles: new Map() }, features: { bars_count: 300 } });
  assert.equal(evidence.evidence_scope, 'none');
});
