import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(new URL('../..', import.meta.url).pathname);
const SCRIPT = fs.readFileSync(path.join(ROOT, 'scripts/build-best-setups-v4.mjs'), 'utf8');

test('best-setups v4 consumes decision bundle BUY rows without unverified fallback', () => {
  assert.match(SCRIPT, /if \(decisionBundleMode\) \{/);
  assert.doesNotMatch(SCRIPT, /falling through to QuantLab\/forecast path/);
  assert.match(SCRIPT, /source: 'decision_bundle_consumer'/);
});

test('best-setups v4 preserves decision confidence, freshness, reasons, and module evidence', () => {
  assert.match(SCRIPT, /const confidence = String\(decision\?\.confidence \|\| ''\)\.toUpperCase\(\)/);
  assert.doesNotMatch(SCRIPT, /confidence: 'HIGH'/);
  assert.match(SCRIPT, /staleFlags\.length > 0 \|\| blockingReasons\.length > 0/);
  assert.match(SCRIPT, /decision\?\.buy_eligibility\?\.eligible !== true/);
  assert.match(SCRIPT, /decision_reasons: Array\.isArray\(decision\.reasons\)/);
  assert.match(SCRIPT, /module_contributions: decision\.module_contributions \|\| null/);
});
