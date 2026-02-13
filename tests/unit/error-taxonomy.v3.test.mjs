import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyError } from '../../scripts/lib/v3/error-taxonomy.mjs';

const policy = {
  actions: {
    auth_missing: 'circuit_open',
    schema_violation: 'discard_batch_use_last_good'
  },
  taxonomy: {
    transient: ['timeout'],
    permanent: ['auth_missing'],
    data_quality: ['schema_violation']
  }
};

test('classifyError detects auth as permanent', () => {
  const out = classifyError(new Error('API key missing'), policy);
  assert.equal(out.kind, 'permanent');
});

test('classifyError detects schema errors as data_quality', () => {
  const out = classifyError(new Error('schema mismatch'), policy);
  assert.equal(out.kind, 'data_quality');
});
