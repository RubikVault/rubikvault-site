#!/usr/bin/env node

import fs from 'node:fs';
import zlib from 'node:zlib';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = path.resolve(fileURLToPath(new URL('.', import.meta.url)), '../..');
const DEFAULT_INPUT = path.join(REPO_ROOT, 'public/data/ops/stock-analyzer-operability-latest.json');
const DEFAULT_SUMMARY_OUTPUT = path.join(REPO_ROOT, 'public/data/ops/stock-analyzer-operability-summary-latest.json');
const DEFAULT_AUDIT_REPORT = path.join(REPO_ROOT, 'public/data/reports/stock-analyzer-universe-audit-latest.json');
const DEFAULT_FINAL_SEAL = path.join(REPO_ROOT, 'public/data/ops/final-integrity-seal-latest.json');
const DEFAULT_MIN_BARS = 200;
const RELEASE_GREEN_THRESHOLD = 0.90;

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
        index.set(entry.canonical_id, Number(entry.bars_count) || 0);
      }
    } catch { /* skip malformed lines */ }
  }
  return index;
}

function effectiveBars(row, registryIndex) {
  const existing = registryBars(row);
  if (registryIndex) {
    const fromRegistry = registryIndex.get(row.canonical_id) ?? 0;
    // MAX: never let registry shrink a correct existing value (global vs exchange-specific
    // pack counts differ), but DO let a higher registry value override a corrupted/missing one.
    const best = Math.max(existing ?? 0, fromRegistry);
    return best > 0 ? best : null;
  }
  return existing;
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

function isOperational(row) {
  return row?.operational === true || String(row?.current_ui_title || '').trim() === 'All systems operational';
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

function buildSummary(records, { minBars = DEFAULT_MIN_BARS, registryIndex = null } = {}) {
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
    const operational = isOperational(row);
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

export function rebuildOperabilityDocument(inputDoc, { minBars = DEFAULT_MIN_BARS, targetMarketDate = null, registryIndex = null } = {}) {
  const records = Array.isArray(inputDoc?.records) ? inputDoc.records : [];
  if (!records.length) throw new Error('stock_analyzer_operability_records_missing');
  const updatedRecords = records.map((row) => {
    const bars = effectiveBars(row, registryIndex);
    const family = String(row?.primary_reason_family || '').trim();
    const targetable = bars != null && bars >= minBars && !NON_TARGETABLE_FAMILIES.has(family);
    const updatedRow = registryIndex != null
      ? { ...row, registry_bars_count: bars ?? row.registry_bars_count ?? null }
      : { ...row };
    return {
      ...updatedRow,
      targetable,
      targetable_basis: 'registry_bars_count',
      targetable_min_bars: minBars,
      operational: isOperational(updatedRow),
    };
  });
  const summary = buildSummary(updatedRecords, { minBars, registryIndex: null });
  const resolvedTargetMarketDate = targetMarketDate || inputDoc?.target_market_date || inputDoc?.target_date || null;
  return {
    ...inputDoc,
    schema: inputDoc.schema || 'rv.stock_analyzer_operability.v1',
    schema_version: inputDoc.schema_version || 'rv.stock_analyzer_operability.v1',
    target_market_date: resolvedTargetMarketDate,
    input_target_market_date: inputDoc?.target_market_date || inputDoc?.target_date || null,
    required_min_bars: minBars,
    producer: 'scripts/ops/build-stock-analyzer-operability.mjs',
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
  const fullDoc = rebuildOperabilityDocument(input, { minBars: options.minBars, targetMarketDate, registryIndex });
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
