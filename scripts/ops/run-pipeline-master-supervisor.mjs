#!/usr/bin/env node

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import {
  buildArtifactEnvelope,
  collectUpstreamRunIds,
  normalizeDate,
  readJson,
  validateControlPlaneConsistency,
  writeJsonAtomic,
} from './pipeline-artifact-contract.mjs';
import {
  buildFinalIntegritySeal,
  writeFinalIntegritySeal,
  writePipelineIncidents,
  FINAL_INTEGRITY_SEAL_PATH,
} from './final-integrity-seal.mjs';
import { latestUsMarketSessionIso } from '../../functions/api/_shared/market-calendar.js';
import { acquirePipelineLock, refreshPipelineLock } from './pipeline-lock.mjs';
import { runReadinessProfile } from '../lib/pipeline_authority/gates/readiness-runner.mjs';
import { writeJsonDurableAtomicSync } from '../lib/durable-atomic-write.mjs';
import { assertProductionRuntime } from './prod-runtime-guard.mjs';

const ROOT = path.resolve(new URL('.', import.meta.url).pathname, '../..');
if (process.env.RV_PIPELINE_MASTER_ENABLED !== '1') {
  const line = [
    `[${new Date().toISOString()}]`,
    'pipeline_master_disabled_by_default=true',
    'enable_with_RV_PIPELINE_MASTER_ENABLED=1',
  ].join(' ');
  const logPath = path.join(ROOT, 'logs/pipeline-master-supervisor.log');
  try {
    fs.mkdirSync(path.dirname(logPath), { recursive: true });
    fs.appendFileSync(logPath, `${line}\n`, 'utf8');
  } catch {
    // A disabled legacy supervisor must not create a new failure loop.
  }
  console.log(line);
  process.exit(0);
}
const STATE_PATH = path.join(ROOT, 'mirrors/ops/pipeline-master/state.json');
const LOCK_PATH = path.join(ROOT, 'mirrors/ops/pipeline-master/lock.json');
const HEARTBEAT_PATH = path.join(ROOT, 'mirrors/ops/pipeline-master/supervisor-heartbeat.json');
const CRASH_DIR = path.join(ROOT, 'mirrors/ops/pipeline-master/crashes');
const STEP_CONTEXT_DIR = path.join(ROOT, 'mirrors/ops/pipeline-master/step-context');
const CRASH_SEAL_PATH = path.join(ROOT, 'public/data/ops/crash-seal-latest.json');
const RELEASE_STATE_PATH = path.join(ROOT, 'public/data/ops/release-state-latest.json');
const LOG_PATH = path.join(ROOT, 'logs/pipeline-master-supervisor.log');
const CYCLE_MS = 5 * 60 * 1000;
const SOURCE_READY_DEADLINE_MINUTES = 5 * 60 + 30;
const RELEASE_DEADLINE_MINUTES = 8 * 60;
const RECOVERY_CORE_STEP_IDS = [
  'market_data_refresh',
  'q1_delta_ingest',
  'quantlab_daily_report',
  'scientific_summary',
  'forecast_daily',
  'fundamentals',
  'hist_probs',
  'snapshot',
  'us_eu_truth_gate',
  'stock_analyzer_universe_audit',
  'system_status',
];
// UPSTREAM_CRITICAL: market-data-chain steps that must complete before Release Gate.
// `fundamentals` is intentionally excluded — it's a downstream enrichment step,
// not a blocking upstream data dependency (it depends on q1_delta_ingest but
// the release gate does not depend on it).
const UPSTREAM_CRITICAL_STEP_IDS = [
  'market_data_refresh',
  'q1_delta_ingest',
  'quantlab_daily_report',
  'scientific_summary',
  'forecast_daily',
  'hist_probs',
  'snapshot',
];

const PATHS = {
  refresh: path.join(ROOT, 'mirrors/universe-v7/state/refresh_v7_history_from_eodhd.report.json'),
  recovery: path.join(ROOT, 'public/data/reports/dashboard-green-recovery-latest.json'),
  recoveryState: path.join(ROOT, 'mirrors/ops/dashboard-green/state.json'),
  system: path.join(ROOT, 'public/data/reports/system-status-latest.json'),
  dashboardStatus: path.join(ROOT, 'public/data/ui/dashboard-v7-status.json'),
  runtime: path.join(ROOT, 'public/data/pipeline/runtime/latest.json'),
  epoch: path.join(ROOT, 'public/data/pipeline/epoch.json'),
  publish: path.join(ROOT, 'public/data/ops/publish-chain-latest.json'),
  runtimePreflight: path.join(ROOT, 'public/data/ops/runtime-preflight-latest.json'),
  release: RELEASE_STATE_PATH,
  stockAudit: path.join(ROOT, 'public/data/reports/stock-analyzer-universe-audit-latest.json'),
  uiFieldTruth: path.join(ROOT, 'public/data/reports/ui-field-truth-report-latest.json'),
  storage: path.join(ROOT, 'public/data/reports/storage-budget-latest.json'),
  launchd: path.join(ROOT, 'public/data/ops/launchd-reconcile-latest.json'),
  seal: FINAL_INTEGRITY_SEAL_PATH,
  decisionBundle: path.join(ROOT, 'public/data/decisions/latest.json'),
  heartbeat: HEARTBEAT_PATH,
  crashSeal: CRASH_SEAL_PATH,
};

let activeRunContext = {
  run_id: null,
  target_market_date: null,
  active_step: 'startup',
};

function log(message) {
  const line = `[${new Date().toISOString()}] ${message}\n`;
  fs.mkdirSync(path.dirname(LOG_PATH), { recursive: true });
  fs.appendFileSync(LOG_PATH, line, 'utf8');
  process.stdout.write(line);
}

function sleepMs(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

function writeSupervisorHeartbeat(state, activeStep = null, completedSteps = null) {
  const payload = {
    schema: 'rv.supervisor_heartbeat.v1',
    run_id: state?.run_id || activeRunContext.run_id || null,
    target_market_date: state?.target_market_date || activeRunContext.target_market_date || null,
    pid: process.pid,
    pid_start_time: activeRunContext.pid_start_time || null,
    host: os.hostname(),
    last_seen: new Date().toISOString(),
    active_step: activeStep || activeRunContext.active_step || null,
    completed_steps: Array.isArray(completedSteps) ? completedSteps : [],
    state: 'running',
  };
  writeJsonDurableAtomicSync(HEARTBEAT_PATH, payload);
  return payload;
}

function writeCrashSeal({
  state = null,
  failedStep = null,
  exitCode = null,
  signal = null,
  failureClass = null,
  error = null,
} = {}) {
  const payload = {
    schema: 'rv.crash_seal.v1',
    schema_version: '1.0',
    status: 'FAILED',
    run_id: state?.run_id || activeRunContext.run_id || null,
    target_market_date: state?.target_market_date || activeRunContext.target_market_date || null,
    generated_at: new Date().toISOString(),
    failed_step: failedStep || activeRunContext.active_step || null,
    exit_code: exitCode,
    signal,
    failure_class: failureClass || (exitCode === 137 || signal === 'SIGKILL' ? 'oom_or_killed' : 'process_failure'),
    blocking_reasons: ['crash_unresolved'],
    error: error ? String(error?.stack || error?.message || error).slice(0, 4000) : null,
  };
  fs.mkdirSync(CRASH_DIR, { recursive: true });
  const runBoundPath = path.join(CRASH_DIR, `${payload.run_id || `unknown-${Date.now()}`}.json`);
  writeJsonDurableAtomicSync(runBoundPath, payload);
  writeJsonDurableAtomicSync(CRASH_SEAL_PATH, payload);
  return payload;
}

function clearCrashSeal(state) {
  const payload = {
    schema: 'rv.crash_seal.v1',
    schema_version: '1.0',
    status: 'OK',
    run_id: state?.run_id || activeRunContext.run_id || null,
    target_market_date: state?.target_market_date || activeRunContext.target_market_date || null,
    generated_at: new Date().toISOString(),
    failed_step: null,
    exit_code: null,
    signal: null,
    failure_class: null,
    blocking_reasons: [],
  };
  writeJsonDurableAtomicSync(CRASH_SEAL_PATH, payload);
  return payload;
}

function writeStepContext({ runId, stepId, startedAt = null, completedAt = null, exitCode = null, outputArtifacts = [] } = {}) {
  if (!runId || !stepId) return;
  try {
    const dir = path.join(STEP_CONTEXT_DIR, String(runId));
    fs.mkdirSync(dir, { recursive: true });
    writeJsonDurableAtomicSync(path.join(dir, `${stepId}.json`), {
      schema: 'rv.step_context.v1',
      run_id: runId,
      step_id: stepId,
      started_at: startedAt || null,
      completed_at: completedAt || null,
      exit_code: exitCode,
      output_artifacts: outputArtifacts,
      written_at: new Date().toISOString(),
    });
  } catch {
    // step context write must not block the supervisor cycle
  }
}

function getBerlinClock(now = new Date()) {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Berlin',
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
  const parts = Object.fromEntries(formatter.formatToParts(now).map((item) => [item.type, item.value]));
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    minutes: Number(parts.hour) * 60 + Number(parts.minute),
  };
}

function runNode(scriptPath, args = [], { timeoutMs = 20 * 60 * 1000, env = {} } = {}) {
  const result = spawnSync(process.execPath, [scriptPath, ...args], {
    cwd: ROOT,
    env: { ...process.env, ...env },
    encoding: 'utf8',
    timeout: timeoutMs,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  return {
    status: result.status ?? 1,
    stdout: result.stdout || '',
    stderr: result.stderr || '',
  };
}

function ensureAuditRuntimeReady() {
  const initial = runReadinessProfile('stock_analyzer_audit', {
    baseUrl: 'http://127.0.0.1:8788',
    ticker: 'AAPL',
  });
  if (initial.ok) return initial;

  const failedIds = (initial.checks || []).filter((c) => !c.ok).map((c) => c.id).join(',') || 'unknown';
  const timedOut = (initial.checks || []).some((c) => !c.ok && (
    String(c.error || '').includes('TIMEOUT') || String(c.error || '').includes('TimeoutError')
  ));
  log(`runtime_preflight=failed timed_out=${timedOut} checks=${failedIds}`);

  if (timedOut) {
    // Workerd is listening but hung — hard-kill before attempting recovery
    log('runtime_preflight: killing hung wrangler/workerd process...');
    try { spawnSync('/usr/bin/pkill', ['-f', 'wrangler'], { stdio: 'ignore' }); } catch {}
    // Allow OS to reclaim the port before recovery restarts wrangler
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 3000);
  }

  runNode(path.join(ROOT, 'scripts/ops/run-dashboard-green-recovery.mjs'), [], { timeoutMs: 4 * 60 * 1000 });

  const retry = runReadinessProfile('stock_analyzer_audit', {
    baseUrl: 'http://127.0.0.1:8788',
    ticker: 'AAPL',
  });
  if (!retry.ok) {
    const retryIds = (retry.checks || []).filter((c) => !c.ok).map((c) => c.id).join(',') || 'unknown';
    log(`runtime_preflight=failed_after_recovery checks=${retryIds} — publish chain will be skipped this cycle`);
  }
  return retry;
}

function runScriptJson(scriptPath, args = [], options = {}) {
  const result = runNode(scriptPath, args, options);
  const text = String(result.stdout || '').trim();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {}
  return { ...result, json };
}

function rotateLogFile(filePath, maxBytes = 5 * 1024 * 1024, keep = 4) {
  try {
    const stat = fs.statSync(filePath);
    if (stat.size <= maxBytes) return;
  } catch {
    return;
  }
  for (let index = keep; index >= 1; index -= 1) {
    const source = `${filePath}.${index}`;
    const target = `${filePath}.${index + 1}`;
    if (fs.existsSync(source)) fs.renameSync(source, target);
  }
  fs.renameSync(filePath, `${filePath}.1`);
}

function rotateOpsLogs() {
  rotateLogFile(LOG_PATH);
  const dashboardLogDir = path.join(ROOT, 'logs/dashboard_v7');
  try {
    for (const file of fs.readdirSync(dashboardLogDir)) {
      if (file.endsWith('.log')) rotateLogFile(path.join(dashboardLogDir, file));
    }
  } catch {}
}

function loadState(targetMarketDate) {
  const forcedRunId = String(process.env.RUN_ID || process.env.RV_RUN_ID || '').trim() || null;
  const current = readJson(STATE_PATH) || {};
  if (current.target_market_date !== targetMarketDate) {
    return {
      schema: 'rv.pipeline_master_state.v2',
      run_id: forcedRunId || `pipeline-master-${targetMarketDate}`,
      target_market_date: targetMarketDate,
      started_at: new Date().toISOString(),
      last_publish_attempt_at: null,
      last_recovery_attempt_at: null,
      completed_at: null,
      phase: 'WAIT_FOR_SOURCE_DATA',
      restart_signatures: {},
    };
  }
  if (forcedRunId) current.run_id = forcedRunId;
  return current;
}

function sourceDataReady(targetMarketDate) {
  const refresh = readJson(PATHS.refresh);
  return refresh?.assets_fetched_with_data > 0
    && normalizeDate(refresh?.to_date) >= targetMarketDate;
}

function publishChainReady(targetMarketDate, runId = null) {
  const publish = readJson(PATHS.publish);
  if (!publish?.ok) return false;
  if (!publish?.generated_at) return false;
  if (normalizeDate(publish?.target_market_date) && normalizeDate(publish?.target_market_date) !== targetMarketDate) return false;
  if (runId && String(publish?.run_id || '').trim() !== String(runId).trim()) return false;
  if (!Array.isArray(publish?.steps) || publish.steps.length === 0) return false;
  return !Array.isArray(publish?.steps) || publish.steps.every((step) => step?.status !== 'failed' && step?.status !== 'skipped');
}

function dashboardMetaFresh(targetMarketDate, seal = null) {
  const status = readJson(PATHS.dashboardStatus);
  if (!status) return false;
  if (normalizeDate(status?.target_market_date) !== targetMarketDate) return false;
  const persistedSeal = readJson(PATHS.seal);
  const persistedSealAt = normalizeDate(persistedSeal?.target_market_date) === targetMarketDate && persistedSeal?.generated_at
    ? Date.parse(persistedSeal.generated_at)
    : NaN;
  const sealAt = Number.isFinite(persistedSealAt)
    ? persistedSealAt
    : (seal?.generated_at ? Date.parse(seal.generated_at) : NaN);
  const dashAt = status?.generated_at ? Date.parse(status.generated_at) : NaN;
  if (!Number.isFinite(dashAt)) return false;
  if (!Number.isFinite(sealAt)) return true;
  return dashAt >= sealAt;
}

function recoveryCoreReady(targetMarketDate, recovery) {
  if (normalizeDate(recovery?.target_market_date) !== targetMarketDate) return false;
  const completed = new Set(recovery?.completed_steps || []);
  return RECOVERY_CORE_STEP_IDS.every((stepId) => completed.has(stepId));
}

function recoveryStateBlockedSteps(recoveryState) {
  return Object.entries(recoveryState?.steps || {})
    .filter(([, stepState]) => String(stepState?.blocked_reason || '').trim())
    .map(([id, stepState]) => ({
      id,
      reason: String(stepState?.blocked_reason || '').trim(),
    }));
}

function systemNeedsUpstreamRefresh(system) {
  if (!system?.summary) return true;
  if (String(system.summary.data_layer_severity || '').toLowerCase() === 'critical') return true;
  if (system.summary.runtime_preflight_ok === false) return true;
  if (system.summary.release_policy_ready === false && system.summary.policy_neutral_structural_gaps_only !== true) return true;
  return UPSTREAM_CRITICAL_STEP_IDS.some((stepId) => String(system?.steps?.[stepId]?.severity || '').toLowerCase() === 'critical');
}

function runVerifyRefresh(targetMarketDate, runId) {
  const sharedEnv = {
    RUN_ID: runId || `run-supervisor-${targetMarketDate}`,
    RV_RUN_ID: runId || `run-supervisor-${targetMarketDate}`,
    TARGET_MARKET_DATE: targetMarketDate,
    RV_TARGET_MARKET_DATE: targetMarketDate,
  };
  const verifySteps = [
    {
      id: 'ui_audit',
      script: path.join(ROOT, 'scripts/ops/verify-ui-completeness.mjs'),
      timeoutMs: 10 * 60 * 1000,
    },
    {
      id: 'system_status',
      script: path.join(ROOT, 'scripts/ops/build-system-status-report.mjs'),
      timeoutMs: 10 * 60 * 1000,
    },
    {
      id: 'pipeline_epoch',
      script: path.join(ROOT, 'scripts/ops/build-pipeline-epoch.mjs'),
      timeoutMs: 5 * 60 * 1000,
    },
    {
      id: 'pipeline_runtime',
      script: path.join(ROOT, 'scripts/ops/build-pipeline-runtime-report.mjs'),
      timeoutMs: 5 * 60 * 1000,
    },
    {
      id: 'final_integrity_seal',
      script: path.join(ROOT, 'scripts/ops/final-integrity-seal.mjs'),
      timeoutMs: 5 * 60 * 1000,
    },
    {
      id: 'monitoring',
      script: path.join(ROOT, 'scripts/ops/build-pipeline-monitoring-report.mjs'),
      timeoutMs: 5 * 60 * 1000,
    },
    {
      id: 'dashboard_meta',
      script: path.join(ROOT, 'scripts/generate_meta_dashboard_data.mjs'),
      timeoutMs: 5 * 60 * 1000,
    },
  ];

  let lastStatus = 0;
  for (const step of verifySteps) {
    const result = runNode(step.script, [], { timeoutMs: step.timeoutMs, env: sharedEnv });
    lastStatus = result.status ?? 1;
    if (lastStatus !== 0) {
      log(`verify_step_failed=${step.id} exit=${lastStatus}`);
      return { status: lastStatus, step: step.id };
    }
  }
  return { status: 0, step: 'dashboard_meta' };
}

function ensureLaunchdHealthy(sourceReady) {
  let report = readJson(PATHS.launchd);
  if (!report || sourceReady) {
    runScriptJson(path.join(ROOT, 'scripts/ops/reconcile-rubikvault-launchd.mjs'));
    report = readJson(PATHS.launchd);
  }
  if (sourceReady && report?.allowed_launchd_only !== true) {
    runScriptJson(path.join(ROOT, 'scripts/ops/reconcile-rubikvault-launchd.mjs'), ['--enforce']);
    report = readJson(PATHS.launchd);
  }
  return report;
}

function ensureStorageReport() {
  runScriptJson(path.join(ROOT, 'scripts/ops/run-storage-governor.mjs'), ['report', '--json']);
  return readJson(PATHS.storage);
}

export function syncSealPhase(seal, phase) {
  if (!seal || typeof seal !== 'object') return seal;
  return {
    ...seal,
    phase: phase || seal.phase || null,
  };
}

function computePhase({
  targetMarketDate,
  runId = null,
  berlinClock,
  sourceReady,
  recovery,
  recoveryState,
  system,
  runtime,
  epoch,
  release,
  publish,
  runtimePreflight = null,
  stockAudit,
  uiFieldTruth,
  launchdReport,
	  storageReport,
	  decisionBundle = null,
	  heartbeat = null,
	  crashSeal = null,
	  previousFinal = null,
	  lockIntegrityOk,
	}) {
  const consistency = validateControlPlaneConsistency({ system, release, runtime, epoch, recovery });
  const seal = buildFinalIntegritySeal({
    runId: runId || consistency.run_id || release?.run_id || runtime?.run_id || null,
    targetMarketDate,
    phase: release?.phase || null,
    system,
    runtime,
    epoch,
    recovery,
    release,
    publish,
    runtimePreflight,
    stockAnalyzerAudit: stockAudit,
	    uiFieldTruth,
	    launchd: launchdReport,
	    storage: storageReport,
	    decisionBundle,
    heartbeat,
    crashSeal,
    previousFinal,
    controlPlaneConsistency: consistency,
    lockIntegrityOk,
  });

  if (seal.ui_green) {
    if (!dashboardMetaFresh(targetMarketDate, seal)) {
      return {
        phase: 'VERIFY',
        functionalPhase: 'VERIFY',
        hasBudgetExhausted: false,
        blockers: [],
        consistency,
        seal: syncSealPhase(seal, 'VERIFY'),
      };
    }
    return { phase: 'RELEASE_READY', blockers: [], consistency, seal: syncSealPhase(seal, 'RELEASE_READY') };
  }

  const blockers = [...(seal.blocking_reasons || [])];

  // Hard correctness gates — active even during SLA_BREACH
  if (!launchdReport?.allowed_launchd_only) return { phase: 'WAIT_FOR_AGENT_RECONCILE', blockers, consistency, seal };
  if (!storageReport?.disk?.heavy_jobs_allowed) return { phase: 'WAIT_FOR_STORAGE', blockers, consistency, seal };
  const nasRequired = process.env.RV_REQUIRE_NAS_FOR_RELEASE === '1';
  if (nasRequired && storageReport?.nas?.reachable !== true) return { phase: 'WAIT_FOR_NAS', blockers, consistency, seal };

  const liveBlockedSteps = recoveryStateBlockedSteps(recoveryState);
  const hasBudgetExhausted = liveBlockedSteps.some((step) => step.reason.startsWith('restart_budget_exhausted'));
  // Detect terminal q1_delta_ingest failure — requires manual intervention, no point continuing recovery.
  const q1TerminallyBlocked = liveBlockedSteps.some(
    (step) => step.id === 'q1_delta_ingest' && step.reason.startsWith('restart_budget_exhausted'),
  );
  const upstreamRecoveryReady = recoveryCoreReady(targetMarketDate, recovery);
  const upstreamRefreshNeeded = !upstreamRecoveryReady || systemNeedsUpstreamRefresh(system);

  // Functional phase: what should the supervisor do?
  let functionalPhase;
  if (!sourceReady) {
    // Market-data refresh is part of recovery; don't idle waiting for an external writer.
    functionalPhase = 'UPSTREAM_REFRESH';
  } else if (q1TerminallyBlocked) {
    // q1_delta_ingest exhausted its restart budget — manual fix required; stop spinning.
    functionalPhase = 'UPSTREAM_BLOCKED';
  } else if (hasBudgetExhausted || upstreamRefreshNeeded) {
    functionalPhase = 'UPSTREAM_REFRESH';
  } else if (publishChainReady(targetMarketDate, runId) !== true) {
    functionalPhase = 'PUBLISH';
  } else {
    functionalPhase = 'VERIFY';
  }

  // SLA overlay: display-only label, does not stop actions
  const slaState = berlinClock.minutes >= RELEASE_DEADLINE_MINUTES ? 'SLA_BREACH'
    : berlinClock.minutes >= SOURCE_READY_DEADLINE_MINUTES ? 'SLA_AT_RISK'
    : null;
  const slaAffected = new Set(['UPSTREAM_REFRESH', 'PUBLISH', 'VERIFY']);
  const phase = (slaState && slaAffected.has(functionalPhase)) ? slaState : functionalPhase;

  return { phase, functionalPhase, hasBudgetExhausted, blockers, consistency, seal: syncSealPhase(seal, phase) };
}

function writeReleaseState({ state, phase, blockers, consistency, system, runtime, epoch, seal }) {
  const envelope = buildArtifactEnvelope({
    producer: 'scripts/ops/run-pipeline-master-supervisor.mjs',
    runId: state.run_id,
    targetMarketDate: state.target_market_date,
    upstreamRunIds: collectUpstreamRunIds(system, runtime, epoch, seal),
  });
  writeJsonAtomic(RELEASE_STATE_PATH, {
    schema: 'rv_release_state_v3',
    ...envelope,
    target_date: state.target_market_date,
    started_at: state.started_at,
    completed_at: phase === 'RELEASE_READY' ? (state.completed_at || new Date().toISOString()) : null,
    phase,
    blocker: blockers?.[0]?.id || null,
    lead_blocker_step: seal?.lead_blocker_step || null,
    blockers,
    next_step: seal?.next_step || null,
    final_integrity_seal_ref: 'public/data/ops/final-integrity-seal-latest.json',
    ui_green: seal?.ui_green ?? null,
    release_ready: seal?.release_ready ?? null,
    full_universe_validated: seal?.full_universe_validated ?? null,
    allowed_launchd_only: seal?.allowed_launchd_only ?? null,
    storage_ok: seal?.storage_ok ?? null,
    nas_ok: seal?.nas_ok ?? null,
    calendar_ok: seal?.calendar_ok ?? null,
    observer_stale: seal?.observer_stale ?? null,
    observer_generated_at: seal?.observer_generated_at ?? null,
    runtime_preflight_ok: seal?.runtime_preflight_ok ?? null,
    runtime_preflight_ref: seal?.runtime_preflight_ref || null,
    control_plane: consistency,
    // data_pipeline_phase reflects the data-plane runtime state (always "running" while pipeline
    // is active) — it is independent from the release-gate phase above. Not a blocker signal.
    data_pipeline_phase: runtime?.phase || null,
    runtime_phase: phase === 'RELEASE_READY' ? 'completed' : (runtime?.phase || null),
    epoch_pipeline_ok: epoch?.pipeline_ok ?? null,
    system_release_ready: system?.summary?.release_ready ?? null,
    last_updated: new Date().toISOString(),
  });
}

function updateRestartSignature(state, phase, exitCode) {
  const key = `${phase}:${exitCode}`;
  state.restart_signatures = state.restart_signatures || {};
  state.restart_signatures[key] = (state.restart_signatures[key] || 0) + 1;
}

export function rebuildReleaseStateOnce(targetMarketDate = latestUsMarketSessionIso(new Date())) {
  const berlinClock = getBerlinClock();
  const state = loadState(targetMarketDate);
  const sourceReady = sourceDataReady(targetMarketDate);
  const launchdReport = ensureLaunchdHealthy(sourceReady);
  const storageReport = ensureStorageReport();
  const recovery = readJson(PATHS.recovery);
  const recoveryState = readJson(PATHS.recoveryState);
  const system = readJson(PATHS.system);
  const runtime = readJson(PATHS.runtime);
  const epoch = readJson(PATHS.epoch);
  const release = readJson(PATHS.release);
  const publish = readJson(PATHS.publish);
  const runtimePreflight = readJson(PATHS.runtimePreflight);
  const stockAudit = readJson(PATHS.stockAudit);
  const uiFieldTruth = readJson(PATHS.uiFieldTruth);
  const decisionBundle = readJson(PATHS.decisionBundle);
  const heartbeat = readJson(PATHS.heartbeat);
  const crashSeal = readJson(PATHS.crashSeal);
  const previousFinal = readJson(PATHS.seal);
  const releaseCandidate = {
    ...(release || {}),
    run_id: state.run_id,
    target_market_date: targetMarketDate,
    target_date: targetMarketDate,
  };

  const phaseState = computePhase({
    targetMarketDate,
    runId: state.run_id,
    berlinClock,
    sourceReady,
    recovery,
    recoveryState,
    system,
    runtime,
    epoch,
    release: releaseCandidate,
    publish,
    runtimePreflight,
    stockAudit,
    uiFieldTruth,
    launchdReport,
    storageReport,
    decisionBundle,
    heartbeat,
    crashSeal,
    previousFinal,
    lockIntegrityOk: true,
  });

  state.phase = phaseState.phase;
  state.target_market_date = targetMarketDate;
  state.updated_at = new Date().toISOString();
  if (phaseState.phase === 'RELEASE_READY') {
    state.completed_at ||= new Date().toISOString();
  }

  writeJsonAtomic(STATE_PATH, state);
  writeReleaseState({
    state,
    phase: phaseState.phase,
    blockers: phaseState.seal?.blocking_reasons || phaseState.blockers,
    consistency: phaseState.consistency,
    system,
    runtime,
    epoch,
    seal: phaseState.seal,
  });
  return {
    phase: phaseState.phase,
    run_id: state.run_id,
    target_market_date: targetMarketDate,
    blocking_reasons: phaseState.seal?.blocking_reasons || [],
  };
}

function main() {
  assertProductionRuntime({ job: 'pipeline-master-supervisor', exitOnFailure: true });
  activeRunContext.pid_start_time = new Date().toISOString();
  process.on('uncaughtException', (error) => {
    try {
      writeCrashSeal({ failedStep: activeRunContext.active_step, exitCode: 1, failureClass: 'uncaught_exception', error });
    } finally {
      console.error(error);
      process.exit(1);
    }
  });
  process.on('unhandledRejection', (error) => {
    try {
      writeCrashSeal({ failedStep: activeRunContext.active_step, exitCode: 1, failureClass: 'unhandled_rejection', error });
    } finally {
      console.error(error);
      process.exit(1);
    }
  });
  rotateOpsLogs();
  const initialTarget = latestUsMarketSessionIso(new Date());
  const initialState = loadState(initialTarget);
  const lockState = acquirePipelineLock(LOCK_PATH, {
    runId: initialState.run_id,
    targetMarketDate: initialTarget,
    ownerStep: 'pipeline_master',
    command: process.execPath,
    args: process.argv.slice(1),
    cwd: ROOT,
    ttlSeconds: Math.round((CYCLE_MS * 3) / 1000),
  });
  if (!lockState.acquired) {
    log(`phase=SKIP reason=${lockState.reason}`);
    process.exit(0);
  }
  let lockDoc = lockState.lock;
  let prevCompletedSteps = new Set();

  while (true) {
    const targetMarketDate = latestUsMarketSessionIso(new Date());
    const berlinClock = getBerlinClock();
    const state = loadState(targetMarketDate);
    activeRunContext = {
      ...activeRunContext,
      run_id: state.run_id,
      target_market_date: targetMarketDate,
      active_step: 'supervisor_cycle',
    };
    writeSupervisorHeartbeat(state, 'supervisor_cycle', Array.from(prevCompletedSteps));
    lockDoc = refreshPipelineLock(LOCK_PATH, lockDoc, Math.round((CYCLE_MS * 3) / 1000));
    const sourceReady = sourceDataReady(targetMarketDate);
    const launchdReport = ensureLaunchdHealthy(sourceReady);
    const storageReport = ensureStorageReport();
    const recovery = readJson(PATHS.recovery);
    const currentCompletedSteps = new Set(recovery?.completed_steps || []);
    for (const stepId of currentCompletedSteps) {
      if (!prevCompletedSteps.has(stepId)) {
        const stepStateEntry = readJson(PATHS.recoveryState)?.steps?.[stepId] || {};
        writeStepContext({
          runId: state.run_id,
          stepId,
          startedAt: stepStateEntry.last_started_at || null,
          completedAt: stepStateEntry.completed_at || new Date().toISOString(),
          exitCode: 0,
        });
      }
    }
    prevCompletedSteps = currentCompletedSteps;
    const recoveryState = readJson(PATHS.recoveryState);
    const system = readJson(PATHS.system);
    const runtime = readJson(PATHS.runtime);
    const epoch = readJson(PATHS.epoch);
    const release = readJson(PATHS.release);
    const publish = readJson(PATHS.publish);
    const runtimePreflight = readJson(PATHS.runtimePreflight);
    const stockAudit = readJson(PATHS.stockAudit);
    const uiFieldTruth = readJson(PATHS.uiFieldTruth);
    const decisionBundle = readJson(PATHS.decisionBundle);
    const heartbeat = readJson(PATHS.heartbeat);
    const crashSeal = readJson(PATHS.crashSeal);
    const previousFinal = readJson(PATHS.seal);
    const current = computePhase({
      targetMarketDate,
      runId: state.run_id,
      berlinClock,
      sourceReady,
      recovery,
      recoveryState,
      system,
      runtime,
      epoch,
      release,
      publish,
      runtimePreflight,
      stockAudit,
      uiFieldTruth,
      launchdReport,
      storageReport,
      decisionBundle,
      heartbeat,
      crashSeal,
      previousFinal,
      lockIntegrityOk: true,
    });

    const actionPhase = current.functionalPhase || current.phase;
    activeRunContext.active_step = actionPhase;
    writeSupervisorHeartbeat(state, actionPhase, Array.from(currentCompletedSteps));
    if (actionPhase === 'UPSTREAM_REFRESH') {
      log(`phase=${current.phase} functionalPhase=${actionPhase} target=${targetMarketDate}`);
      const result = runNode(path.join(ROOT, 'scripts/ops/run-dashboard-green-recovery.mjs'), [], {
        timeoutMs: 4 * 60 * 1000,
      });
      state.last_recovery_attempt_at = new Date().toISOString();
      if (current.hasBudgetExhausted) {
        log(`recovery_budget_exhausted=1 reset_suppressed=1 target=${targetMarketDate}`);
      }
      updateRestartSignature(state, 'UPSTREAM_REFRESH', result.status);
      if (result.status !== 0) writeCrashSeal({ state, failedStep: actionPhase, exitCode: result.status, failureClass: 'step_failed' });
    } else if (actionPhase === 'PUBLISH') {
      log(`phase=${current.phase} functionalPhase=${actionPhase} target=${targetMarketDate}`);
      const readiness = ensureAuditRuntimeReady();
      if (readiness.ok) {
        const result = runNode(path.join(ROOT, 'scripts/ops/run-stock-analyzer-publish-chain.mjs'), [`--date=${targetMarketDate}`, '--full-universe-audit'], {
          timeoutMs: 60 * 60 * 1000,
          env: {
            RUN_ID: state.run_id || `run-supervisor-${targetMarketDate}`,
            RV_RUN_ID: state.run_id || `run-supervisor-${targetMarketDate}`,
            TARGET_MARKET_DATE: targetMarketDate,
            RV_TARGET_MARKET_DATE: targetMarketDate,
            RV_FULL_UNIVERSE_AUDIT: '1',
            RV_STOCK_ANALYZER_LIVE_SAMPLE_SIZE: '0',
            RV_STOCK_ANALYZER_LIVE_CANARY_SIZE: '0',
            RV_ALLOW_STANDALONE_PUBLISH_CHAIN: '1',
          },
        });
	        state.last_publish_attempt_at = new Date().toISOString();
	        updateRestartSignature(state, actionPhase, result.status);
	        if (result.status !== 0) writeCrashSeal({ state, failedStep: actionPhase, exitCode: result.status, failureClass: 'step_failed' });
	      } else {
        state.last_recovery_attempt_at = new Date().toISOString();
        updateRestartSignature(state, 'RUNTIME_PREFLIGHT', 1);
      }
    } else if (actionPhase === 'VERIFY') {
      log(`phase=${current.phase} functionalPhase=${actionPhase} target=${targetMarketDate}`);
      const result = runVerifyRefresh(targetMarketDate, state.run_id);
      state.last_publish_attempt_at = new Date().toISOString();
      updateRestartSignature(state, actionPhase, result.status);
    } else {
      log(`phase=${current.phase} target=${targetMarketDate}`);
    }

    const refreshedRecovery = readJson(PATHS.recovery);
    const refreshedRecoveryState = readJson(PATHS.recoveryState);
    const refreshedSystem = readJson(PATHS.system);
    const refreshedRuntime = readJson(PATHS.runtime);
    const refreshedEpoch = readJson(PATHS.epoch);
    const refreshedRelease = readJson(PATHS.release);
    const refreshedPublish = readJson(PATHS.publish);
    const refreshedRuntimePreflight = readJson(PATHS.runtimePreflight);
    const refreshedAudit = readJson(PATHS.stockAudit);
    const refreshedUiFieldTruth = readJson(PATHS.uiFieldTruth);
    const refreshedLaunchd = readJson(PATHS.launchd);
    const refreshedStorage = readJson(PATHS.storage);
    const refreshedDecisionBundle = readJson(PATHS.decisionBundle);
    const refreshedHeartbeat = readJson(PATHS.heartbeat);
    const refreshedCrashSeal = readJson(PATHS.crashSeal);
    const refreshedPreviousFinal = readJson(PATHS.seal);

    const finalPhase = computePhase({
      targetMarketDate,
      runId: state.run_id,
      berlinClock,
      sourceReady,
      recovery: refreshedRecovery,
      recoveryState: refreshedRecoveryState,
      system: refreshedSystem,
      runtime: refreshedRuntime,
      epoch: refreshedEpoch,
      release: refreshedRelease,
      publish: refreshedPublish,
      runtimePreflight: refreshedRuntimePreflight,
      stockAudit: refreshedAudit,
      uiFieldTruth: refreshedUiFieldTruth,
      launchdReport: refreshedLaunchd,
      storageReport: refreshedStorage,
      decisionBundle: refreshedDecisionBundle,
      heartbeat: refreshedHeartbeat,
      crashSeal: refreshedCrashSeal,
      previousFinal: refreshedPreviousFinal,
      lockIntegrityOk: true,
    });

    state.phase = finalPhase.phase;
    state.target_market_date = targetMarketDate;
    state.updated_at = new Date().toISOString();
    if (finalPhase.phase === 'RELEASE_READY') {
      state.completed_at ||= new Date().toISOString();
      clearCrashSeal(state);
    }

    writeJsonAtomic(STATE_PATH, state);
    writeFinalIntegritySeal(finalPhase.seal);
    writePipelineIncidents({
      phase: finalPhase.phase,
      blockers: finalPhase.seal?.blocking_reasons || [],
      topBlocker: finalPhase.seal?.blocking_reasons?.[0] || null,
      launchd: refreshedLaunchd,
      storage: refreshedStorage,
      targetMarketDate,
      runId: state.run_id,
      release: refreshedRelease,
    });
    writeReleaseState({
      state,
      phase: finalPhase.phase,
      blockers: finalPhase.seal?.blocking_reasons || finalPhase.blockers,
      consistency: finalPhase.consistency,
      system: refreshedSystem,
      runtime: refreshedRuntime,
      epoch: refreshedEpoch,
      seal: finalPhase.seal,
    });
    writeSupervisorHeartbeat(state, 'sleep');
    sleepMs(CYCLE_MS);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  if (process.argv.includes('--once') || process.argv.includes('--rebuild-release-state-only')) {
    const targetMarketDate = String(process.env.TARGET_MARKET_DATE || process.env.RV_TARGET_MARKET_DATE || '').trim()
      || latestUsMarketSessionIso(new Date());
    const result = rebuildReleaseStateOnce(targetMarketDate);
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  } else {
    main();
  }
}
