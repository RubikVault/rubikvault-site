import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import {
  aliasShardIndex,
  aliasShardName,
  pageShardIndex,
  pageShardName,
} from '../../functions/api/_shared/page-core-contract.js';
import {
  applyPageCoreAliasMarketDataFallback,
  clearPageCoreReaderCache,
  normalizePageCoreOperationalState,
  pageCoreAliasMarketDataCompatible,
  readPageCoreForTicker,
} from '../../functions/api/_shared/page-core-reader.js';

async function writeJson(filePath, payload) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
}

async function writeGzipJson(filePath, payload) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, zlib.gzipSync(Buffer.from(JSON.stringify(payload), 'utf8')));
}

function row(canonical, ticker, asOf = '2026-04-24') {
  return {
    ok: true,
    schema_version: 'rv.page_core.v1',
    run_id: 'test-run',
    snapshot_id: 'page-test',
    canonical_asset_id: canonical,
    display_ticker: ticker,
    provider_ticker: ticker,
    freshness: {
      status: 'fresh',
      as_of: asOf,
      generated_at: `${asOf}T12:00:00.000Z`,
      stale_after: `${asOf}T12:00:00.000Z`,
    },
    identity: { name: ticker, country: 'US', exchange: 'US', sector: null, industry: null, asset_class: 'STOCK' },
    summary_min: {
      last_close: 100,
      daily_change_pct: 0.01010101,
      daily_change_abs: 1,
      market_cap: null,
      decision_verdict: 'WAIT',
      decision_confidence_bucket: 'medium',
      learning_status: null,
      quality_status: 'OK',
      governance_status: 'available',
    },
    governance_summary: { status: 'ok', evaluation_role: 'tradable', learning_gate_status: null, blocking_reasons: [], warnings: [] },
    coverage: { bars: 300, derived_daily: true, governance: true, fundamentals: false, forecast: false, ui_renderable: true },
    module_links: { historical: null, fundamentals: null, forecast: null, quote: null },
    meta: { source: 'test', render_contract: 'critical_page_contract', warnings: [] },
  };
}

async function fixtureRoot() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'rv-page-core-reader-'));
  const snapshotPath = '/data/page-core/snapshots/2026-04-24/page-test';
  const base = path.join(root, 'public', snapshotPath.slice(1));
  const aliases = {
    'BRK-B': 'US:BRK-B',
    'BRK.B': 'US:BRK.B',
    AAPL: 'US:AAPL',
  };
  const rows = {
    'US:BRK-B': row('US:BRK-B', 'BRK-B'),
    'US:BRK.B': row('US:BRK.B', 'BRK.B'),
    'US:AAPL': row('US:AAPL', 'AAPL', '2026-04-20'),
  };
  await writeJson(path.join(root, 'public/data/page-core/latest.json'), {
    schema: 'rv.page_core_latest.v1',
    run_id: 'test-run',
    snapshot_id: 'page-test',
    snapshot_path: snapshotPath,
    alias_shard_count: 64,
    page_shard_count: 256,
  });
  for (let i = 0; i < 64; i += 1) await writeGzipJson(path.join(base, 'alias-shards', aliasShardName(i)), {});
  for (let i = 0; i < 256; i += 1) await writeGzipJson(path.join(base, 'page-shards', pageShardName(i, 256)), {});
  const aliasShards = new Map();
  for (const [alias, canonical] of Object.entries(aliases)) {
    const index = aliasShardIndex(alias);
    aliasShards.set(index, { ...(aliasShards.get(index) || {}), [alias]: canonical });
  }
  for (const [index, payload] of aliasShards.entries()) {
    await writeGzipJson(path.join(base, 'alias-shards', aliasShardName(index)), payload);
  }
  const pageShards = new Map();
  for (const [canonical, payload] of Object.entries(rows)) {
    const index = pageShardIndex(canonical, 256);
    pageShards.set(index, { ...(pageShards.get(index) || {}), [canonical]: payload });
  }
  for (const [index, payload] of pageShards.entries()) {
    await writeGzipJson(path.join(base, 'page-shards', pageShardName(index, 256)), payload);
  }
  return root;
}

test('page-core reader keeps punctuation-distinct protected aliases', async () => {
  const root = await fixtureRoot();
  clearPageCoreReaderCache();
  const dash = await readPageCoreForTicker('BRK-B', { rootDir: root, nowMs: Date.parse('2026-04-24T18:00:00Z') });
  const dot = await readPageCoreForTicker('BRK.B', { rootDir: root, nowMs: Date.parse('2026-04-24T18:00:00Z') });
  assert.equal(dash.ok, true);
  assert.equal(dot.ok, true);
  assert.equal(dash.canonical_id, 'US:BRK-B');
  assert.equal(dot.canonical_id, 'US:BRK.B');
});

test('page-core reader rejects malformed and unmapped aliases without punctuation fallback', async () => {
  const root = await fixtureRoot();
  clearPageCoreReaderCache();
  const malformed = await readPageCoreForTicker('', { rootDir: root });
  const unmapped = await readPageCoreForTicker('BRK_B', { rootDir: root });
  assert.equal(malformed.ok, false);
  assert.equal(malformed.httpStatus, 400);
  assert.equal(unmapped.ok, false);
  assert.equal(unmapped.code, 'INVALID_OR_UNMAPPED_TICKER');
});

test('page-core reader marks expired freshness while preserving renderable row', async () => {
  const root = await fixtureRoot();
  clearPageCoreReaderCache();
  const result = await readPageCoreForTicker('AAPL', {
    rootDir: root,
    nowMs: Date.parse('2026-04-28T12:00:00Z'),
  });
  assert.equal(result.ok, true);
  assert.equal(result.canonical_id, 'US:AAPL');
  assert.equal(result.freshness_status, 'expired');
});

test('page-core reader downgrades false-green rows without hiding core data', () => {
  const bad = {
    ...row('US:Z', 'Z'),
    ui_banner_state: 'all_systems_operational',
    key_levels_ready: false,
    market_stats_min: null,
    primary_blocker: null,
  };
  const normalized = normalizePageCoreOperationalState(bad, {
    latest: { target_market_date: '2026-04-24' },
    freshnessStatus: 'fresh',
  });
  assert.equal(normalized.ui_banner_state, 'degraded');
  assert.equal(normalized.summary_min.last_close, 100);
  assert.equal(normalized.status_contract.stock_detail_view_status, 'degraded');
  assert.ok(normalized.status_contract.strict_blocking_reasons.includes('missing_market_stats_basis'));
});

test('page-core reader treats normalizable percent-unit returns as compatibility data', () => {
  const bad = {
    ...row('US:HOOD', 'HOOD'),
    summary_min: {
      ...row('US:HOOD', 'HOOD').summary_min,
      last_close: 72.89,
      daily_change_abs: 1.69,
      daily_change_pct: 2.373596,
    },
    market_stats_min: {
      key_levels_ready: true,
      price_source: 'historical-bars',
      stats_source: 'historical-indicators',
      price_date: '2026-04-30',
      latest_bar_date: '2026-04-30',
      as_of: '2026-04-30',
      issues: [],
      stats: { rsi14: 42, sma20: 79, sma50: 76, atr14: 4.86, low_52w: 45.6 },
    },
    key_levels_ready: true,
    ui_banner_state: 'all_systems_operational',
    primary_blocker: null,
  };
  const normalized = normalizePageCoreOperationalState(bad, {
    latest: { target_market_date: '2026-04-30' },
    freshnessStatus: 'fresh',
  });
  assert.equal(normalized.ui_banner_state, 'all_systems_operational');
  assert.equal(normalized.status_contract.strict_operational, true);
  assert.deepEqual(normalized.status_contract.strict_blocking_reasons, []);
});

test('page-core reader honors two-trading-day operational freshness window', () => {
  const staleButAllowed = {
    ...row('US:TTL', 'TTL', '2026-04-28'),
    market_stats_min: {
      key_levels_ready: true,
      price_source: 'historical-bars',
      stats_source: 'historical-indicators',
      price_date: '2026-04-28',
      latest_bar_date: '2026-04-28',
      as_of: '2026-04-28',
      issues: [],
      stats: { rsi14: 42, sma20: 99, sma50: 98, atr14: 2, low_52w: 60 },
    },
    key_levels_ready: true,
    ui_banner_state: 'provider_or_data_reason',
    primary_blocker: 'bars_stale',
  };
  const normalized = normalizePageCoreOperationalState(staleButAllowed, {
    latest: { target_market_date: '2026-04-30' },
    freshnessStatus: 'expired',
  });
  assert.equal(normalized.ui_banner_state, 'all_systems_operational');
  assert.equal(normalized.primary_blocker, null);
  assert.equal(normalized.status_contract.stock_detail_view_status, 'operational');
  assert.deepEqual(normalized.status_contract.strict_blocking_reasons, []);
});

test('page-core reader can use a compatible fresh alias basis for stale duplicate listings', () => {
  const staleStuttgart = {
    ...row('STU:189A', '189A', '2026-04-23'),
    identity: { ...row('STU:189A', '189A').identity, name: 'Grupo Supervielle SA', country: 'GERMANY', exchange: 'STU' },
    market_stats_min: {
      key_levels_ready: true,
      price_source: 'historical-bars',
      stats_source: 'historical-indicators',
      price_date: '2026-04-23',
      latest_bar_date: '2026-04-23',
      as_of: '2026-04-23',
      issues: [],
      stats: { rsi14: 42, sma20: 8, sma50: 7, atr14: 0.5, low_52w: 4 },
    },
    key_levels_ready: true,
    ui_banner_state: 'provider_or_data_reason',
    primary_blocker: 'bars_stale',
  };
  const freshFrankfurt = {
    ...row('F:189A', '189A', '2026-04-30'),
    identity: { ...row('F:189A', '189A').identity, name: 'Grupo Supervielle S.A', country: 'GERMANY', exchange: 'F' },
    market_stats_min: {
      key_levels_ready: true,
      price_source: 'historical-bars',
      stats_source: 'historical-indicators',
      price_date: '2026-04-30',
      latest_bar_date: '2026-04-30',
      as_of: '2026-04-30',
      issues: [],
      stats: { rsi14: 42, sma20: 8, sma50: 7, atr14: 0.5, low_52w: 4 },
    },
    key_levels_ready: true,
    ui_banner_state: 'all_systems_operational',
    primary_blocker: null,
  };
  assert.equal(pageCoreAliasMarketDataCompatible(staleStuttgart, freshFrankfurt), true);
  const normalized = applyPageCoreAliasMarketDataFallback(staleStuttgart, freshFrankfurt, {
    latest: { target_market_date: '2026-04-30' },
  });
  assert.equal(normalized.canonical_asset_id, 'STU:189A');
  assert.equal(normalized.market_stats_min.latest_bar_date, '2026-04-30');
  assert.equal(normalized.status_contract.stock_detail_view_status, 'operational');
  assert.equal(normalized.meta.market_data_alias_basis.source_canonical_id, 'F:189A');
});
