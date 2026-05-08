import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveEligibility } from '../../scripts/decision-core/eligibility.mjs';
import { resolveDecisionGrade } from '../../scripts/decision-core/decision-grade.mjs';
import { readJson, baseRow } from './shared-fixtures.mjs';

const policy = readJson('public/data/decision-core/policies/latest.json');
const featureManifest = readJson('public/data/decision-core/feature-manifests/latest.json');
const reasonRegistry = readJson('public/data/decision-core/reason-codes/latest.json');

function grade(row, extra = {}) {
  const eligibility = resolveEligibility(row, { targetMarketDate: '2026-05-07', policy });
  return resolveDecisionGrade({ eligibility, targetMarketDate: '2026-05-07', policy, featureManifest, reasonRegistry, buyCriticalFeaturesAvailable: true, ...extra });
}

test('decision-grade fixture cases', () => {
  assert.equal(grade(baseRow()).decision_grade, true);
  assert.equal(grade(baseRow({ last_trade_date: '2026-04-01', computed: { staleness_bd: 30 } })).decision_grade, false);
  assert.equal(grade(baseRow(), { policy: null }).decision_grade, false);
  assert.equal(grade(baseRow(), { featureManifest: null }).decision_grade, false);
  assert.equal(grade(baseRow(), { reasonRegistry: null }).decision_grade, false);
  assert.equal(grade(baseRow(), { buyCriticalFeaturesAvailable: false }).decision_grade, false);
  assert.equal(grade(baseRow({ flags: { ghost_price: true } })).decision_grade, false);
  const halted = resolveDecisionGrade({
    eligibility: { ...resolveEligibility(baseRow(), { targetMarketDate: '2026-05-07', policy }), vetos: ['HALTED_RECENTLY'] },
    targetMarketDate: '2026-05-07',
    policy,
    featureManifest,
    reasonRegistry,
    buyCriticalFeaturesAvailable: true,
  });
  assert.equal(halted.decision_grade, false);
});
