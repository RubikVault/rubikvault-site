#!/usr/bin/env node
/**
 * build-system-status-aggregator.mjs
 *
 * Aggregates 6+ scattered status JSONs into a single source-of-truth artifact at
 * public/data/ops/system-status-aggregator-latest.json.
 *
 * Inputs:
 *   public/data/ops/final-integrity-seal-latest.json
 *   public/data/ops/pipeline-state-latest.json
 *   public/data/ops/module-outputs-verify-latest.json
 *   public/data/page-core/latest.json
 *   public/data/status/dashboard-v7-public-latest.json
 *   public/data/universe/v7/ssot/assets.global.canonical.ids.json
 *   public/data/status/deploy-proof-latest.json (optional)
 *
 * Output schema: rv.system_status_aggregator.v1
 *
 * global_status derivation:
 *   - FAIL  if final_seal.status === 'FAIL' or pipeline.failed_step set
 *   - DEGRADED if final_seal.status === 'DEGRADED' or any module status !== 'OK'/'N/A'
 *   - GREEN otherwise (and final_seal.status === 'OK')
 *
 * No new state — pure derived artifact. Run as a pipeline step (e.g.
 * `system_status_aggregator` immediately before final_integrity_seal publication)
 * or standalone for diagnostics.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(fileURLToPath(new URL('.', import.meta.url)), '../..');
const args = process.argv.slice(2);
const getArg = (name, fallback = null) => {
  const inline = args.find((arg) => arg.startsWith(`--${name}=`));
  if (inline) return inline.slice(`--${name}=`.length);
  const idx = args.indexOf(`--${name}`);
  if (idx >= 0 && idx + 1 < args.length) return args[idx + 1];
  return fallback;
};

const OUTPUT_PATH = path.resolve(ROOT, getArg('output') || 'public/data/ops/system-status-aggregator-latest.json');

const SOURCES = {
  finalSeal: 'public/data/ops/final-integrity-seal-latest.json',
  pipelineState: 'public/data/ops/pipeline-state-latest.json',
  moduleVerify: 'public/data/ops/module-outputs-verify-latest.json',
  pageCore: 'public/data/page-core/latest.json',
  dashboardV7: 'public/data/status/dashboard-v7-public-latest.json',
  canonicalIds: 'public/data/universe/v7/ssot/assets.global.canonical.ids.json',
  deployProof: 'public/data/status/deploy-proof-latest.json',
};

function readJsonMaybe(relPath) {
  const full = path.resolve(ROOT, relPath);
  try {
    return JSON.parse(fs.readFileSync(full, 'utf8'));
  } catch {
    return null;
  }
}

function summarizePipeline(state) {
  if (!state) return { last_status: 'unknown', completed_steps: 0, failed_step: null, current_step: null, target_market_date: null, updated_at: null, run_id: null };
  return {
    last_status: state.last_status || null,
    completed_steps: Array.isArray(state.completed_steps) ? state.completed_steps.length : 0,
    failed_step: state.failed_step || null,
    current_step: state.current_step || null,
    target_market_date: state.target_market_date || null,
    updated_at: state.updated_at || null,
    run_id: state.run_id || null,
  };
}

function summarizeFinalSeal(seal) {
  if (!seal) return { status: 'unknown', target_market_date: null, generated_at: null, global_green: null, blocker_count: null, warning_count: null };
  const blockers = Array.isArray(seal.blocking_reasons) ? seal.blocking_reasons.length : (seal.blocker_count ?? null);
  const warnings = Array.isArray(seal.warnings) ? seal.warnings.length : (seal.warning_count ?? null);
  return {
    status: seal.status || null,
    target_market_date: seal.target_market_date || null,
    generated_at: seal.generated_at || null,
    global_green: seal.global_green ?? null,
    blocker_count: blockers,
    warning_count: warnings,
  };
}

function summarizeModules(verify) {
  if (!verify) return { status: 'unknown', target_market_date: null, failed_count: null, modules: {} };
  const modules = {};
  if (Array.isArray(verify.modules)) {
    for (const mod of verify.modules) {
      const name = mod?.name || mod?.module || 'unknown';
      modules[name] = mod?.ok === true ? 'OK' : (mod?.status === 'not_applicable' ? 'N/A' : (mod?.status || 'UNAVAILABLE'));
    }
  } else if (verify.modules && typeof verify.modules === 'object') {
    for (const [name, mod] of Object.entries(verify.modules)) {
      modules[name] = mod?.ok === true ? 'OK' : (mod?.status === 'not_applicable' ? 'N/A' : (mod?.status || 'UNAVAILABLE'));
    }
  }
  return {
    status: verify.status || null,
    target_market_date: verify.target_market_date || null,
    failed_count: verify.failed_count ?? null,
    modules,
  };
}

function summarizePageCore(pc) {
  if (!pc) return { asset_count: null, target_market_date: null, snapshot_id: null, generated_at: null, input_hash: null };
  return {
    asset_count: pc.asset_count ?? null,
    target_market_date: pc.target_market_date || null,
    snapshot_id: pc.snapshot_id || null,
    generated_at: pc.generated_at || null,
    input_hash: pc.input_hash || null,
  };
}

function summarizeDeploy(proof, dashboard) {
  const source = proof || dashboard?.deploy || null;
  if (!source) return { deployment_url: null, deployment_id: null, smokes_ok: null, git_commit_sha: null, dist_hash: null, reused_prior_deploy: null };
  return {
    deployment_url: source.deployment_url || source.deploy_url || null,
    deployment_id: source.deployment_id || source.deploy_id || null,
    smokes_ok: source.smokes_ok ?? null,
    git_commit_sha: source.git_commit_sha || source.deployed_commit || null,
    dist_hash: source.dist_hash || null,
    reused_prior_deploy: source.reused_prior_deploy ?? null,
  };
}

function summarizeScope(canonical) {
  if (!canonical) return { canonical_ids_count: null, scope_mode: null };
  return {
    canonical_ids_count: canonical.count ?? (Array.isArray(canonical.canonical_ids) ? canonical.canonical_ids.length : null),
    scope_mode: canonical.scope_mode || canonical.meta?.scope_mode || null,
  };
}

function summarizeUiProof(dashboard) {
  if (!dashboard) return { frontpage_status: null, alpha_proof: null, ui_green: null, release_ready: null };
  return {
    frontpage_status: dashboard.frontpage?.status || dashboard.status || null,
    alpha_proof: dashboard.public_truth?.alpha_proof ?? null,
    ui_green: dashboard.public_truth?.ui_green ?? null,
    release_ready: dashboard.public_truth?.release_ready ?? null,
  };
}

function deriveGlobalStatus({ pipeline, finalSeal, modules }) {
  if (finalSeal.status === 'FAIL') return 'FAIL';
  if (pipeline.failed_step) return 'FAIL';
  const moduleValues = Object.values(modules.modules || {});
  const moduleBad = moduleValues.some((v) => !['OK', 'N/A'].includes(String(v).toUpperCase()));
  if (finalSeal.status === 'DEGRADED' || moduleBad) return 'DEGRADED';
  if (finalSeal.status === 'OK' && finalSeal.global_green !== false) return 'GREEN';
  return 'UNKNOWN';
}

function main() {
  const sources = {};
  for (const [key, rel] of Object.entries(SOURCES)) {
    sources[key] = readJsonMaybe(rel);
  }
  const pipeline = summarizePipeline(sources.pipelineState);
  const finalSeal = summarizeFinalSeal(sources.finalSeal);
  const modules = summarizeModules(sources.moduleVerify);
  const pageCore = summarizePageCore(sources.pageCore);
  const deploy = summarizeDeploy(sources.deployProof, sources.dashboardV7);
  const scope = summarizeScope(sources.canonicalIds);
  const uiProof = summarizeUiProof(sources.dashboardV7);
  const targetMarketDate = finalSeal.target_market_date || pageCore.target_market_date || pipeline.target_market_date || null;

  const aggregate = {
    schema: 'rv.system_status_aggregator.v1',
    generated_at: new Date().toISOString(),
    global_status: deriveGlobalStatus({ pipeline, finalSeal, modules }),
    target_market_date: targetMarketDate,
    pipeline,
    final_seal: finalSeal,
    modules,
    page_core: pageCore,
    deploy,
    scope,
    ui_proof: uiProof,
    sources: Object.fromEntries(
      Object.entries(SOURCES).map(([key, rel]) => [key, { path: rel, present: sources[key] !== null }]),
    ),
  };

  fs.mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true });
  const tmp = `${OUTPUT_PATH}.tmp.${process.pid}.${Date.now()}`;
  fs.writeFileSync(tmp, `${JSON.stringify(aggregate, null, 2)}\n`);
  fs.renameSync(tmp, OUTPUT_PATH);
  process.stdout.write(`${JSON.stringify({ ok: true, output: path.relative(ROOT, OUTPUT_PATH), global_status: aggregate.global_status, target_market_date: targetMarketDate })}\n`);
}

main();
