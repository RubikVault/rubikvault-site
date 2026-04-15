import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(new URL('..', import.meta.url).pathname, '..');

test('overnight autopilot writes hardened nightly status semantics', () => {
  const filePath = path.join(ROOT, 'scripts/stock-analyzer/run_overnight_autopilot.sh');
  const content = fs.readFileSync(filePath, 'utf8');
  for (const token of ['step_class', 'blocking_failures', 'advisory_failures']) {
    assert.equal(content.includes(token), true, token);
  }
  assert.equal(content.includes('final_rc == 0 and not blocking_failures'), true);
});

test('nightly status artifact exposes hardened nightly fields', () => {
  const filePath = path.join(ROOT, 'public/data/reports/nightly-stock-analyzer-status.json');
  const doc = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  assert.equal(typeof doc.step_class, 'string');
  assert.equal(Array.isArray(doc.blocking_failures), true);
  assert.equal(Array.isArray(doc.advisory_failures), true);
  assert.equal(Array.isArray(doc.stepResults), true);
});
