import test from 'node:test';
import assert from 'node:assert/strict';

import { resolveLocalAssetPaths } from '../../functions/api/_shared/history-store.mjs';

test('history store resolves pack paths against public data and mirror history roots', () => {
  const paths = resolveLocalAssetPaths('/data/eod/history/packs/US/a/reconcile_registry_20260417T200940_aapl_0001.ndjson.gz');
  assert.equal(paths.length, 2);
  assert.match(paths[0], /public\/data\/eod\/history\/packs\/US\/a\/reconcile_registry_20260417T200940_aapl_0001\.ndjson\.gz$/);
  assert.match(paths[1], /mirrors\/universe-v7\/history\/US\/a\/reconcile_registry_20260417T200940_aapl_0001\.ndjson\.gz$/);
});

test('history store keeps ordinary data paths on the public data root only', () => {
  const paths = resolveLocalAssetPaths('/data/v3/eod/US/latest.ndjson.gz');
  assert.equal(paths.length, 1);
  assert.match(paths[0], /public\/data\/v3\/eod\/US\/latest\.ndjson\.gz$/);
});
