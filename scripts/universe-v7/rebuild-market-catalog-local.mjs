#!/usr/bin/env node

import fs from 'node:fs/promises';
import path from 'node:path';
import { REPO_ROOT, nowIso, toFinite, writeJsonAtomic } from './lib/common.mjs';
import { loadV7Config, resolvePathMaybe } from './lib/config.mjs';
import { readJsonGz, writeJsonGz } from './lib/gzip-json.mjs';

const STATUS_RANK = {
  ACTIVE_RECENT: 4,
  PARTIAL_HISTORY: 3,
  EOD_ONLY: 2,
  METADATA_ONLY: 1
};

function normalizeTypeNorm(value) {
  const t = String(value || 'OTHER').toUpperCase();
  const allowed = new Set(['STOCK', 'ETF', 'FUND', 'BOND', 'INDEX', 'FOREX', 'CRYPTO', 'OTHER']);
  return allowed.has(t) ? t : 'OTHER';
}

function chunkArray(rows, size) {
  const out = [];
  for (let i = 0; i < rows.length; i += size) out.push(rows.slice(i, i + size));
  return out;
}

function inc(map, key, n = 1) {
  map.set(key, (map.get(key) || 0) + n);
}

function safeDaysSince(dateIso) {
  if (!dateIso || typeof dateIso !== 'string') return null;
  const ts = Date.parse(`${dateIso.slice(0, 10)}T00:00:00Z`);
  if (!Number.isFinite(ts)) return null;
  const nowTs = Date.now();
  return Math.max(0, Math.floor((nowTs - ts) / 86400000));
}

function deriveStatus({ last_trade_date, bars_count }) {
  const bars = toFinite(bars_count, 0);
  const age = safeDaysSince(last_trade_date);
  if (age != null && age <= 5 && bars > 0) return 'ACTIVE_RECENT';
  if (bars > 0) return 'PARTIAL_HISTORY';
  if (last_trade_date) return 'EOD_ONLY';
  return 'METADATA_ONLY';
}

function deriveLayer({ computed, status, bars_count }) {
  const direct = String(computed?.layer || '');
  if (direct) return direct;
  const bars = toFinite(bars_count, 0);
  if (status === 'ACTIVE_RECENT' && bars >= 252) return 'L2_PARTIAL_EST';
  if (bars > 0) return 'L3_MINIMAL_EST';
  return 'L4_DEAD';
}

function deriveScore({ computed, bars_count, avg_volume_30d, last_trade_date }) {
  const direct = toFinite(computed?.score_0_100, null);
  if (direct != null) return direct;
  const bars = Math.max(0, toFinite(bars_count, 0));
  const vol = Math.max(0, toFinite(avg_volume_30d, 0));
  const age = safeDaysSince(last_trade_date);
  const depth = Math.min(1, bars / 2520);
  const freshness = age == null ? 0 : Math.max(0, 1 - (age / 180));
  const liquid = Math.min(1, Math.log10(Math.max(1, vol)) / 6);
  return Math.round(100 * (0.5 * depth + 0.3 * freshness + 0.2 * liquid));
}

function byCountDesc(entries) {
  return [...entries]
    .sort((a, b) => b[1] - a[1]);
}

async function writeCatalogPages(baseDir, rows, pageSize, schemaBase) {
  await fs.rm(baseDir, { recursive: true, force: true });
  await fs.mkdir(baseDir, { recursive: true });
  const pages = chunkArray(rows, pageSize);
  const totalPages = pages.length;
  const totalItems = rows.length;

  for (let i = 0; i < pages.length; i += 1) {
    await writeJsonGz(path.join(baseDir, `page_${String(i).padStart(3, '0')}.json.gz`), {
      schema: `${schemaBase}_page_v1`,
      generated_at: nowIso(),
      page: i,
      page_size: pageSize,
      total_pages: totalPages,
      total_items: totalItems,
      items: pages[i]
    });
  }

  return { total_pages: totalPages, total_items: totalItems, page_size: pageSize };
}

async function run() {
  const { cfg } = await loadV7Config();
  const publishRoot = resolvePathMaybe(cfg?.run?.publish_dir) || path.join(REPO_ROOT, 'public/data/universe/v7');
  const readModelsRoot = path.join(publishRoot, 'read_models');
  const snapshotPath = path.join(publishRoot, 'registry', 'registry.snapshot.json.gz');
  const snapshot = await readJsonGz(snapshotPath, null);
  if (!snapshot || !Array.isArray(snapshot.records)) {
    throw new Error(`invalid snapshot: ${snapshotPath}`);
  }

  const pageSize = Math.max(50, Math.min(500, Math.floor(toFinite(cfg?.read_models?.market_catalog_page_size, 200))));
  const byType = new Map();
  const byStatus = new Map();
  const byExchange = new Map();

  const rows = snapshot.records
    .filter((row) => row && typeof row === 'object' && row.canonical_id && row.symbol)
    .map((row) => {
      const type_norm = normalizeTypeNorm(row.type_norm);
      const exchange = String(row.exchange || row.mic || '').toUpperCase() || 'UNK';
      const status = deriveStatus(row);
      const layer = deriveLayer({ ...row, status });
      const score_0_100 = deriveScore(row);
      const out = {
        canonical_id: row.canonical_id,
        symbol: String(row.symbol || '').toUpperCase(),
        name: row.name || null,
        type_norm,
        exchange,
        layer,
        status,
        score_0_100,
        last_trade_date: row.last_trade_date || null,
        bars_count: Math.max(0, Math.floor(toFinite(row.bars_count, 0))),
        avg_volume_30d: Math.max(0, Math.floor(toFinite(row.avg_volume_30d, 0)))
      };
      inc(byType, type_norm);
      inc(byStatus, status);
      inc(byExchange, exchange);
      return out;
    })
    .sort((a, b) => {
      const sRank = (STATUS_RANK[b.status] || 0) - (STATUS_RANK[a.status] || 0);
      if (sRank !== 0) return sRank;
      if (b.score_0_100 !== a.score_0_100) return b.score_0_100 - a.score_0_100;
      if (b.avg_volume_30d !== a.avg_volume_30d) return b.avg_volume_30d - a.avg_volume_30d;
      return String(a.canonical_id).localeCompare(String(b.canonical_id));
    });

  const allPagesDir = path.join(readModelsRoot, 'market_catalog_pages');
  const allMeta = await writeCatalogPages(allPagesDir, rows, pageSize, 'rv_v7_market_catalog');
  const previewItems = rows.slice(0, Math.min(1000, rows.length));
  await writeJsonGz(path.join(readModelsRoot, 'market_catalog_top.json.gz'), {
    schema: 'rv_v7_market_catalog_top_v1',
    generated_at: nowIso(),
    total_items: allMeta.total_items,
    preview_items: previewItems.length,
    page_size: allMeta.page_size,
    total_pages: allMeta.total_pages,
    items: previewItems
  });

  const classRoot = path.join(readModelsRoot, 'market_catalog_by_class');
  await fs.rm(classRoot, { recursive: true, force: true });
  await fs.mkdir(classRoot, { recursive: true });

  const byClassManifest = {};
  const classes = ['STOCK', 'ETF', 'FUND', 'CRYPTO', 'FOREX', 'BOND', 'INDEX', 'OTHER'];
  for (const c of classes) {
    const classRows = rows.filter((row) => row.type_norm === c);
    const slug = c.toLowerCase();
    const classDir = path.join(classRoot, slug, 'pages');
    const meta = await writeCatalogPages(classDir, classRows, pageSize, `rv_v7_market_catalog_${slug}`);
    const manifest = {
      schema: 'rv_v7_market_catalog_class_manifest_v1',
      generated_at: nowIso(),
      asset_class: c,
      ...meta
    };
    await writeJsonAtomic(path.join(classRoot, slug, 'manifest.json'), manifest);
    byClassManifest[slug] = {
      asset_class: c,
      total_items: meta.total_items,
      total_pages: meta.total_pages,
      page_size: meta.page_size,
      manifest_path: `read_models/market_catalog_by_class/${slug}/manifest.json`
    };
  }

  const byTypeObj = Object.fromEntries(byCountDesc(byType.entries()));
  const byStatusObj = Object.fromEntries(byCountDesc(byStatus.entries()));
  const byExchangeObj = Object.fromEntries(byCountDesc(byExchange.entries()).slice(0, 30));

  const manifest = {
    schema: 'rv_v7_market_catalog_manifest_v1',
    generated_at: nowIso(),
    source_snapshot_generated_at: snapshot.generated_at || null,
    source_run_id: snapshot.records?.[0]?.meta?.run_id || null,
    total_items: allMeta.total_items,
    total_pages: allMeta.total_pages,
    page_size: allMeta.page_size,
    by_type_norm: byTypeObj,
    by_status: byStatusObj,
    by_exchange_top30: byExchangeObj,
    by_class: byClassManifest
  };

  await writeJsonAtomic(path.join(readModelsRoot, 'market_catalog_manifest.json'), manifest);

  process.stdout.write(`${JSON.stringify({
    status: 'OK',
    schema: 'rv_v7_market_catalog_rebuild_local_v1',
    generated_at: manifest.generated_at,
    total_items: manifest.total_items,
    total_pages: manifest.total_pages,
    page_size: manifest.page_size,
    by_type_norm: manifest.by_type_norm
  })}\n`);
}

run().catch((err) => {
  process.stderr.write(`${JSON.stringify({ status: 'FAIL', reason: String(err?.message || err) })}\n`);
  process.exit(1);
});

