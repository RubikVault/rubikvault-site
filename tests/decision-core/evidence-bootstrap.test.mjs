import test from 'node:test';
import assert from 'node:assert/strict';
import { evidenceBootstrap } from '../../scripts/decision-core/evidence-bootstrap-v1.mjs';

test('long-term BUY evidence is unavailable without long-horizon support', () => {
  const out = evidenceBootstrap({ assetId: 'US:TEST', horizon: 'long_term', setup: { primary_setup: 'trend_continuation' }, histProbs: { available: false }, features: { bars_count: 300 } });
  assert.equal(out.evidence_method, 'unavailable');
  assert.equal(out.evidence_effective_n, 0);
});
