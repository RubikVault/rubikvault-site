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
  clearPageCoreReaderCache,
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
      daily_change_pct: 1,
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
  for (let i = 0; i < 256; i += 1) await writeGzipJson(path.join(base, 'page-shards', pageShardName(i)), {});
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
    const index = pageShardIndex(canonical);
    pageShards.set(index, { ...(pageShards.get(index) || {}), [canonical]: payload });
  }
  for (const [index, payload] of pageShards.entries()) {
    await writeGzipJson(path.join(base, 'page-shards', pageShardName(index)), payload);
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
