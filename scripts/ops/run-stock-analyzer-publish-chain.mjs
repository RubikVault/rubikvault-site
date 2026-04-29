#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { resolveApprovedNodeBin } from './approved-node.mjs';
import {
  buildArtifactEnvelope,
  collectUpstreamRunIds,
  normalizeDate,
  readJson,
  resolveReleaseTargetMarketDate,
} from './pipeline-artifact-contract.mjs';

const ROOT = path.resolve(new URL('..', import.meta.url).pathname, '..');
const OUTPUT_PATH = path.join(ROOT, 'public/data/ops/publish-chain-latest.json');
const PIPELINE_LEDGER_PATH = path.join(ROOT, 'public/data/ops/pipeline-run-ledger.ndjson');

function nowIso() {
  return new Date().toISOString();
}

function writeJsonAtomic(filePath, payload) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const tmp = `${filePath}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
  fs.renameSync(tmp, filePath);
}

function parseArgs(argv) {
  const options = {
    printOnly: false,
    dateArg: null,
    runId: String(process.env.RUN_ID || process.env.RV_RUN_ID || '').trim() || null,
    skipLearning: false,
    skipSnapshot: false,
    skipQuantlabReport: false,
    skipDataFreshness: false,
    skipSystemStatus: false,
    skipPipelineRuntime: false,
    skipPipelineEpoch: false,
    skipMonitoring: false,
    skipDashboard: false,
    skipUiAudit: false,
    skipUniverseAudit: false,
    skipFinalIntegritySeal: false,
    skipFrontpageValidator: false,
    fullUniverseAudit: process.env.RV_FULL_UNIVERSE_AUDIT === '1',
    liveAuditSampleSize: null,
    date: null,
  };
  let liveAuditSampleSizeExplicit = false;
  for (const arg of argv.slice(2)) {
    if (arg === '--print-only') options.printOnly = true;
    else if (arg.startsWith('--run-id=')) options.runId = String(arg.split('=')[1] || '').trim() || null;
    else if (arg.startsWith('--date=')) {
      options.dateArg = arg;
      options.date = normalizeDate(arg.split('=')[1]);
    }
    else if (arg === '--skip-learning') options.skipLearning = true;
    else if (arg === '--skip-snapshot') options.skipSnapshot = true;
    else if (arg === '--skip-quantlab-report') options.skipQuantlabReport = true;
    else if (arg === '--skip-data-freshness') options.skipDataFreshness = true;
    else if (arg === '--skip-system-status') options.skipSystemStatus = true;
    else if (arg === '--skip-pipeline-runtime') options.skipPipelineRuntime = true;
    else if (arg === '--skip-pipeline-epoch') options.skipPipelineEpoch = true;
    else if (arg === '--skip-monitoring') options.skipMonitoring = true;
    else if (arg === '--skip-dashboard') options.skipDashboard = true;
    else if (arg === '--skip-ui-audit') options.skipUiAudit = true;
    else if (arg === '--skip-universe-audit') options.skipUniverseAudit = true;
    else if (arg === '--skip-final-integrity-seal') options.skipFinalIntegritySeal = true;
    else if (arg === '--skip-frontpage-validator') options.skipFrontpageValidator = true;
    else if (arg === '--full-universe-audit') options.fullUniverseAudit = true;
    else if (arg.startsWith('--live-audit-sample-size=')) {
      options.liveAuditSampleSize = Math.max(0, Number(arg.split('=')[1]) || 0);
      liveAuditSampleSizeExplicit = true;
    }
  }
  if (!liveAuditSampleSizeExplicit) {
    options.liveAuditSampleSize = Math.max(
      0,
      Number(process.env.RV_STOCK_ANALYZER_LIVE_SAMPLE_SIZE || (options.fullUniverseAudit ? 0 : 300)),
    );
  }
  return options;
}

function stepEnv(context, overrides = {}) {
  return {
    ...process.env,
    RUN_ID: context.runId,
    RV_RUN_ID: context.runId,
    TARGET_MARKET_DATE: context.targetMarketDate,
    RV_TARGET_MARKET_DATE: context.targetMarketDate,
    RV_GLOBAL_ASSET_CLASSES: process.env.RV_GLOBAL_ASSET_CLASSES || 'STOCK,ETF',
    ...overrides,
  };
}

function appendPipelineRunLedgerEntry(stepId, status, durationMs, targetMarketDate, detail = {}) {
  const now = new Date();
  const cutoffMs = now.getTime() - (90 * 24 * 60 * 60 * 1000);
  let keptLines = [];
  try {
    const existing = fs.readFileSync(PIPELINE_LEDGER_PATH, 'utf8')
      .split(/\r?\n/)
      .filter(Boolean);
    keptLines = existing.filter((line) => {
      try {
        const doc = JSON.parse(line);
        const ts = new Date(doc?.ts || 0).getTime();
        return Number.isFinite(ts) && ts >= cutoffMs;
      } catch {
        return false;
      }
    });
  } catch {}
  const entry = JSON.stringify({
    ts: now.toISOString(),
    run_date: targetMarketDate,
    step_id: stepId,
    status,
    duration_ms: durationMs,
    assets_total: detail.assets_total ?? null,
    assets_ok: detail.assets_ok ?? null,
    assets_failed: detail.assets_failed ?? null,
    error_message: detail.error_message ?? null,
  });
  fs.mkdirSync(path.dirname(PIPELINE_LEDGER_PATH), { recursive: true });
  const tmp = `${PIPELINE_LEDGER_PATH}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, [...keptLines, entry].join('\n') + '\n', 'utf8');
  fs.renameSync(tmp, PIPELINE_LEDGER_PATH);
}

function readLedgerDetail(step) {
  try {
    if (step.id === 'stock_analyzer_universe_audit') {
      const audit = readJson(path.join(ROOT, 'public/data/reports/stock-analyzer-universe-audit-latest.json'));
      return {
        assets_total: audit?.summary?.processed_assets ?? null,
        assets_ok: audit?.summary?.healthy_assets ?? null,
        assets_failed: audit?.summary?.affected_assets ?? null,
        error_message: audit?.failure_families?.[0]?.description || null,
      };
    }
    if (step.id === 'data_freshness') {
      const freshness = readJson(path.join(ROOT, 'public/data/reports/data-freshness-latest.json'));
      return {
        error_message: freshness?.summary?.severity === 'ok'
          ? null
          : `${freshness?.summary?.family_unhealthy ?? 'unknown'} unhealthy families`,
      };
    }
  } catch {}
  return {};
}

function defineSteps(options, context) {
  const node = resolveApprovedNodeBin();
  return [
    {
      id: 'learning',
      enabled: !options.skipLearning,
      command: node,
      args: ['scripts/learning/run-daily-learning-cycle.mjs', ...(options.dateArg ? [options.dateArg] : [])],
      env: stepEnv(context),
      outputs: [
        'public/data/reports/learning-report-latest.json',
        'public/data/runtime/stock-analyzer-control.json',
      ],
    },
    {
      id: 'snapshot',
      enabled: !options.skipSnapshot,
      command: node,
      args: ['scripts/build-best-setups-v4.mjs', '--publish'],
      env: stepEnv(context, {
        NODE_OPTIONS: '--max-old-space-size=8192',
        BEST_SETUPS_DISABLE_NETWORK: '1',
        ALLOW_REMOTE_BAR_FETCH: '0',
        BEST_SETUPS_CONCURRENCY: process.env.BEST_SETUPS_CONCURRENCY || '2',
        BEST_SETUPS_META_CONCURRENCY: process.env.BEST_SETUPS_META_CONCURRENCY || '4',
      }),
      outputs: [
        'public/data/snapshots/best-setups-v4.json',
        'public/data/reports/best-setups-build-latest.json',
      ],
    },
    {
      id: 'quantlab_daily_report',
      enabled: !options.skipQuantlabReport,
      command: node,
      args: ['scripts/quantlab/build_quantlab_v4_daily_report.mjs'],
      env: stepEnv(context),
      outputs: [
        'public/data/quantlab/status/operational-status.json',
        'public/data/quantlab/reports/v4-daily-latest.json',
      ],
    },
    {
      id: 'fundamentals_scope_refresh',
      enabled: true,
      nonBlocking: true,
      timeoutMs: Math.max(60_000, Number(process.env.RV_FUNDAMENTALS_SCOPE_TIMEOUT_MS || 60_000)),
      command: node,
      args: ['scripts/build-fundamentals.mjs', '--top-scope', '--force'],
      env: stepEnv(context),
      outputs: [
        'public/data/fundamentals/_scope.json',
        'public/data/v3/fundamentals/manifest.json',
      ],
    },
    {
      id: 'runtime_preflight',
      enabled: true,
      command: node,
      args: ['scripts/ops/runtime-preflight.mjs', '--ensure-runtime', '--mode=hard'],
      env: stepEnv(context),
      outputs: ['public/data/ops/runtime-preflight-latest.json'],
    },
    {
      id: 'stock_analyzer_universe_audit',
      enabled: !options.skipUniverseAudit,
      command: node,
      args: [
        'scripts/ops/build-stock-analyzer-universe-audit.mjs',
        '--registry-path', 'public/data/universe/v7/registry/registry.ndjson.gz',
        '--asset-classes', process.env.RV_GLOBAL_ASSET_CLASSES || 'STOCK,ETF',
        '--max-tickers', '0',
        `--date=${context.targetMarketDate}`,
        '--run-id', context.runId,
        '--live-sample-size', String(options.liveAuditSampleSize),
      ],
      env: stepEnv(context),
      outputs: ['public/data/reports/stock-analyzer-universe-audit-latest.json'],
    },
    {
      id: 'data_freshness',
      enabled: !options.skipDataFreshness,
      command: node,
      args: ['scripts/ops/build-data-freshness-report.mjs'],
      env: stepEnv(context),
      outputs: ['public/data/reports/data-freshness-latest.json'],
    },
    {
      id: 'system_status',
      enabled: !options.skipSystemStatus,
      command: node,
      args: ['scripts/ops/build-system-status-report.mjs'],
      env: stepEnv(context),
      outputs: ['public/data/reports/system-status-latest.json'],
    },
    {
      id: 'pipeline_epoch',
      enabled: !options.skipPipelineEpoch,
      command: node,
      args: ['scripts/ops/build-pipeline-epoch.mjs'],
      env: stepEnv(context),
      outputs: ['public/data/pipeline/epoch.json'],
    },
    {
      id: 'pipeline_runtime',
      enabled: !options.skipPipelineRuntime,
      command: node,
      args: ['scripts/ops/build-pipeline-runtime-report.mjs'],
      env: stepEnv(context),
      outputs: ['public/data/pipeline/runtime/latest.json'],
    },
    {
      id: 'ui_audit',
      enabled: !options.skipUiAudit,
      command: node,
      args: ['scripts/ops/verify-ui-completeness.mjs'],
      env: stepEnv(context),
      outputs: [
        'public/data/reports/frontpage-snapshot-audit-latest.json',
        'public/data/reports/analyzer-detail-audit-latest.json',
        'public/data/reports/ui-field-truth-report-latest.json',
        'public/data/reports/ui-audit-latest.json',
      ],
    },
    {
      id: 'system_status_refresh',
      enabled: !options.skipSystemStatus,
      command: node,
      args: ['scripts/ops/build-system-status-report.mjs'],
      env: stepEnv(context),
      outputs: ['public/data/reports/system-status-latest.json'],
    },
    {
      id: 'pipeline_epoch_refresh',
      enabled: !options.skipPipelineEpoch,
      command: node,
      args: ['scripts/ops/build-pipeline-epoch.mjs'],
      env: stepEnv(context),
      outputs: ['public/data/pipeline/epoch.json'],
    },
    {
      id: 'pipeline_runtime_refresh',
      enabled: !options.skipPipelineRuntime,
      command: node,
      args: ['scripts/ops/build-pipeline-runtime-report.mjs'],
      env: stepEnv(context),
      outputs: ['public/data/pipeline/runtime/latest.json'],
    },
    {
      id: 'decision_bundle',
      enabled: true,
      command: node,
      args: [
        'scripts/ops/build-full-universe-decisions.mjs',
        `--target-market-date=${context.targetMarketDate}`,
        '--replace',
      ],
      env: stepEnv(context),
      outputs: [
        'public/data/decisions/latest.json',
        'public/data/ops/decision-bundle-latest.json',
      ],
    },
    {
      id: 'final_integrity_seal',
      enabled: !options.skipFinalIntegritySeal,
      command: node,
      args: ['scripts/ops/final-integrity-seal.mjs', '--allow-publish-inflight'],
      env: stepEnv(context),
      outputs: [
        'public/data/ops/final-integrity-seal-latest.json',
        'public/data/reports/pipeline-incidents-latest.json',
      ],
    },
    {
      id: 'monitoring',
      enabled: !options.skipMonitoring,
      command: node,
      args: ['scripts/ops/build-pipeline-monitoring-report.mjs'],
      env: stepEnv(context),
      outputs: ['public/data/reports/pipeline-monitoring-latest.json'],
    },
    {
      id: 'dashboard_meta',
      enabled: !options.skipDashboard,
      command: node,
      args: ['scripts/generate_meta_dashboard_data.mjs'],
      env: stepEnv(context),
      outputs: [
        'public/dashboard_v6_meta_data.json',
        'public/data/ui/dashboard-v7-status.json',
      ],
    },
    {
      id: 'frontpage_links',
      enabled: !options.skipFrontpageValidator,
      command: node,
      args: ['scripts/ci/validate-frontpage-signal-links.mjs'],
      env: stepEnv(context),
      outputs: ['public/data/reports/frontpage-signal-link-validation-latest.json'],
    },
  ];
}

function rejectProductionSkips(options) {
  const skipFlags = [];
  if (options.skipLearning) skipFlags.push('--skip-learning');
  if (options.skipSnapshot) skipFlags.push('--skip-snapshot');
  if (options.skipQuantlabReport) skipFlags.push('--skip-quantlab-report');
  if (options.skipDataFreshness) skipFlags.push('--skip-data-freshness');
  if (options.skipSystemStatus) skipFlags.push('--skip-system-status');
  if (options.skipPipelineRuntime) skipFlags.push('--skip-pipeline-runtime');
  if (options.skipPipelineEpoch) skipFlags.push('--skip-pipeline-epoch');
  if (options.skipMonitoring) skipFlags.push('--skip-monitoring');
  if (options.skipDashboard) skipFlags.push('--skip-dashboard');
  if (options.skipUiAudit) skipFlags.push('--skip-ui-audit');
  if (options.skipUniverseAudit) skipFlags.push('--skip-universe-audit');
  if (options.skipFinalIntegritySeal) skipFlags.push('--skip-final-integrity-seal');
  if (options.skipFrontpageValidator) skipFlags.push('--skip-frontpage-validator');
  if (skipFlags.length > 0 && process.env.RV_ALLOW_SKIP_PUBLISH_CHAIN !== '1') {
    throw new Error(`publish_chain_skip_flags_forbidden:${skipFlags.join(',')}`);
  }
}

function outputState(relativePath) {
  const absPath = path.join(ROOT, relativePath);
  try {
    const stat = fs.statSync(absPath);
    return {
      path: relativePath,
      exists: true,
      mtime: new Date(stat.mtimeMs).toISOString(),
      size_bytes: stat.size,
    };
  } catch {
    return {
      path: relativePath,
      exists: false,
      mtime: null,
      size_bytes: null,
    };
  }
}

function learningOutputsFresh(targetMarketDate) {
  const learningReport = readJson(path.join(ROOT, 'public/data/reports/learning-report-latest.json'));
  const control = readJson(path.join(ROOT, 'public/data/runtime/stock-analyzer-control.json'));
  const learningTarget = normalizeDate(
    learningReport?.target_market_date
    || learningReport?.report_date
    || learningReport?.date
    || null
  );
  const controlTarget = normalizeDate(
    control?.target_market_date
    || control?.report_date
    || null
  );
  return learningTarget === targetMarketDate && controlTarget === targetMarketDate;
}

function shouldReuseStep(step, context) {
  if (step.id === 'learning') {
    return learningOutputsFresh(context.targetMarketDate);
  }
  return false;
}

function runCommand(step) {
  return new Promise((resolve) => {
    const child = spawn(step.command, step.args, {
      cwd: ROOT,
      env: step.env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    let timedOut = false;
    const timeoutMs = Math.max(0, Number(step?.timeoutMs) || 0);
    let timeoutId = null;
    let killId = null;
    if (timeoutMs > 0) {
      timeoutId = setTimeout(() => {
        timedOut = true;
        child.kill('SIGTERM');
        killId = setTimeout(() => {
          child.kill('SIGKILL');
        }, 5000);
      }, timeoutMs);
    }
    child.stdout.on('data', (chunk) => {
      const text = String(chunk || '');
      stdout += text;
      process.stdout.write(text);
    });
    child.stderr.on('data', (chunk) => {
      const text = String(chunk || '');
      stderr += text;
      process.stderr.write(text);
    });
    child.on('close', (code) => {
      if (timeoutId) clearTimeout(timeoutId);
      if (killId) clearTimeout(killId);
      resolve({
        exit_code: timedOut ? 124 : (code ?? 1),
        timed_out: timedOut,
        stdout_tail: stdout.trim().split(/\r?\n/).filter(Boolean).slice(-20),
        stderr_tail: stderr.trim().split(/\r?\n/).filter(Boolean).slice(-20),
      });
    });
    child.on('error', (error) => {
      if (timeoutId) clearTimeout(timeoutId);
      if (killId) clearTimeout(killId);
      resolve({
        exit_code: 1,
        timed_out: timedOut,
        stdout_tail: stdout.trim().split(/\r?\n/).filter(Boolean).slice(-20),
        stderr_tail: [...stderr.trim().split(/\r?\n/).filter(Boolean).slice(-20), String(error?.message || error)],
      });
    });
  });
}

async function main() {
  const options = parseArgs(process.argv);
  rejectProductionSkips(options);
  const releaseState = readJson(path.join(ROOT, 'public/data/ops/release-state-latest.json'));
  const learningReport = readJson(path.join(ROOT, 'public/data/reports/learning-report-latest.json'));
  const releaseTargetMarketDate = resolveReleaseTargetMarketDate(releaseState, {
    trackLegacyRead: true,
    readerId: 'scripts/ops/run-stock-analyzer-publish-chain.mjs',
  });
  const targetMarketDate = options.date || normalizeDate(releaseTargetMarketDate || learningReport?.target_market_date || learningReport?.date) || new Date().toISOString().slice(0, 10);
  const standaloneAllowed = process.env.RV_ALLOW_STANDALONE_PUBLISH_CHAIN === '1';
  const runId = options.runId || (standaloneAllowed ? `publish_chain_${nowIso().replace(/[-:.]/g, '').slice(0, 15)}_${process.pid}` : null);
  if (!runId) {
    throw new Error('publish_chain_requires_run_id');
  }
  const context = { runId, targetMarketDate };
  const steps = defineSteps(options, context);
  if (options.printOnly) {
    console.log(JSON.stringify({
      ok: true,
      run_id: runId,
      target_market_date: targetMarketDate,
      steps: steps.filter((step) => step.enabled).map((step) => ({
        id: step.id,
        command: [step.command, ...step.args].join(' '),
        outputs: step.outputs,
      })),
    }, null, 2));
    return;
  }

  const payload = {
    schema: 'rv.publish_chain.v1',
    ok: false,
    ...buildArtifactEnvelope({
      producer: 'scripts/ops/run-stock-analyzer-publish-chain.mjs',
      runId,
      targetMarketDate,
      upstreamRunIds: collectUpstreamRunIds(releaseState, learningReport),
    }),
    run_id: runId,
    started_at: nowIso(),
    finished_at: null,
    steps: [],
  };
  writeJsonAtomic(OUTPUT_PATH, payload);

  for (const step of steps) {
    if (!step.enabled) {
      payload.steps.push({
        id: step.id,
        status: 'skipped',
        started_at: null,
        finished_at: null,
        exit_code: 0,
        outputs: step.outputs.map(outputState),
      });
      writeJsonAtomic(OUTPUT_PATH, payload);
      continue;
    }

    if (shouldReuseStep(step, context)) {
      const reusedAt = nowIso();
      payload.steps.push({
        id: step.id,
        status: 'ok',
        started_at: reusedAt,
        finished_at: reusedAt,
        exit_code: 0,
        timed_out: false,
        reused: true,
        stdout_tail: [`reused_existing_outputs target_market_date=${context.targetMarketDate}`],
        stderr_tail: [],
        outputs: step.outputs.map(outputState),
      });
      writeJsonAtomic(OUTPUT_PATH, payload);
      appendPipelineRunLedgerEntry(step.id, 'ok', 0, targetMarketDate, readLedgerDetail(step));
      continue;
    }

    const startedAt = nowIso();
    const result = await runCommand(step);
    const finishedAt = nowIso();
    const status = result.exit_code === 0 ? 'ok' : (step.nonBlocking ? 'warning' : 'failed');
    const stepDoc = {
      id: step.id,
      status,
      started_at: startedAt,
      finished_at: finishedAt,
      exit_code: result.exit_code,
      timed_out: result.timed_out === true,
      stdout_tail: result.stdout_tail,
      stderr_tail: result.stderr_tail,
      outputs: step.outputs.map(outputState),
    };
    payload.steps.push(stepDoc);
    writeJsonAtomic(OUTPUT_PATH, payload);
    appendPipelineRunLedgerEntry(
      step.id,
      status,
      Math.max(0, new Date(finishedAt).getTime() - new Date(startedAt).getTime()),
      targetMarketDate,
      {
        ...readLedgerDetail(step),
        error_message: result.exit_code === 0
          ? readLedgerDetail(step).error_message ?? null
          : (result.stderr_tail?.slice(-1)?.[0] || result.stdout_tail?.slice(-1)?.[0] || `exit_code_${result.exit_code}`),
      },
    );
    if (result.exit_code !== 0) {
      if (step.nonBlocking) {
        continue;
      }
      payload.ok = false;
      payload.finished_at = finishedAt;
      writeJsonAtomic(OUTPUT_PATH, payload);
      process.exit(result.exit_code);
    }
  }

  payload.ok = true;
  payload.finished_at = nowIso();
  writeJsonAtomic(OUTPUT_PATH, payload);
}

main().catch((error) => {
  writeJsonAtomic(OUTPUT_PATH, {
    schema: 'rv.publish_chain.v1',
    ok: false,
    producer: 'scripts/ops/run-stock-analyzer-publish-chain.mjs',
    target_market_date: null,
    upstream_run_ids: [],
    run_id: `publish_chain_failed_${process.pid}`,
    started_at: nowIso(),
    finished_at: nowIso(),
    error: String(error?.stack || error?.message || error),
    steps: [],
  });
  console.error(error);
  process.exit(1);
});
