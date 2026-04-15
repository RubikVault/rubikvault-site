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

export function evaluateDashboardSeverity(systemStatus, dashboardStatus) {
  const systemBlockingSeverity = String(systemStatus?.summary?.blocking_severity || '').toLowerCase();
  const dashboardBlockingSeverity = String(
    dashboardStatus?.blocking_severity || dashboardStatus?.system?.blocking_severity || ''
  ).toLowerCase();
  const dashboardUiGreen = dashboardStatus?.ui_green ?? dashboardStatus?.system?.ui_green;
  const dashboardReleaseReady = dashboardStatus?.release_ready ?? dashboardStatus?.system?.production_ready;
  const dashboardLiveStatus = String(dashboardStatus?.system?.live_status || '').toLowerCase();
  const effectiveBlockingSeverity = dashboardBlockingSeverity || systemBlockingSeverity || 'unknown';

  return {
    expectedSeverity: effectiveBlockingSeverity,
    pass: (
      effectiveBlockingSeverity === 'ok' &&
      dashboardUiGreen === true &&
      dashboardReleaseReady === true &&
      dashboardLiveStatus === 'ok' &&
      (systemBlockingSeverity ? systemBlockingSeverity === 'ok' : true) &&
      systemStatus?.summary?.ui_green !== false
    ),
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  const steps = {
    ui_logic: runNodeScript('tests/stock-analyzer-ui.test.mjs'),
    v4_contract: runNodeScript('tests/stock-insights-v4.test.mjs'),
    v4_truth: runNodeArgs(['--test', path.resolve(ROOT, 'tests/rv-v2-client.test.mjs')], {}, `${process.execPath} --test tests/rv-v2-client.test.mjs`),
    no_legacy_fallback: runNodeArgs(['--test', path.resolve(ROOT, 'tests/stock-analyzer-no-legacy-fallback.test.mjs')], {}, `${process.execPath} --test tests/stock-analyzer-no-legacy-fallback.test.mjs`),
    dashboard_meta: runNodeArgs(['--test', path.resolve(ROOT, 'tests/dashboard_v7_meta.test.mjs')], {}, `${process.execPath} --test tests/dashboard_v7_meta.test.mjs`),
    q1_target_truth: runNodeArgs(['--test', path.resolve(ROOT, 'tests/ops/q1-delta-ingest-hardening.test.mjs')], {}, `${process.execPath} --test tests/ops/q1-delta-ingest-hardening.test.mjs`),
    ui_artifacts: runNodeScript('scripts/ci/verify-stock-ui-artifacts.mjs', [], {
      RV_STOCK_UI_STRICT: '0',
    }),
  };

  const systemStatus = await readJson(path.resolve(ROOT, 'public/data/reports/system-status-latest.json'), null);
  const dashboardMetaDoc = await readJson(path.resolve(ROOT, 'public/dashboard_v6_meta_data.json'), null);
  const dashboardV7StatusDoc = await readJson(path.resolve(ROOT, 'public/data/ui/dashboard-v7-status.json'), null);
  const dashboardGate = evaluateDashboardSeverity(systemStatus, dashboardV7StatusDoc || dashboardMetaDoc);

  const checks = {
    ui_logic_ok: steps.ui_logic.ok,
    v4_contract_ok: steps.v4_contract.ok,
    v4_truth_ok: steps.v4_truth.ok,
    no_legacy_fallback_ok: steps.no_legacy_fallback.ok,
    dashboard_meta_ok: steps.dashboard_meta.ok,
    q1_target_truth_ok: steps.q1_target_truth.ok,
    ui_artifacts_ok: steps.ui_artifacts.ok,
    dashboard_truth_ok: dashboardGate.pass,
  };

  const pass = Object.values(checks).every(Boolean);
  const report = {
    schema_version: 'rv.stock-analyzer.non-regression-gate.v2',
    generated_at: new Date().toISOString(),
    local_base: String(args.localBase || '').replace(/\/+$/, ''),
    benchmark_base: String(args.benchmarkBase || '').replace(/\/+$/, ''),
    ticker: args.ticker,
    pass,
    checks,
    dashboard: {
      system_summary: systemStatus?.summary || null,
      v7_status: dashboardV7StatusDoc || null,
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
