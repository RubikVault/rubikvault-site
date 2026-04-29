import test from 'node:test';
import assert from 'node:assert/strict';
import {
  aliasShardIndex as workerAliasShardIndex,
  pageShardIndex as workerPageShardIndex,
} from '../../functions/api/_shared/page-core-contract.js';
import {
  aliasShardIndex as builderAliasShardIndex,
  pageShardIndex as builderPageShardIndex,
  aliasShardName,
  pageShardName,
} from '../../scripts/lib/page-core-contract.mjs';

test('page-core hash buckets are stable between builder and worker', () => {
  for (const key of ['AAPL', 'BRK-B', 'BRK.B', 'US:BRK-B', 'US:BRK.B']) {
    assert.equal(builderAliasShardIndex(key), workerAliasShardIndex(key));
    assert.equal(builderPageShardIndex(key), workerPageShardIndex(key));
  }
  assert.equal(aliasShardName(0), '00.json.gz');
  assert.equal(pageShardName(0), '000.json.gz');
  assert.equal(pageShardName(255), '255.json.gz');
});
