import test from 'node:test';
import assert from 'node:assert/strict';
import { gzipSync } from 'node:zlib';

import { getStaticBars, resolveLocalAssetPaths } from '../../functions/api/_shared/history-store.mjs';

test('history store resolves pack paths against public data and mirror history roots', () => {
  const paths = resolveLocalAssetPaths('/data/eod/history/packs/US/a/reconcile_registry_20260417T200940_aapl_0001.ndjson.gz');
  assert.equal(paths.length, 3);
  assert.match(paths[0], /public\/data\/eod\/history\/packs\/US\/a\/reconcile_registry_20260417T200940_aapl_0001\.ndjson\.gz$/);
  assert.match(paths[1], /mirrors\/universe-v7\/history\/US\/a\/reconcile_registry_20260417T200940_aapl_0001\.ndjson\.gz$/);
  assert.match(paths[2], /mirrors\/universe-v7\/history\/history\/US\/a\/reconcile_registry_20260417T200940_aapl_0001\.ndjson\.gz$/);
});

test('history store keeps ordinary data paths on the public data root only', () => {
  const paths = resolveLocalAssetPaths('/data/v3/eod/US/latest.ndjson.gz');
  assert.equal(paths.length, 1);
  assert.match(paths[0], /public\/data\/v3\/eod\/US\/latest\.ndjson\.gz$/);
});

test('history store reads compact gzip public history shards before legacy json shards', async () => {
  const bars = Array.from({ length: 65 }, (_, index) => [
    new Date(Date.UTC(2026, 0, index + 1)).toISOString().slice(0, 10),
    100 + index,
    101 + index,
    99 + index,
    100.5 + index,
    100.5 + index,
    1000 + index,
  ]);
  const gzPayload = gzipSync(Buffer.from(JSON.stringify({ HOOD: bars })));
  const requested = [];
  const assetFetcher = {
    async fetch(url) {
      const pathname = new URL(url).pathname;
      requested.push(pathname);
      if (pathname === '/data/eod/history/shards/H.json.gz') {
        return new Response(gzPayload, {
          status: 200,
          headers: { 'content-type': 'application/gzip' },
        });
      }
      if (pathname === '/data/eod/history/shards/H.json') {
        return Response.json({ HOOD: bars.slice(0, 3) });
      }
      return new Response('', { status: 404 });
    },
  };

  const resolved = await getStaticBars('HOOD', 'https://example.test', assetFetcher);
  assert.equal(resolved.length, 65);
  assert.equal(resolved.at(-1).close, 164.5);
  assert.ok(!requested.includes('/data/eod/history/pack-manifest.us-eu.lookup.json'));
  assert.ok(!requested.includes('/data/eod/history/pack-manifest.us-eu.json'));
});

test('history store resolves known exchange suffixes to shard symbols', async () => {
  const bars = Array.from({ length: 65 }, (_, index) => [
    new Date(Date.UTC(2026, 0, index + 1)).toISOString().slice(0, 10),
    200 + index,
    201 + index,
    199 + index,
    200.5 + index,
    200.5 + index,
    2000 + index,
  ]);
  const gzPayload = gzipSync(Buffer.from(JSON.stringify({ ASML: bars })));
  const assetFetcher = {
    async fetch(url) {
      const pathname = new URL(url).pathname;
      if (pathname === '/data/eod/history/shards/A.json.gz') {
        return new Response(gzPayload, {
          status: 200,
          headers: { 'content-type': 'application/gzip' },
        });
      }
      return new Response('', { status: 404 });
    },
  };

  const resolved = await getStaticBars('ASML.AS', 'https://example.test', assetFetcher);
  assert.equal(resolved.length, 65);
  assert.equal(resolved.at(-1).close, 264.5);
});
