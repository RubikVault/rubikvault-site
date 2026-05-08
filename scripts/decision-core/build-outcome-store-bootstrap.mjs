#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { DECISION_CORE_PUBLIC_ROOT, ROOT, classifyRegion, isoNow, parseArgs, readJsonMaybe, readRegistryRows, writeGzipAtomic, writeJsonAtomic } from './shared.mjs';

const REPORT_PATH = path.join(ROOT, 'public/data/reports/decision-core-outcome-bootstrap-latest.json');
const OUTCOME_RUNTIME_ROOT = path.resolve(
  process.env.RV_DECISION_CORE_OUTCOME_ROOT
    || (process.env.NAS_RUNTIME_ROOT ? path.join(process.env.NAS_RUNTIME_ROOT, 'outcomes') : '')
    || path.join(ROOT, 'runtime/outcomes')
);

function readRows(root = path.join(DECISION_CORE_PUBLIC_ROOT, 'core')) {
  const rows = [];
  const dir = path.join(root, 'parts');
  if (!fs.existsSync(dir)) return rows;
  for (const name of fs.readdirSync(dir).filter((item) => item.endsWith('.ndjson.gz')).sort()) {
    const text = zlib.gunzipSync(fs.readFileSync(path.join(dir, name))).toString('utf8');
    for (const line of text.split('\n')) if (line.trim()) rows.push(JSON.parse(line));
  }
  return rows;
}

function registryRegions() {
  const out = new Map();
  for (const row of readRegistryRows()) out.set(String(row.canonical_id || '').toUpperCase(), classifyRegion(row));
  return out;
}

function toSnapshot(row, regions) {
  const assetId = String(row?.meta?.asset_id || '').toUpperCase();
  return {
    decision_id: row?.meta?.decision_id || null,
    asset_id: assetId || null,
    asset_type: row?.meta?.asset_type || null,
    region: regions.get(assetId) || 'UNKNOWN',
    target_market_date: row?.meta?.target_market_date || null,
    primary_action: row?.decision?.primary_action || null,
    setup: row?.decision?.primary_setup || null,
    evaluation_horizon_days: row?.evaluation?.evaluation_horizon_days || null,
    evaluation_policy: row?.evaluation?.evaluation_policy || null,
    max_entry_price: row?.trade_guard?.max_entry_price ?? null,
    invalidation_level: row?.trade_guard?.invalidation_level ?? null,
    entry_valid: row?.decision?.primary_action === 'BUY' ? null : false,
    realized_return: null,
    max_drawdown: null,
    outcome_matured: false,
  };
}

export function buildOutcomeBootstrap({ root = path.join(DECISION_CORE_PUBLIC_ROOT, 'core'), targetMarketDate = null } = {}) {
  const rows = readRows(root);
  const regions = registryRegions();
  const snapshots = rows.map((row) => toSnapshot(row, regions));
  const outDir = path.join(OUTCOME_RUNTIME_ROOT, 'decision-snapshots');
  const target = targetMarketDate || readJsonMaybe(path.join(root, 'manifest.json'))?.target_market_date || 'unknown';
  const snapshotPath = path.join(outDir, `${target}.ndjson.gz`);
  writeGzipAtomic(snapshotPath, snapshots.map((row) => JSON.stringify(row)).join('\n') + '\n');
  const byAction = snapshots.reduce((acc, row) => {
    acc[row.primary_action] = (acc[row.primary_action] || 0) + 1;
    return acc;
  }, {});
  const scorecard = {
    schema: 'rv.decision_core_scorecard_bootstrap.v1',
    generated_at: isoNow(),
    target_market_date: target,
    sample_n: snapshots.length,
    action_counts: byAction,
    technical_safety_validity: true,
    performance_evidence: 'not_matured',
    alpha_proof: false,
  };
  const scorecardPath = path.join(OUTCOME_RUNTIME_ROOT, 'scorecards/latest.json');
  writeJsonAtomic(scorecardPath, scorecard);
  const report = {
    schema: 'rv.decision_core_outcome_bootstrap.v1',
    status: snapshots.length > 0 ? 'OK' : 'FAILED',
    generated_at: isoNow(),
    target_market_date: target,
    sample_n: snapshots.length,
    stock_samples: snapshots.filter((row) => row.asset_type === 'STOCK').length,
    etf_samples: snapshots.filter((row) => row.asset_type === 'ETF').length,
    us_samples: snapshots.filter((row) => row.region === 'US').length,
    eu_samples: snapshots.filter((row) => row.region === 'EU').length,
    asia_samples: snapshots.filter((row) => row.region === 'ASIA').length,
    technical_safety_validity: true,
    performance_evidence: 'not_matured',
    alpha_proof: false,
    snapshot_path: path.relative(ROOT, snapshotPath),
    scorecard_path: path.relative(ROOT, scorecardPath),
  };
  writeJsonAtomic(REPORT_PATH, report);
  return report;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const opts = parseArgs(process.argv.slice(2));
  const rootArg = process.argv.find((arg) => arg.startsWith('--root='))?.split('=')[1];
  const report = buildOutcomeBootstrap({
    root: path.resolve(ROOT, rootArg || 'public/data/decision-core/core'),
    targetMarketDate: opts.targetMarketDate,
  });
  console.log(JSON.stringify(report, null, 2));
  if (report.status !== 'OK') process.exit(1);
}
