import test from 'node:test';
import assert from 'node:assert/strict';
import { gzipDeterministic, sha256Buffer } from '../../scripts/lib/v3/gzip-deterministic.mjs';

test('gzipDeterministic yields stable bytes', () => {
  const payload = Buffer.from('{"a":1}\n', 'utf8');
  const a = gzipDeterministic(payload);
  const b = gzipDeterministic(payload);
  assert.equal(sha256Buffer(a), sha256Buffer(b));
});
