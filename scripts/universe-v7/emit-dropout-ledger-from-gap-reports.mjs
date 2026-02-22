#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { appendDropoutRecords } from '../_shared/dropout-logger.mjs';

const REPO_ROOT = process.cwd();
const FEATURE_GAP_REPORT = path.join(REPO_ROOT, 'public/data/universe/v7/reports/feature_gap_reasons_report.json');
const SCI_GAP_REPORT = path.join(REPO_ROOT, 'public/data/universe/v7/reports/scientific_gap_reasons_report.json');
const LEDGER_PATH = path.join(REPO_ROOT, 'mirrors/universe-v7/ledgers/dropout_ledger.ndjson');

function nowIso() {
  return new Date().toISOString();
}

function parseArgs(argv = process.argv.slice(2)) {
  return {
    reset: argv.includes('--reset')
  };
}

async function readJson(file) {
  return JSON.parse(await fs.readFile(file, 'utf8'));
}

function toDropout(feature, row, runId, extra = {}) {
  return {
    ts: nowIso(),
    run_id: runId,
    feature,
    canonical_id: row?.canonical_id || null,
    symbol_display: row?.symbol || row?.ticker || null,
    status: 'DROP',
    reason: row?.reason || 'UNKNOWN',
    details: {
      bars_count: Number(row?.bars_count || 0) || 0,
      ...extra
    },
    policy_versions: {
      source: 'gap_reports_v1'
    }
  };
}

async function main() {
  const args = parseArgs();
  const runId = `dropout_emit_${new Date().toISOString().replace(/[-:TZ.]/g, '').slice(0, 14)}`;
  const [featureGap, scientificGap] = await Promise.all([
    readJson(FEATURE_GAP_REPORT),
    readJson(SCI_GAP_REPORT)
  ]);

  if (args.reset) {
    await fs.mkdir(path.dirname(LEDGER_PATH), { recursive: true });
    await fs.writeFile(LEDGER_PATH, '', 'utf8');
  }

  const records = [];
  for (const row of featureGap?.marketphase_elliott?.missing || []) {
    records.push(toDropout('marketphase', row, runId));
    records.push(toDropout('elliott', row, runId));
  }
  for (const row of featureGap?.forecast?.missing || []) {
    records.push(toDropout('forecast', row, runId, row?.details || {}));
  }

  const sciSnapshot = await readJson(path.join(REPO_ROOT, 'public/data/snapshots/stock-analysis.json'));
  const ssotRows = await readJson(path.join(REPO_ROOT, 'public/data/universe/v7/ssot/stocks.max.rows.json'));
  const ssotBySymbol = new Map((ssotRows?.items || []).map((r) => [String(r.symbol || '').toUpperCase(), r]));
  for (const [k, v] of Object.entries(sciSnapshot || {})) {
    if (String(k).startsWith('_')) continue;
    if (String(v?.status || '').toUpperCase() !== 'DATA_UNAVAILABLE') continue;
    const sym = String(v?.ticker || k || '').toUpperCase();
    const row = ssotBySymbol.get(sym);
    records.push(toDropout('scientific', {
      symbol: sym,
      canonical_id: row?.canonical_id || null,
      bars_count: row?.bars_count || 0,
      reason: String(v?.reason || 'SCIENTIFIC_DATA_UNAVAILABLE').toUpperCase().replaceAll(/[^A-Z0-9]+/g, '_').replace(/^_|_$/g, '')
    }, runId));
  }

  const res = await appendDropoutRecords(records, { ledgerPath: LEDGER_PATH });

  const summaryRes = spawnSync('node', ['scripts/generate-dropout-report.mjs'], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe']
  });

  console.log(JSON.stringify({
    ok: res.ok && summaryRes.status === 0,
    run_id: runId,
    reset: args.reset,
    appended_records: records.length,
    ledger_path: path.relative(REPO_ROOT, LEDGER_PATH),
    summary_stdout: (summaryRes.stdout || '').trim(),
    summary_stderr: (summaryRes.stderr || '').trim()
  }));
}

main().catch((error) => {
  console.error(JSON.stringify({ ok: false, reason: error?.message || String(error) }));
  process.exit(1);
});

