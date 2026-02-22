#!/usr/bin/env node

import fs from 'node:fs/promises';
import path from 'node:path';
import { REPO_ROOT, nowIso, toFinite } from './lib/common.mjs';
import { loadV7Config, resolvePathMaybe } from './lib/config.mjs';
import { readJsonGz, writeJsonGz } from './lib/gzip-json.mjs';

function normalizeTypeNorm(v) {
  const t = String(v || 'OTHER').toUpperCase();
  const allowed = new Set(['STOCK', 'ETF', 'FUND', 'BOND', 'INDEX', 'FOREX', 'CRYPTO', 'OTHER']);
  return allowed.has(t) ? t : 'OTHER';
}

function eligibilityFromLayer(layer) {
  const L = String(layer || '');
  const isCore = L === 'L0_LEGACY_CORE';
  return {
    analyzer: isCore || L === 'L1_FULL' || L === 'L2_PARTIAL',
    forecast: isCore || L === 'L1_FULL',
    marketphase: isCore || L === 'L1_FULL' || L === 'L2_PARTIAL' || L === 'L3_MINIMAL',
    scientific: isCore || L === 'L1_FULL' || L === 'L2_PARTIAL'
  };
}

function rankScore(rec) {
  const elig = toFinite(rec?.score_0_100, 0) / 100;
  const avg30 = Math.max(1, toFinite(rec?.avg_volume_30d, 1));
  const v = Math.log10(avg30) / 10;
  const m = toFinite(rec?.market_cap_proxy_percentile, 0);
  return 0.6 * elig + 0.3 * v + 0.1 * m;
}

function chunkArray(rows, size) {
  const out = [];
  for (let i = 0; i < rows.length; i += size) out.push(rows.slice(i, i + size));
  return out;
}

function summarizeByType(rows) {
  const out = {};
  for (const row of rows) {
    const t = normalizeTypeNorm(row?.type_norm);
    out[t] = (out[t] || 0) + 1;
  }
  return out;
}

function summarizeByLayer(rows) {
  const out = {};
  for (const row of rows) {
    const layer = String(row?.layer || 'UNKNOWN');
    out[layer] = (out[layer] || 0) + 1;
  }
  return out;
}

async function run() {
  const { cfg } = await loadV7Config();
  const publishRoot = resolvePathMaybe(cfg?.run?.publish_dir) || path.join(REPO_ROOT, 'public/data/universe/v7');
  const snapshotPath = path.join(publishRoot, 'registry', 'registry.snapshot.json.gz');
  const snapshot = await readJsonGz(snapshotPath, null);
  if (!snapshot || !Array.isArray(snapshot.records)) {
    throw new Error(`registry snapshot missing or invalid: ${snapshotPath}`);
  }

  const rankedRows = snapshot.records
    .filter((row) => row && typeof row === 'object')
    .map((row) => {
      const layer = row?.computed?.layer || null;
      return {
        canonical_id: row.canonical_id || null,
        symbol: row.symbol || null,
        name: row.name || null,
        type_norm: normalizeTypeNorm(row.type_norm),
        layer,
        score_0_100: toFinite(row?.computed?.score_0_100, null),
        avg_volume_30d: toFinite(row?.avg_volume_30d, 0),
        market_cap_proxy_percentile: toFinite(row?.market_cap_proxy_percentile, 0),
        eligibility: eligibilityFromLayer(layer)
      };
    })
    .filter((row) => row.canonical_id && row.symbol)
    .sort((a, b) => {
      const as = rankScore(a);
      const bs = rankScore(b);
      if (as !== bs) return bs - as;
      const aScore = toFinite(a.score_0_100, 0);
      const bScore = toFinite(b.score_0_100, 0);
      if (aScore !== bScore) return bScore - aScore;
      const aVol = toFinite(a.avg_volume_30d, 0);
      const bVol = toFinite(b.avg_volume_30d, 0);
      if (aVol !== bVol) return bVol - aVol;
      return String(a.canonical_id).localeCompare(String(b.canonical_id));
    });

  const readModelsCfg = cfg?.read_models && typeof cfg.read_models === 'object' ? cfg.read_models : {};
  const pageSize = Math.max(20, Math.min(500, Math.floor(toFinite(readModelsCfg.page_size, 100))));
  const maxItemsDefault = { marketphase: 12000, scientific: 10000, forecast: 5000 };

  const readRoot = path.join(publishRoot, 'read_models');
  await fs.mkdir(readRoot, { recursive: true });

  const summary = { generated_at: nowIso(), page_size: pageSize, features: {} };

  for (const feature of ['marketphase', 'scientific', 'forecast']) {
    const configuredMax = toFinite(readModelsCfg?.max_items?.[feature], maxItemsDefault[feature]);
    const maxItems = Number.isFinite(configuredMax) ? Math.max(100, Math.floor(configuredMax)) : maxItemsDefault[feature];
    const eligibleRows = rankedRows.filter((row) => row?.eligibility?.[feature] === true);
    const featureRows = eligibleRows.slice(0, maxItems);
    const topPreviewRows = featureRows.slice(0, Math.min(featureRows.length, 1000));
    const pages = chunkArray(featureRows, pageSize);
    const totalPages = pages.length;

    await writeJsonGz(path.join(readRoot, `${feature}_top.json.gz`), {
      schema: `rv_v7_${feature}_top_v1`,
      generated_at: nowIso(),
      total_items: featureRows.length,
      eligible_total_items: eligibleRows.length,
      preview_items: topPreviewRows.length,
      page_size: pageSize,
      total_pages: totalPages,
      by_type_norm: summarizeByType(featureRows),
      by_layer: summarizeByLayer(featureRows),
      items: topPreviewRows
    });

    const pagesDir = path.join(readRoot, `${feature}_pages`);
    await fs.rm(pagesDir, { recursive: true, force: true });
    await fs.mkdir(pagesDir, { recursive: true });
    for (let i = 0; i < pages.length; i += 1) {
      await writeJsonGz(path.join(pagesDir, `page_${String(i).padStart(3, '0')}.json.gz`), {
        schema: `rv_v7_${feature}_page_v1`,
        page: i,
        page_size: pageSize,
        total_pages: totalPages,
        total_items: featureRows.length,
        eligible_total_items: eligibleRows.length,
        items: pages[i]
      });
    }

    summary.features[feature] = {
      eligible_total_items: eligibleRows.length,
      total_items: featureRows.length,
      preview_items: topPreviewRows.length,
      total_pages: totalPages
    };
  }

  process.stdout.write(`${JSON.stringify({ status: 'OK', schema: 'rv_v7_rebuild_read_models_local_v1', ...summary })}\n`);
}

run().catch((err) => {
  process.stderr.write(`${JSON.stringify({ status: 'FAIL', reason: String(err?.message || err) })}\n`);
  process.exit(1);
});

