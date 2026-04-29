#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const REPO_ROOT = path.resolve(new URL('.', import.meta.url).pathname, '../..');
const OUTPUT_PATH = path.join(REPO_ROOT, 'public/data/reports/system-recovery-latest.json');
const GLOBAL_ASSET_CLASSES = process.env.RV_GLOBAL_ASSET_CLASSES || 'STOCK,ETF,INDEX';
const EODHD_ENV_FILE = process.env.RV_EODHD_ENV_FILE || '.env.local';
const EODHD_GLOBAL_LOCK_PATH = process.env.RV_EODHD_GLOBAL_LOCK_PATH || 'mirrors/universe-v7/state/eodhd-global.lock';
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
    id: 'global_scope',
    command: ['node', 'scripts/universe-v7/build-global-scope.mjs', '--asset-classes', GLOBAL_ASSET_CLASSES],
    gate: (results) => true,
  },
  {
    id: 'global_history_pack_manifest',
    command: ['node', 'scripts/ops/build-history-pack-manifest.mjs', '--scope', 'global', '--asset-classes', GLOBAL_ASSET_CLASSES],
    gate: (results) => true,
  },
  {
    id: 'market_data_refresh',
    command: [
      'python3',
      'scripts/quantlab/refresh_v7_history_from_eodhd.py',
      '--env-file',
      EODHD_ENV_FILE,
      '--allowlist-path',
      'public/data/universe/v7/ssot/assets.global.canonical.ids.json',
      '--from-date',
      refreshFromDate.toISOString().slice(0, 10),
      '--to-date',
      targetMarketDate,
      '--bulk-last-day',
      '--bulk-exchange-cost',
      process.env.RV_EODHD_BULK_EXCHANGE_COST || '100',
      '--global-lock-path',
      EODHD_GLOBAL_LOCK_PATH,
      '--max-eodhd-calls',
      process.env.RV_MARKET_REFRESH_MAX_EODHD_CALLS || '0',
      '--max-retries',
      process.env.RV_MARKET_REFRESH_MAX_RETRIES || '1',
      '--timeout-sec',
      process.env.RV_MARKET_REFRESH_TIMEOUT_PER_REQUEST_SEC || '60',
      '--flush-every',
      process.env.RV_MARKET_REFRESH_FLUSH_EVERY || '250',
      '--concurrency',
      process.env.RV_MARKET_REFRESH_CONCURRENCY || '12',
      '--progress-every',
      process.env.RV_MARKET_REFRESH_PROGRESS_EVERY || '500',
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
    command: ['node', 'run-hist-probs-turbo.mjs', '--asset-classes', GLOBAL_ASSET_CLASSES],
    gate: (results) => ['completed', 'skipped'].includes(results.q1_delta_ingest?.status || ''),
  },
  {
    id: 'snapshot',
    command: ['node', 'scripts/build-best-setups-v4.mjs'],
    gate: (results) => results.quantlab_daily_report?.status === 'completed' && results.hist_probs?.status === 'completed',
  },
  {
    id: 'stock_analyzer_universe_audit',
    command: ['node', 'scripts/ops/build-stock-analyzer-universe-audit.mjs', '--registry-path', 'public/data/universe/v7/registry/registry.ndjson.gz', '--allowlist-path', 'public/data/universe/v7/ssot/assets.global.canonical.ids.json', '--asset-classes', GLOBAL_ASSET_CLASSES, '--max-tickers', '0', '--live-sample-size', '0'],
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
