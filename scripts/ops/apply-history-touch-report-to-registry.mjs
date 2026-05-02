#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

const ROOT = path.resolve(new URL('.', import.meta.url).pathname, '../..');

const DEFAULT_TOUCH_REPORT = path.join(ROOT, 'mirrors/universe-v7/reports/history_touch_report.json');
const DEFAULT_REGISTRY = path.join(ROOT, 'public/data/universe/v7/registry/registry.ndjson.gz');
const DEFAULT_SNAPSHOT = path.join(ROOT, 'public/data/universe/v7/registry/registry.snapshot.json.gz');
const DEFAULT_OUTPUT = path.join(ROOT, 'public/data/universe/v7/registry/history-touch-apply-report.json');

function parseArgs(argv) {
  const out = {
    touchReport: DEFAULT_TOUCH_REPORT,
    registry: DEFAULT_REGISTRY,
    snapshot: DEFAULT_SNAPSHOT,
    output: DEFAULT_OUTPUT,
    dryRun: false,
    scanExistingPacks: false,
    ignoreFresh: false,
    allowEmpty: false,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = String(argv[i] || '');
    const readValue = () => {
      if (arg.includes('=')) return arg.slice(arg.indexOf('=') + 1);
      i += 1;
      return argv[i];
    };
    if (arg === '--touch-report' || arg.startsWith('--touch-report=')) out.touchReport = resolveRepoPath(readValue());
    else if (arg === '--registry-path' || arg.startsWith('--registry-path=')) out.registry = resolveRepoPath(readValue());
    else if (arg === '--snapshot-path' || arg.startsWith('--snapshot-path=')) out.snapshot = resolveRepoPath(readValue());
    else if (arg === '--output-path' || arg.startsWith('--output-path=')) out.output = resolveRepoPath(readValue());
    else if (arg === '--dry-run') out.dryRun = true;
    else if (arg === '--scan-existing-packs') out.scanExistingPacks = true;
    else if (arg === '--ignore-fresh') out.ignoreFresh = true;
    else if (arg === '--allow-empty') out.allowEmpty = true;
  }
  return out;
}

function resolveRepoPath(value) {
  const raw = String(value || '').trim();
  if (!raw) return raw;
  return path.isAbsolute(raw) ? raw : path.join(ROOT, raw);
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function readJsonGz(filePath) {
  return JSON.parse(zlib.gunzipSync(fs.readFileSync(filePath)).toString('utf8'));
}

function readNdjsonGz(filePath) {
  return zlib.gunzipSync(fs.readFileSync(filePath))
    .toString('utf8')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

function writeAtomic(filePath, buffer) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const tmp = `${filePath}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, buffer);
  fs.renameSync(tmp, filePath);
}

function writeJson(filePath, payload) {
  writeAtomic(filePath, Buffer.from(`${JSON.stringify(payload, null, 2)}\n`, 'utf8'));
}

function writeJsonGz(filePath, payload) {
  writeAtomic(filePath, zlib.gzipSync(Buffer.from(JSON.stringify(payload), 'utf8')));
}

function writeNdjsonGz(filePath, rows) {
  const body = rows.map((row) => JSON.stringify(row)).join('\n') + (rows.length ? '\n' : '');
  writeAtomic(filePath, zlib.gzipSync(Buffer.from(body, 'utf8')));
}

function normalizeId(value) {
  return String(value || '').trim().toUpperCase();
}

function normalizeDate(value) {
  const iso = String(value || '').slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(iso) ? iso : null;
}

function newerDate(a, b) {
  const left = normalizeDate(a);
  const right = normalizeDate(b);
  if (!left) return right;
  if (!right) return left;
  return right > left ? right : left;
}

function approxStalenessBusinessDays(lastTradeDate, targetDate) {
  const last = normalizeDate(lastTradeDate);
  const target = normalizeDate(targetDate);
  if (!last || !target || last >= target) return 0;
  const diffMs = Date.parse(`${target}T00:00:00Z`) - Date.parse(`${last}T00:00:00Z`);
  if (!Number.isFinite(diffMs) || diffMs <= 0) return 0;
  return Math.floor((Math.floor(diffMs / 86400000) * 5) / 7);
}

function historyPackAbsPath(relPack) {
  const rel = String(relPack || '').trim();
  if (!rel) return null;
  if (path.isAbsolute(rel)) return rel;
  return path.join(ROOT, 'mirrors/universe-v7', rel.replace(/^\/+/, ''));
}

function createPackStatsLoader() {
  const cache = new Map();
  return function loadPackStats(relPack) {
    const rel = String(relPack || '').trim();
    if (!rel) return { ok: false, reason: 'missing_history_pack_pointer', stats: new Map() };
    if (cache.has(rel)) return cache.get(rel);
    const abs = historyPackAbsPath(rel);
    if (!abs || !fs.existsSync(abs)) {
      const result = { ok: false, reason: 'pack_missing', stats: new Map() };
      cache.set(rel, result);
      return result;
    }
    const stats = new Map();
    try {
      const rows = zlib.gunzipSync(fs.readFileSync(abs))
        .toString('utf8')
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean)
        .map((line) => JSON.parse(line));
      for (const row of rows) {
        const canonicalId = normalizeId(row?.canonical_id);
        const bars = Array.isArray(row?.bars) ? row.bars : [];
        const dates = bars
          .map((bar) => normalizeDate(bar?.date || bar?.trading_date || null))
          .filter(Boolean)
          .sort();
        stats.set(canonicalId, {
          bars_count: bars.length,
          last_trade_date: dates.length ? dates[dates.length - 1] : null,
        });
      }
      const result = { ok: true, reason: 'ok', stats };
      cache.set(rel, result);
      return result;
    } catch (error) {
      const result = { ok: false, reason: `pack_read_failed:${error?.message || error}`, stats: new Map() };
      cache.set(rel, result);
      return result;
    }
  };
}

function buildTouchIndex(touchReport) {
  const entries = Array.isArray(touchReport?.entries) ? touchReport.entries : [];
  const byId = new Map();
  for (const entry of entries) {
    const canonicalId = normalizeId(entry?.canonical_id);
    const lastDateAfter = normalizeDate(entry?.last_date_after);
    if (!canonicalId || !lastDateAfter) continue;
    const current = byId.get(canonicalId);
    if (!current || lastDateAfter > current.last_date_after) {
      byId.set(canonicalId, {
        canonical_id: canonicalId,
        history_pack: String(entry?.history_pack || '').trim(),
        pack_sha256: String(entry?.pack_sha256 || '').trim(),
        history_effective_sha256: String(entry?.history_effective_sha256 || entry?.pack_sha256 || '').trim(),
        last_date_before: normalizeDate(entry?.last_date_before),
        last_date_after: lastDateAfter,
      });
    }
  }
  return byId;
}

function applyToRows(rows, touchIndex, { targetDate, appliedAt }) {
  let rowsTouched = 0;
  let datesAdvanced = 0;
  let packHashesUpdated = 0;
  const missing = new Set(touchIndex.keys());

  for (const row of rows) {
    const canonicalId = normalizeId(row?.canonical_id);
    const touch = touchIndex.get(canonicalId);
    if (!touch) continue;
    missing.delete(canonicalId);
    rowsTouched += 1;

    const beforeDate = normalizeDate(row.last_trade_date);
    const nextDate = newerDate(beforeDate, touch.last_date_after);
    if (nextDate && nextDate !== beforeDate) {
      row.last_trade_date = nextDate;
      datesAdvanced += 1;
    }

    if (touch.history_pack || touch.pack_sha256) {
      row.pointers = row.pointers && typeof row.pointers === 'object' ? row.pointers : {};
      if (touch.history_pack && row.pointers.history_pack !== touch.history_pack) {
        row.pointers.history_pack = touch.history_pack;
      }
      if (touch.pack_sha256 && row.pointers.pack_sha256 !== touch.pack_sha256) {
        row.pointers.pack_sha256 = touch.pack_sha256;
        packHashesUpdated += 1;
      }
      if (touch.history_effective_sha256 && row.pointers.history_effective_sha256 !== touch.history_effective_sha256) {
        row.pointers.history_effective_sha256 = touch.history_effective_sha256;
      }
    }

    if (row.computed && typeof row.computed === 'object' && nextDate) {
      row.computed.staleness_bd = approxStalenessBusinessDays(nextDate, targetDate);
    }
    row.meta = {
      ...(row.meta && typeof row.meta === 'object' ? row.meta : {}),
      updated_at: appliedAt,
      history_touch_report_applied_at: appliedAt,
      history_touch_report_last_date_after: touch.last_date_after,
    };
  }

  return {
    rows_touched: rowsTouched,
    dates_advanced: datesAdvanced,
    pack_hashes_updated: packHashesUpdated,
    missing_registry_rows: missing.size,
  };
}

function scanRowsFromExistingPacks(rows, { targetDate, appliedAt, loadPackStats, ignoreFresh = false }) {
  let rowsScanned = 0;
  let rowsWithPackStats = 0;
  let datesAdvanced = 0;
  let barsCountsUpdated = 0;
  let missingPackPointer = 0;
  let missingPackFile = 0;
  let missingAssetInPack = 0;
  let skippedFresh = 0;
  const sampleMissingAssetInPack = [];

  for (const row of rows) {
    const canonicalId = normalizeId(row?.canonical_id);
    if (!canonicalId) continue;
    const currentDate = normalizeDate(row.last_trade_date);
    if (!ignoreFresh && targetDate && currentDate && currentDate >= targetDate) {
      skippedFresh += 1;
      continue;
    }
    const relPack = String(row?.pointers?.history_pack || row?.history_pack || '').trim();
    if (!relPack) {
      missingPackPointer += 1;
      continue;
    }
    rowsScanned += 1;
    const loaded = loadPackStats(relPack);
    if (!loaded.ok) {
      if (loaded.reason === 'pack_missing') missingPackFile += 1;
      continue;
    }
    const stats = loaded.stats.get(canonicalId);
    if (!stats) {
      missingAssetInPack += 1;
      if (sampleMissingAssetInPack.length < 20) sampleMissingAssetInPack.push(canonicalId);
      continue;
    }
    rowsWithPackStats += 1;
    const beforeDate = normalizeDate(row.last_trade_date);
    const nextDate = newerDate(beforeDate, stats.last_trade_date);
    let changed = false;
    if (nextDate && nextDate !== beforeDate) {
      row.last_trade_date = nextDate;
      datesAdvanced += 1;
      changed = true;
    }
    if (Number.isFinite(Number(stats.bars_count)) && Number(row.bars_count || 0) !== Number(stats.bars_count)) {
      row.bars_count = Number(stats.bars_count);
      barsCountsUpdated += 1;
      changed = true;
    }
    if (changed) {
      if (row.computed && typeof row.computed === 'object' && row.last_trade_date) {
        row.computed.staleness_bd = approxStalenessBusinessDays(row.last_trade_date, targetDate);
      }
      row.meta = {
        ...(row.meta && typeof row.meta === 'object' ? row.meta : {}),
        updated_at: appliedAt,
        history_pack_scan_applied_at: appliedAt,
      };
    }
  }

  return {
    rows_scanned: rowsScanned,
    rows_with_pack_stats: rowsWithPackStats,
    skipped_fresh: skippedFresh,
    dates_advanced: datesAdvanced,
    bars_counts_updated: barsCountsUpdated,
    missing_pack_pointer: missingPackPointer,
    missing_pack_file: missingPackFile,
    missing_asset_in_pack: missingAssetInPack,
    sample_missing_asset_in_pack: sampleMissingAssetInPack,
  };
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const touchReport = readJson(args.touchReport);
  const targetDate = normalizeDate(touchReport?.meta?.to_date || touchReport?.to_date || null);
  const touchIndex = buildTouchIndex(touchReport);
  const appliedAt = new Date().toISOString();
  if (!touchIndex.size && !args.scanExistingPacks && !args.allowEmpty) {
    throw new Error(`history_touch_report_has_no_entries:${args.touchReport}`);
  }

  const registryRows = readNdjsonGz(args.registry);
  const snapshot = fs.existsSync(args.snapshot) ? readJsonGz(args.snapshot) : null;
  const snapshotRows = Array.isArray(snapshot?.records) ? snapshot.records : [];

  const registryResult = applyToRows(registryRows, touchIndex, { targetDate, appliedAt });
  const snapshotResult = snapshotRows.length
    ? applyToRows(snapshotRows, touchIndex, { targetDate, appliedAt })
    : null;
  const loadPackStats = args.scanExistingPacks ? createPackStatsLoader() : null;
  const registryPackScan = loadPackStats
    ? scanRowsFromExistingPacks(registryRows, { targetDate, appliedAt, loadPackStats, ignoreFresh: args.ignoreFresh })
    : null;
  const snapshotPackScan = loadPackStats && snapshotRows.length
    ? scanRowsFromExistingPacks(snapshotRows, { targetDate, appliedAt, loadPackStats, ignoreFresh: args.ignoreFresh })
    : null;

  const report = {
    schema: 'rv.history_touch_registry_apply.v1',
    generated_at: appliedAt,
    dry_run: args.dryRun,
    source_touch_report: path.relative(ROOT, args.touchReport),
    registry_path: path.relative(ROOT, args.registry),
    snapshot_path: fs.existsSync(args.snapshot) ? path.relative(ROOT, args.snapshot) : null,
    target_market_date: targetDate,
    touch_entries: touchIndex.size,
    registry: registryResult,
    snapshot: snapshotResult,
    pack_scan_enabled: args.scanExistingPacks,
    registry_pack_scan: registryPackScan,
    snapshot_pack_scan: snapshotPackScan,
  };

  if (!args.dryRun) {
    writeNdjsonGz(args.registry, registryRows);
    if (snapshot && snapshotRows.length) {
      snapshot.generated_at = appliedAt;
      snapshot.record_count = snapshotRows.length;
      writeJsonGz(args.snapshot, snapshot);
    }
  }
  writeJson(args.output, report);
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
}

try {
  main();
} catch (error) {
  process.stderr.write(`${error?.stack || error}\n`);
  process.exit(1);
}
