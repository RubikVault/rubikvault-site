#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const REPO_ROOT = path.resolve(new URL('.', import.meta.url).pathname, '../..');
const OUTPUT_PATH = path.join(REPO_ROOT, 'public/data/reports/system-recovery-latest.json');
const now = new Date();
const startOfUtcDay = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
const afterUsClose = now.getUTCHours() > 20 || (now.getUTCHours() === 20 && now.getUTCMinutes() >= 15);
if (!afterUsClose) startOfUtcDay.setUTCDate(startOfUtcDay.getUTCDate() - 1);
while (startOfUtcDay.getUTCDay() === 0 || startOfUtcDay.getUTCDay() === 6) {
  startOfUtcDay.setUTCDate(startOfUtcDay.getUTCDate() - 1);
}
const targetMarketDate = startOfUtcDay.toISOString().slice(0, 10);
const refreshFromDate = new Date(startOfUtcDay.getTime());
refreshFromDate.setUTCDate(refreshFromDate.getUTCDate() - 14);

const STEPS = [
  {
    id: 'system_status_preflight',
    command: ['node', 'scripts/ops/build-system-status-report.mjs'],
    gate: (results) => true,
  },
  {
    id: 'us_eu_scope',
    command: ['node', 'scripts/universe-v7/build-us-eu-scope.mjs'],
    gate: (results) => true,
  },
  {
    id: 'market_data_refresh',
    command: [
      'python3',
      'scripts/quantlab/refresh_v7_history_from_eodhd.py',
      '--allowlist-path',
      'public/data/universe/v7/ssot/stocks_etfs.us_eu.canonical.ids.json',
      '--from-date',
      refreshFromDate.toISOString().slice(0, 10),
      '--to-date',
      targetMarketDate,
      '--concurrency',
      '12',
      '--progress-every',
      '500',
    ],
    gate: () => false,
    note: 'Run manually with valid provider env/token when upstream market data must be advanced.',
  },
  {
    id: 'q1_delta_ingest',
    command: ['python3', 'scripts/quantlab/run_daily_delta_ingest_q1.py', '--ingest-date', targetMarketDate, '--full-scan-packs'],
    gate: (results) => results.market_data_refresh?.status === 'completed',
  },
  {
    id: 'quantlab_daily_report',
    command: ['node', 'scripts/quantlab/build_quantlab_v4_daily_report.mjs'],
    gate: (results) => ['completed', 'skipped'].includes(results.market_data_refresh?.status || '') && ['completed', 'skipped'].includes(results.q1_delta_ingest?.status || ''),
  },
  {
    id: 'hist_probs',
    command: ['node', 'run-hist-probs-turbo.mjs'],
    gate: (results) => ['completed', 'skipped'].includes(results.q1_delta_ingest?.status || ''),
  },
  {
    id: 'snapshot',
    command: ['node', 'scripts/build-best-setups-v4.mjs'],
    gate: (results) => results.quantlab_daily_report?.status === 'completed' && results.hist_probs?.status === 'completed',
  },
  {
    id: 'stock_analyzer_universe_audit',
    command: ['node', 'scripts/ops/build-stock-analyzer-universe-audit.mjs', '--base-url', 'http://127.0.0.1:8788', '--registry-path', 'public/data/universe/v7/registry/registry.ndjson.gz', '--asset-classes', 'STOCK,ETF', '--max-tickers', '0'],
    gate: (results) => results.snapshot?.status === 'completed',
  },
  {
    id: 'system_status_postflight',
    command: ['node', 'scripts/ops/build-system-status-report.mjs'],
    gate: (results) => results.stock_analyzer_universe_audit?.status === 'completed',
  },
  {
    id: 'dashboard_meta',
    command: ['node', 'scripts/generate_meta_dashboard_data.mjs'],
    gate: (results) => results.system_status_postflight?.status === 'completed',
  },
];

function parseArgs(argv) {
  return {
    dryRun: argv.includes('--dry-run'),
  };
}

function runStep(step, dryRun) {
  if (dryRun || step.note) {
    return {
      status: step.note ? 'skipped' : 'dry_run',
      command: step.command,
      note: step.note || null,
      started_at: new Date().toISOString(),
      finished_at: new Date().toISOString(),
      exit_code: null,
    };
  }
  const startedAt = new Date().toISOString();
  const proc = spawnSync(step.command[0], step.command.slice(1), {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    maxBuffer: 8 * 1024 * 1024,
  });
  return {
    status: proc.status === 0 ? 'completed' : 'failed',
    command: step.command,
    note: null,
    started_at: startedAt,
    finished_at: new Date().toISOString(),
    exit_code: proc.status,
    stdout_tail: (proc.stdout || '').trim().split('\n').slice(-8),
    stderr_tail: (proc.stderr || '').trim().split('\n').slice(-8),
  };
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const results = {};

  for (const step of STEPS) {
    if (!step.gate(results)) {
      results[step.id] = {
        status: 'blocked',
        command: step.command,
        note: 'Blocked by an upstream gate in the recovery chain.',
        started_at: new Date().toISOString(),
        finished_at: new Date().toISOString(),
        exit_code: null,
      };
      break;
    }
    results[step.id] = runStep(step, args.dryRun);
    if (results[step.id].status === 'failed') break;
  }

  const payload = {
    schema: 'rv.system_recovery.v1',
    generated_at: new Date().toISOString(),
    dry_run: args.dryRun,
    results,
  };

  fs.mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true });
  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(payload, null, 2) + '\n', 'utf8');
}

main();
