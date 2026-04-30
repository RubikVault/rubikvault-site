import test from 'node:test';
import assert from 'node:assert/strict';

import { onRequestGet } from '../functions/api/universe.js';

const usVisa = {
  canonical_id: 'US:V',
  symbol: 'V',
  exchange: 'US',
  name: 'Visa Inc',
  type_norm: 'STOCK',
  layer: 'L0_LEGACY_CORE',
  score_0_100: 55,
  bars_count: 19,
  avg_volume_30d: 8300000,
};

const brazilVisa = {
  canonical_id: 'SA:VISA34',
  symbol: 'VISA34',
  exchange: 'SA',
  name: 'Visa Inc',
  type_norm: 'STOCK',
  layer: 'L1_FULL',
  score_0_100: 94,
  bars_count: 1200,
  avg_volume_30d: 12000,
};

const canadaVisa = {
  canonical_id: 'TO:VISA',
  symbol: 'VISA',
  exchange: 'TO',
  name: 'Visa CDR',
  type_norm: 'STOCK',
  layer: 'L1_FULL',
  score_0_100: 89,
  bars_count: 900,
  avg_volume_30d: 25000,
};

const usFord = {
  canonical_id: 'US:F',
  symbol: 'F',
  exchange: 'US',
  name: 'Ford Motor Company',
  type_norm: 'STOCK',
  layer: 'L0_LEGACY_CORE',
  avg_volume_30d: 62000000,
};

const usTesla = {
  canonical_id: 'US:TSLA',
  symbol: 'TSLA',
  exchange: 'US',
  name: 'Tesla Inc',
  type_norm: 'STOCK',
  layer: 'L0_LEGACY_CORE',
  avg_volume_30d: 94000000,
};

function jsonResponse(payload) {
  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

test('universe v7 API search keeps name matches and ranks US Visa first for visa query', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (rawUrl) => {
    const url = new URL(String(rawUrl));
    if (url.pathname === '/data/universe/v7/search/search_index_manifest.json') {
      return jsonResponse({ schema: 'rv_v7_search_manifest_v1', buckets: { vis: true } });
    }
    if (url.pathname === '/data/universe/v7/search/buckets/vis.json.gz') {
      return jsonResponse({
        schema: 'rv_v7_search_bucket_v1',
        items: [brazilVisa, canadaVisa, usVisa],
      });
    }
    if (url.pathname === '/data/universe/v7/search/search_global_top_2000.json.gz') {
      return jsonResponse({ schema: 'rv_v7_search_top_v1', items: [] });
    }
    return new Response('not found', { status: 404 });
  };

  try {
    const res = await onRequestGet({
      request: new Request('https://rubikvault.test/api/universe?q=visa&limit=5'),
    });
    assert.equal(res.status, 200);
    const payload = await res.json();
    const symbols = payload?.data?.symbols;
    assert.equal(Array.isArray(symbols), true);
    assert.equal(symbols[0]?.canonical_id, 'US:V');
    assert.equal(symbols[0]?.symbol, 'V');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('universe v7 API search uses protected fallbacks when buckets/global miss protected majors', async () => {
  const originalFetch = globalThis.fetch;
  let exactIndexFetches = 0;
  globalThis.fetch = async (rawUrl) => {
    const url = new URL(String(rawUrl));
    if (url.pathname === '/data/universe/v7/search/search_exact_by_symbol.json.gz') {
      exactIndexFetches += 1;
      return new Response('exact index should not be loaded for normal protected search', { status: 500 });
    }
    if (url.pathname === '/data/universe/v7/search/search_index_manifest.json') {
      return jsonResponse({ schema: 'rv_v7_search_manifest_v1', buckets: {} });
    }
    if (url.pathname.includes('/search_global_top_')) {
      return jsonResponse({ schema: 'rv_v7_search_top_v1', items: [] });
    }
    return new Response('not found', { status: 404 });
  };

  try {
    for (const [query, expected] of [['ford', 'US:F'], ['tesl', 'US:TSLA'], ['tesla', 'US:TSLA']]) {
      const res = await onRequestGet({
        request: new Request(`https://rubikvault.test/api/universe?q=${query}&limit=5`),
      });
      assert.equal(res.status, 200);
      const payload = await res.json();
      assert.equal(payload?.data?.symbols?.[0]?.canonical_id, expected);
    }
    assert.equal(exactIndexFetches, 0);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
