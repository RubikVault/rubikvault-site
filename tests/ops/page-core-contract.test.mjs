import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
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

test('page-core builder protects canonical major aliases', () => {
  const content = fs.readFileSync(
    new URL('../../scripts/ops/build-page-core-bundle.mjs', import.meta.url),
    'utf8'
  );
  for (const [alias, canonicalId] of [
    ['AAPL', 'US:AAPL'],
    ['MSFT', 'US:MSFT'],
    ['F', 'US:F'],
    ['V', 'US:V'],
    ['TSLA', 'US:TSLA'],
    ['SPY', 'US:SPY'],
    ['QQQ', 'US:QQQ'],
    ['BRK-B', 'US:BRK-B'],
    ['BRK.B', 'US:BRK.B'],
    ['BF-B', 'US:BF-B'],
    ['BF.B', 'US:BF.B'],
  ]) {
    assert.ok(content.includes(`['${alias}', '${canonicalId}']`), `${alias} must map to ${canonicalId}`);
  }
  assert.match(content, /protected_authoritative_kept/);
});
