#!/usr/bin/env node

import path from 'node:path';
import {
  buildArtifactEnvelope,
  collectUpstreamRunIds,
  readJson,
  writeJsonAtomic,
} from './pipeline-artifact-contract.mjs';

const ROOT = path.resolve(new URL('.', import.meta.url).pathname, '../..');

const PATHS = {
  finalSeal: path.join(ROOT, 'public/data/ops/final-integrity-seal-latest.json'),
  releaseState: path.join(ROOT, 'public/data/ops/release-state-latest.json'),
  system: path.join(ROOT, 'public/data/reports/system-status-latest.json'),
  runtime: path.join(ROOT, 'public/data/pipeline/runtime/latest.json'),
  epoch: path.join(ROOT, 'public/data/pipeline/epoch.json'),
};

function main() {
  const seal = readJson(PATHS.finalSeal);
  if (!seal || typeof seal !== 'object') {
    throw new Error(`final_integrity_seal_missing:${PATHS.finalSeal}`);
  }
  const previous = readJson(PATHS.releaseState) || {};
  const system = readJson(PATHS.system) || {};
  const runtime = readJson(PATHS.runtime) || {};
  const epoch = readJson(PATHS.epoch) || {};
  const now = new Date().toISOString();
  const targetMarketDate = seal.target_market_date || process.env.TARGET_MARKET_DATE || process.env.RV_TARGET_MARKET_DATE || null;
  const runId = process.env.RUN_ID
    || process.env.RV_RUN_ID
    || seal.run_id
    || previous.run_id
    || `release-state-${targetMarketDate || now.slice(0, 10)}`;
  const blockers = Array.isArray(seal.blocking_reasons) ? seal.blocking_reasons : [];
  const releaseReady = seal.release_ready === true && blockers.length === 0;
  const phase = releaseReady ? 'RELEASE_READY' : (seal.phase || previous.phase || 'VERIFY');

  const payload = {
    schema: 'rv_release_state_v3',
    ...buildArtifactEnvelope({
      producer: 'scripts/ops/sync-release-state-from-final-seal.mjs',
      runId,
      targetMarketDate,
      upstreamRunIds: collectUpstreamRunIds(system, runtime, epoch, seal),
    }),
    target_date: targetMarketDate,
    started_at: previous.started_at || now,
    completed_at: releaseReady ? (previous.completed_at || now) : null,
    phase,
    blocker: blockers[0]?.id || null,
    lead_blocker_step: seal.lead_blocker_step || null,
    blockers,
    next_step: seal.next_step || null,
    final_integrity_seal_ref: 'public/data/ops/final-integrity-seal-latest.json',
    ui_green: seal.ui_green ?? null,
    release_ready: seal.release_ready ?? null,
    full_universe_validated: seal.full_universe_validated ?? null,
    allowed_launchd_only: seal.allowed_launchd_only ?? null,
    storage_ok: seal.storage_ok ?? null,
    nas_ok: seal.nas_ok ?? null,
    calendar_ok: seal.calendar_ok ?? null,
    observer_stale: seal.observer_stale ?? null,
    observer_generated_at: seal.observer_generated_at ?? null,
    runtime_preflight_ok: seal.runtime_preflight_ok ?? null,
    runtime_preflight_ref: seal.runtime_preflight_ref || null,
    control_plane: seal.control_plane || seal.pipeline_consistency || null,
    data_pipeline_phase: runtime.phase || null,
    runtime_phase: releaseReady ? 'completed' : (runtime.phase || null),
    epoch_pipeline_ok: epoch.pipeline_ok ?? null,
    system_release_ready: system?.summary?.release_ready ?? null,
    last_updated: now,
  };

  writeJsonAtomic(PATHS.releaseState, payload);
  process.stdout.write(`${JSON.stringify({
    ok: true,
    phase: payload.phase,
    target_market_date: payload.target_market_date,
    blocker: payload.blocker,
    release_ready: payload.release_ready,
  }, null, 2)}\n`);
}

try {
  main();
} catch (error) {
  process.stderr.write(`${error?.stack || error}\n`);
  process.exit(1);
}
