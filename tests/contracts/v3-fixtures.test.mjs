import test from 'node:test';
import assert from 'node:assert/strict';
import { execSync } from 'node:child_process';

test('v3 fixture contracts validate', () => {
  const out = execSync('node scripts/contracts/validate-v3-fixtures.mjs', { encoding: 'utf8' });
  assert.match(out, /V3_FIXTURE_CONTRACTS_OK/);
});
