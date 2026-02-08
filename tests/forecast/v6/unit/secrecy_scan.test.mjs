import { test } from 'node:test';
import assert from 'node:assert/strict';

import { runSecrecyScan } from '../../../../scripts/forecast/v6/lib/secrecy_scan.mjs';

test('secrecy scan returns structured result', () => {
  const result = runSecrecyScan({ repoRoot: process.cwd(), mode: 'LOCAL' });
  assert.equal(typeof result.pass, 'boolean');
  assert.ok(Array.isArray(result.findings));
  assert.equal(typeof result.scanned_files, 'number');
});
