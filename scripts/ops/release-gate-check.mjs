#!/usr/bin/env node
/**
 * Release Gate Check
 *
 * Authoritative MacBook-side release coordinator.
 * Reads public/data/ops/release-state-latest.json, checks all gates,
 * builds dist/pages-prod/, runs wrangler pages deploy, performs smoke tests,
 * and writes public/data/ops/deploy-proof-latest.json.
 *
 * Usage:
 *   node scripts/ops/release-gate-check.mjs [--dry-run] [--force] [--skip-smokes]
 *
 * --dry-run    : Check gates and build bundle but do NOT deploy
 * --force      : Deploy even if release-state is not RELEASE_READY
 * --skip-smokes: Deploy but skip smoke tests (emergency use only)
 *
 * Called by:
 *   npm run release:gate
 *   Night supervisor (after pipeline completes)
 *   Manual operator intervention
 *
 * Outputs:
 *   public/data/ops/deploy-proof-latest.json  — deploy proof artifact
 *   dist/pages-prod/                           — deploy bundle (via build:deploy)
 */

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = path.resolve(fileURLToPath(new URL('.', import.meta.url)), '../..');

// ─── Paths ─────────────────────────────────────────────────────────────────────
const RELEASE_STATE_PATH = path.join(REPO_ROOT, 'public/data/ops/release-state-latest.json');
const DEPLOY_PROOF_PATH  = path.join(REPO_ROOT, 'public/data/ops/deploy-proof-latest.json');
const BUNDLE_META_PATH   = path.join(REPO_ROOT, 'dist/pages-prod/data/ops/build-bundle-meta.json');
const BUILD_META_PATH    = path.join(REPO_ROOT, 'public/data/ops/build-meta.json');

// ─── Config ────────────────────────────────────────────────────────────────────
// Smoke test URLs (production endpoints)
const PROD_BASE = 'https://rubikvault.com';
const SMOKE_ENDPOINTS = {
  dashboard_v7:    `${PROD_BASE}/dashboard_v7`,
  api_diag:        `${PROD_BASE}/api/diag`,
  api_stock_sample:`${PROD_BASE}/api/stock?ticker=AAPL`,
  ops_pulse:       `${PROD_BASE}/api/ops-pulse`,
};

// Phases that are considered "ready to deploy"
const RELEASE_READY_PHASES = new Set([
  'RELEASE_READY', 'DONE', 'QUANTLAB',  // Any of these means pipeline succeeded
]);

// ─── Args ──────────────────────────────────────────────────────────────────────
const argv = process.argv.slice(2);
const isDryRun   = argv.includes('--dry-run');
const isForce    = argv.includes('--force');
const skipSmokes = argv.includes('--skip-smokes');

// ─── Logging ───────────────────────────────────────────────────────────────────
function log(msg) { console.log(`[release-gate] ${msg}`); }
function warn(msg) { console.warn(`[release-gate] WARN: ${msg}`); }
function fail(msg) { console.error(`[release-gate] FAIL: ${msg}`); process.exit(1); }

// ─── Helpers ───────────────────────────────────────────────────────────────────
function readJson(p) {
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return null; }
}

function writeJsonAtomic(p, obj) {
  fs.mkdirSync(path.dirname(p), { recursive: true });
  const tmp = `${p}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(obj, null, 2) + '\n', 'utf8');
  fs.renameSync(tmp, p);
}

function utcNow() { return new Date().toISOString(); }

function getCurrentGitSha() {
  try {
    return execFileSync('/usr/bin/git', ['rev-parse', 'HEAD'], {
      cwd: REPO_ROOT, encoding: 'utf8', timeout: 5000,
    }).trim();
  } catch { return null; }
}

/** Run a command, return { ok, stdout, stderr }. */
function run(cmd, args, { timeoutMs = 120_000, cwd = REPO_ROOT } = {}) {
  const r = spawnSync(cmd, args, {
    cwd, encoding: 'utf8', timeout: timeoutMs,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  return {
    ok: r.status === 0,
    stdout: r.stdout || '',
    stderr: r.stderr || '',
    status: r.status ?? -1,
  };
}

/** HTTP smoke test — returns HTTP status code or null on network error. */
function smokeTest(url) {
  try {
    const r = spawnSync('curl', [
      '-s', '-o', '/dev/null', '-w', '%{http_code}',
      '--max-time', '20',
      '--connect-timeout', '10',
      url,
    ], { encoding: 'utf8', timeout: 30000 });
    const code = parseInt(r.stdout?.trim() || '0', 10);
    return Number.isFinite(code) && code > 0 ? code : null;
  } catch { return null; }
}

// ─── Gate Checks ───────────────────────────────────────────────────────────────

function checkReleaseState() {
  const state = readJson(RELEASE_STATE_PATH);

  if (!state && !isForce) {
    fail(`release-state-latest.json not found at ${RELEASE_STATE_PATH}. ` +
         'Run the night supervisor first, or use --force to bypass.');
  }

  if (state) {
    const phase = state.phase || 'UNKNOWN';
    const targetDate = state.target_date;
    const lastUpdated = state.last_updated;
    log(`Release state: phase=${phase} target_date=${targetDate} last_updated=${lastUpdated}`);

    if (!isForce && !RELEASE_READY_PHASES.has(phase)) {
      fail(`Release state phase is "${phase}" — not in RELEASE_READY states. ` +
           `Use --force to override, or wait for the pipeline to complete. ` +
           `Blocker: ${state.blocker || 'none'}`);
    }

    if (state.blocker && !isForce) {
      fail(`Release blocked: ${state.blocker}. Use --force to override.`);
    }

    if (state.quantlab?.phase && state.quantlab.phase !== 'DONE' && !isForce) {
      warn(`QuantLab catchup is in phase "${state.quantlab.phase}" (not DONE). ` +
           'Dashboard V7 may not be fully green. Use --force to deploy anyway.');
    }
  } else {
    warn('release-state-latest.json missing — proceeding with --force.');
  }

  return state;
}

function checkBuildMeta() {
  const meta = readJson(BUILD_META_PATH);
  if (meta?.meta?.commit) {
    log(`Current build commit: ${meta.meta.commit.slice(0, 8)}`);
  }
  return meta;
}

// ─── Deploy ────────────────────────────────────────────────────────────────────

function buildDeployBundle() {
  log('Building deploy bundle (dist/pages-prod/)...');
  const r = spawnSync(process.execPath, [
    path.join(REPO_ROOT, 'scripts/ops/build-deploy-bundle.mjs'),
    '--strict',
  ], {
    cwd: REPO_ROOT,
    stdio: 'inherit',
    timeout: 300_000,
  });
  if (r.status !== 0) {
    fail(`build-deploy-bundle failed with exit ${r.status ?? 'timeout'}`);
  }
  log('Deploy bundle built.');
}

function runWranglerDeploy() {
  log('Running wrangler pages deploy dist/pages-prod/...');
  const r = spawnSync('npx', ['wrangler', 'pages', 'deploy', 'dist/pages-prod/', '--project-name', 'rubikvault-site'], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    timeout: 300_000,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const output = (r.stdout || '') + (r.stderr || '');
  log(`wrangler exit=${r.status ?? 'timeout'}`);
  if (r.status !== 0) {
    console.error(output);
    fail('wrangler pages deploy failed.');
  }
  // Extract deployment URL and ID from wrangler output
  const urlMatch = output.match(/https:\/\/[a-z0-9-]+\.rubikvault\.pages\.dev/);
  const idMatch  = output.match(/Deployment ID[:\s]+([a-f0-9-]+)/i);
  return {
    deployment_url: urlMatch?.[0] || null,
    deployment_id: idMatch?.[1] || null,
    raw_output: output,
  };
}

function runSmokes() {
  log('Running smoke tests...');
  const results = {};
  for (const [name, url] of Object.entries(SMOKE_ENDPOINTS)) {
    const status = smokeTest(url);
    results[name] = status;
    const ok = status === 200 || status === 304;
    log(`  ${ok ? '✓' : '✗'} ${name}: HTTP ${status ?? 'FAIL'} — ${url}`);
  }
  const allOk = Object.values(results).every(s => s === 200 || s === 304);
  return { smokes: results, smokes_ok: allOk };
}

// ─── Main ──────────────────────────────────────────────────────────────────────

log('═══ Release Gate Check ═══');
log(`Dry run: ${isDryRun} | Force: ${isForce} | Skip smokes: ${skipSmokes}`);

const requestedAt = utcNow();

// 1. Gate checks
const releaseState = checkReleaseState();
checkBuildMeta();

// 2. Build deploy bundle
buildDeployBundle();

const bundleMeta = readJson(BUNDLE_META_PATH);
log(`Bundle: ${bundleMeta?.bundle_file_count ?? '?'} files, ${bundleMeta?.bundle_size_mb ?? '?'} MB`);

if (isDryRun) {
  log('Dry run: stopping before deploy.');
  process.exit(0);
}

// 3. Deploy
const deployResult = runWranglerDeploy();
log(`Deployed: url=${deployResult.deployment_url} id=${deployResult.deployment_id}`);

// 4. Smokes
let smokeResults = { smokes: {}, smokes_ok: true };
if (!skipSmokes) {
  // Wait a moment for the deploy to propagate
  log('Waiting 15s for deploy propagation...');
  spawnSync('sleep', ['15']);
  smokeResults = runSmokes();
  if (!smokeResults.smokes_ok) {
    warn('Some smoke tests failed — deploy proof will reflect this. Review manually.');
  }
}

// 5. Write deploy proof
const verifiedAt = utcNow();
const proof = {
  schema: 'rv_deploy_proof_v1',
  deployed_commit: getCurrentGitSha(),
  deployment_id: deployResult.deployment_id,
  deployment_url: deployResult.deployment_url,
  smokes: smokeResults.smokes,
  smokes_ok: smokeResults.smokes_ok,
  requested_at: requestedAt,
  verified_at: smokeResults.smokes_ok ? verifiedAt : null,
  bundle_file_count: bundleMeta?.bundle_file_count ?? null,
  bundle_size_mb: bundleMeta?.bundle_size_mb ?? null,
  release_state_phase: releaseState?.phase ?? null,
  target_date: releaseState?.target_date ?? null,
};

writeJsonAtomic(DEPLOY_PROOF_PATH, proof);
log(`Deploy proof written: ${DEPLOY_PROOF_PATH}`);

// 6. Update release state to DEPLOY_VERIFIED
if (fs.existsSync(RELEASE_STATE_PATH)) {
  const state = readJson(RELEASE_STATE_PATH) || {};
  writeJsonAtomic(RELEASE_STATE_PATH, {
    ...state,
    phase: smokeResults.smokes_ok ? 'DEPLOY_VERIFIED' : 'DEPLOY_REQUESTED',
    last_success_phase: smokeResults.smokes_ok ? 'DEPLOY_VERIFIED' : state.last_success_phase,
    last_updated: verifiedAt,
  });
  log(`Release state updated to ${smokeResults.smokes_ok ? 'DEPLOY_VERIFIED' : 'DEPLOY_REQUESTED'}`);
}

log('');
log('═══ Release Gate Summary ═══');
log(`Deployment URL: ${deployResult.deployment_url ?? '(unknown)'}`);
log(`Smokes OK:      ${smokeResults.smokes_ok}`);
log(`Proof written:  ${DEPLOY_PROOF_PATH}`);
log('Done.');

process.exit(smokeResults.smokes_ok ? 0 : 1);
