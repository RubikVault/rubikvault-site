#!/usr/bin/env node
/**
 * Release Gate Check
 *
 * Authoritative release coordinator.
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
import { verifySealPayload } from '../lib/pipeline_authority/gates/release-seal.mjs';
import { resolveRuntimeConfig } from '../lib/pipeline_authority/config/runtime-config.mjs';

const REPO_ROOT = path.resolve(fileURLToPath(new URL('.', import.meta.url)), '../..');

// ─── Paths ─────────────────────────────────────────────────────────────────────
const RELEASE_STATE_PATH = path.join(REPO_ROOT, 'public/data/ops/release-state-latest.json');
const FINAL_INTEGRITY_SEAL_PATH = path.join(REPO_ROOT, 'public/data/ops/final-integrity-seal-latest.json');
const DEPLOY_PROOF_PATH  = path.join(REPO_ROOT, 'public/data/ops/deploy-proof-latest.json');
const BUNDLE_META_PATH   = path.join(REPO_ROOT, 'dist/pages-prod/data/ops/build-bundle-meta.json');
const BUILD_META_PATH    = path.join(REPO_ROOT, 'public/data/ops/build-meta.json');
const PUBLIC_DIR         = path.join(REPO_ROOT, 'public');
const DIST_DIR           = path.join(REPO_ROOT, 'dist/pages-prod');

// ─── Config ────────────────────────────────────────────────────────────────────
// Smoke test URLs (production endpoints)
const PROD_BASE = 'https://rubikvault.com';
const SMOKE_ENDPOINTS = {
  dashboard_v7:    `${PROD_BASE}/dashboard_v7`,
  api_diag:        `${PROD_BASE}/api/diag`,
  api_stock_sample:`${PROD_BASE}/api/stock?ticker=AAPL`,
  ops_pulse:       `${PROD_BASE}/api/ops-pulse`,
};

// ─── Args ──────────────────────────────────────────────────────────────────────
const argv = process.argv.slice(2);
const isDryRun    = argv.includes('--dry-run');
const isForce     = argv.includes('--force');
const skipSmokes  = argv.includes('--skip-smokes');
const allowDirty  = argv.includes('--allow-dirty');

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

function syncPublicFileIntoBundle(publicPath) {
  if (!fs.existsSync(publicPath)) return false;
  const rel = path.relative(PUBLIC_DIR, publicPath);
  if (!rel || rel.startsWith('..')) {
    throw new Error(`Cannot sync non-public file into bundle: ${publicPath}`);
  }
  const distPath = path.join(DIST_DIR, rel);
  fs.mkdirSync(path.dirname(distPath), { recursive: true });
  fs.copyFileSync(publicPath, distPath);
  return true;
}

function utcNow() { return new Date().toISOString(); }

function readTextMaybe(filePath) {
  if (!filePath) return null;
  try {
    return fs.readFileSync(path.resolve(filePath), 'utf8');
  } catch {
    return null;
  }
}

function getCurrentGitSha() {
  try {
    return execFileSync('/usr/bin/git', ['rev-parse', 'HEAD'], {
      cwd: REPO_ROOT, encoding: 'utf8', timeout: 5000,
    }).trim();
  } catch { return null; }
}

function checkCleanWorkingTree() {
  if (allowDirty || isForce) return;
  try {
    const dirty = execFileSync('/usr/bin/git', ['status', '--porcelain'], {
      cwd: REPO_ROOT, encoding: 'utf8', timeout: 5000,
    }).trim();
    if (dirty) {
      fail(`Unclean working tree — commit or stash changes before release.\nDirty files:\n${dirty}\nUse --allow-dirty to override.`);
    }
  } catch (e) {
    if (e.message?.includes('Unclean working tree')) throw e;
    warn('Could not check git status — proceeding anyway.');
  }
}

function verifyFinalSeal(seal) {
  const requireVerification = process.env.RV_FINAL_SEAL_VERIFY_REQUIRED === '1' || Boolean(seal?.signature);
  const runtimeConfig = resolveRuntimeConfig({ ensureRuntimeDirs: true });
  const publicKeyPem = process.env.RV_FINAL_SEAL_PUBLIC_KEY_PEM
    || readTextMaybe(process.env.RV_FINAL_SEAL_PUBLIC_KEY_PATH)
    || readTextMaybe(runtimeConfig.finalSealPublicKeyPath);
  if (!requireVerification) {
    return { required: false, ok: true, reason: 'verification_not_required' };
  }
  if (!seal?.signature || !seal?.key_id) {
    return { required: true, ok: false, reason: 'signature_missing' };
  }
  if (!publicKeyPem) {
    return { required: true, ok: false, reason: 'public_key_missing' };
  }
  const { signature, key_id, signature_algorithm, ...unsignedPayload } = seal;
  const ok = verifySealPayload(unsignedPayload, { signature, publicKeyPem });
  return {
    required: true,
    ok,
    reason: ok ? 'verified' : 'signature_invalid',
    key_id,
    signature_algorithm: signature_algorithm || null,
  };
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
  const seal = readJson(FINAL_INTEGRITY_SEAL_PATH);

  if (!seal && !isForce) fail(`final-integrity-seal-latest.json not found at ${FINAL_INTEGRITY_SEAL_PATH}.`);

  if (state) {
    const phase = state.phase || 'UNKNOWN';
    const targetDate = state.target_market_date || state.target_date || null;
    const lastUpdated = state.last_updated;
    log(`Release state: phase=${phase} target_date=${targetDate} last_updated=${lastUpdated}`);

    if (state.schema === 'rv_release_state_v3' && state.blocker && !isForce) {
      fail(`Release blocked: ${state.blocker}. Use --force to override.`);
    }
  }

  const sealVerification = verifyFinalSeal(seal);
  if (!isForce && sealVerification.required && !sealVerification.ok) {
    fail(`Final integrity seal verification failed: ${sealVerification.reason}.`);
  }

  if (!isForce && seal?.release_ready !== true) {
    fail(`Final integrity seal is not green. Top blocker: ${seal?.blocking_reasons?.[0]?.id || 'unknown'}`);
  }

  return state
    ? { ...state, final_integrity_seal: seal || null, final_integrity_seal_verification: sealVerification }
    : { final_integrity_seal: seal || null, final_integrity_seal_verification: sealVerification };
}

function checkBuildMeta() {
  const meta = readJson(BUILD_META_PATH);
  if (meta?.meta?.commit) {
    log(`Current build commit: ${meta.meta.commit.slice(0, 8)}`);
  }
  return meta;
}

function writeDeployProof({
  deployedCommit,
  deploymentId = null,
  deploymentUrl = PROD_BASE,
  smokes = {},
  smokesOk = null,
  requestedAt,
  verifiedAt = null,
  bundleMeta = null,
  releaseStatePhase = null,
  targetDate = null,
}) {
  const proof = {
    schema: 'rv_deploy_proof_v1',
    deployed_commit: deployedCommit,
    deployment_id: deploymentId,
    deployment_url: deploymentUrl,
    smokes,
    smokes_ok: smokesOk,
    requested_at: requestedAt,
    verified_at: verifiedAt,
    bundle_file_count: bundleMeta?.bundle_file_count ?? null,
    bundle_size_mb: bundleMeta?.bundle_size_mb ?? null,
    release_state_phase: releaseStatePhase,
    target_date: targetDate,
  };
  writeJsonAtomic(DEPLOY_PROOF_PATH, proof);
  return proof;
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
  // Use the project-local Wrangler binary so deploys do not depend on host CLI PATH setup.
  const localWrangler = path.join(REPO_ROOT, 'node_modules/.bin/wrangler');
  if (!fs.existsSync(localWrangler)) {
    fail(`local wrangler binary missing at ${path.relative(REPO_ROOT, localWrangler)}; run npm install/npm ci in the repo before release deploy.`);
  }
  const r = spawnSync(localWrangler, ['pages', 'deploy', 'dist/pages-prod/', '--project-name', 'rubikvault-site'], {
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
const currentGitSha = getCurrentGitSha();
checkCleanWorkingTree();

// 1. Gate checks
const releaseState = checkReleaseState();
const releaseStateForProof = releaseState?.schema === 'rv_release_state_v3' ? releaseState : null;
const finalSealForProof = releaseState?.final_integrity_seal || readJson(FINAL_INTEGRITY_SEAL_PATH);
const proofTargetDate = finalSealForProof?.target_market_date ?? releaseStateForProof?.target_market_date ?? null;
const proofReleasePhase = releaseStateForProof?.phase ?? null;
checkBuildMeta();
writeDeployProof({
  deployedCommit: currentGitSha,
  requestedAt,
  bundleMeta: null,
  releaseStatePhase: proofReleasePhase,
  targetDate: proofTargetDate,
});

// 2. Build deploy bundle
buildDeployBundle();

const bundleMeta = readJson(BUNDLE_META_PATH);
log(`Bundle: ${bundleMeta?.bundle_file_count ?? '?'} files, ${bundleMeta?.bundle_size_mb ?? '?'} MB`);
writeDeployProof({
  deployedCommit: currentGitSha,
  requestedAt,
  bundleMeta,
  releaseStatePhase: proofReleasePhase,
  targetDate: proofTargetDate,
});
syncPublicFileIntoBundle(RELEASE_STATE_PATH);
syncPublicFileIntoBundle(DEPLOY_PROOF_PATH);

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
writeDeployProof({
  deployedCommit: currentGitSha,
  deploymentId: deployResult.deployment_id,
  deploymentUrl: deployResult.deployment_url || PROD_BASE,
  smokes: smokeResults.smokes,
  smokesOk: smokeResults.smokes_ok,
  requestedAt,
  verifiedAt: smokeResults.smokes_ok ? verifiedAt : null,
  bundleMeta,
  releaseStatePhase: proofReleasePhase,
  targetDate: proofTargetDate,
});
log(`Deploy proof written: ${DEPLOY_PROOF_PATH}`);

// 6. Publish final proof/state artifacts so production serves the same machine
// evidence that was just written locally.
syncPublicFileIntoBundle(RELEASE_STATE_PATH);
syncPublicFileIntoBundle(DEPLOY_PROOF_PATH);
log('Publishing final release artifacts...');
runWranglerDeploy();

log('');
log('═══ Release Gate Summary ═══');
log(`Deployment URL: ${deployResult.deployment_url ?? PROD_BASE}`);
log(`Smokes OK:      ${smokeResults.smokes_ok}`);
log(`Proof written:  ${DEPLOY_PROOF_PATH}`);
log('Done.');

process.exit(smokeResults.smokes_ok ? 0 : 1);
