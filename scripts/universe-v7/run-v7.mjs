#!/usr/bin/env node

import path from 'node:path';
import fs from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import {
  REPO_ROOT,
  parseArgs,
  nowIso,
  writeJsonAtomic,
  readJson,
  toFinite,
  pathExists
} from './lib/common.mjs';
import { loadV7Config, resolvePathMaybe } from './lib/config.mjs';
import { EXIT } from './lib/exit-codes.mjs';
import { loadBudgetState, evaluateBudgetKillSwitch } from './lib/budget.mjs';
import { releaseRunLock } from './lib/run-lock.mjs';
import { loadEnvFile } from './lib/env-loader.mjs';

function runNodeScript(scriptPath, args = [], envPatch = null) {
  const spawnMaxBuffer = Number(
    process.env.RV_V7_SPAWN_MAX_BUFFER_BYTES || (64 * 1024 * 1024)
  );
  const proc = spawnSync('node', [scriptPath, ...args], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    env: envPatch ? { ...process.env, ...envPatch } : process.env,
    maxBuffer: Number.isFinite(spawnMaxBuffer) && spawnMaxBuffer > 0
      ? spawnMaxBuffer
      : (64 * 1024 * 1024)
  });

  const rawStdout = String(proc.stdout || '');
  const rawStderr = String(proc.stderr || '');
  const rawOut = `${rawStdout}${rawStderr}`.trim();
  let parsed = null;
  const lines = rawOut.split(/\n+/).filter(Boolean);
  for (const line of lines.reverse()) {
    try {
      parsed = JSON.parse(line);
      break;
    } catch {
      // continue
    }
  }

  const spawnError = proc.error
    ? {
        name: proc.error.name || 'SpawnError',
        message: proc.error.message || 'spawn_failed',
        code: proc.error.code || null,
        errno: proc.error.errno || null
      }
    : null;
  if (!parsed && spawnError && String(spawnError.code || '') === 'ENOBUFS') {
    parsed = {
      status: 'FAIL',
      code: 1,
      reason: `SPAWN_ENOBUFS:${scriptPath}`
    };
  }

  return {
    status: proc.status ?? 1,
    ok: (proc.status ?? 1) === 0,
    signal: proc.signal ?? null,
    stdout: rawStdout,
    stderr: rawStderr,
    output: rawOut,
    parsed,
    error: spawnError
  };
}

async function copyReportsFromRunDir(runDir) {
  const runReports = path.join(runDir, 'reports');
  const publicReports = path.join(REPO_ROOT, 'public/data/universe/v7/reports');
  await fs.mkdir(publicReports, { recursive: true });
  const files = await fs.readdir(runReports).catch(() => []);
  for (const name of files) {
    if (!name.endsWith('.json') && !name.endsWith('.md')) continue;
    await fs.copyFile(path.join(runReports, name), path.join(publicReports, name));
  }
}

async function writeRunReports({ runId, steps, budgetHealth, exitCode, reason, cfg, kpi = null }) {
  const reportsDir = path.join(REPO_ROOT, 'public/data/universe/v7/reports');
  const runStatusPath = path.join(reportsDir, 'run_status.json');
  const systemStatusPath = path.join(reportsDir, 'system_status.json');

  const discovered = toFinite(kpi?.discovered_count, 0);
  const ingestible = toFinite(kpi?.active_ingestible_count, 0);
  const eligible = toFinite(kpi?.feature_eligible_count?.analyzer, 0);

  const runStatus = {
    schema: 'rv_v7_run_status_v1',
    generated_at: nowIso(),
    run_id: runId,
    exit_code: exitCode,
    reason,
    steps
  };

  const systemStatus = {
    schema: 'rv_v7_system_status_v1',
    generated_at: nowIso(),
    run_id: runId,
    budget_health: budgetHealth,
    drift_state: 'PASS',
    golden_baseline_delta: null,
    active_universe_counts: {
      discovered,
      ingestible,
      eligible
    },
    top_feature_by_rolling_sharpe: null,
    promotion_state: String(cfg?.promotion?.enabled ? 'DISABLED_OR_PENDING' : 'DISABLED'),
    circuit_open_reason: exitCode === EXIT.HARD_FAIL_BUDGET_KILL ? reason : null
  };

  await writeJsonAtomic(runStatusPath, runStatus);
  await writeJsonAtomic(systemStatusPath, systemStatus);
}

async function run() {
  const args = parseArgs(process.argv.slice(2));
  const { cfg } = await loadV7Config(args.config ? path.resolve(args.config) : undefined);
  const isBackfillFastMode = String(process.env.RV_V7_BACKFILL_FAST_MODE || '').toLowerCase() === 'true';
  const envCandidates = [
    args['env-file'] ? String(args['env-file']) : null,
    process.env.EODHD_ENV_FILE || null,
    '/Users/michaelpuchowezki/Desktop/EODHD.env',
    path.join(REPO_ROOT, '.env.local')
  ].filter(Boolean);
  for (const candidate of envCandidates) {
    const loaded = await loadEnvFile(candidate);
    if (loaded.loaded && Object.keys(loaded.vars || {}).length > 0) break;
  }

  const steps = [];

  if (!args['skip-archeology']) {
    const phase0 = runNodeScript('scripts/universe-v7/phase0-archeology.mjs', []);
    steps.push({ step: 'phase0_archeology', ok: phase0.ok, code: phase0.status, output: phase0.parsed || null });
    if (!phase0.ok) {
      const code = phase0.parsed?.code || phase0.status || 1;
      await writeRunReports({ runId: 'unknown', steps, budgetHealth: null, exitCode: code, reason: 'phase0_failed', cfg });
      process.exit(code);
    }
  }

  const preflightArgs = ['--hold-lock'];
  if (args['env-file']) preflightArgs.push('--env-file', String(args['env-file']));
  const preflight = runNodeScript('scripts/universe-v7/preflight-v7.mjs', preflightArgs);
  steps.push({ step: 'preflight', ok: preflight.ok, code: preflight.status, output: preflight.parsed || null });

  if (!preflight.ok) {
    const code = preflight.parsed?.code || preflight.status || 1;
    await writeRunReports({ runId: 'unknown', steps, budgetHealth: null, exitCode: code, reason: 'preflight_failed', cfg });
    process.exit(code);
  }

  const runId = String(preflight.parsed?.run_id || 'unknown');
  const runDir = path.join(resolvePathMaybe(cfg?.run?.tmp_dir) || path.join(REPO_ROOT, 'tmp/v7-build'), runId);
  const budgetPath = resolvePathMaybe(cfg?.budget?.state_path) || path.join(REPO_ROOT, 'mirrors/universe-v7/state/budget_state.json');
  const budgetBeforeRun = await loadBudgetState(budgetPath).catch(() => ({ daily_calls: 0 }));
  const budgetDailyBefore = toFinite(budgetBeforeRun?.daily_calls, 0);

  const earlyGates = [
    { id: 'law_coverage', script: 'scripts/universe-v7/gates/check-law-coverage.mjs', args: ['--run-id', runId] },
    { id: 'single_ingestor', script: 'scripts/universe-v7/gates/single-ingestor-guard.mjs', args: ['--run-id', runId] }
  ];

  for (const gate of earlyGates) {
    const result = runNodeScript(gate.script, gate.args);
    steps.push({ step: gate.id, ok: result.ok, code: result.status, output: result.parsed || null });
    if (!result.ok) {
      const code = result.parsed?.code || result.status || 1;
      await writeRunReports({ runId, steps, budgetHealth: null, exitCode: code, reason: `${gate.id}_failed`, cfg });
      const lockPath = path.join(REPO_ROOT, 'mirrors/universe-v7/state/run.lock');
      await releaseRunLock(lockPath, runId);
      process.exit(code);
    }
  }

  const pipelineArgs = ['--run-id', runId];
  if (args.offline) pipelineArgs.push('--offline');
  if (args['backfill-max'] !== undefined) {
    pipelineArgs.push('--backfill-max', String(args['backfill-max']));
  }
  const pipelineEnv = { NETWORK_ALLOWED: 'true' };
  if (process.env.RV_V7_PIPELINE_NODE_OPTIONS) {
    pipelineEnv.NODE_OPTIONS = String(process.env.RV_V7_PIPELINE_NODE_OPTIONS);
  } else if (!process.env.NODE_OPTIONS) {
    // Prevent SIGABRT (V8 OOM) during large backfill runs on local runners.
    pipelineEnv.NODE_OPTIONS = '--max-old-space-size=8192';
  }
  const pipeline = runNodeScript('scripts/universe-v7/pipeline-v7.mjs', pipelineArgs, pipelineEnv);
  const pipelineCode = pipeline.parsed?.code ?? pipeline.status;
  const pipelineOk = pipeline.status === 0 || pipelineCode === EXIT.BUDGET_STOP || pipelineCode === EXIT.API_THROTTLE;
  steps.push({
    step: 'pipeline_v7',
    ok: pipelineOk,
    code: pipelineCode,
    exit_code: pipeline.status,
    reason: pipeline.parsed?.reason
      || pipeline.error?.code
      || pipeline.signal
      || (pipelineOk ? 'ok' : 'unknown'),
    output: pipeline.parsed || (pipeline.error ? { status: 'FAIL', ...pipeline.error } : null)
  });

  if (!pipelineOk) {
    const code = pipelineCode || 1;
    await copyReportsFromRunDir(runDir);
    await writeRunReports({ runId, steps, budgetHealth: null, exitCode: code, reason: 'pipeline_failed', cfg });
    const lockPath = path.join(REPO_ROOT, 'mirrors/universe-v7/state/run.lock');
    await releaseRunLock(lockPath, runId);
    process.exit(code);
  }

  const publishPayload = String(pipeline.parsed?.publish_payload || path.join(runDir, 'publish_payload'));

  const uiGate = runNodeScript('scripts/universe-v7/gates/ui-safety-check.mjs', ['--run-id', runId]);
  steps.push({ step: 'ui_safety', ok: uiGate.ok, code: uiGate.status, output: uiGate.parsed || null });
  if (!uiGate.ok) {
    const code = uiGate.parsed?.code || uiGate.status || 1;
    await copyReportsFromRunDir(runDir);
    await writeRunReports({ runId, steps, budgetHealth: null, exitCode: code, reason: 'ui_safety_failed', cfg });
    const lockPath = path.join(REPO_ROOT, 'mirrors/universe-v7/state/run.lock');
    await releaseRunLock(lockPath, runId);
    process.exit(code);
  }

  const licenseGate = runNodeScript('scripts/universe-v7/gates/license-leak-scan.mjs', [
    '--run-id', runId,
    '--scan-dir', path.resolve(REPO_ROOT, publishPayload)
  ]);
  steps.push({ step: 'license_leak', ok: licenseGate.ok, code: licenseGate.status, output: licenseGate.parsed || null });
  if (!licenseGate.ok) {
    const code = licenseGate.parsed?.code || licenseGate.status || 1;
    await copyReportsFromRunDir(runDir);
    await writeRunReports({ runId, steps, budgetHealth: null, exitCode: code, reason: 'license_leak_failed', cfg });
    const lockPath = path.join(REPO_ROOT, 'mirrors/universe-v7/state/run.lock');
    await releaseRunLock(lockPath, runId);
    process.exit(code);
  }

  const budgetState = await loadBudgetState(budgetPath);
  const budgetDailyAfter = toFinite(budgetState?.daily_calls, 0);

  const pipelineBudgetReportPath = path.join(runDir, 'reports', 'budget_report.json');
  const pipelineBudgetReport = await readJson(pipelineBudgetReportPath).catch(() => ({}));
  const reportCallsDelta = toFinite(pipelineBudgetReport?.calls_delta, null);
  const runCalls = Number.isFinite(reportCallsDelta)
    ? reportCallsDelta
    : Math.max(0, budgetDailyAfter - budgetDailyBefore);

  const kpiReport = await readJson(path.join(runDir, 'reports', 'kpi_levels_report.json')).catch(() => null);
  const ingestibleGainRatio = toFinite(process.env.RV_V7_INGESTIBLE_GAIN_RATIO, 0);
  const eligibleGainRatio = toFinite(process.env.RV_V7_ELIGIBLE_GAIN_RATIO, 0);
  const deadCallsRatio = toFinite(process.env.RV_V7_DEAD_CALLS_RATIO, 0);

  const budgetEval = evaluateBudgetKillSwitch({
    state: budgetState,
    config: cfg,
    runStats: {
      run_calls: runCalls,
      ingestible_gain_ratio: ingestibleGainRatio,
      eligible_gain_ratio: eligibleGainRatio,
      dead_calls_ratio: deadCallsRatio
    }
  });

  await writeJsonAtomic(path.join(REPO_ROOT, 'public/data/universe/v7/reports/budget_report.json'), {
    schema: 'rv_v7_budget_report_v1',
    generated_at: nowIso(),
    run_id: runId,
    state: budgetState,
    evaluation: budgetEval,
    run_calls: runCalls,
    run_calls_source: Number.isFinite(reportCallsDelta) ? 'pipeline_report.calls_delta' : 'budget_state_delta'
  });

  if (budgetEval.kills.length > 0) {
    steps.push({ step: 'budget_kill', ok: false, code: EXIT.HARD_FAIL_BUDGET_KILL, output: budgetEval });
    await copyReportsFromRunDir(runDir);
    await writeRunReports({
      runId,
      steps,
      budgetHealth: { status: 'CIRCUIT_OPEN', ...budgetEval },
      exitCode: EXIT.HARD_FAIL_BUDGET_KILL,
      reason: 'budget_kill_triggered',
      cfg,
      kpi: kpiReport
    });
    const lockPath = path.join(REPO_ROOT, 'mirrors/universe-v7/state/run.lock');
    await releaseRunLock(lockPath, runId);
    process.exit(EXIT.HARD_FAIL_BUDGET_KILL);
  }

  const shouldPublish = (Boolean(args.publish) || String(cfg?.run?.mode || 'shadow').toLowerCase() !== 'shadow')
    && pipelineCode !== EXIT.API_THROTTLE;
  if (shouldPublish) {
    const publish = runNodeScript('scripts/universe-v7/publish-two-phase.mjs', [
      '--run-id', runId,
      '--source', path.resolve(REPO_ROOT, publishPayload)
    ]);
    steps.push({ step: 'publish_two_phase', ok: publish.ok, code: publish.status, output: publish.parsed || null });
    if (!publish.ok) {
      const code = publish.parsed?.code || publish.status || EXIT.HARD_FAIL_PARTIAL_PUBLISH;
      await copyReportsFromRunDir(runDir);
      await writeRunReports({ runId, steps, budgetHealth: { status: 'PASS', ...budgetEval }, exitCode: code, reason: 'publish_failed', cfg, kpi: kpiReport });
      const lockPath = path.join(REPO_ROOT, 'mirrors/universe-v7/state/run.lock');
      await releaseRunLock(lockPath, runId);
      process.exit(code);
    }
  }

  const skipSsotBuild = String(process.env.RV_V7_SKIP_SSOT_BUILD || '').toLowerCase() === 'true';
  if (!skipSsotBuild) {
    const ssotBuild = runNodeScript('scripts/universe-v7/build-stock-ssot.mjs', []);
    steps.push({ step: 'build_stock_ssot', ok: ssotBuild.ok, code: ssotBuild.status, output: ssotBuild.parsed || null });
    if (!ssotBuild.ok) {
      const code = ssotBuild.parsed?.code || ssotBuild.status || EXIT.HARD_FAIL_CONTRACT;
      await copyReportsFromRunDir(runDir);
      await writeRunReports({
        runId,
        steps,
        budgetHealth: { status: 'PASS', ...budgetEval },
        exitCode: code,
        reason: 'build_stock_ssot_failed',
        cfg,
        kpi: kpiReport
      });
      const lockPath = path.join(REPO_ROOT, 'mirrors/universe-v7/state/run.lock');
      await releaseRunLock(lockPath, runId);
      process.exit(code);
    }

    const parity = runNodeScript('scripts/universe-v7/gates/feature-universe-parity.mjs', ['--enforce']);
    steps.push({ step: 'feature_universe_parity', ok: parity.ok, code: parity.status, output: parity.parsed || null });
    if (!parity.ok) {
      if (isBackfillFastMode) {
        steps.push({
          step: 'feature_universe_parity_gate_waived',
          ok: true,
          code: 0,
          output: {
            status: 'WARN',
            reason: 'feature_universe_parity_failed_but_waived_in_backfill_fast_mode'
          }
        });
      } else {
      const code = parity.parsed?.code || parity.status || EXIT.HARD_FAIL_CONTRACT;
      await copyReportsFromRunDir(runDir);
      await writeRunReports({
        runId,
        steps,
        budgetHealth: { status: 'PASS', ...budgetEval },
        exitCode: code,
        reason: 'feature_universe_parity_failed',
        cfg,
        kpi: kpiReport
      });
      const lockPath = path.join(REPO_ROOT, 'mirrors/universe-v7/state/run.lock');
      await releaseRunLock(lockPath, runId);
      process.exit(code);
      }
    }
  }

  await copyReportsFromRunDir(runDir);

  const finalCode = pipelineCode === EXIT.BUDGET_STOP
    ? EXIT.BUDGET_STOP
    : pipelineCode === EXIT.API_THROTTLE
      ? EXIT.API_THROTTLE
      : EXIT.SUCCESS;
  const finalReason = pipeline.parsed?.reason
    || (finalCode === EXIT.BUDGET_STOP
      ? 'budget_stop_with_checkpoint'
      : finalCode === EXIT.API_THROTTLE
        ? 'api_rate_limited_429'
        : 'ok');
  await writeRunReports({
    runId,
    steps,
    budgetHealth: {
      status: finalCode === EXIT.BUDGET_STOP
        ? 'BUDGET_STOP'
        : finalCode === EXIT.API_THROTTLE
          ? 'THROTTLED'
          : 'PASS',
      ...budgetEval
    },
    exitCode: finalCode,
    reason: finalReason,
    cfg,
    kpi: kpiReport
  });

  const lockPath = path.join(REPO_ROOT, 'mirrors/universe-v7/state/run.lock');
  await releaseRunLock(lockPath, runId);

  process.stdout.write(JSON.stringify({ status: 'OK', code: finalCode, run_id: runId, steps: steps.length, published: shouldPublish }) + '\n');
  process.exit(finalCode);
}

run().catch(async (err) => {
  const lockPath = path.join(REPO_ROOT, 'mirrors/universe-v7/state/run.lock');
  await releaseRunLock(lockPath, null, { force: true });
  process.stderr.write(JSON.stringify({ status: 'FAIL', code: 1, reason: err?.message || 'run_v7_failed' }) + '\n');
  process.exit(1);
});
