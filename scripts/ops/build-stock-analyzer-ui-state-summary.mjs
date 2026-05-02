#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { gunzipSync } from 'node:zlib';
import {
  pageCoreClaimsOperational,
  pageCoreStrictOperationalReasons,
} from '../../functions/api/_shared/page-core-reader.js';

const ROOT = path.resolve(fileURLToPath(new URL('.', import.meta.url)), '../..');
const DEFAULT_LATEST = path.join(ROOT, 'public/data/page-core/latest.json');
const DEFAULT_OUT = path.join(ROOT, 'public/data/runtime/stock-analyzer-ui-state-summary-latest.json');
const DEFAULT_PROVIDER_EXCEPTIONS = path.join(ROOT, 'public/data/runtime/stock-analyzer-provider-exceptions-latest.json');
const GLOBAL_SCOPE_PATH = path.join(ROOT, 'public/data/universe/v7/ssot/assets.global.canonical.ids.json');
const MIN_GREEN_RATIO = Number(process.env.RV_STOCK_ANALYZER_UI_MIN_GREEN_RATIO || 0.90);
const OPERATIONAL_ASSET_CLASSES = new Set(['STOCK', 'ETF', 'INDEX']);

function parseArgs(argv) {
  const options = { latestPath: DEFAULT_LATEST, outputPath: DEFAULT_OUT, providerExceptionsPath: DEFAULT_PROVIDER_EXCEPTIONS };
  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    const next = argv[i + 1];
    if (arg === '--latest' && next) {
      options.latestPath = path.resolve(ROOT, next);
      i += 1;
    } else if (arg.startsWith('--latest=')) {
      options.latestPath = path.resolve(ROOT, arg.split('=').slice(1).join('='));
    } else if (arg === '--output' && next) {
      options.outputPath = path.resolve(ROOT, next);
      i += 1;
    } else if (arg.startsWith('--output=')) {
      options.outputPath = path.resolve(ROOT, arg.split('=').slice(1).join('='));
    } else if (arg === '--provider-exceptions' && next) {
      options.providerExceptionsPath = path.resolve(ROOT, next);
      i += 1;
    } else if (arg.startsWith('--provider-exceptions=')) {
      options.providerExceptionsPath = path.resolve(ROOT, arg.split('=').slice(1).join('='));
    }
  }
  return options;
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function readGlobalScopeIds() {
  if (!fs.existsSync(GLOBAL_SCOPE_PATH)) return null;
  const doc = readJson(GLOBAL_SCOPE_PATH);
  const ids = Array.isArray(doc?.canonical_ids) ? doc.canonical_ids : [];
  return new Set(ids.map((id) => String(id || '').toUpperCase()).filter(Boolean));
}

function readMaybeGzip(filePath) {
  const body = fs.readFileSync(filePath);
  const text = filePath.endsWith('.gz') ? gunzipSync(body).toString('utf8') : body.toString('utf8');
  return JSON.parse(text);
}

function writeJsonAtomic(filePath, doc) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const tmp = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(tmp, `${JSON.stringify(doc, null, 2)}\n`, 'utf8');
  fs.renameSync(tmp, filePath);
}

function resolveSnapshotPath(latestPath, latest) {
  const raw = String(latest?.snapshot_path || '').replace(/^\/+/, '');
  if (!raw) throw new Error('PAGE_CORE_SNAPSHOT_PATH_MISSING');
  const marker = 'data/page-core/';
  if (raw.startsWith(marker)) {
    const latestRoot = path.dirname(path.dirname(latestPath));
    if (path.basename(path.dirname(latestPath)) === 'candidates') {
      return path.join(latestRoot, raw.slice(marker.length));
    }
  }
  return path.join(ROOT, 'public', raw);
}

function inc(map, key, amount = 1) {
  const normalized = String(key || 'unknown');
  map[normalized] = (map[normalized] || 0) + amount;
}

function readProviderExceptions(filePath, targetMarketDate) {
  if (!filePath || !fs.existsSync(filePath)) return new Map();
  const doc = readJson(filePath);
  const docTarget = String(doc?.target_market_date || '').slice(0, 10);
  if (targetMarketDate && docTarget && docTarget !== targetMarketDate) return new Map();
  const rows = Array.isArray(doc?.exceptions) ? doc.exceptions : [];
  const out = new Map();
  for (const row of rows) {
    const canonicalId = String(row?.canonical_id || '').toUpperCase();
    if (!canonicalId) continue;
    out.set(canonicalId, {
      reason: String(row?.reason || 'provider_no_target_row').trim() || 'provider_no_target_row',
      evidence: String(row?.evidence || 'provider_refresh_no_row').trim() || 'provider_refresh_no_row',
    });
  }
  return out;
}

function num(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function moduleStatus(row, key) {
  const statusKey = `${key}_status`;
  return String(
    row?.status_contract?.[statusKey]
    || row?.coverage?.[statusKey]
    || row?.[key]?.availability?.status
    || row?.[key]?.status
    || ''
  ).trim().toLowerCase();
}

function hasTypedModuleStatus(row, key) {
  return [
    'available',
    'ready',
    'ok',
    'not_applicable',
    'out_of_scope',
    'provider_unavailable',
    'provider_no_data',
    'not_generated',
    'insufficient_history',
    'unavailable',
    'updating',
  ].includes(moduleStatus(row, key));
}

function uiModuleCompletenessReasons(row) {
  const reasons = [];
  const assetClass = String(row?.identity?.asset_class || 'UNKNOWN').toUpperCase();
  if (!row?.breakout_summary && !hasTypedModuleStatus(row, 'breakout')) reasons.push('breakout_v12_missing_or_untyped');
  if (assetClass === 'STOCK') {
    if (row?.coverage?.fundamentals !== true && !hasTypedModuleStatus(row, 'fundamentals')) reasons.push('fundamentals_missing_or_untyped');
    if (row?.coverage?.forecast !== true && !hasTypedModuleStatus(row, 'forecast')) reasons.push('forecast_missing_or_untyped');
    if (row?.coverage?.catalysts === false && !hasTypedModuleStatus(row, 'catalysts')) reasons.push('catalysts_missing_or_untyped');
  }
  return reasons;
}

function splitBlockingReasons(reasons) {
  const ui = [];
  const decision = [];
  for (const reason of reasons) {
    const text = String(reason || '');
    if (
      text === 'decision_bundle_missing'
      || text === 'decision_not_buy_or_wait'
      || text === 'risk_unknown'
      || text.startsWith('minimum_n_')
      || text.startsWith('learning_')
      || text.startsWith('governance_blocked')
    ) {
      decision.push(text);
    } else {
      ui.push(text);
    }
  }
  return { ui, decision };
}

function classifyRow(row, providerExceptions = new Map()) {
  const canonicalId = String(row?.canonical_asset_id || '').toUpperCase();
  const assetClass = String(row?.identity?.asset_class || 'UNKNOWN').toUpperCase();
  const bars = num(row?.coverage?.bars);
  const verdict = String(row?.summary_min?.decision_verdict || '').toUpperCase();
  const quality = String(row?.summary_min?.quality_status || '').toUpperCase();
  const govStatus = String(row?.governance_summary?.status || '').toLowerCase();
  const riskLevel = String(row?.summary_min?.risk_level || row?.governance_summary?.risk_level || '').toUpperCase();
  const blockers = Array.isArray(row?.governance_summary?.blocking_reasons) ? row.governance_summary.blocking_reasons : [];
  const warnings = [
    ...(Array.isArray(row?.meta?.warnings) ? row.meta.warnings : []),
    ...(Array.isArray(row?.governance_summary?.warnings) ? row.governance_summary.warnings : []),
    ...(Array.isArray(row?.coverage?.warnings) ? row.coverage.warnings : []),
  ];
  const inOperationalScope = OPERATIONAL_ASSET_CLASSES.has(assetClass);
  const targetable = inOperationalScope && bars != null && bars >= 200;
  const reasons = [];
  if (row?.coverage?.ui_renderable !== true) reasons.push('ui_not_renderable');
  if (!inOperationalScope) reasons.push('asset_class_out_of_scope');
  if (inOperationalScope && !targetable) reasons.push('not_targetable');
  if (row?.market_stats_min == null) reasons.push('missing_market_stats_basis');
  if (row?.key_levels_ready !== true) reasons.push('key_levels_not_ready');
  if (row?.ui_banner_state === 'all_systems_operational' && row?.key_levels_ready !== true) reasons.push('contract_green_without_key_levels');
  if (pageCoreClaimsOperational(row)) {
    for (const reason of pageCoreStrictOperationalReasons(row).filter((item) => item !== 'ui_banner_not_operational')) {
      reasons.push(`contract_green_strict_${reason}`);
    }
  }
  if (warnings.includes('decision_bundle_missing')) reasons.push('decision_bundle_missing');
  if (warnings.includes('bars_stale')) reasons.push('bars_stale');
  if (!['BUY', 'WAIT'].includes(verdict)) reasons.push('decision_not_buy_or_wait');
  if (quality !== 'OK') reasons.push(`quality_${quality.toLowerCase() || 'missing'}`);
  if (!['ok', 'available'].includes(govStatus)) reasons.push(`governance_${govStatus || 'missing'}`);
  if (!riskLevel || riskLevel === 'UNKNOWN') reasons.push('risk_unknown');
  if (blockers.length) reasons.push(blockers[0] || 'governance_blocked');
  const historicalLink = String(row?.module_links?.historical || '');
  if (!historicalLink.includes('asset_id=')) reasons.push('historical_link_not_canonical_safe');
  reasons.push(...uiModuleCompletenessReasons(row));
  const providerException = providerExceptions.get(canonicalId) || null;
  const verifiedProviderException = Boolean(providerException && reasons.includes('bars_stale'));
  if (verifiedProviderException) {
    reasons.push(`provider_exception:${providerException.reason}`);
  }
  const effectiveTargetable = targetable && !verifiedProviderException;
  const split = splitBlockingReasons(reasons);
  const uiRenderable = effectiveTargetable && split.ui.length === 0;
  const decisionReady = uiRenderable && split.decision.length === 0;
  return {
    targetable: effectiveTargetable,
    operational: uiRenderable,
    ui_renderable: uiRenderable,
    decision_ready: decisionReady,
    state: uiRenderable ? 'all_systems_operational' : effectiveTargetable ? 'degraded' : 'provider_or_structural_exception',
    reasons,
    ui_blocking_reasons: split.ui,
    decision_blocking_reasons: split.decision,
    assetClass,
    verifiedProviderException,
  };
}

function main() {
  const options = parseArgs(process.argv);
  const latest = readJson(options.latestPath);
  const scopeIds = readGlobalScopeIds();
  const targetMarketDate = String(latest?.target_market_date || latest?.target_date || '').slice(0, 10);
  const providerExceptions = readProviderExceptions(options.providerExceptionsPath, targetMarketDate);
  const snapshotPath = resolveSnapshotPath(options.latestPath, latest);
  const pageDir = path.join(snapshotPath, 'page-shards');
  const counts = {
    rows_total: 0,
    rows_in_release_scope: 0,
    rows_outside_release_scope: 0,
    targetable_total: 0,
    operational_total: 0,
    ui_renderable_total: 0,
    decision_ready_total: 0,
    exception_total: 0,
    verified_provider_exception_total: 0,
    contract_violation_total: 0,
    by_state: {},
    by_asset_class: {},
    by_reason: {},
    by_ui_blocking_reason: {},
    by_decision_blocking_reason: {},
  };
  const samples = { degraded: [], exceptions: [] };
  for (const file of fs.readdirSync(pageDir).filter((name) => name.endsWith('.json.gz')).sort()) {
    const shard = readMaybeGzip(path.join(pageDir, file));
    for (const row of Object.values(shard)) {
      counts.rows_total += 1;
      const canonicalId = String(row?.canonical_asset_id || '').toUpperCase();
      if (scopeIds && !scopeIds.has(canonicalId)) {
        counts.rows_outside_release_scope += 1;
        continue;
      }
      counts.rows_in_release_scope += 1;
      const classified = classifyRow(row, providerExceptions);
      inc(counts.by_state, classified.state);
      inc(counts.by_asset_class, classified.assetClass);
      if (classified.targetable) counts.targetable_total += 1;
      else counts.exception_total += 1;
      if (classified.verifiedProviderException) counts.verified_provider_exception_total += 1;
      if (classified.operational) counts.operational_total += 1;
      if (classified.ui_renderable) counts.ui_renderable_total += 1;
      if (classified.decision_ready) counts.decision_ready_total += 1;
      for (const reason of classified.reasons) inc(counts.by_reason, reason);
      for (const reason of classified.ui_blocking_reasons) inc(counts.by_ui_blocking_reason, reason);
      for (const reason of classified.decision_blocking_reasons) inc(counts.by_decision_blocking_reason, reason);
      if (classified.reasons.some((reason) => String(reason).startsWith('contract_green_'))) {
        counts.contract_violation_total += 1;
      }
      if (classified.targetable && !classified.operational && samples.degraded.length < 50) {
        samples.degraded.push({
          canonical_asset_id: row?.canonical_asset_id || null,
          display_ticker: row?.display_ticker || null,
          asset_class: classified.assetClass,
          reasons: classified.reasons,
          ui_blocking_reasons: classified.ui_blocking_reasons,
          decision_blocking_reasons: classified.decision_blocking_reasons,
        });
      } else if (!classified.targetable && samples.exceptions.length < 25) {
        samples.exceptions.push({
          canonical_asset_id: row?.canonical_asset_id || null,
          display_ticker: row?.display_ticker || null,
          asset_class: classified.assetClass,
          reasons: classified.reasons,
        });
      }
    }
  }
  const denominator = counts.targetable_total;
  const missingScopeRows = scopeIds ? Math.max(0, scopeIds.size - counts.rows_in_release_scope) : 0;
  const ratio = denominator > 0 ? counts.operational_total / denominator : 0;
  const coreReleaseEligible = missingScopeRows === 0 && counts.contract_violation_total === 0;
  const releaseEligible = ratio >= MIN_GREEN_RATIO && coreReleaseEligible;
  const doc = {
    schema: 'rv.stock_analyzer.ui_state_summary.v2',
    generated_at: new Date().toISOString(),
    snapshot_id: latest.snapshot_id || null,
    target_market_date: latest.target_market_date || null,
    denominator: 'targetable_page_core_stock_etf_index_bars_ge_200_minus_verified_provider_exceptions',
    release_scope_rows: scopeIds ? scopeIds.size : counts.rows_in_release_scope,
    min_green_ratio: MIN_GREEN_RATIO,
    release_eligible: releaseEligible,
    ui_renderable_release_eligible: releaseEligible,
    decision_ready_release_eligible: denominator > 0 ? (counts.decision_ready_total / denominator) >= MIN_GREEN_RATIO && coreReleaseEligible : false,
    core_release_eligible: coreReleaseEligible,
    overall_ui_ready: releaseEligible,
    ui_operational_ratio: Number(ratio.toFixed(6)),
    ui_renderable_ratio: Number(ratio.toFixed(6)),
    decision_ready_ratio: Number((denominator > 0 ? counts.decision_ready_total / denominator : 0).toFixed(6)),
    missing_scope_rows: missingScopeRows,
    counts,
    samples,
  };
  writeJsonAtomic(options.outputPath, doc);
  console.log(`[build-stock-analyzer-ui-state-summary] wrote ${path.relative(ROOT, options.outputPath)} ratio=${doc.ui_operational_ratio}`);
  if (counts.contract_violation_total > 0) console.error(`[build-stock-analyzer-ui-state-summary] contract violations=${counts.contract_violation_total}`);
  if (!doc.core_release_eligible) process.exitCode = 1;
}

main();
