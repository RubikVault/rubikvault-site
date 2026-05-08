#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import {
  DECISION_CORE_PUBLIC_ROOT,
  DECISION_CORE_RUNTIME_ROOT,
  HARD_VETO_CODES,
  ROOT,
  classifyRegion,
  isoDate,
  loadPolicyBundle,
  parseArgs,
  readJsonMaybe,
  readRegistryRows,
  uniqueStrings,
  writeJsonAtomic,
} from './shared.mjs';

const DEFAULT_REPORT_PATH = path.join(ROOT, 'public/data/reports/decision-core-buy-breadth-latest.json');

function cliValue(name, fallback = null) {
  const prefix = `--${name}=`;
  const found = process.argv.find((arg) => arg.startsWith(prefix));
  if (found) return found.slice(prefix.length);
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] || fallback : fallback;
}

function resolveCliRoot() {
  const mode = String(cliValue('mode', '') || '').trim().toLowerCase();
  const rootArg = cliValue('root');
  if (rootArg) return path.resolve(ROOT, rootArg);
  if (mode === 'shadow' || mode === 'core' || mode === 'last_good') {
    return path.join(DECISION_CORE_PUBLIC_ROOT, mode);
  }
  return path.join(DECISION_CORE_PUBLIC_ROOT, 'core');
}

function readRows(root = path.join(DECISION_CORE_PUBLIC_ROOT, 'core')) {
  const rows = [];
  const parts = path.join(root, 'parts');
  if (!fs.existsSync(parts)) return rows;
  for (const name of fs.readdirSync(parts).filter((item) => item.endsWith('.ndjson.gz')).sort()) {
    const text = zlib.gunzipSync(fs.readFileSync(path.join(parts, name))).toString('utf8');
    for (const line of text.split('\n')) {
      if (line.trim()) rows.push(JSON.parse(line));
    }
  }
  return rows;
}

function registryMeta() {
  const out = new Map();
  for (const row of readRegistryRows()) {
    out.set(String(row.canonical_id || '').toUpperCase(), {
      region: classifyRegion(row),
      symbol: row.symbol || String(row.canonical_id || '').split(':').pop(),
      asset_type: String(row.type_norm || row.asset_class || '').toUpperCase() === 'ETF' ? 'ETF' : String(row.type_norm || row.asset_class || '').toUpperCase(),
    });
  }
  return out;
}

function bestSetupCanonicalIds() {
  const doc = readJsonMaybe(path.join(ROOT, 'public/data/snapshots/best-setups-v4.json'));
  const ids = new Set();
  const data = doc?.data || {};
  for (const bucket of Object.values(data)) {
    if (Array.isArray(bucket)) {
      for (const row of bucket) if (row?.canonical_id) ids.add(String(row.canonical_id).toUpperCase());
    } else if (bucket && typeof bucket === 'object') {
      for (const rows of Object.values(bucket)) {
        if (!Array.isArray(rows)) continue;
        for (const row of rows) if (row?.canonical_id) ids.add(String(row.canonical_id).toUpperCase());
      }
    }
  }
  return {
    source: doc?.meta?.source || null,
    ids,
    rows_emitted_total: Number(doc?.meta?.rows_emitted?.total || 0),
  };
}

function bump(map, key) {
  const clean = String(key || 'UNKNOWN');
  map[clean] = (map[clean] || 0) + 1;
}

function diagnoseBreadth({ rows, metaById }) {
  const diag = {
    us_stock_etf_rows: 0,
    eu_stock_etf_rows: 0,
    asia_stock_etf_rows: 0,
    by_action: {},
    by_eligibility_status: {},
    by_ev_proxy_bucket: {},
    by_tail_risk_bucket: {},
    by_main_blocker: {},
    by_wait_subtype: {},
    by_region_asset_type_action: {},
    sample_blocked_assets: [],
  };
  for (const row of rows) {
    const assetId = String(row?.meta?.asset_id || '').toUpperCase();
    const meta = metaById.get(assetId) || {};
    const region = meta.region || 'OTHER';
    const assetType = row?.meta?.asset_type || meta.asset_type || 'UNKNOWN';
    if (!['STOCK', 'ETF'].includes(assetType) || !['US', 'EU', 'ASIA'].includes(region)) continue;
    if (region === 'US') diag.us_stock_etf_rows += 1;
    if (region === 'EU') diag.eu_stock_etf_rows += 1;
    if (region === 'ASIA') diag.asia_stock_etf_rows += 1;
    bump(diag.by_action, row?.decision?.primary_action);
    bump(diag.by_eligibility_status, row?.eligibility?.eligibility_status);
    bump(diag.by_ev_proxy_bucket, row?.evidence_summary?.ev_proxy_bucket);
    bump(diag.by_tail_risk_bucket, row?.evidence_summary?.tail_risk_bucket);
    bump(diag.by_main_blocker, row?.decision?.main_blocker || row?.eligibility?.vetos?.[0] || row?.decision?.wait_subtype || 'none');
    bump(diag.by_wait_subtype, row?.decision?.wait_subtype || 'none');
    bump(diag.by_region_asset_type_action, `${region}|${assetType}|${row?.decision?.primary_action || 'UNKNOWN'}`);
    if (row?.decision?.primary_action !== 'BUY' && diag.sample_blocked_assets.length < 30) {
      diag.sample_blocked_assets.push({
        asset_id: assetId,
        symbol: meta.symbol || assetId.split(':').pop(),
        region,
        asset_type: assetType,
        action: row?.decision?.primary_action || null,
        eligibility_status: row?.eligibility?.eligibility_status || null,
        main_blocker: row?.decision?.main_blocker || null,
        wait_subtype: row?.decision?.wait_subtype || null,
        ev_proxy_bucket: row?.evidence_summary?.ev_proxy_bucket || null,
        tail_risk_bucket: row?.evidence_summary?.tail_risk_bucket || null,
        reason_codes: row?.decision?.reason_codes || [],
      });
    }
  }
  return diag;
}

export function buyInvariantFailures(row, reasonMap = new Map()) {
  const failures = [];
  const reasons = uniqueStrings(row?.decision?.reason_codes || []);
  if (row?.decision?.primary_action !== 'BUY') failures.push('not_buy');
  if (row?.eligibility?.eligibility_status !== 'ELIGIBLE') failures.push('not_eligible');
  if (row?.eligibility?.decision_grade !== true) failures.push('decision_grade_false');
  if ((row?.eligibility?.vetos || []).some((code) => HARD_VETO_CODES.has(code))) failures.push('hard_veto');
  if (!reasons.length) failures.push('reason_codes_missing');
  if (reasons.some((code) => !reasonMap.has(code))) failures.push('reason_code_unmapped');
  if (row?.decision?.analysis_reliability === 'LOW') failures.push('reliability_low');
  if (row?.evidence_summary?.ev_proxy_bucket !== 'positive') failures.push('ev_proxy_not_positive');
  if (!['LOW', 'MEDIUM'].includes(row?.evidence_summary?.tail_risk_bucket)) failures.push('tail_risk_blocking');
  if (row?.trade_guard?.max_entry_price == null) failures.push('entry_guard_missing');
  if (row?.trade_guard?.invalidation_level == null) failures.push('invalidation_missing');
  if (row?.meta?.as_of_date && row?.meta?.target_market_date && row.meta.as_of_date > row.meta.target_market_date) failures.push('as_of_mismatch');
  return failures;
}

export function buildBuyBreadthProof({ root = path.join(DECISION_CORE_PUBLIC_ROOT, 'core'), targetMarketDate = null } = {}) {
  const { reasonMap } = loadPolicyBundle();
  const manifest = readJsonMaybe(path.join(root, 'manifest.json')) || {};
  const status = readJsonMaybe(path.join(root, 'status.json')) || {};
  const target = isoDate(targetMarketDate) || isoDate(manifest.target_market_date) || isoDate(status.target_market_date);
  const metaById = registryMeta();
  const best = bestSetupCanonicalIds();
  const rows = readRows(root);
  const failureDiagnostics = diagnoseBreadth({ rows, metaById });
  const unsafe = [];
  const buys = [];
  for (const row of rows) {
    if (row?.decision?.primary_action !== 'BUY') continue;
    const assetId = String(row?.meta?.asset_id || '').toUpperCase();
    const meta = metaById.get(assetId) || {};
    const failures = buyInvariantFailures(row, reasonMap);
    if (target && isoDate(row?.meta?.target_market_date) !== target) failures.push('target_mismatch');
    if (failures.length) unsafe.push({ asset_id: assetId, failures });
    buys.push({
      asset_id: assetId,
      symbol: meta.symbol || assetId.split(':').pop(),
      asset_type: row?.meta?.asset_type,
      region: meta.region || 'OTHER',
      analysis_reliability: row?.decision?.analysis_reliability,
      max_entry_price: row?.trade_guard?.max_entry_price ?? null,
      invalidation_level: row?.trade_guard?.invalidation_level ?? null,
      best_setups_present: best.ids.has(assetId),
    });
  }
  const validBuys = unsafe.length ? [] : buys;
  const availableUs = validBuys.filter((row) => row.region === 'US' && ['STOCK', 'ETF'].includes(row.asset_type));
  const availableEu = validBuys.filter((row) => row.region === 'EU' && ['STOCK', 'ETF'].includes(row.asset_type));
  const availableAsia = validBuys.filter((row) => row.region === 'ASIA' && ['STOCK', 'ETF'].includes(row.asset_type));
  const us = availableUs.filter((row) => row.best_setups_present);
  const eu = availableEu.filter((row) => row.best_setups_present);
  const asia = availableAsia.filter((row) => row.best_setups_present);
  const bestSetupsCoreOnly = best.source === 'decision_core_consumer';
  const missingBestSetup = [
    ...availableUs.filter((row) => !row.best_setups_present).slice(0, 10),
    ...availableEu.filter((row) => !row.best_setups_present).slice(0, 10),
  ];
  const failures = [];
  if (us.length < 10) failures.push('BUY_BREADTH_US_BELOW_10');
  if (eu.length < 10) failures.push('BUY_BREADTH_EU_BELOW_10');
  if (unsafe.length) failures.push('UNSAFE_BUY_ROWS');
  if (!bestSetupsCoreOnly) failures.push('BEST_SETUPS_NOT_CORE_ONLY');
  return {
    schema: 'rv.decision_core_buy_breadth.v1',
    status: failures.length ? 'FAILED' : 'OK',
    generated_at: new Date().toISOString(),
    target_market_date: target,
    root: path.relative(ROOT, root),
    proof_mode: path.basename(root),
    us_stock_etf_buy_count: us.length,
    eu_stock_etf_buy_count: eu.length,
    asia_stock_etf_buy_count: asia.length,
    available_us_stock_etf_buy_count: availableUs.length,
    available_eu_stock_etf_buy_count: availableEu.length,
    available_asia_stock_etf_buy_count: availableAsia.length,
    total_buy_count: buys.length,
    us_buy_assets: us.slice(0, 20),
    eu_buy_assets: eu.slice(0, 20),
    asia_buy_assets: asia.slice(0, 20),
    best_setups_core_only: bestSetupsCoreOnly,
    best_setups_rows_emitted_total: best.rows_emitted_total,
    legacy_buy_count: 0,
    unsafe_buy_counters: unsafe.length,
    unsafe_buy_rows: unsafe.slice(0, 20),
    missing_best_setups_assets: missingBestSetup,
    failure_diagnostics: failureDiagnostics,
    failure_reason: failures[0] || null,
    failures,
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const opts = parseArgs(process.argv.slice(2));
  const root = resolveCliRoot();
  const outputPath = path.resolve(ROOT, cliValue('output') || cliValue('report') || DEFAULT_REPORT_PATH);
  const report = buildBuyBreadthProof({ root, targetMarketDate: opts.targetMarketDate });
  writeJsonAtomic(outputPath, report);
  const manifest = readJsonMaybe(path.join(root, 'manifest.json'));
  if (manifest?.decision_run_id) {
    writeJsonAtomic(path.join(DECISION_CORE_RUNTIME_ROOT, manifest.decision_run_id, 'audit/buy-breadth-proof.json'), report);
  }
  console.log(JSON.stringify(report, null, 2));
  if (report.status !== 'OK') process.exit(1);
}
