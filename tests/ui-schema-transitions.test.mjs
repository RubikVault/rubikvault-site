import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

import {
  shapeBreakoutV12Result,
  toBreakoutV2Compat,
} from '../functions/api/_shared/breakout-v12-static.mjs';

const ROOT = path.resolve(new URL('.', import.meta.url).pathname, '..');

function readText(relPath) {
  return fs.readFileSync(path.join(ROOT, relPath), 'utf8');
}

test('frontpage accepts decision_core_consumer best-setup source', () => {
  const html = readText('public/index.html');
  assert.match(html, /decision_core_consumer/);
});

test('stock analyzer status validation accepts decision-core operational non-buy actions', () => {
  const html = readText('public/stock.html');
  assert.match(html, /status_contract/);
  assert.match(html, /AVOID/);
  assert.match(html, /INCUBATING/);
  assert.doesNotMatch(html, /_assetVerdict\s*===\s*['"]BUY['"]\s*\|\|\s*_assetVerdict\s*===\s*['"]WAIT['"]/);
});

test('breakout v12 static adapter maps ui label into status fields', () => {
  const item = {
    asset_id: 'US:ABC',
    symbol: 'ABC',
    ui: { label: 'breakout_candidate', rank: 7, rank_percentile: 0.99 },
    scores: { final_signal_score: 0.87 },
  };
  const shaped = shapeBreakoutV12Result({
    manifest: { as_of: '2026-05-11', score_version: 'v1.3', content_hash: 'abc' },
    top500: { as_of: '2026-05-11' },
    item,
  });
  assert.equal(shaped.breakout_status, 'BREAKOUT_CANDIDATE');
  assert.equal(shaped.legacy_state, 'BREAKOUT_CANDIDATE');
  const compat = toBreakoutV2Compat(shaped);
  assert.equal(compat.state, 'BREAKOUT_CANDIDATE');
  assert.equal(compat.breakout_status, 'BREAKOUT_CANDIDATE');
  assert.equal(compat.scores.total, 87);
});

test('historical endpoint rejects stale runtime historical cache before fallback', () => {
  const source = readText('functions/api/v2/stocks/[ticker]/historical.js');
  assert.match(source, /latestUsMarketSessionIso/);
  assert.match(source, /runtimeHistoricalDataDate/);
  assert.match(source, /dataDate\s*<\s*targetDate/);
  assert.match(source, /return null;/);
});

test('v2 client uses symbol route plus asset_id query for canonical historical calls', () => {
  const source = readText('public/js/rv-v2-client.js');
  assert.match(source, /function routeTickerForAsset/);
  assert.match(source, /function hasRenderableBars/);
  assert.match(source, /fetchV2Historical\(ticker\)[\s\S]+routeTickerForAsset\(ticker\)[\s\S]+canonicalAssetQuery\(ticker\)/);
  assert.match(source, /fetchV2HistoricalProfile\(ticker\)[\s\S]+routeTickerForAsset\(ticker\)[\s\S]+canonicalAssetQuery\(ticker\)/);
  assert.match(source, /hasRenderableBars\(stockApiHistorical\)[\s\S]+hasRenderableBars\(historicalResult\?\.data\)/);
});
