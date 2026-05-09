import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { evidenceBootstrap, loadHistProbsPublic } from '../../scripts/decision-core/evidence-bootstrap-v1.mjs';

test('long-term BUY evidence is unavailable without long-horizon support', () => {
  const out = evidenceBootstrap({ assetId: 'US:TEST', horizon: 'long_term', setup: { primary_setup: 'trend_continuation' }, histProbs: { available: false }, features: { bars_count: 300 } });
  assert.equal(out.evidence_method, 'unavailable');
  assert.equal(out.evidence_effective_n, 0);
});

test('hist-probs public projection json shards provide effective evidence', () => {
  if (!fs.existsSync('public/data/hist-probs-public/latest.json')) return;
  const out = evidenceBootstrap({
    assetId: 'HK:3816',
    horizon: 'mid_term',
    setup: { primary_setup: 'trend_continuation' },
    histProbs: loadHistProbsPublic(),
    features: { bars_count: 300 },
  });
  assert.equal(out.evidence_method, 'hist_probs_v2_bootstrap');
  assert.ok(out.evidence_effective_n > 0);
  assert.equal(out.raw_profile?.lookup_key, '3816');
});
