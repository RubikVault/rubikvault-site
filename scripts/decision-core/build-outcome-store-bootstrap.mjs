#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { once } from 'node:events';
import { DECISION_CORE_PUBLIC_ROOT, ROOT, classifyRegion, isoNow, parseArgs, readJsonMaybe, readRegistryRows, writeJsonAtomic } from './shared.mjs';

const REPORT_PATH = path.join(ROOT, 'public/data/reports/decision-core-outcome-bootstrap-latest.json');
const OUTCOME_RUNTIME_ROOT = path.resolve(
  process.env.RV_DECISION_CORE_OUTCOME_ROOT
    || (process.env.NAS_RUNTIME_ROOT ? path.join(process.env.NAS_RUNTIME_ROOT, 'outcomes') : '')
    || path.join(ROOT, 'runtime/outcomes')
);

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

async function writeSnapshotsFromParts({ root, snapshotPath, regions }) {
  const dir = path.join(root, 'parts');
  const counts = {
    sample_n: 0,
    stock_samples: 0,
    etf_samples: 0,
    us_samples: 0,
    eu_samples: 0,
    asia_samples: 0,
    action_counts: {},
  };
  fs.mkdirSync(path.dirname(snapshotPath), { recursive: true });
  const tmp = `${snapshotPath}.${process.pid}.${Date.now()}.tmp`;
  const gzip = zlib.createGzip({ level: 9 });
  const out = fs.createWriteStream(tmp);
  const done = once(out, 'finish');
  const error = new Promise((_, reject) => {
    gzip.once('error', reject);
    out.once('error', reject);
  });
  gzip.pipe(out);
  try {
    if (fs.existsSync(dir)) {
      for (const name of fs.readdirSync(dir).filter((item) => item.endsWith('.ndjson.gz')).sort()) {
        const text = zlib.gunzipSync(fs.readFileSync(path.join(dir, name))).toString('utf8');
        for (const line of text.split('\n')) {
          if (!line.trim()) continue;
          const snapshot = toSnapshot(JSON.parse(line), regions);
          counts.sample_n += 1;
          if (snapshot.asset_type === 'STOCK') counts.stock_samples += 1;
          if (snapshot.asset_type === 'ETF') counts.etf_samples += 1;
          if (snapshot.region === 'US') counts.us_samples += 1;
          if (snapshot.region === 'EU') counts.eu_samples += 1;
          if (snapshot.region === 'ASIA') counts.asia_samples += 1;
          counts.action_counts[snapshot.primary_action] = (counts.action_counts[snapshot.primary_action] || 0) + 1;
          if (!gzip.write(`${JSON.stringify(snapshot)}\n`)) await once(gzip, 'drain');
        }
      }
    }
    gzip.end();
    await Promise.race([done, error]);
    fs.renameSync(tmp, snapshotPath);
    return counts;
  } catch (error_) {
    gzip.destroy();
    out.destroy();
    try { fs.rmSync(tmp, { force: true }); } catch {}
    throw error_;
  }
}

export async function buildOutcomeBootstrap({ root = path.join(DECISION_CORE_PUBLIC_ROOT, 'core'), targetMarketDate = null } = {}) {
  const regions = registryRegions();
  const outDir = path.join(OUTCOME_RUNTIME_ROOT, 'decision-snapshots');
  const target = targetMarketDate || readJsonMaybe(path.join(root, 'manifest.json'))?.target_market_date || 'unknown';
  const snapshotPath = path.join(outDir, `${target}.ndjson.gz`);
  const counts = await writeSnapshotsFromParts({ root, snapshotPath, regions });
  const scorecard = {
    schema: 'rv.decision_core_scorecard_bootstrap.v1',
    generated_at: isoNow(),
    target_market_date: target,
    sample_n: counts.sample_n,
    action_counts: counts.action_counts,
    technical_safety_validity: true,
    performance_evidence: 'not_matured',
    alpha_proof: false,
  };
  const scorecardPath = path.join(OUTCOME_RUNTIME_ROOT, 'scorecards/latest.json');
  writeJsonAtomic(scorecardPath, scorecard);
  const report = {
    schema: 'rv.decision_core_outcome_bootstrap.v1',
    status: counts.sample_n > 0 ? 'OK' : 'FAILED',
    generated_at: isoNow(),
    target_market_date: target,
    sample_n: counts.sample_n,
    stock_samples: counts.stock_samples,
    etf_samples: counts.etf_samples,
    us_samples: counts.us_samples,
    eu_samples: counts.eu_samples,
    asia_samples: counts.asia_samples,
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
  const report = await buildOutcomeBootstrap({
    root: path.resolve(ROOT, rootArg || 'public/data/decision-core/core'),
    targetMarketDate: opts.targetMarketDate,
  });
  console.log(JSON.stringify(report, null, 2));
  if (report.status !== 'OK') process.exit(1);
}
