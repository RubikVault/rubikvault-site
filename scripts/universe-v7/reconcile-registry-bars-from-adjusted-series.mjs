#!/usr/bin/env node

import fs from 'node:fs/promises';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';
import {
  REPO_ROOT,
  clamp,
  nowIso,
  parseArgs,
  sha256File,
  toFinite,
} from './lib/common.mjs';
import { loadV7Config } from './lib/config.mjs';
import { readJsonGz, readNdjsonGz } from './lib/gzip-json.mjs';

const REGISTRY_NDJSON = path.join(REPO_ROOT, 'public/data/universe/v7/registry/registry.ndjson.gz');
const REGISTRY_SNAPSHOT = path.join(REPO_ROOT, 'public/data/universe/v7/registry/registry.snapshot.json.gz');
const ADJUSTED_DIR = path.join(REPO_ROOT, 'public/data/v3/series/adjusted');
const MIRROR_HISTORY_DIR = path.join(REPO_ROOT, 'mirrors/universe-v7/history');
const CORE_CONTRACT = path.join(REPO_ROOT, 'policies/universe/core_legacy_contract.json');

function avg(values) {
  if (!Array.isArray(values) || values.length === 0) return 0;
  return values.reduce((sum, value) => sum + Number(value || 0), 0) / values.length;
}

function stdev(values) {
  if (!Array.isArray(values) || values.length < 2) return 0;
  const mean = avg(values);
  const variance = values.reduce((sum, value) => {
    const delta = Number(value || 0) - mean;
    return sum + delta * delta;
  }, 0) / values.length;
  return Math.sqrt(variance);
}

function profileForType(typeNorm) {
  const map = {
    STOCK: 'EQUITY_LIKE',
    ETF: 'EQUITY_LIKE',
    FUND: 'NAV_LIKE',
    BOND: 'BOND_LIKE',
    INDEX: 'INDEX_LIKE',
    FOREX: 'FOREX_LIKE',
    CRYPTO: 'CRYPTO_LIKE',
    OTHER: 'NAV_LIKE',
  };
  return map[String(typeNorm || 'OTHER').toUpperCase()] || 'NAV_LIKE';
}

function daysBetween(a, b) {
  const da = Date.parse(`${a}T00:00:00Z`);
  const db = Date.parse(`${b}T00:00:00Z`);
  if (!Number.isFinite(da) || !Number.isFinite(db)) return null;
  return Math.max(0, Math.floor((db - da) / 86400000));
}

function stalenessBusinessDays(lastTradeDate, cfg, today = nowIso().slice(0, 10)) {
  if (!lastTradeDate) return Number(cfg?.eligibility?.freshness_max_days || 180);
  const delta = daysBetween(lastTradeDate, today);
  if (!Number.isFinite(delta)) return Number(cfg?.eligibility?.freshness_max_days || 180);
  const factor = toFinite(cfg?.staleness?.weekend_adjust_factor, 5);
  const divisor = toFinite(cfg?.staleness?.weekend_adjust_divisor, 7);
  return Math.floor(delta * (factor / Math.max(1, divisor)));
}

function sanitizeSymbolForFile(symbol) {
  return String(symbol || '').trim().toUpperCase().replace(/[^A-Z0-9.\-]/g, '_');
}

function canonicalToAdjustedPath(canonicalId) {
  const [exchange, symbol] = String(canonicalId || '').split(':');
  if (!exchange || !symbol) return null;
  return path.join(ADJUSTED_DIR, `${exchange.toUpperCase()}__${sanitizeSymbolForFile(symbol)}.ndjson.gz`);
}

function normalizeBar(raw) {
  const date = String(raw?.date || raw?.trading_date || '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  const close = toFinite(raw?.close ?? raw?.adjusted_close, null);
  if (close == null) return null;
  return {
    date,
    open: toFinite(raw?.open, close),
    high: toFinite(raw?.high, close),
    low: toFinite(raw?.low, close),
    close,
    volume: Math.max(0, toFinite(raw?.volume, 0)),
    adjusted_close: toFinite(raw?.adjusted_close, close),
  };
}

export function mergeBars(...sources) {
  const byDate = new Map();
  for (const source of sources) {
    for (const raw of Array.isArray(source) ? source : []) {
      const bar = normalizeBar(raw);
      if (!bar) continue;
      byDate.set(bar.date, bar);
    }
  }
  return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
}

export function computeEligibilityPatch(row, bars, cfg, { preserveLegacyCore = true, today = nowIso().slice(0, 10) } = {}) {
  const barsCount = Array.isArray(bars) ? bars.length : 0;
  const latest = barsCount > 0 ? bars[barsCount - 1] : null;
  const recent10 = bars.slice(-10);
  const recent30 = bars.slice(-30);
  const volumes10 = recent10.map((bar) => Math.max(0, toFinite(bar.volume, 0)));
  const volumes30 = recent30.map((bar) => Math.max(0, toFinite(bar.volume, 0)));
  const closes10 = recent10.map((bar) => toFinite(bar.adjusted_close ?? bar.close, null)).filter((value) => value != null);
  const avgVolume10d = Math.round(avg(volumes10));
  const avgVolume30d = Math.round(avg(volumes30));

  const weights = cfg?.eligibility?.weights || {
    history_depth: 0.4,
    ohlcv_completeness: 0.25,
    volume_quality: 0.2,
    freshness: 0.15,
  };

  const years = barsCount / 252;
  const historyDepth = years >= 10 ? 1 : years <= 0 ? 0 : years / 10;
  const profile = profileForType(row?.type_norm);
  const requiresVolume = profile === 'EQUITY_LIKE' || profile === 'CRYPTO_LIKE';
  const ohlcvCompleteness = barsCount > 0 ? 1 : 0;
  const volumeGate = avgVolume10d >= Number(cfg?.volume?.min_avg_volume_10d_equity || 10000) ? 1 : 0;
  const volumeConsistency = avgVolume30d <= 0
    ? 0
    : clamp(1 - (stdev(volumes30) / Math.max(1, avgVolume30d)), 0, 1);

  let volumeScore = 0.7;
  if (requiresVolume) volumeScore = volumeGate === 0 ? 0 : 0.5 * volumeGate + 0.5 * volumeConsistency;

  const lastTradeDate = latest?.date || null;
  const stale = stalenessBusinessDays(lastTradeDate, cfg, today);
  const freshnessMax = Number(cfg?.eligibility?.freshness_max_days || 180);
  const freshness = clamp(1 - stale / Math.max(1, freshnessMax), 0, 1);

  const score = Math.round(
    100 * (
      Number(weights.history_depth || 0.4) * historyDepth
      + Number(weights.ohlcv_completeness || 0.25) * ohlcvCompleteness
      + Number(weights.volume_quality || 0.2) * volumeScore
      + Number(weights.freshness || 0.15) * freshness
    )
  );

  const thresholds = cfg?.eligibility?.layer_thresholds || { L1_FULL: 85, L2_PARTIAL: 65, L3_MINIMAL: 40 };
  let layer = 'L4_DEAD';
  if (score >= Number(thresholds.L1_FULL || 85)) layer = 'L1_FULL';
  else if (score >= Number(thresholds.L2_PARTIAL || 65)) layer = 'L2_PARTIAL';
  else if (score >= Number(thresholds.L3_MINIMAL || 40)) layer = 'L3_MINIMAL';

  if (preserveLegacyCore && String(row?.computed?.layer || '').toUpperCase() === 'L0_LEGACY_CORE') {
    layer = 'L0_LEGACY_CORE';
  }

  return {
    bars_count: barsCount,
    last_trade_date: lastTradeDate,
    avg_volume_10d: avgVolume10d,
    avg_volume_30d: avgVolume30d,
    _tmp_recent_closes: closes10,
    _tmp_recent_volumes: volumes10,
    computed: {
      ...(row?.computed || {}),
      score_0_100: score,
      layer,
      profile,
      staleness_bd: stale,
    },
  };
}

async function readExistingPackBars(row, canonicalId) {
  const rel = String(row?.pointers?.history_pack || '').trim();
  if (!rel) return [];
  const packPath = path.join(REPO_ROOT, 'mirrors/universe-v7', rel);
  const rows = await readNdjsonGz(packPath, []);
  const match = rows.find((entry) => String(entry?.canonical_id || '').toUpperCase() === canonicalId);
  return Array.isArray(match?.bars) ? match.bars : [];
}

async function writeGzipAtomic(filePath, payloadBuffer) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  const tmp = `${filePath}.tmp-${process.pid}-${Date.now()}`;
  await fs.writeFile(tmp, payloadBuffer);
  await fs.rename(tmp, filePath);
}

async function writeJsonGzAtomic(filePath, payload) {
  await writeGzipAtomic(filePath, zlib.gzipSync(Buffer.from(JSON.stringify(payload))));
}

async function writeNdjsonGzAtomic(filePath, rows) {
  const body = rows.map((row) => JSON.stringify(row)).join('\n') + '\n';
  await writeGzipAtomic(filePath, zlib.gzipSync(Buffer.from(body)));
}

async function writeHistoryPack({ canonicalId, row, bars, runId }) {
  const [exchange, symbol] = canonicalId.split(':');
  const bucket = String(symbol || '_').charAt(0).toLowerCase() || '_';
  const packId = `${runId}_${sanitizeSymbolForFile(symbol).toLowerCase()}_0001.ndjson.gz`;
  const rel = `history/${exchange.toUpperCase()}/${bucket}/${packId}`;
  const abs = path.join(MIRROR_HISTORY_DIR, exchange.toUpperCase(), bucket, packId);
  await writeNdjsonGzAtomic(abs, [{
    canonical_id: canonicalId,
    bars,
  }]);
  return {
    history_pack: rel,
    pack_sha256: `sha256:${await sha256File(abs)}`,
    symbol_group: row?.pointers?.symbol_group || `${canonicalId}..${canonicalId}`,
  };
}

async function readCoreSet() {
  try {
    const payload = JSON.parse(await fs.readFile(CORE_CONTRACT, 'utf8'));
    const tickers = Array.isArray(payload?.legacy_sets?.universe_tickers)
      ? payload.legacy_sets.universe_tickers
      : [];
    return new Set(tickers.map((symbol) => `US:${String(symbol || '').trim().toUpperCase()}`).filter((id) => id !== 'US:'));
  } catch {
    return new Set();
  }
}

async function reconcileRows(rows, { canonicalIds, cfg, runId, dryRun, preserveLegacyCore }) {
  const wanted = new Set(canonicalIds.map((id) => String(id || '').trim().toUpperCase()).filter(Boolean));
  const coreSet = await readCoreSet();
  const summaries = [];
  let changed = false;

  for (const row of rows) {
    const canonicalId = String(row?.canonical_id || '').trim().toUpperCase();
    if (!wanted.has(canonicalId)) continue;

    const adjustedPath = canonicalToAdjustedPath(canonicalId);
    const adjustedRows = adjustedPath ? await readNdjsonGz(adjustedPath, []) : [];
    const packBars = await readExistingPackBars(row, canonicalId);
    const bars = mergeBars(adjustedRows, packBars);
    if (!bars.length) {
      summaries.push({ canonical_id: canonicalId, status: 'NO_BARS_FOUND', adjusted_rows: adjustedRows.length, pack_bars: packBars.length });
      continue;
    }

    const legacyCore = coreSet.has(canonicalId);
    const before = {
      bars_count: Number(row?.bars_count || 0),
      last_trade_date: row?.last_trade_date || null,
      layer: row?.computed?.layer || null,
      score_0_100: row?.computed?.score_0_100 ?? null,
    };
    const patch = computeEligibilityPatch(row, bars, cfg, {
      preserveLegacyCore: preserveLegacyCore || legacyCore,
    });
    const pointers = dryRun ? row.pointers : await writeHistoryPack({ canonicalId, row, bars, runId });

    Object.assign(row, patch, {
      pointers,
      _quality_basis: row?._quality_basis || 'backfill_real',
      meta: {
        ...(row?.meta || {}),
        updated_at: nowIso(),
        run_id: runId,
        registry_reconcile_source: 'adjusted_series_plus_existing_v7_pack',
      },
    });

    summaries.push({
      canonical_id: canonicalId,
      status: 'UPDATED',
      before,
      after: {
        bars_count: row.bars_count,
        last_trade_date: row.last_trade_date,
        layer: row.computed?.layer || null,
        score_0_100: row.computed?.score_0_100 ?? null,
      },
      adjusted_rows: adjustedRows.length,
      existing_pack_bars: packBars.length,
      merged_bars: bars.length,
      history_pack: pointers?.history_pack || null,
    });
    changed = true;
  }

  for (const canonicalId of wanted) {
    if (!rows.some((row) => String(row?.canonical_id || '').trim().toUpperCase() === canonicalId)) {
      summaries.push({ canonical_id: canonicalId, status: 'REGISTRY_ROW_NOT_FOUND' });
    }
  }

  return { changed, summaries };
}

function parseCanonicalIds(args) {
  const raw = args.canonical || args.canonical_id || args.ids || 'US:V';
  return String(raw)
    .split(',')
    .map((id) => id.trim().toUpperCase())
    .filter(Boolean);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const canonicalIds = parseCanonicalIds(args);
  const dryRun = Boolean(args['dry-run']);
  const preserveLegacyCore = args['unlock-legacy-core-layer'] ? false : true;
  const runId = String(args['run-id'] || `reconcile_registry_${nowIso().replace(/[-:]/g, '').slice(0, 15)}`);
  const { cfg } = await loadV7Config();

  const registryRows = await readNdjsonGz(REGISTRY_NDJSON, []);
  const snapshot = await readJsonGz(REGISTRY_SNAPSHOT, null);
  if (!registryRows.length) throw new Error(`registry_empty:${REGISTRY_NDJSON}`);
  if (!snapshot || !Array.isArray(snapshot.records)) throw new Error(`snapshot_invalid:${REGISTRY_SNAPSHOT}`);

  const registryResult = await reconcileRows(registryRows, { canonicalIds, cfg, runId, dryRun, preserveLegacyCore });
  const snapshotResult = await reconcileRows(snapshot.records, { canonicalIds, cfg, runId, dryRun, preserveLegacyCore });

  if (!dryRun) {
    if (registryResult.changed) await writeNdjsonGzAtomic(REGISTRY_NDJSON, registryRows);
    if (snapshotResult.changed) {
      snapshot.generated_at = nowIso();
      snapshot.record_count = Array.isArray(snapshot.records) ? snapshot.records.length : snapshot.record_count;
      await writeJsonGzAtomic(REGISTRY_SNAPSHOT, snapshot);
    }
  }

  process.stdout.write(`${JSON.stringify({
    ok: true,
    dry_run: dryRun,
    run_id: runId,
    canonical_ids: canonicalIds,
    registry: registryResult.summaries,
    snapshot: snapshotResult.summaries,
  }, null, 2)}\n`);
}

const isCli = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (isCli) {
  main().catch((error) => {
    process.stderr.write(`${error?.stack || error}\n`);
    process.exit(1);
  });
}
