#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');

export function parseArgs(argv) {
  const out = {
    localBase: process.env.RV_LOCAL_BASE || 'http://127.0.0.1:8788',
    benchmarkBase: process.env.RV_BENCHMARK_BASE || 'https://56a89a60.rubikvault-site.pages.dev',
    ticker: process.env.RV_BENCHMARK_TICKER || 'AAPL',
    maxTickers: Number(process.env.RV_PARITY_MAX_TICKERS || 60),
    outSsot: 'mirrors/features-v4/reports/stock-analyzer-non-regression-gate.json',
    outPublish: 'public/data/features-v4/reports/stock-analyzer-non-regression-gate.json',
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = String(argv[i] || '').trim();
    if (arg === '--local-base') out.localBase = String(argv[++i] || out.localBase);
    else if (arg === '--benchmark-base') out.benchmarkBase = String(argv[++i] || out.benchmarkBase);
    else if (arg === '--ticker') out.ticker = String(argv[++i] || out.ticker).trim().toUpperCase();
    else if (arg === '--max-tickers') out.maxTickers = Math.max(1, Number(argv[++i] || out.maxTickers));
    else if (arg === '--out-ssot') out.outSsot = String(argv[++i] || out.outSsot);
    else if (arg === '--out-publish') out.outPublish = String(argv[++i] || out.outPublish);
  }
  return out;
}

async function ensureDirFor(absPath) {
  await fs.mkdir(path.dirname(absPath), { recursive: true });
}

async function readJson(absPath, fallback = null) {
  try {
    const raw = await fs.readFile(absPath, 'utf8');
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

function runNodeScript(scriptRelPath, args = [], env = {}) {
  const scriptAbs = path.resolve(ROOT, scriptRelPath);
  return runNodeArgs([scriptAbs, ...args], env, [process.execPath, scriptRelPath, ...args].join(' '));
}

function runNodeArgs(args = [], env = {}, commandLabel = '') {
  const result = spawnSync(process.execPath, args, {
    cwd: ROOT,
    env: { ...process.env, ...env },
    encoding: 'utf8',
    maxBuffer: 32 * 1024 * 1024,
  });
  return {
    ok: result.status === 0,
    status: result.status ?? 1,
    signal: result.signal ?? null,
    stdout: String(result.stdout || '').trim(),
    stderr: String(result.stderr || '').trim(),
    command: commandLabel || [process.execPath, ...args].join(' '),
  };
}

export function evaluateDashboardSeverity(systemStatus, dashboardMeta) {
  const severity = String(systemStatus?.summary?.severity || '').toLowerCase();
  const liveStatus = String(dashboardMeta?.system?.live_status || '').toLowerCase();
  const truthState = String(dashboardMeta?.system?.data_truth_state || '');
  if (severity === 'ok') {
    return {
      expectedSeverity: severity,
      pass: liveStatus === 'ok' && /fresh|consistent|operational/i.test(truthState),
    };
  }
  if (severity === 'degraded') {
    return {
      expectedSeverity: severity,
      pass: liveStatus === 'degraded',
    };
  }
  return {
    expectedSeverity: severity || 'unknown',
    pass: liveStatus === 'failed',
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  const steps = {
    ui_logic: runNodeScript('tests/stock-analyzer-ui.test.mjs'),
    v4_contract: runNodeScript('tests/stock-insights-v4.test.mjs'),
    v2_summary_truth: runNodeScript('tests/data-interface-summary-selection.test.mjs'),
    v2_promotion_gate: runNodeScript('tests/rv-v2-promotion-gate.test.mjs'),
    dashboard_meta: runNodeArgs(['--test', path.resolve(ROOT, 'tests/dashboard_v7_meta.test.mjs')], {}, `${process.execPath} --test tests/dashboard_v7_meta.test.mjs`),
    non_regression_unit: runNodeScript('tests/stock-analyzer-non-regression-gate.test.mjs'),
    ui_artifacts: runNodeScript('scripts/ci/verify-stock-ui-artifacts.mjs', [], {
      RV_STOCK_UI_STRICT: '0',
    }),
  };

  const systemStatus = await readJson(path.resolve(ROOT, 'public/data/reports/system-status-latest.json'), null);
  const dashboardMetaDoc = await readJson(path.resolve(ROOT, 'public/dashboard_v6_meta_data.json'), null);
  const dashboardGate = evaluateDashboardSeverity(systemStatus, dashboardMetaDoc);

  const checks = {
    ui_logic_ok: steps.ui_logic.ok,
    v4_contract_ok: steps.v4_contract.ok,
    v2_summary_truth_ok: steps.v2_summary_truth.ok,
    v2_promotion_gate_ok: steps.v2_promotion_gate.ok,
    dashboard_meta_ok: steps.dashboard_meta.ok,
    non_regression_unit_ok: steps.non_regression_unit.ok,
    ui_artifacts_ok: steps.ui_artifacts.ok,
    dashboard_truth_ok: dashboardGate.pass,
  };

  const pass = Object.values(checks).every(Boolean);
  const report = {
    schema_version: 'rv.stock-analyzer.non-regression-gate.v1',
    generated_at: new Date().toISOString(),
    local_base: String(args.localBase || '').replace(/\/+$/, ''),
    benchmark_base: String(args.benchmarkBase || '').replace(/\/+$/, ''),
    ticker: args.ticker,
    pass,
    checks,
    dashboard: {
      system_summary: systemStatus?.summary || null,
      meta_summary: dashboardMetaDoc?.system || null,
      gate: dashboardGate,
    },
    steps,
  };

  const outSsotAbs = path.resolve(ROOT, args.outSsot);
  const outPublishAbs = path.resolve(ROOT, args.outPublish);
  await ensureDirFor(outSsotAbs);
  await ensureDirFor(outPublishAbs);
  const serialized = JSON.stringify(report, null, 2);
  await fs.writeFile(outSsotAbs, serialized, 'utf8');
  await fs.writeFile(outPublishAbs, serialized, 'utf8');

  if (!pass) {
    console.error(JSON.stringify(report, null, 2));
    process.exit(1);
  }

  console.log(JSON.stringify({
    pass,
    ticker: args.ticker,
    checks,
  }));
}

const entryUrl = process.argv[1] ? pathToFileURL(process.argv[1]).href : null;
if (import.meta.url === entryUrl) {
  main().catch((error) => {
    console.error(error?.stack || error?.message || String(error));
    process.exit(1);
  });
}
