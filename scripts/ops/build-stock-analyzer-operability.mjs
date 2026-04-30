#!/usr/bin/env node

import fs from 'node:fs';
import zlib from 'node:zlib';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import {
  pageCoreClaimsOperational,
  pageCoreStrictOperationalReasons,
} from '../../functions/api/_shared/page-core-reader.js';

const REPO_ROOT = path.resolve(fileURLToPath(new URL('.', import.meta.url)), '../..');
const DEFAULT_INPUT = path.join(REPO_ROOT, 'public/data/ops/stock-analyzer-operability-latest.json');
const DEFAULT_SUMMARY_OUTPUT = path.join(REPO_ROOT, 'public/data/ops/stock-analyzer-operability-summary-latest.json');
const DEFAULT_AUDIT_REPORT = path.join(REPO_ROOT, 'public/data/reports/stock-analyzer-universe-audit-latest.json');
const DEFAULT_FINAL_SEAL = path.join(REPO_ROOT, 'public/data/ops/final-integrity-seal-latest.json');
const DEFAULT_PAGE_CORE_LATEST = path.join(REPO_ROOT, 'public/data/page-core/latest.json');
const DEFAULT_MIN_BARS = 200;
const RELEASE_GREEN_THRESHOLD = 0.90;
const OPERATIONAL_ASSET_CLASSES = new Set(['STOCK', 'ETF', 'INDEX']);

function parseArgs(argv = process.argv.slice(2)) {
  const get = (name) => {
    const prefix = `--${name}=`;
    const inline = argv.find((arg) => arg.startsWith(prefix));
    if (inline) return inline.slice(prefix.length);
    const idx = argv.indexOf(`--${name}`);
    if (idx >= 0) return argv[idx + 1] || '';
    return null;
  };
  return {
    input: path.resolve(get('input') || DEFAULT_INPUT),
    fullOutput: path.resolve(get('full-output') || get('output') || DEFAULT_INPUT),
    summaryOutput: path.resolve(get('summary-output') || DEFAULT_SUMMARY_OUTPUT),
    minBars: Math.max(1, Number(get('min-bars') || process.env.RV_STOCK_ANALYZER_TARGETABLE_MIN_BARS || DEFAULT_MIN_BARS)),
    targetMarketDate: get('target-market-date') || process.env.RV_TARGET_MARKET_DATE || process.env.TARGET_MARKET_DATE || null,
    summaryOnly: argv.includes('--summary-only'),
    refreshRegistry: argv.includes('--refresh-from-registry'),
    registryPath: get('registry-path') ? path.resolve(get('registry-path')) : null,
    pageCoreLatestPath: get('page-core-latest') ? path.resolve(REPO_ROOT, get('page-core-latest')) : DEFAULT_PAGE_CORE_LATEST,
  };
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function readJsonMaybe(filePath) {
  try {
    return readJson(filePath);
  } catch {
    return null;
  }
}

function resolveTargetMarketDate(inputDoc, explicitTargetMarketDate = null) {
  if (explicitTargetMarketDate) return explicitTargetMarketDate;
  for (const filePath of [DEFAULT_AUDIT_REPORT, DEFAULT_FINAL_SEAL]) {
    const doc = readJsonMaybe(filePath);
    const target = doc?.target_market_date || doc?.target_date || null;
    if (target) return target;
  }
  return inputDoc?.target_market_date || inputDoc?.target_date || null;
}

function writeJsonAtomic(filePath, payload) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const tmp = `${filePath}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
  fs.renameSync(tmp, filePath);
}

function artifactHash(document) {
  const cloned = JSON.parse(JSON.stringify(document));
  delete cloned.artifact_hash;
  return createHash('sha256').update(JSON.stringify(cloned)).digest('hex');
}

function toFiniteNumber(value) {
  if (value == null || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function isoDate(value) {
  if (typeof value !== 'string' || value.length < 10) return null;
  const iso = value.slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(iso) ? iso : null;
}

function registryBars(row) {
  return toFiniteNumber(row?.registry_bars_count);
}

function loadRegistryIndex(registryPath) {
  const buf = fs.readFileSync(registryPath);
  const text = zlib.gunzipSync(buf).toString('utf8');
  const index = new Map();
  for (const line of text.split('\n')) {
    if (!line.trim()) continue;
    try {
      const entry = JSON.parse(line);
      if (entry.canonical_id) {
        index.set(String(entry.canonical_id).toUpperCase(), {
          bars_count: Number(entry.bars_count) || 0,
          last_trade_date: isoDate(entry.last_trade_date || entry.latest_bar_date || entry.actual_last_trade_date),
          asset_class: String(entry.type_norm || entry.asset_class || '').toUpperCase() || null,
          symbol: entry.symbol || entry.ticker || null,
        });
      }
    } catch { /* skip malformed lines */ }
  }
  return index;
}

function registryRecord(row, registryIndex) {
  if (!registryIndex || !row?.canonical_id) return null;
  const value = registryIndex.get(String(row.canonical_id).toUpperCase());
  if (value == null) return null;
  if (typeof value === 'number') return { bars_count: value };
  return value && typeof value === 'object' ? value : null;
}

function effectiveBars(row, registryIndex) {
  const existing = registryBars(row);
  if (registryIndex) {
    const fromRegistry = toFiniteNumber(registryRecord(row, registryIndex)?.bars_count);
    return fromRegistry;
  }
  return existing;
}

function resolveSnapshotPath(latestPath, latest) {
  const raw = String(latest?.snapshot_path || '').replace(/^\/+/, '');
  if (!raw) throw new Error('PAGE_CORE_SNAPSHOT_PATH_MISSING');
  return path.join(REPO_ROOT, 'public', raw);
}

function readMaybeGzipJson(filePath) {
  const body = fs.readFileSync(filePath);
  const text = filePath.endsWith('.gz') ? zlib.gunzipSync(body).toString('utf8') : body.toString('utf8');
  return JSON.parse(text);
}

function loadPageCoreIndex(latestPath) {
  if (!latestPath || !fs.existsSync(latestPath)) return null;
  const latest = readJson(latestPath);
  if (!latest || latest.schema !== 'rv.page_core_latest.v1') return null;
  const snapshotPath = resolveSnapshotPath(latestPath, latest);
  const pageDir = path.join(snapshotPath, 'page-shards');
  if (!fs.existsSync(pageDir)) return null;
  const rows = new Map();
  for (const file of fs.readdirSync(pageDir).filter((name) => name.endsWith('.json.gz')).sort()) {
    const shard = readMaybeGzipJson(path.join(pageDir, file));
    for (const row of Object.values(shard || {})) {
      const canonicalId = String(row?.canonical_asset_id || row?.identity?.canonical_id || '').toUpperCase();
      if (canonicalId) rows.set(canonicalId, row);
    }
  }
  return { latest, rows };
}

function pageCoreBars(row) {
  return toFiniteNumber(row?.coverage?.bars);
}

function pageCoreDate(row) {
  return isoDate(
    row?.market_stats_min?.latest_bar_date
    || row?.latest_bar_date
    || row?.freshness?.as_of
    || row?.price_date
  );
}

function pageCoreBlockers(row, { latest = null, minBars = DEFAULT_MIN_BARS } = {}) {
  const blockers = [];
  const assetClass = String(row?.identity?.asset_class || row?.asset_class || '').toUpperCase();
  const bars = pageCoreBars(row);
  const verdict = String(row?.summary_min?.decision_verdict || '').toUpperCase();
  const quality = String(row?.summary_min?.quality_status || '').toUpperCase();
  const govStatus = String(row?.governance_summary?.status || '').toLowerCase();
  const riskLevel = String(row?.summary_min?.risk_level || row?.governance_summary?.risk_level || '').toUpperCase();
  const governanceBlockers = Array.isArray(row?.governance_summary?.blocking_reasons)
    ? row.governance_summary.blocking_reasons
    : [];
  const warnings = [
    ...(Array.isArray(row?.meta?.warnings) ? row.meta.warnings : []),
    ...(Array.isArray(row?.governance_summary?.warnings) ? row.governance_summary.warnings : []),
    ...(Array.isArray(row?.coverage?.warnings) ? row.coverage.warnings : []),
  ].map((item) => String(item || ''));
  if (!OPERATIONAL_ASSET_CLASSES.has(assetClass)) blockers.push('asset_class_out_of_scope');
  if (bars == null || bars < minBars) blockers.push('insufficient_history');
  for (const reason of pageCoreStrictOperationalReasons(row, { latest })) {
    if (reason !== 'ui_banner_not_operational') blockers.push(reason);
  }
  if (warnings.includes('decision_bundle_missing')) blockers.push('decision_bundle_missing');
  if (warnings.includes('bars_stale')) blockers.push('bars_stale');
  if (!['BUY', 'WAIT'].includes(verdict)) blockers.push('decision_not_buy_or_wait');
  if (quality !== 'OK') blockers.push(`quality_${quality.toLowerCase() || 'missing'}`);
  if (!['ok', 'available'].includes(govStatus)) blockers.push(`governance_${govStatus || 'missing'}`);
  if (!riskLevel || riskLevel === 'UNKNOWN') blockers.push('risk_unknown');
  if (governanceBlockers.length > 0) blockers.push(String(governanceBlockers[0] || 'governance_blocked'));
  if (!pageCoreClaimsOperational(row) && blockers.length === 0) blockers.push('ui_banner_not_operational');
  return [...new Set(blockers.filter(Boolean))];
}

function rowLatestDate(row, registryEntry = null) {
  const dates = [
    row?.actual_last_trade_date,
    row?.latest_bar_date,
    row?.last_trade_date,
    row?.price_date,
    row?.target_market_date,
    row?.freshness?.as_of,
    registryEntry?.last_trade_date,
  ].map(isoDate).filter(Boolean);
  return dates.length ? dates.sort().at(-1) : null;
}

// Assets excluded from the targetable denominator regardless of bars count.
// non_tradable_or_delisted: cannot be operational by definition.
// verified_insufficient_history, verified_sparse_trading, true_short_history:
// structurally unanalyzable — previously hidden by stale bars=1 in registry,
// now explicitly excluded so the 90% gate reflects only truly targetable assets.
const NON_TARGETABLE_FAMILIES = new Set([
  'non_tradable_or_delisted_exception',
  'verified_insufficient_history_exception',
  'verified_sparse_trading_exception',
  'true_short_history',
]);

function strictOperabilityBlockers(row, { targetMarketDate = null, registryEntry = null } = {}) {
  const blockers = [];
  const titleClaimsGreen = String(row?.current_ui_title || '').trim() === 'All systems operational';
  if (row?.operational !== true && !titleClaimsGreen) blockers.push('ui_title_not_operational');
  const latestDate = rowLatestDate(row, registryEntry);
  if (targetMarketDate) {
    if (!latestDate) blockers.push('missing_latest_bar_date');
    else if (latestDate < targetMarketDate) blockers.push('bars_stale');
  }
  const stack = Array.isArray(row?.blocking_stack) ? row.blocking_stack : [];
  if (stack.length > 0) blockers.push(String(stack[0] || 'blocking_stack_present'));
  const severity = String(row?.severity || '').toLowerCase();
  if (severity && !['ok', 'info'].includes(severity)) blockers.push(`severity_${severity}`);
  return [...new Set(blockers.filter(Boolean))];
}

function isOperational(row, context = {}) {
  return strictOperabilityBlockers(row, context).length === 0;
}

function binForRegistryBars(value, minBars) {
  if (value == null || value <= 0) return 'zero_or_unknown';
  if (value < minBars) return 'one_to_199';
  if (value < 500) return 'two_hundred_to_499';
  if (value < 1000) return 'five_hundred_to_999';
  return 'one_thousand_plus';
}

function increment(map, key, by = 1) {
  map[key] = (map[key] || 0) + by;
}

function compactExamples(rows, limit = 3) {
  return rows.slice(0, limit).map((row) => ({
    canonical_id: row.canonical_id || null,
    registry_bars_count: row.registry_bars_count ?? null,
    pack_bars_count: row.pack_bars_count ?? null,
    actual_adjusted_bars_count: row.actual_adjusted_bars_count ?? null,
  }));
}

function buildSummary(records, { minBars = DEFAULT_MIN_BARS, registryIndex = null, targetMarketDate = null } = {}) {
  const barBins = {
    zero_or_unknown: { assets: 0, operational_assets: 0 },
    one_to_199: { assets: 0, operational_assets: 0 },
    two_hundred_to_499: { assets: 0, operational_assets: 0 },
    five_hundred_to_999: { assets: 0, operational_assets: 0 },
    one_thousand_plus: { assets: 0, operational_assets: 0 },
  };
  const uiTitleCounts = {};
  const reasonFamilyCounts = {};
  const structuralExceptionCounts = {};
  const targetableReasonCounts = {};
  const examplesByFamily = {};
  const targetableNonOperationalExamples = [];
  const structuralFamilies = new Set([
    'non_tradable_or_delisted_exception',
    'verified_insufficient_history_exception',
    'true_short_history',
    'verified_sparse_trading_exception',
  ]);

  let operationalAssets = 0;
  let targetableAssets = 0;
  let targetableOperationalAssets = 0;
  let registryBarsUnknownAssets = 0;
  let targetableNonOperationalAssets = 0;
  let bugsRemaining = 0;
  let globalBlockersRemaining = 0;
  let unclassifiedAssets = 0;

  for (const row of records) {
    const bars = effectiveBars(row, registryIndex);
    const bin = binForRegistryBars(bars, minBars);
    const operational = isOperational(row, {
      targetMarketDate,
      registryEntry: registryRecord(row, registryIndex),
    });
    const family = String(row?.primary_reason_family || '').trim();
    const targetable = bars != null && bars >= minBars && !NON_TARGETABLE_FAMILIES.has(family);

    if (bars == null) registryBarsUnknownAssets += 1;
    barBins[bin].assets += 1;
    if (operational) {
      operationalAssets += 1;
      barBins[bin].operational_assets += 1;
    }
    if (targetable) {
      targetableAssets += 1;
      if (operational) {
        targetableOperationalAssets += 1;
      } else {
        targetableNonOperationalAssets += 1;
        if (targetableNonOperationalExamples.length < 20) {
          targetableNonOperationalExamples.push({
            canonical_id: row.canonical_id || null,
            symbol: row.symbol || null,
            registry_bars_count: bars,
            current_ui_title: row.current_ui_title || null,
            primary_reason_family: family || null,
          });
        }
        increment(targetableReasonCounts, family || 'unclassified');
      }
    }

    increment(uiTitleCounts, row?.current_ui_title || 'unknown');
    if (family) {
      increment(reasonFamilyCounts, family);
      if (structuralFamilies.has(family)) increment(structuralExceptionCounts, family);
      examplesByFamily[family] ||= [];
      if (examplesByFamily[family].length < 3) examplesByFamily[family].push(row);
    } else if (!operational && !targetable) {
      unclassifiedAssets += 1;
    }

    const severity = String(row?.severity || '').toLowerCase();
    const stack = Array.isArray(row?.blocking_stack) ? row.blocking_stack : [];
    const isStructural = family && structuralFamilies.has(family);
    if (!operational && targetable && !isStructural) {
      bugsRemaining += 1;
    }
    if (severity === 'critical' && !isStructural) {
      globalBlockersRemaining += 1;
    }
    if (stack.includes('missing_local_history_bug') || stack.includes('registry_or_pack_bug')) {
      bugsRemaining += 1;
    }
  }

  const targetableGreenRatio = targetableAssets > 0
    ? Number((targetableOperationalAssets / targetableAssets).toFixed(6))
    : null;
  const nonTargetableAssets = records.length - targetableAssets;
  const releaseBlocked = targetableAssets <= 0
    || targetableGreenRatio < RELEASE_GREEN_THRESHOLD
    || bugsRemaining > 0
    || globalBlockersRemaining > 0;

  return {
    total_assets: records.length,
    coverage_denominator: 'targetable_assets_min_registry_bars',
    required_min_bars: minBars,
    targetable_min_bars: minBars,
    targetable_assets: targetableAssets,
    operational_assets: operationalAssets,
    targetable_operational_assets: targetableOperationalAssets,
    targetable_non_operational_assets: targetableNonOperationalAssets,
    non_targetable_assets: nonTargetableAssets,
    verified_exception_count: nonTargetableAssets,
    registry_zero_or_unknown_bar_assets: barBins.zero_or_unknown.assets,
    registry_bars_unknown_assets: registryBarsUnknownAssets,
    warming_up_assets: barBins.one_to_199.assets,
    bugs_remaining: bugsRemaining,
    global_blockers_remaining: globalBlockersRemaining,
    unclassified_assets: unclassifiedAssets,
    ui_title_counts: uiTitleCounts,
    primary_reason_family_counts: reasonFamilyCounts,
    structural_exception_counts: structuralExceptionCounts,
    targetable_non_operational_reason_counts: targetableReasonCounts,
    bar_count_bins: barBins,
    examples: Object.fromEntries(
      Object.entries(examplesByFamily).map(([family, rows]) => [family, compactExamples(rows)]),
    ),
    targetable_non_operational_examples: targetableNonOperationalExamples,
    targetable_green_ratio: targetableGreenRatio,
    release_green_threshold: RELEASE_GREEN_THRESHOLD,
    release_blocked: releaseBlocked,
  };
}

// Stale exception families that should be cleared when registry confirms healthy data.
// non_tradable_or_delisted: stale tag if registry now has ≥minBars from real pack scan.
// verified_insufficient_history: graduates once registry shows ≥minBars.
// true_short_history: same — graduates once history catches up.
// verified_sparse_trading is INTENTIONALLY excluded — sparse trading is a quality issue
// independent of bar count and must be re-validated by EODHD provider check, not registry alone.
const RECONCILABLE_FAMILIES = new Set([
  'non_tradable_or_delisted_exception',
  'verified_insufficient_history_exception',
  'true_short_history',
]);

function modulesAllClean(row) {
  const flags = row?.module_stale_flags;
  if (!flags || typeof flags !== 'object') return true;
  return !Object.values(flags).some((v) => v === true);
}

function reconcileFromRegistry(row, bars, minBars, { targetMarketDate = null, registryEntry = null } = {}) {
  const family = String(row?.primary_reason_family || '').trim();
  if (!family || !RECONCILABLE_FAMILIES.has(family)) return row;
  if (bars == null || bars < minBars) return row;
  if (!modulesAllClean(row)) return row;
  if (targetMarketDate) {
    const latestDate = rowLatestDate(row, registryEntry);
    if (!latestDate || latestDate < targetMarketDate) return row;
  }
  return {
    ...row,
    primary_reason_family: null,
    structural_exception_class: null,
    blocking_stack: [],
    blocking_step: null,
    severity: 'ok',
    current_ui_title: 'All systems operational',
    operational: true,
    required_action: 'none',
    auto_fixable: false,
    exception_expires_at: null,
    reason_codes: Array.isArray(row?.reason_codes)
      ? row.reason_codes.filter((c) => c !== 'bars_missing' && c !== 'provider_no_data')
      : [],
    reconciliation: {
      reconciled_from_family: family,
      reconciled_at: new Date().toISOString(),
      reconciliation_basis: 'registry_bars_count_and_target_date_confirm_healthy',
      registry_bars_count_at_reconciliation: bars,
      last_trade_date_at_reconciliation: rowLatestDate(row, registryEntry),
    },
  };
}

function applyPageCoreTruth(row, pageRow, { latest = null, minBars = DEFAULT_MIN_BARS } = {}) {
  if (!pageRow) return row;
  const blockers = pageCoreBlockers(pageRow, { latest, minBars });
  const operational = blockers.length === 0;
  const bars = pageCoreBars(pageRow);
  const lastTradeDate = pageCoreDate(pageRow);
  return {
    ...row,
    canonical_id: row?.canonical_id || pageRow?.canonical_asset_id || null,
    symbol: row?.symbol || pageRow?.display_ticker || pageRow?.identity?.symbol || null,
    asset_class: row?.asset_class || pageRow?.identity?.asset_class || null,
    current_ui_title: operational ? 'All systems operational' : 'Analysis incomplete',
    severity: operational ? 'ok' : 'warning',
    operational,
    primary_reason_family: operational ? null : blockers[0] || 'page_core_degraded',
    blocking_stack: operational ? [] : blockers,
    reason_codes: operational ? [] : blockers,
    registry_bars_count: bars ?? row?.registry_bars_count ?? null,
    actual_last_trade_date: lastTradeDate || row?.actual_last_trade_date || null,
    ui_banner_state: pageRow?.ui_banner_state || null,
    market_stats_min_present: Boolean(pageRow?.market_stats_min),
    key_levels_ready: pageRow?.key_levels_ready === true,
    price_source: pageRow?.market_stats_min?.price_source || pageRow?.price_source || null,
    risk_level: pageRow?.summary_min?.risk_level || pageRow?.governance_summary?.risk_level || null,
    decision_verdict: pageRow?.summary_min?.decision_verdict || null,
    page_core_truth: {
      snapshot_id: latest?.snapshot_id || null,
      target_market_date: latest?.target_market_date || null,
      strict_operational: operational,
      blockers,
    },
  };
}

export function rebuildOperabilityDocument(inputDoc, {
  minBars = DEFAULT_MIN_BARS,
  targetMarketDate = null,
  registryIndex = null,
  pageCoreIndex = null,
} = {}) {
  const records = Array.isArray(inputDoc?.records) ? inputDoc.records : [];
  if (!records.length) throw new Error('stock_analyzer_operability_records_missing');
  const resolvedTargetMarketDate = targetMarketDate || inputDoc?.target_market_date || inputDoc?.target_date || pageCoreIndex?.latest?.target_market_date || null;
  const baseRecords = [...records];
  if (pageCoreIndex?.rows?.size) {
    const existingIds = new Set(records.map((row) => String(row?.canonical_id || '').toUpperCase()).filter(Boolean));
    for (const [canonicalId, pageRow] of pageCoreIndex.rows.entries()) {
      if (!existingIds.has(canonicalId)) {
        baseRecords.push({
          environment: 'PAGE_CORE',
          canonical_id: canonicalId,
          symbol: pageRow?.display_ticker || pageRow?.identity?.symbol || null,
          asset_class: pageRow?.identity?.asset_class || null,
        });
      }
    }
  }
  const updatedRecords = baseRecords.map((sourceRow) => {
    const canonicalId = String(sourceRow?.canonical_id || '').toUpperCase();
    const pageRow = pageCoreIndex?.rows?.get(canonicalId) || null;
    const row = applyPageCoreTruth(sourceRow, pageRow, { latest: pageCoreIndex?.latest || null, minBars });
    const registryEntry = registryRecord(row, registryIndex);
    const bars = effectiveBars(row, registryIndex);
    let updatedRow = registryIndex != null
      ? { ...row, registry_bars_count: bars ?? row.registry_bars_count ?? null }
      : { ...row };
    if (registryIndex != null) {
      updatedRow = reconcileFromRegistry(updatedRow, bars, minBars, {
        targetMarketDate: resolvedTargetMarketDate,
        registryEntry,
      });
    }
    const family = String(updatedRow?.primary_reason_family || '').trim();
    const targetable = bars != null && bars >= minBars && !NON_TARGETABLE_FAMILIES.has(family);
    const operational = pageRow
      ? updatedRow.operational === true
      : isOperational(updatedRow, {
        targetMarketDate: resolvedTargetMarketDate,
        registryEntry,
      });
    return {
      ...updatedRow,
      targetable,
      targetable_basis: 'registry_bars_count',
      targetable_min_bars: minBars,
      operational,
      current_ui_title: operational ? 'All systems operational' : 'Analysis incomplete',
    };
  });
  const summary = buildSummary(updatedRecords, { minBars, registryIndex: null, targetMarketDate: resolvedTargetMarketDate });
  return {
    ...inputDoc,
    schema: inputDoc.schema || 'rv.stock_analyzer_operability.v1',
    schema_version: inputDoc.schema_version || 'rv.stock_analyzer_operability.v1',
    target_market_date: resolvedTargetMarketDate,
    input_target_market_date: inputDoc?.target_market_date || inputDoc?.target_date || null,
    required_min_bars: minBars,
    producer: 'scripts/ops/build-stock-analyzer-operability.mjs',
    page_core_snapshot_id: pageCoreIndex?.latest?.snapshot_id || null,
    page_core_rows: pageCoreIndex?.rows?.size ?? null,
    generated_at: new Date().toISOString(),
    summary,
    records: updatedRecords,
  };
}

function summaryDocument(fullDoc) {
  const { records, artifact_hash: _artifactHash, ...rest } = fullDoc;
  return {
    ...rest,
    schema: 'rv.stock_analyzer_operability_summary.v1',
    schema_version: 'rv.stock_analyzer_operability_summary.v1',
    summary: fullDoc.summary,
  };
}

async function main() {
  const options = parseArgs();
  const input = readJson(options.input);
  const targetMarketDate = resolveTargetMarketDate(input, options.targetMarketDate);
  const registryIndex = (options.refreshRegistry && options.registryPath)
    ? loadRegistryIndex(options.registryPath)
    : null;
  const pageCoreIndex = loadPageCoreIndex(options.pageCoreLatestPath);
  const fullDoc = rebuildOperabilityDocument(input, {
    minBars: options.minBars,
    targetMarketDate,
    registryIndex,
    pageCoreIndex,
  });
  const summaryDoc = summaryDocument(fullDoc);
  fullDoc.artifact_hash = artifactHash(fullDoc);
  summaryDoc.artifact_hash = artifactHash(summaryDoc);

  if (!options.summaryOnly) writeJsonAtomic(options.fullOutput, fullDoc);
  writeJsonAtomic(options.summaryOutput, summaryDoc);
  process.stdout.write(`${JSON.stringify({
    ok: true,
    input: path.relative(REPO_ROOT, options.input),
    full_output: options.summaryOnly ? null : path.relative(REPO_ROOT, options.fullOutput),
    summary_output: path.relative(REPO_ROOT, options.summaryOutput),
    total_assets: fullDoc.summary.total_assets,
    targetable_assets: fullDoc.summary.targetable_assets,
    targetable_operational_assets: fullDoc.summary.targetable_operational_assets,
    targetable_green_ratio: fullDoc.summary.targetable_green_ratio,
    release_blocked: fullDoc.summary.release_blocked,
  })}\n`);
}

if (process.argv[1] && import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error(error?.stack || error);
    process.exitCode = 1;
  });
}
