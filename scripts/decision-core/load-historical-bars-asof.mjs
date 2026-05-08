#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import {
  ROOT,
  finiteNumber,
  isoDate,
  normalizeAssetType,
  normalizeId,
  readRegistryRows,
  writeGzipAtomic,
} from './shared.mjs';

export function assertNoFeatureAfterAsOf(rows, targetMarketDate) {
  const target = isoDate(targetMarketDate);
  if (!target) throw new Error('TARGET_MARKET_DATE_REQUIRED');
  const violations = [];
  for (const row of rows || []) {
    const asOf = isoDate(row?.last_trade_date || row?.bars_latest_date || row?.as_of_date);
    if (asOf && asOf > target) {
      violations.push({
        asset_id: row?.canonical_id || row?.asset_id || null,
        as_of_date: asOf,
        target_market_date: target,
      });
      if (violations.length >= 100) break;
    }
  }
  return { ok: violations.length === 0, violations };
}

function safeRel(filePath) {
  const rel = path.relative(ROOT, filePath);
  if (rel && !rel.startsWith('..') && !path.isAbsolute(rel)) return rel;
  return '[external-history-root]';
}

function inferRegion(row) {
  const exchange = normalizeId(row?.exchange || row?.exchange_code || row?.mic || row?.primary_exchange || row?.canonical_id?.split(':')?.[0]);
  const country = normalizeId(row?.country || row?.country_code || row?.region);
  if (country === 'US' || exchange === 'US' || ['NYSE', 'NASDAQ', 'AMEX', 'ARCA', 'BATS'].includes(exchange)) return 'US';
  if (['GB', 'UK', 'DE', 'FR', 'IT', 'ES', 'NL', 'SE', 'CH', 'DK', 'FI', 'NO', 'BE', 'AT', 'IE', 'PT'].includes(country)) return 'EU';
  if (['LSE', 'XETRA', 'F', 'PA', 'MI', 'MC', 'AS', 'ST', 'SW', 'CO', 'HE', 'OL', 'BR', 'VI', 'LS'].includes(exchange)) return 'EU';
  if (['JP', 'HK', 'CN', 'KR', 'IN', 'SG', 'TW', 'AU', 'NZ', 'MY', 'TH', 'ID'].includes(country)) return 'ASIA';
  if (['TSE', 'TO', 'V', 'NEO'].includes(exchange)) return 'OTHER';
  if (['KO', 'KQ', 'HK', 'SHG', 'SHE', 'TWO', 'TW', 'TA', 'KLSE', 'SG', 'AU', 'NSE', 'BSE', 'JSE'].includes(exchange)) return 'ASIA';
  return 'OTHER';
}

function stratifyRegistryRows(rows, maxAssets) {
  const limit = Number(maxAssets) || 0;
  if (!limit || rows.length <= limit) return rows;
  const buckets = new Map();
  for (const row of rows) {
    const region = inferRegion(row);
    const assetType = normalizeAssetType(row?.type_norm || row?.asset_class || row?.type);
    const key = `${region}|${assetType}`;
    const bucket = buckets.get(key) || [];
    bucket.push(row);
    buckets.set(key, bucket);
  }
  const preferredKeys = [
    'US|STOCK', 'US|ETF',
    'EU|STOCK', 'EU|ETF',
    'ASIA|STOCK', 'ASIA|ETF',
    'OTHER|STOCK', 'OTHER|ETF',
    'US|INDEX', 'EU|INDEX', 'ASIA|INDEX', 'OTHER|INDEX',
  ].filter((key) => buckets.has(key));
  const keys = [...preferredKeys, ...Array.from(buckets.keys()).filter((key) => !preferredKeys.includes(key)).sort()];
  const selected = [];
  let cursor = 0;
  while (selected.length < limit && keys.length) {
    let moved = false;
    for (const key of keys) {
      const bucket = buckets.get(key) || [];
      const row = bucket[cursor];
      if (row) {
        selected.push(row);
        moved = true;
        if (selected.length >= limit) break;
      }
    }
    if (!moved) break;
    cursor += 1;
  }
  return selected;
}

function historyRootCandidates(explicitRoots = null) {
  const envRoots = [
    process.env.RV_DECISION_CORE_HISTORY_ROOT,
    process.env.RV_UNIVERSE_V7_MIRROR_ROOT,
    process.env.RV_V7_HISTORY_ROOT,
  ].filter(Boolean).flatMap((item) => String(item).split(path.delimiter).filter(Boolean));
  const roots = explicitRoots
    ? String(explicitRoots).split(path.delimiter).filter(Boolean)
    : envRoots;
  const defaults = [
    path.join(ROOT, 'mirrors/universe-v7'),
    path.join(ROOT, 'public/data/universe/v7'),
  ];
  return [...roots, ...defaults]
    .map((item) => path.resolve(ROOT, item))
    .filter((item, index, arr) => arr.indexOf(item) === index);
}

function packParts(relPack) {
  const rel = String(relPack || '').replace(/^\/+/, '');
  const stripped = rel.startsWith('history/') ? rel.slice('history/'.length) : rel;
  return { rel, stripped, parts: stripped.split('/') };
}

function packExactCandidates(root, relPack) {
  const { rel, stripped } = packParts(relPack);
  const candidates = [
    path.join(root, rel),
    path.join(root, stripped),
    path.join(root, 'history', stripped),
  ];
  return candidates.filter((item, index, arr) => arr.indexOf(item) === index);
}

function packSiblingCandidates(root, relPack) {
  const { stripped, parts } = packParts(relPack);
  const candidates = [];
  if (parts.length >= 3) {
    const exchange = parts[0];
    const fileName = parts.at(-1);
    for (const base of [path.join(root, exchange), path.join(root, 'history', exchange)]) {
      try {
        for (const bucket of fs.readdirSync(base).sort()) {
          candidates.push(path.join(base, bucket, fileName));
        }
      } catch {
        // no sibling bucket fallback for this root.
      }
    }
  }
  return candidates.filter((item, index, arr) => arr.indexOf(item) === index);
}

function resolvePackPath(relPack, roots) {
  for (const root of roots) {
    for (const candidate of packExactCandidates(root, relPack)) {
      if (fs.existsSync(candidate)) return candidate;
    }
  }
  return null;
}

function readPackIndex(filePath) {
  const index = new Map();
  const raw = zlib.gunzipSync(fs.readFileSync(filePath));
  let start = 0;
  for (let i = 0; i <= raw.length; i += 1) {
    if (i < raw.length && raw[i] !== 10) continue;
    const line = raw.subarray(start, i).toString('utf8').trim();
    start = i + 1;
    if (!line) continue;
    const row = JSON.parse(line);
    const id = normalizeId(row?.canonical_id);
    if (id) index.set(id, row);
  }
  return index;
}

function readPackIndexSafe(filePath) {
  try {
    return { ok: true, index: readPackIndex(filePath), error: null };
  } catch (error) {
    return { ok: false, index: null, error: error?.code || error?.message || String(error) };
  }
}

function readFirstReadablePack(relPack, roots, expectedIds = []) {
  let corruptCandidates = 0;
  let existingCandidates = 0;
  let readableWithoutExpectedIds = 0;
  const candidates = [
    ...roots.flatMap((root) => packExactCandidates(root, relPack)),
    ...roots.flatMap((root) => packSiblingCandidates(root, relPack)),
  ].filter((item, index, arr) => arr.indexOf(item) === index);
  for (const candidate of candidates) {
      if (!fs.existsSync(candidate)) continue;
      existingCandidates += 1;
      const loaded = readPackIndexSafe(candidate);
      if (loaded.ok) {
        const hasExpected = !expectedIds.length || expectedIds.some((id) => loaded.index.has(id));
        if (hasExpected) return { ok: true, index: loaded.index, filePath: candidate, corruptCandidates, readableWithoutExpectedIds };
        readableWithoutExpectedIds += 1;
        continue;
      }
      corruptCandidates += 1;
  }
  return { ok: false, index: null, filePath: null, corruptCandidates, readableWithoutExpectedIds, missing: existingCandidates === 0 };
}

function barDate(row) {
  return isoDate(row?.date || row?.trading_date);
}

function barClose(row) {
  return finiteNumber(row?.adjusted_close ?? row?.adj_close ?? row?.close ?? row?.last_close);
}

function barVolume(row) {
  return finiteNumber(row?.volume ?? row?.adjusted_volume ?? row?.unadjusted_volume);
}

function mean(values) {
  const clean = values.map(finiteNumber).filter((value) => value != null);
  if (!clean.length) return null;
  return clean.reduce((sum, value) => sum + value, 0) / clean.length;
}

export function sliceBarsAsOf(bars, targetMarketDate) {
  const target = isoDate(targetMarketDate);
  return (Array.isArray(bars) ? bars : [])
    .map((row) => ({ row, date: barDate(row) }))
    .filter((item) => item.date && item.date <= target)
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((item) => ({ ...item.row, date: item.date }));
}

export function buildRegistryRowFromBars(registryRow, bars, targetMarketDate) {
  const sliced = sliceBarsAsOf(bars, targetMarketDate);
  if (!sliced.length) return null;
  const last = sliced.at(-1);
  const lastDate = barDate(last);
  const recent = sliced.slice(-252);
  const closes = recent.map(barClose).filter((value) => value != null);
  const volumes = recent.map(barVolume).filter((value) => value != null);
  const close = barClose(last);
  return {
    ...registryRow,
    last_trade_date: lastDate,
    bars_latest_date: lastDate,
    bars_count: sliced.length,
    close,
    last_close: close,
    avg_volume_10d: mean(volumes.slice(-10)),
    avg_volume_30d: mean(volumes.slice(-30)),
    _tmp_recent_closes: closes.slice(-252),
    _tmp_recent_volumes: volumes.slice(-252),
    computed: {
      ...(registryRow?.computed || {}),
      staleness_bd: 0,
    },
    _historical_pit: {
      target_market_date: isoDate(targetMarketDate),
      source_history_pack: registryRow?.pointers?.history_pack || registryRow?.history_pack || null,
      source_bar_count: sliced.length,
    },
  };
}

function prepareBarsForBatch(bars) {
  return (Array.isArray(bars) ? bars : [])
    .map((row) => {
      const date = barDate(row);
      if (!date) return null;
      return {
        date,
        close: barClose(row),
        volume: barVolume(row),
      };
    })
    .filter(Boolean)
    .sort((a, b) => a.date.localeCompare(b.date));
}

function upperBoundDate(bars, target) {
  let lo = 0;
  let hi = bars.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (bars[mid].date <= target) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

function buildRegistryRowFromPreparedBars(registryRow, preparedBars, targetMarketDate) {
  const target = isoDate(targetMarketDate);
  const end = upperBoundDate(preparedBars, target);
  if (end <= 0) return null;
  const last = preparedBars[end - 1];
  const recent = preparedBars.slice(Math.max(0, end - 252), end);
  const closes = recent.map((row) => row.close).filter((value) => value != null);
  const volumes = recent.map((row) => row.volume).filter((value) => value != null);
  const close = last.close;
  return {
    ...registryRow,
    last_trade_date: last.date,
    bars_latest_date: last.date,
    bars_count: end,
    close,
    last_close: close,
    avg_volume_10d: mean(volumes.slice(-10)),
    avg_volume_30d: mean(volumes.slice(-30)),
    _tmp_recent_closes: closes.slice(-252),
    _tmp_recent_volumes: volumes.slice(-252),
    computed: {
      ...(registryRow?.computed || {}),
      staleness_bd: 0,
    },
    _historical_pit: {
      target_market_date: target,
      source_history_pack: registryRow?.pointers?.history_pack || registryRow?.history_pack || null,
      source_bar_count: end,
    },
  };
}

export function loadHistoricalRegistryAsOf({
  targetMarketDate,
  maxAssets = null,
  historyRoots = null,
  outPath = null,
  stratifiedSample = false,
} = {}) {
  const target = isoDate(targetMarketDate);
  if (!target) throw new Error('TARGET_MARKET_DATE_REQUIRED');
  const registryRows = stratifiedSample && maxAssets
    ? stratifyRegistryRows(readRegistryRows({ maxAssets: null }), maxAssets)
    : readRegistryRows({ maxAssets });
  const roots = historyRootCandidates(historyRoots);
  const rowsByPack = new Map();
  const rows = [];
  let noPointerCount = 0;
  let missingPackCount = 0;
  let missingPackRowTotal = 0;
  let missingPackRowCount = 0;
  let noBarsAsOfCount = 0;
  let packFilesLoaded = 0;
  let corruptPackCount = 0;
  let corruptPackCandidateCount = 0;
  let readableWrongPackCount = 0;
  const corruptPackSamples = [];

  for (const registryRow of registryRows) {
    const assetId = normalizeId(registryRow?.canonical_id);
    const relPack = registryRow?.pointers?.history_pack || registryRow?.history_pack;
    if (!assetId || !relPack) {
      noPointerCount += 1;
      continue;
    }
    const list = rowsByPack.get(relPack) || [];
    list.push(registryRow);
    rowsByPack.set(relPack, list);
  }

  for (const [relPack, packRows] of rowsByPack.entries()) {
    const expectedIds = packRows.map((row) => normalizeId(row?.canonical_id)).filter(Boolean);
    const loaded = readFirstReadablePack(relPack, roots, expectedIds);
    corruptPackCandidateCount += loaded.corruptCandidates;
    readableWrongPackCount += loaded.readableWithoutExpectedIds || 0;
    if (loaded.missing) {
      missingPackCount += 1;
      missingPackRowTotal += packRows.length;
      continue;
    }
    if (!loaded.ok) {
      if (loaded.corruptCandidates > 0) corruptPackCount += 1;
      if (loaded.corruptCandidates > 0 && corruptPackSamples.length < 20) {
        corruptPackSamples.push({ history_pack: relPack, affected_rows: packRows.length });
      }
      missingPackRowTotal += packRows.length;
      continue;
    }
    packFilesLoaded += 1;
    const pack = { index: loaded.index, filePath: loaded.filePath };
    for (const registryRow of packRows) {
      const assetId = normalizeId(registryRow?.canonical_id);
      if (!assetId) continue;
      const packRow = pack.index.get(assetId);
      if (!packRow) {
        missingPackRowCount += 1;
        continue;
      }
      const historicalRow = buildRegistryRowFromBars(registryRow, packRow.bars, target);
      if (!historicalRow) {
        noBarsAsOfCount += 1;
        continue;
      }
      rows.push(historicalRow);
    }
  }

  if (outPath) {
    writeGzipAtomic(outPath, rows.map((row) => JSON.stringify(row)).join('\n') + (rows.length ? '\n' : ''));
  }

  const check = assertNoFeatureAfterAsOf(rows, target);
  return {
    target_market_date: target,
    rows,
    pit_check: check,
    source: 'history_pack_pit_slice',
    registry_override_path: outPath ? safeRel(outPath) : null,
    history_roots_checked: roots.map(safeRel),
    history_root_found: packFilesLoaded > 0,
    registry_row_count: registryRows.length,
    stratified_sample: Boolean(stratifiedSample && maxAssets),
    emitted_row_count: rows.length,
    pack_files_loaded: packFilesLoaded,
    history_pack_missing_count: missingPackCount,
    history_pack_missing_row_count: missingPackRowTotal,
    history_pack_row_missing_count: missingPackRowCount,
    history_pack_pointer_missing_count: noPointerCount,
    history_pack_corrupt_count: corruptPackCount,
    history_pack_corrupt_candidate_count: corruptPackCandidateCount,
    history_pack_readable_wrong_bucket_count: readableWrongPackCount,
    history_pack_corrupt_samples: corruptPackSamples,
    no_bars_asof_count: noBarsAsOfCount,
  };
}

export function loadHistoricalRegistriesAsOfDates({
  targetMarketDates = [],
  maxAssets = null,
  historyRoots = null,
  outDir = null,
  stratifiedSample = false,
} = {}) {
  const dates = Array.from(new Set((targetMarketDates || []).map(isoDate).filter(Boolean))).sort();
  if (!dates.length) throw new Error('TARGET_MARKET_DATES_REQUIRED');
  const registryRows = stratifiedSample && maxAssets
    ? stratifyRegistryRows(readRegistryRows({ maxAssets: null }), maxAssets)
    : readRegistryRows({ maxAssets });
  const roots = historyRootCandidates(historyRoots);
  const rowsByPack = new Map();
  const entries = [];
  let noPointerCount = 0;
  let missingPackCount = 0;
  let missingPackRowTotal = 0;
  let missingPackRowCount = 0;
  let packFilesLoaded = 0;
  let corruptPackCount = 0;
  let corruptPackCandidateCount = 0;
  let readableWrongPackCount = 0;
  const corruptPackSamples = [];

  for (const registryRow of registryRows) {
    const assetId = normalizeId(registryRow?.canonical_id);
    const relPack = registryRow?.pointers?.history_pack || registryRow?.history_pack;
    if (!assetId || !relPack) {
      noPointerCount += 1;
      continue;
    }
    const list = rowsByPack.get(relPack) || [];
    list.push(registryRow);
    rowsByPack.set(relPack, list);
  }

  for (const [relPack, packRows] of rowsByPack.entries()) {
    const expectedIds = packRows.map((row) => normalizeId(row?.canonical_id)).filter(Boolean);
    const loaded = readFirstReadablePack(relPack, roots, expectedIds);
    corruptPackCandidateCount += loaded.corruptCandidates;
    readableWrongPackCount += loaded.readableWithoutExpectedIds || 0;
    if (loaded.missing) {
      missingPackCount += 1;
      missingPackRowTotal += packRows.length;
      continue;
    }
    if (!loaded.ok) {
      if (loaded.corruptCandidates > 0) corruptPackCount += 1;
      if (loaded.corruptCandidates > 0 && corruptPackSamples.length < 20) {
        corruptPackSamples.push({ history_pack: relPack, affected_rows: packRows.length });
      }
      missingPackRowTotal += packRows.length;
      continue;
    }
    packFilesLoaded += 1;
    for (const registryRow of packRows) {
      const assetId = normalizeId(registryRow?.canonical_id);
      const packRow = loaded.index.get(assetId);
      if (!packRow) {
        missingPackRowCount += 1;
        continue;
      }
      entries.push({ registryRow, preparedBars: prepareBarsForBatch(packRow.bars || []) });
    }
  }

  const staticStats = {
    source: 'history_pack_pit_slice_batch_cache',
    history_root_found: packFilesLoaded > 0,
    registry_row_count: registryRows.length,
    stratified_sample: Boolean(stratifiedSample && maxAssets),
    pack_files_loaded: packFilesLoaded,
    history_pack_missing_count: missingPackCount,
    history_pack_missing_row_count: missingPackRowTotal,
    history_pack_row_missing_count: missingPackRowCount,
    history_pack_pointer_missing_count: noPointerCount,
    history_pack_corrupt_count: corruptPackCount,
    history_pack_corrupt_candidate_count: corruptPackCandidateCount,
    history_pack_readable_wrong_bucket_count: readableWrongPackCount,
    history_pack_corrupt_samples: corruptPackSamples,
  };

  const byDate = new Map();
  for (const target of dates) {
    const rows = [];
    let noBarsAsOfCount = 0;
    for (const entry of entries) {
      const historicalRow = buildRegistryRowFromPreparedBars(entry.registryRow, entry.preparedBars, target);
      if (!historicalRow) {
        noBarsAsOfCount += 1;
        continue;
      }
      rows.push(historicalRow);
    }
    let outPath = null;
    if (outDir) {
      outPath = path.join(outDir, `${target}.registry.ndjson.gz`);
      writeGzipAtomic(outPath, rows.map((row) => JSON.stringify(row)).join('\n') + (rows.length ? '\n' : ''));
    }
    const check = assertNoFeatureAfterAsOf(rows, target);
    byDate.set(target, {
      target_market_date: target,
      rows,
      pit_check: check,
      ...staticStats,
      emitted_row_count: rows.length,
      no_bars_asof_count: noBarsAsOfCount,
      registry_override_path: outPath ? safeRel(outPath) : null,
      history_roots_checked: roots.map(safeRel),
    });
  }

  return { dates, byDate, static_stats: staticStats };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const argv = process.argv.slice(2);
  const get = (name) => {
    const eq = argv.find((arg) => arg.startsWith(`--${name}=`));
    if (eq) return eq.split('=').slice(1).join('=');
    const index = argv.indexOf(`--${name}`);
    return index >= 0 ? argv[index + 1] : null;
  };
  const target = get('target-market-date');
  const maxAssets = Number(get('max-assets') || 0) || null;
  const outPath = get('out');
  const stratifiedSample = argv.includes('--stratified-sample');
  const result = loadHistoricalRegistryAsOf({ targetMarketDate: target, maxAssets, outPath, stratifiedSample });
  console.log(JSON.stringify({
    target_market_date: result.target_market_date,
    row_count: result.rows.length,
    source: result.source,
    history_root_found: result.history_root_found,
    pack_files_loaded: result.pack_files_loaded,
    history_pack_missing_count: result.history_pack_missing_count,
    history_pack_missing_row_count: result.history_pack_missing_row_count,
    history_pack_row_missing_count: result.history_pack_row_missing_count,
    history_pack_pointer_missing_count: result.history_pack_pointer_missing_count,
    history_pack_corrupt_count: result.history_pack_corrupt_count,
    history_pack_corrupt_candidate_count: result.history_pack_corrupt_candidate_count,
    history_pack_readable_wrong_bucket_count: result.history_pack_readable_wrong_bucket_count,
    history_pack_corrupt_samples: result.history_pack_corrupt_samples,
    no_bars_asof_count: result.no_bars_asof_count,
    pit_check: result.pit_check,
    registry_override_path: result.registry_override_path,
    stratified_sample: result.stratified_sample,
  }, null, 2));
  if (!result.pit_check.ok || !result.rows.length) process.exit(1);
}
