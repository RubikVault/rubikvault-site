import test from 'node:test';
import assert from 'node:assert/strict';
import { evidenceBootstrap } from '../../scripts/decision-core/evidence-bootstrap-v1.mjs';
import { resolveHorizonState } from '../../scripts/decision-core/resolve-horizon-state.mjs';

test('long horizon evidence missing only blocks when policy requires long profile', () => {
  const evidence = evidenceBootstrap({ assetId: 'US:TEST', horizon: 'long_term', setup: { primary_setup: 'trend_continuation' }, histProbs: { available: true, latest: { shard_count: 0 }, profiles: new Map() }, features: { bars_count: 300 } });
  assert.equal(evidence.evidence_scope, 'asset_type');
  const required = evidenceBootstrap({ assetId: 'US:TEST', horizon: 'long_term', setup: { primary_setup: 'trend_continuation' }, histProbs: { available: true, latest: { shard_count: 0 }, profiles: new Map() }, features: { bars_count: 300 }, policy: { evidence: { require_long_horizon_profile: true } } });
  assert.equal(required.evidence_scope, 'none');
});

test('long horizon state does not force WAIT when long profile is not required', () => {
  const open = resolveHorizonState({
    horizon: 'long_term',
    baseAction: 'BUY',
    evidence: { evidence_method: 'unavailable' },
    reasonCodes: [],
    reliability: 'MEDIUM',
    policy: { evidence: { require_long_horizon_profile: false } },
  });
  assert.equal(open.horizon_action, 'BUY');
  const required = resolveHorizonState({
    horizon: 'long_term',
    baseAction: 'BUY',
    evidence: { evidence_method: 'unavailable' },
    reasonCodes: [],
    reliability: 'MEDIUM',
    policy: { evidence: { require_long_horizon_profile: true } },
  });
  assert.equal(required.horizon_action, 'WAIT');
});
