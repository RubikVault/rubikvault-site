#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import {
  buildArtifactEnvelope,
  collectUpstreamRunIds,
  normalizeDate,
  readJson,
  resolveReleaseTargetMarketDate,
  validateControlPlaneConsistency,
  writeJsonAtomic,
} from './pipeline-artifact-contract.mjs';

const ROOT = path.resolve(new URL('.', import.meta.url).pathname, '../..');
const PATHS = {
  nightly: path.join(ROOT, 'public/data/reports/nightly-stock-analyzer-status.json'),
  recovery: path.join(ROOT, 'public/data/reports/dashboard-green-recovery-latest.json'),
  system: path.join(ROOT, 'public/data/reports/system-status-latest.json'),
  release: path.join(ROOT, 'public/data/ops/release-state-latest.json'),
  seal: path.join(ROOT, 'public/data/ops/final-integrity-seal-latest.json'),
  output: path.join(ROOT, 'public/data/pipeline/runtime/latest.json'),
  epoch: path.join(ROOT, 'public/data/pipeline/epoch.json'),
};

function statMtimeIso(filePath) {
  try {
    return new Date(fs.statSync(filePath).mtimeMs).toISOString();
  } catch {
    return null;
  }
}

function chooseOwner({ nightly, recovery }) {
  if (nightly?.phase && nightly.phase !== 'completed' && nightly.phase !== 'ok') return 'nightly';
  if ((recovery?.running_steps || []).length > 0) return 'recovery';
  if ((recovery?.blocked_steps || []).length > 0 && recovery?.next_step) return 'recovery';
  return 'release';
}

const nightly = readJson(PATHS.nightly) || {};
const recovery = readJson(PATHS.recovery) || {};
const system = readJson(PATHS.system) || {};
const release = readJson(PATHS.release) || {};
const seal = readJson(PATHS.seal) || {};
const epoch = readJson(PATHS.epoch) || {};
const consistency = validateControlPlaneConsistency({ system, release, epoch, recovery });
const releaseTargetMarketDate = resolveReleaseTargetMarketDate(release, {
  trackLegacyRead: true,
  readerId: 'scripts/ops/build-pipeline-runtime-report.mjs',
});
const forcedTargetMarketDate = normalizeDate(process.env.TARGET_MARKET_DATE || process.env.RV_TARGET_MARKET_DATE || null);
const forcedRunId = String(process.env.RUN_ID || process.env.RV_RUN_ID || '').trim() || null;
const targetMarketDate = forcedTargetMarketDate
  || consistency.target_market_date
  || normalizeDate(recovery.target_market_date || releaseTargetMarketDate)
  || null;

const blockers = (system.root_causes || [])
  .filter((item) => ['warning', 'critical'].includes(String(item?.severity || '').toLowerCase()))
  .map((item) => ({
    id: item.id || null,
    severity: item.severity || null,
    title: item.title || null,
    subsystem: item.subsystem || null,
  }));
for (const reason of consistency.blocking_reasons || []) {
  blockers.push({
    id: reason.id,
    severity: reason.severity,
    title: reason.id,
    subsystem: 'control_plane',
  });
}

const blockingState = (consistency.ok ? null : 'critical')
  || system?.summary?.blocking_severity
  || system?.summary?.severity
  || 'unknown';
const phase = consistency.ok
  ? (nightly.phase || release.phase || null)
  : 'blocked';
const step = consistency.ok
  ? (recovery.next_step || nightly.step || null)
  : (consistency.blocking_reasons?.[0]?.id || recovery.next_step || nightly.step || null);

const payload = {
  schema: 'rv_pipeline_runtime_v1',
  ...buildArtifactEnvelope({
    producer: 'scripts/ops/build-pipeline-runtime-report.mjs',
    runId: forcedRunId || consistency.run_id || recovery.run_id || `runtime-${targetMarketDate || new Date().toISOString().slice(0, 10)}`,
    targetMarketDate,
    upstreamRunIds: collectUpstreamRunIds(system, recovery, release, epoch),
  }),
  updated_at: system.generated_at || recovery.generated_at || nightly.updated_at || release.last_updated || null,
  owner_orchestrator: chooseOwner({ nightly, recovery }),
  mode: recovery.run_id ? 'recovery' : 'steady_state',
  phase,
  step,
  blocking_state: blockingState,
  advisory_state: system?.summary?.advisory_severity || 'ok',
  blockers,
  pipeline_consistency: consistency,
  step_states: Object.fromEntries(
    Object.entries(system.steps || {}).map(([id, step]) => [id, {
      severity: step?.severity || null,
      summary: step?.summary || null,
      output_asof: step?.output_asof || null,
      owner: step?.owner || null,
    }])
  ),
  source_refs: {
    nightly_status: {
      path: 'public/data/reports/nightly-stock-analyzer-status.json',
      generated_at: nightly.updated_at || nightly.heartbeat || statMtimeIso(PATHS.nightly),
    },
    recovery_report: {
      path: 'public/data/reports/dashboard-green-recovery-latest.json',
      generated_at: recovery.generated_at || statMtimeIso(PATHS.recovery),
    },
    system_status: {
      path: 'public/data/reports/system-status-latest.json',
      generated_at: system.generated_at || statMtimeIso(PATHS.system),
    },
    release_state: {
      path: 'public/data/ops/release-state-latest.json',
      generated_at: release.last_updated || statMtimeIso(PATHS.release),
    },
    final_integrity_seal: {
      path: 'public/data/ops/final-integrity-seal-latest.json',
      generated_at: seal.generated_at || statMtimeIso(PATHS.seal),
    },
  },
  final_integrity_seal: seal || null,
};

writeJsonAtomic(PATHS.output, payload);
