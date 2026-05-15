import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(new URL('../..', import.meta.url).pathname);
const SCRIPT = fs.readFileSync(path.join(ROOT, 'scripts/build-best-setups-v4.mjs'), 'utf8');

test('best-setups v4 consumes decision bundle BUY rows without unverified fallback', () => {
  assert.match(SCRIPT, /if \(decisionBundleMode\) \{/);
  assert.doesNotMatch(SCRIPT, /falling through to QuantLab\/forecast path/);
  assert.match(SCRIPT, /'decision_bundle_consumer'/);
});

test('best-setups v4 preserves decision confidence, freshness, reasons, and module evidence', () => {
  assert.match(SCRIPT, /const confidence = String\(decision\?\.confidence \|\| ''\)\.toUpperCase\(\)/);
  assert.doesNotMatch(SCRIPT, /confidence: 'HIGH'/);
  assert.match(SCRIPT, /staleFlags\.length > 0 \|\| blockingReasons\.length > 0/);
  assert.match(SCRIPT, /decision\?\.buy_eligibility\?\.eligible !== true/);
  assert.match(SCRIPT, /decision_reasons: Array\.isArray\(decision\.reasons\)/);
  assert.match(SCRIPT, /module_contributions: decision\.module_contributions \|\| null/);
});

test('decision-core best-setups only publishes true BUY rows for each horizon', () => {
  assert.match(SCRIPT, /horizon_actions:/);
  assert.match(SCRIPT, /horizon_reliability:/);
  assert.match(SCRIPT, /short: String\(decision\?\.horizons\?\.short_term\?\.horizon_action/);
  assert.match(SCRIPT, /medium: String\(decision\?\.horizons\?\.mid_term\?\.horizon_action/);
  assert.match(SCRIPT, /long: String\(decision\?\.horizons\?\.long_term\?\.horizon_action/);
  assert.match(SCRIPT, /rowQualifiesForHorizon\(row, horizon\)/);
  assert.match(SCRIPT, /function isHorizonBuyAction/);
  assert.match(SCRIPT, /\['BUY', 'HIGH'\]\.includes/);
  assert.match(SCRIPT, /return isHorizonBuyAction\(actions\[horizon\]\)/);
  assert.doesNotMatch(SCRIPT, /decision_core_primary_buy_horizon_rank/);
  assert.doesNotMatch(SCRIPT, /BEST_SETUPS_REQUIRE_HORIZON_ACTION/);
  assert.doesNotMatch(SCRIPT, /return !action \|\| action === 'BUY'/);
});

test('best-setups v4 publishes horizon diagnostics and rank basis', () => {
  assert.match(SCRIPT, /function horizonDiagnostics/);
  assert.match(SCRIPT, /function assertHorizonDiversity/);
  assert.match(SCRIPT, /BEST_SETUPS_HORIZON_DIVERSITY_FAILED/);
  assert.match(SCRIPT, /candidate_pool_size/);
  assert.match(SCRIPT, /overlap_count/);
  assert.match(SCRIPT, /horizon_diagnostics: horizonDiagnosticsSummary/);
  assert.match(SCRIPT, /rank_basis: 'horizon_probability_expected_gain'/);
  assert.match(SCRIPT, /horizon_signal_basis/);
});

test('best-setups v4 keeps horizon cards ordered by probability then gain', () => {
  assert.match(SCRIPT, /function compareHorizonRankRows/);
  assert.match(SCRIPT, /rank_probability/);
  assert.match(SCRIPT, /expected_return/);
  assert.match(SCRIPT, /num\(row\.expected_return\) > 0/);
  assert.match(SCRIPT, /selected\.slice\(0, BEST_SETUP_LIMIT\)\.sort\(compareHorizonRankRows\)/);
});

test('decision-core source uses page-core guard for enrichment only', () => {
  assert.match(SCRIPT, /guard_mode = 'enrich_only'/);
  assert.match(SCRIPT, /enriched_buy_rows/);
  assert.match(SCRIPT, /market_data_as_of: row\.market_data_as_of \|\| marketDataAsOf/);
  assert.match(SCRIPT, /if \(!pageCoreGuard\?\.available\) \{\s*buyRows = await enrichDecisionRowsFromLocalUniverse\(buyRows\);/s);
  assert.doesNotMatch(
    SCRIPT,
    /buyRows = buyRows\.filter\(\(row\) => pageCoreGuard\.buy_ids\.has/,
    'decision-core BUY rows must not be filtered by page-core summary state',
  );
});
