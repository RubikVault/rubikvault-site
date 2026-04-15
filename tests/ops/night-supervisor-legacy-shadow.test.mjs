import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(new URL('../..', import.meta.url).pathname);

test('night supervisor does not write to authoritative release-state path', () => {
  const content = fs.readFileSync(path.join(ROOT, 'scripts/ops/run-night-supervisor.mjs'), 'utf8');
  assert.equal(content.includes("public/data/ops/release-state-latest.json"), false,
    'night-supervisor must not reference the authoritative release-state path');
  assert.equal(content.includes('recordLegacyShadowWrite'), false,
    'night-supervisor must not call recordLegacyShadowWrite — it is observer-only');
});
