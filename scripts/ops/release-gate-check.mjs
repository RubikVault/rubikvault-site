#!/usr/bin/env node
/**
 * Release Gate Check
 *
 * Authoritative release coordinator.
 * Reads local/NAS release evidence, checks all gates,
 * builds dist/pages-prod/, runs wrangler pages deploy, performs smoke tests,
 * and writes var/private/ops/deploy-proof-latest.json.
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
 *   var/private/ops/deploy-proof-latest.json  — local deploy proof artifact
 *   dist/pages-prod/                           — deploy bundle (via build:deploy)
 */

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { verifySealPayload } from '../lib/pipeline_authority/gates/release-seal.mjs';
import { resolveRuntimeConfig } from '../lib/pipeline_authority/config/runtime-config.mjs';
import { buildReleaseGateModel } from './lib/release-gate-model.mjs';

const REPO_ROOT = path.resolve(fileURLToPath(new URL('.', import.meta.url)), '../..');

// ─── Paths ─────────────────────────────────────────────────────────────────────
const RELEASE_STATE_PATH = path.join(REPO_ROOT, 'public/data/ops/release-state-latest.json');
const FINAL_INTEGRITY_SEAL_PATH = path.join(REPO_ROOT, 'public/data/ops/final-integrity-seal-latest.json');
const PUBLIC_STATUS_PATH = path.join(REPO_ROOT, 'public/data/public-status.json');
const STOCK_UI_STATE_PATH = path.join(REPO_ROOT, 'public/data/runtime/stock-analyzer-ui-state-summary-latest.json');
const DEPLOY_PROOF_PATH  = path.join(REPO_ROOT, 'var/private/ops/deploy-proof-latest.json');
const PUBLIC_DEPLOY_PROOF_PATH = path.join(REPO_ROOT, 'public/data/status/deploy-proof-latest.json');
const BUNDLE_META_PATH   = path.join(REPO_ROOT, 'var/private/ops/build-bundle-meta.json');
const BUILD_META_PATH    = path.join(REPO_ROOT, 'public/data/ops/build-meta.json');
const PAGE_CORE_ACTIVE_LATEST_PATH = path.join(REPO_ROOT, 'public/data/page-core/latest.json');
const PAGE_CORE_CANDIDATE_LATEST_PATH = path.join(REPO_ROOT, 'public/data/page-core/candidates/latest.candidate.json');
const DIST_DIR           = path.join(REPO_ROOT, 'dist/pages-prod');
const DEFAULT_CLOUDFLARE_ENV_PATH = process.env.RV_CLOUDFLARE_ENV_FILE
  || path.join(process.env.NAS_OPS_ROOT || process.env.OPS_ROOT || path.join(REPO_ROOT, 'var/private'), 'secrets/cloudflare.env');

// ─── Config ────────────────────────────────────────────────────────────────────
// Smoke test URLs (production endpoints)
const PROD_BASE = 'https://rubikvault.com';
const PAGES_DEPLOY_BRANCH = process.env.CLOUDFLARE_PAGES_BRANCH || process.env.CF_PAGES_BRANCH || 'main';
const PAGE_CORE_STAGING_BRANCH = process.env.RV_PAGE_CORE_STAGING_BRANCH || 'page-core-staging';
const WRANGLER_SKIP_CACHING = process.env.RV_WRANGLER_SKIP_CACHING !== '0';
const WRANGLER_DEPLOY_TIMEOUT_MS = Number(process.env.RV_WRANGLER_DEPLOY_TIMEOUT_MS || 2_700_000);
const WRANGLER_DEPLOY_MAX_BUFFER = Number(process.env.RV_WRANGLER_DEPLOY_MAX_BUFFER || 128 * 1024 * 1024);
const PRODUCTION_ARTIFACT_SMOKE_ATTEMPTS = Number(process.env.RV_PRODUCTION_ARTIFACT_SMOKE_ATTEMPTS || 3);
const PRODUCTION_ARTIFACT_SMOKE_BACKOFF_SEC = Number(process.env.RV_PRODUCTION_ARTIFACT_SMOKE_BACKOFF_SEC || 20);
const RUNTIME_CONTRACT_SMOKE_ATTEMPTS = Number(process.env.RV_RUNTIME_CONTRACT_SMOKE_ATTEMPTS || 3);
const RUNTIME_CONTRACT_SMOKE_BACKOFF_SEC = Number(process.env.RV_RUNTIME_CONTRACT_SMOKE_BACKOFF_SEC || 15);
const STOCK_ANALYZER_GREEN_MINIMUM = Number(process.env.RV_STOCK_ANALYZER_GREEN_MINIMUM || 0.90);
const STOCK_ANALYZER_GREEN_TARGET = Number(process.env.RV_STOCK_ANALYZER_GREEN_TARGET || 0.95);
const SMOKE_ENDPOINT_PATHS = {
  homepage: '/',
  stock: '/stock',
  analyze: '/analyze',
  api_stock_sample: '/api/stock?ticker=AAPL',
  api_page_core_aapl: '/api/v2/page/AAPL',
  api_page_core_brkb: '/api/v2/page/BRK-B',
  api_page_core_brkdotb: '/api/v2/page/BRK.B',
  api_universe_ford: '/api/universe?q=ford&limit=5',
  api_universe_visa: '/api/universe?q=visa&limit=5',
  api_universe_tesla: '/api/universe?q=tesl&limit=5',
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

function loadSecretEnvFile(filePath = DEFAULT_CLOUDFLARE_ENV_PATH) {
  if (!filePath || !fs.existsSync(filePath)) return false;
  const allowed = new Set([
    'CLOUDFLARE_API_TOKEN',
    'CF_API_TOKEN',
    'CLOUDFLARE_ACCOUNT_ID',
    'CF_ACCOUNT_ID',
    'CLOUDFLARE_PROJECT_NAME',
    'CF_PAGES_PROJECT_NAME',
  ]);
  const body = fs.readFileSync(filePath, 'utf8');
  for (const rawLine of body.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#') || !line.includes('=')) continue;
    const key = line.slice(0, line.indexOf('=')).trim();
    if (!allowed.has(key) || process.env[key]) continue;
    let value = line.slice(line.indexOf('=') + 1).trim();
    value = value.replace(/^['"]|['"]$/g, '');
    if (value) process.env[key] = value;
  }
  if (!process.env.CLOUDFLARE_API_TOKEN && process.env.CF_API_TOKEN) {
    process.env.CLOUDFLARE_API_TOKEN = process.env.CF_API_TOKEN;
  }
  if (!process.env.CLOUDFLARE_ACCOUNT_ID && process.env.CF_ACCOUNT_ID) {
    process.env.CLOUDFLARE_ACCOUNT_ID = process.env.CF_ACCOUNT_ID;
  }
  return Boolean(process.env.CLOUDFLARE_API_TOKEN);
}

function writeJsonAtomic(p, obj) {
  fs.mkdirSync(path.dirname(p), { recursive: true });
  const tmp = `${p}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(obj, null, 2) + '\n', 'utf8');
  fs.renameSync(tmp, p);
}

function removeAppleDoubleArtifacts(dir) {
  if (!fs.existsSync(dir)) return 0;
  let removed = 0;
  function walk(current) {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const full = path.join(current, entry.name);
      if (entry.name === '__MACOSX' || entry.name.startsWith('._')) {
        fs.rmSync(full, { recursive: true, force: true });
        removed += 1;
        continue;
      }
      if (entry.isDirectory()) walk(full);
    }
  }
  walk(dir);
  return removed;
}

function hasPageCoreCandidate() {
  return Boolean(readJson(PAGE_CORE_CANDIDATE_LATEST_PATH)?.snapshot_id);
}

function overlayPageCoreCandidateIntoBundle() {
  if (!hasPageCoreCandidate()) return false;
  const distPath = path.join(DIST_DIR, 'data/page-core/latest.json');
  fs.mkdirSync(path.dirname(distPath), { recursive: true });
  fs.copyFileSync(PAGE_CORE_CANDIDATE_LATEST_PATH, distPath);
  log('Overlayed page-core candidate latest.json into deploy bundle.');
  return true;
}

function promotePageCoreCandidate() {
  const candidate = readJson(PAGE_CORE_CANDIDATE_LATEST_PATH);
  if (!candidate?.snapshot_id) return false;
  writeJsonAtomic(PAGE_CORE_ACTIVE_LATEST_PATH, {
    ...candidate,
    status: 'ACTIVE',
    promoted_at: utcNow(),
  });
  log(`Promoted page-core candidate snapshot=${candidate.snapshot_id}`);
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

function fetchJsonSmoke(url) {
  try {
    const r = spawnSync('curl', [
      '-fsS',
      '--max-time', '20',
      '--connect-timeout', '10',
      url,
    ], { encoding: 'utf8', timeout: 30000 });
    if (r.status !== 0) {
      return { ok: false, status: r.status ?? -1, error: (r.stderr || '').trim() || 'curl_failed' };
    }
    return { ok: true, json: JSON.parse(r.stdout || '{}') };
  } catch (error) {
    return { ok: false, status: -1, error: error?.message || String(error) };
  }
}

function sleepSeconds(seconds) {
  spawnSync('sleep', [String(seconds)]);
}

function targetDateOf(doc) {
  return doc?.target_market_date || doc?.target_date || null;
}

function verifyProductionArtifactsOnce(targetDate) {
  const cacheBust = `rv=${Date.now()}`;
  const checks = {
    public_status: fetchJsonSmoke(`${PROD_BASE}/data/public-status.json?${cacheBust}`),
    deploy_proof: fetchJsonSmoke(`${PROD_BASE}/data/status/deploy-proof-latest.json?${cacheBust}`),
  };
  const failures = [];
  const publicStatus = checks.public_status.json || {};
  const publicStatusSafe = publicStatus.release_ready === true
    && publicStatus.core_release_ready !== false
    && publicStatus.overall_ui_ready === true
    && publicStatus.ui_green === true;
  if (!checks.public_status.ok || targetDateOf(publicStatus) !== targetDate || !publicStatusSafe) {
    failures.push(`public_status target=${targetDateOf(publicStatus) || 'missing'} status=${publicStatus.status || 'missing'} release_ready=${publicStatus.release_ready} core_release_ready=${publicStatus.core_release_ready} overall_ui_ready=${publicStatus.overall_ui_ready}`);
  }
  const publicProof = checks.deploy_proof.json || {};
  if (!checks.deploy_proof.ok || targetDateOf(publicProof) !== targetDate || publicProof.release_ready !== true) {
    failures.push(`deploy_proof target=${targetDateOf(publicProof) || 'missing'} release_ready=${publicProof.release_ready}`);
  }
  return { ok: failures.length === 0, failures, checks };
}

function universeHasCanonical(payload, canonicalId) {
  const rows = Array.isArray(payload?.data?.symbols) ? payload.data.symbols : [];
  return rows.some((row) => String(row?.canonical_id || '').toUpperCase() === canonicalId);
}

function stockHasNoPublicBundleBlocker(payload) {
  const readiness = payload?.analysis_readiness || payload?.data?.analysis_readiness || {};
  const daily = payload?.daily_decision || payload?.data?.daily_decision || {};
  const reasons = [
    ...(Array.isArray(readiness.blocking_reasons) ? readiness.blocking_reasons : []),
    ...(Array.isArray(daily.blocking_reasons) ? daily.blocking_reasons : []),
  ].map((item) => String(item?.id || item || '').toLowerCase());
  return !reasons.includes('bundle_missing') && !reasons.includes('bundle_stale');
}

function verifyRuntimeContracts(baseUrl, targetDate = null, { requirePublicStatus = false } = {}) {
  const clean = String(baseUrl || PROD_BASE).replace(/\/+$/, '');
  const cacheBust = `rv=${Date.now()}`;
  const checks = {
    universe_ford: fetchJsonSmoke(`${clean}/api/universe?q=ford&limit=5&${cacheBust}`),
    universe_visa: fetchJsonSmoke(`${clean}/api/universe?q=visa&limit=5&${cacheBust}`),
    universe_tesla: fetchJsonSmoke(`${clean}/api/universe?q=tesl&limit=5&${cacheBust}`),
    page_aapl: fetchJsonSmoke(`${clean}/api/v2/page/AAPL?${cacheBust}`),
    page_brkb: fetchJsonSmoke(`${clean}/api/v2/page/BRK-B?${cacheBust}`),
    page_brkdotb: fetchJsonSmoke(`${clean}/api/v2/page/BRK.B?${cacheBust}`),
    page_f: fetchJsonSmoke(`${clean}/api/v2/page/F?${cacheBust}`),
    summary_f: fetchJsonSmoke(`${clean}/api/v2/stocks/F/summary?${cacheBust}`),
    historical_f: fetchJsonSmoke(`${clean}/api/v2/stocks/F/historical?asset_id=US:F&${cacheBust}`),
    stock_f: fetchJsonSmoke(`${clean}/api/stock?ticker=F&${cacheBust}`),
  };
  if (requirePublicStatus) {
    checks.public_status = fetchJsonSmoke(`${clean}/data/public-status.json?${cacheBust}`);
  }
  const failures = [];
  if (!checks.universe_ford.ok || !universeHasCanonical(checks.universe_ford.json, 'US:F')) failures.push('universe_ford_missing_US:F');
  if (!checks.universe_visa.ok || !universeHasCanonical(checks.universe_visa.json, 'US:V')) failures.push('universe_visa_missing_US:V');
  if (!checks.universe_tesla.ok || !universeHasCanonical(checks.universe_tesla.json, 'US:TSLA')) failures.push('universe_tesla_missing_US:TSLA');
  for (const key of ['page_aapl', 'page_brkb', 'page_brkdotb', 'page_f']) {
    if (!checks[key].ok || checks[key].json?.ok !== true || !checks[key].json?.data?.canonical_asset_id) failures.push(`${key}_page_core_failed`);
  }
  if (!checks.summary_f.ok || checks.summary_f.json?.ok !== true) failures.push('summary_f_failed');
  if (!checks.historical_f.ok || checks.historical_f.json?.ok !== true) failures.push('historical_f_failed');
  if (!checks.stock_f.ok || checks.stock_f.json?.ok !== true || !stockHasNoPublicBundleBlocker(checks.stock_f.json)) {
    failures.push('api_stock_f_public_bundle_blocker');
  }
  if (requirePublicStatus) {
    const publicStatus = checks.public_status?.json || {};
    const publicStatusSafe = publicStatus.release_ready === true && publicStatus.core_release_ready !== false;
    if (!checks.public_status?.ok || publicStatusSafe !== true || (targetDate && targetDateOf(publicStatus) !== targetDate)) {
      failures.push('public_status_contract_failed');
    }
  }
  return { ok: failures.length === 0, failures, checks };
}

function verifyRuntimeContractsWithRetry(baseUrl, targetDate = null, options = {}) {
  let last = null;
  const attempts = Math.max(1, RUNTIME_CONTRACT_SMOKE_ATTEMPTS);
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    last = verifyRuntimeContracts(baseUrl, targetDate, options);
    if (last.ok) return { ...last, attempts: attempt };
    if (attempt < attempts) {
      warn(`Runtime contract smoke attempt ${attempt}/${attempts} failed: ${last.failures.join('; ')}; retrying in ${RUNTIME_CONTRACT_SMOKE_BACKOFF_SEC}s`);
      sleepSeconds(RUNTIME_CONTRACT_SMOKE_BACKOFF_SEC);
    }
  }
  return { ...last, attempts };
}

function verifyProductionArtifacts(targetDate) {
  let latest = null;
  for (let attempt = 1; attempt <= PRODUCTION_ARTIFACT_SMOKE_ATTEMPTS; attempt += 1) {
    latest = verifyProductionArtifactsOnce(targetDate);
    if (latest.ok) {
      if (attempt > 1) log(`Production artifact smoke OK on attempt ${attempt}.`);
      return latest;
    }
    if (attempt < PRODUCTION_ARTIFACT_SMOKE_ATTEMPTS) {
      warn(`Production artifact smoke attempt ${attempt}/${PRODUCTION_ARTIFACT_SMOKE_ATTEMPTS} failed: ${latest.failures.join('; ')}. Retrying in ${PRODUCTION_ARTIFACT_SMOKE_BACKOFF_SEC}s.`);
      sleepSeconds(PRODUCTION_ARTIFACT_SMOKE_BACKOFF_SEC);
    }
  }
  return latest || { ok: false, failures: ['production_artifact_smoke_not_run'], checks: {} };
}

function checkStockAnalyzerTargets(seal) {
  const operability = seal?.stock_analyzer_operability || {};
  const ratio = Number(operability.targetable_green_ratio ?? operability.targetable_operational_ratio ?? NaN);
  if (!Number.isFinite(ratio)) {
    warn('Stock Analyzer targetable_green_ratio missing from final seal.');
    return;
  }
  const targetable = Number(operability.targetable_assets ?? 0);
  const operational = Number(operability.targetable_operational_assets ?? operability.operational_assets ?? 0);
  if (ratio < STOCK_ANALYZER_GREEN_MINIMUM && !isForce) {
    fail(`Stock Analyzer targetable green ratio ${(ratio * 100).toFixed(2)}% is below minimum ${(STOCK_ANALYZER_GREEN_MINIMUM * 100).toFixed(0)}% (${operational}/${targetable}).`);
  }
  const unclassified = Number(operability.unclassified_assets ?? 0);
  const bugsRemaining = Number(operability.bugs_remaining ?? 0);
  const globalBlockers = Number(operability.global_blockers_remaining ?? 0);
  if (ratio < STOCK_ANALYZER_GREEN_TARGET) {
    const message = `Stock Analyzer targetable green ratio ${(ratio * 100).toFixed(2)}% is below target ${(STOCK_ANALYZER_GREEN_TARGET * 100).toFixed(0)}% (${operational}/${targetable}).`;
    if ((unclassified > 0 || bugsRemaining > 0 || globalBlockers > 0) && !isForce) {
      fail(`${message} Remaining unclassified/internal issues: unclassified=${unclassified}, bugs=${bugsRemaining}, global_blockers=${globalBlockers}.`);
    }
    warn(`${message} Remaining non-green targetable assets must be provider/short-history/delisted exceptions.`);
  }
}

function checkStockAnalyzerUiState(seal) {
  const uiState = seal?.stock_analyzer_ui_state || readJson(STOCK_UI_STATE_PATH);
  const expectedTargetDate = targetDateOf(seal);
  if (!uiState) {
    if (!isForce) fail('Stock Analyzer UI-state summary missing.');
    warn('Stock Analyzer UI-state summary missing but --force active.');
    return;
  }
  const uiTargetDate = targetDateOf(uiState);
  if (expectedTargetDate && uiTargetDate && uiTargetDate !== expectedTargetDate && !isForce) {
    fail(`Stock Analyzer UI-state target mismatch: expected ${expectedTargetDate}, got ${uiTargetDate}.`);
  }
  const ratio = Number(uiState.ui_operational_ratio ?? NaN);
  if (!Number.isFinite(ratio) && !isForce) {
    fail('Stock Analyzer UI operational ratio missing.');
  }
  if (Number.isFinite(ratio) && ratio < STOCK_ANALYZER_GREEN_MINIMUM && !isForce) {
    fail(`Stock Analyzer UI operational ratio ${(ratio * 100).toFixed(2)}% is below minimum ${(STOCK_ANALYZER_GREEN_MINIMUM * 100).toFixed(0)}%.`);
  }
  const missingScopeRows = Number(uiState.missing_scope_rows ?? 0);
  const contractViolations = Number(uiState.counts?.contract_violation_total ?? 0);
  if (uiState.release_eligible !== true && !isForce) {
    fail(`Stock Analyzer UI-state is not release eligible: ratio=${Number.isFinite(ratio) ? ratio : 'missing'} missing_scope_rows=${missingScopeRows} contract_violations=${contractViolations}.`);
  }
  if ((missingScopeRows > 0 || contractViolations > 0) && !isForce) {
    fail(`Stock Analyzer UI-state contract failed: missing_scope_rows=${missingScopeRows} contract_violations=${contractViolations}.`);
  }
}

function checkLocalPublicStatus(seal) {
  const status = readJson(PUBLIC_STATUS_PATH);
  if (!status) {
    if (!isForce) fail(`public-status.json missing at ${PUBLIC_STATUS_PATH}.`);
    warn('public-status.json missing but --force active.');
    return;
  }
  const expectedTargetDate = targetDateOf(seal);
  const statusTargetDate = targetDateOf(status);
  const uiState = readJson(STOCK_UI_STATE_PATH);
  const gate = buildReleaseGateModel({
    coreReleaseReady: status.core_release_ready !== false && status.release_ready === true,
    pageCoreReady: status.page_core_ready !== false,
    searchReady: status.search_ready !== false,
    universeReady: status.universe_ready !== false,
    stockUiState: uiState,
    stockUiReleaseEligible: status.stock_analyzer_ui_state_green === true || uiState?.release_eligible === true,
    histReady: status.hist_ready === true,
  });
  const safe = status.release_ready === true
    && status.overall_ui_ready === true
    && status.ui_green === true
    && status.core_release_ready !== false
    && gate.deploy_allowed === true;
  if (expectedTargetDate && statusTargetDate !== expectedTargetDate && !isForce) {
    fail(`public-status target mismatch: expected ${expectedTargetDate}, got ${statusTargetDate || 'missing'}.`);
  }
  if (!safe && !isForce) {
    fail(`public-status is not release-ready: status=${status.status || 'missing'} release_ready=${status.release_ready} overall_ui_ready=${status.overall_ui_ready} gate_blockers=${gate.blocking_reasons.map((item) => item.id).join(',') || 'none'}.`);
  }
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
    fail(`Final integrity seal is not release-ready. Top blocker: ${seal?.blocking_reasons?.[0]?.id || 'unknown'}`);
  }
  checkStockAnalyzerTargets(seal);
  checkStockAnalyzerUiState(seal);
  checkLocalPublicStatus(seal);

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

function checkManifestContract(bundleMeta) {
  if (!bundleMeta) return null;
  const check = bundleMeta.manifest_check;
  if (!check || check === 'skipped') {
    warn('manifest_check is missing from build-bundle-meta — runtime-manifest.json may not have been present during build.');
    return 'skipped';
  }
  if (check === 'failed') {
    const violations = bundleMeta.manifest_violations ?? '?';
    const missing    = bundleMeta.manifest_missing ?? '?';
    if (!isForce) {
      fail(`Bundle failed runtime manifest contract: ${violations} violations, ${missing} missing required files. Run build with --strict-manifest to see details. Use --force to override.`);
    }
    warn(`Manifest contract failed but --force active: violations=${violations} missing=${missing}`);
  }
  log(`Manifest contract: ${check} (violations: ${bundleMeta.manifest_violations ?? 0}, unmatched: ${bundleMeta.manifest_unmatched ?? 0})`);
  return check;
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
  contractCheck = null,
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
    bundle_max_file_bytes: bundleMeta?.bundle_max_file_bytes ?? null,
    contract_check: contractCheck ?? bundleMeta?.manifest_check ?? null,
    release_state_phase: releaseStatePhase,
    target_market_date: targetDate,
    target_date: targetDate,
  };
  writeJsonAtomic(DEPLOY_PROOF_PATH, proof);
  const publicProof = {
    schema: 'rv_public_deploy_proof_v1',
    generated_at: utcNow(),
    proof_mode: deploymentId ? 'post_deploy_local' : 'pre_deploy_bundle',
    git_commit_sha: deployedCommit,
    deployment_id: deploymentId,
    deployment_url: deploymentUrl,
    smokes_ok: smokesOk,
    release_ready: contractCheck === 'failed' ? false : true,
    bundle_file_count: bundleMeta?.bundle_file_count ?? null,
    bundle_size_mb: bundleMeta?.bundle_size_mb ?? null,
    bundle_max_file_bytes: bundleMeta?.bundle_max_file_bytes ?? null,
    contract_check: contractCheck ?? bundleMeta?.manifest_check ?? null,
    release_state_phase: releaseStatePhase,
    target_market_date: targetDate,
    target_date: targetDate,
    requested_at: requestedAt,
    verified_at: verifiedAt,
  };
  writeJsonAtomic(PUBLIC_DEPLOY_PROOF_PATH, publicProof);
  const distProofPath = path.join(DIST_DIR, 'data/status/deploy-proof-latest.json');
  if (fs.existsSync(DIST_DIR)) {
    fs.mkdirSync(path.dirname(distProofPath), { recursive: true });
    fs.copyFileSync(PUBLIC_DEPLOY_PROOF_PATH, distProofPath);
  }
  return proof;
}

// ─── Deploy ────────────────────────────────────────────────────────────────────

function buildDeployBundle() {
  log('Building deploy bundle (dist/pages-prod/)...');
  const r = spawnSync(process.execPath, [
    path.join(REPO_ROOT, 'scripts/ops/build-deploy-bundle.mjs'),
    '--strict',
    '--strict-manifest',
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

function runWranglerDeploy(branch = PAGES_DEPLOY_BRANCH) {
  log(`Running wrangler pages deploy dist/pages-prod/ (branch=${branch})...`);
  loadSecretEnvFile();
  if (!process.env.CLOUDFLARE_API_TOKEN) {
    fail(`CLOUDFLARE_API_TOKEN missing; store it in ${DEFAULT_CLOUDFLARE_ENV_PATH} or export it before deploy.`);
  }
  // Use the project-local Wrangler binary so deploys do not depend on host CLI PATH setup.
  const localWrangler = path.join(REPO_ROOT, 'node_modules/.bin/wrangler');
  if (!fs.existsSync(localWrangler)) {
    fail(`local wrangler binary missing at ${path.relative(REPO_ROOT, localWrangler)}; run npm install/npm ci in the repo before release deploy.`);
  }
  const removedAppleDouble = removeAppleDoubleArtifacts(path.join(REPO_ROOT, 'functions'))
    + removeAppleDoubleArtifacts(DIST_DIR);
  if (removedAppleDouble > 0) log(`Removed ${removedAppleDouble} AppleDouble metadata artifacts before wrangler deploy.`);
  const deployArgs = ['pages', 'deploy', 'dist/pages-prod/', '--project-name', 'rubikvault-site', '--branch', branch];
  if (WRANGLER_SKIP_CACHING) deployArgs.push('--skip-caching');
  fs.mkdirSync(path.dirname(DEPLOY_PROOF_PATH), { recursive: true });
  const wranglerLogPath = path.join(path.dirname(DEPLOY_PROOF_PATH), `wrangler-deploy-${branch}-${Date.now()}.log`);
  const wranglerLogFd = fs.openSync(wranglerLogPath, 'w');
  let r;
  try {
    r = spawnSync(localWrangler, deployArgs, {
      cwd: REPO_ROOT,
      encoding: 'utf8',
      timeout: WRANGLER_DEPLOY_TIMEOUT_MS,
      maxBuffer: WRANGLER_DEPLOY_MAX_BUFFER,
      stdio: ['ignore', wranglerLogFd, wranglerLogFd],
    });
  } finally {
    fs.closeSync(wranglerLogFd);
  }
  const output = readTextMaybe(wranglerLogPath) || '';
  log(`wrangler exit=${r.status ?? 'timeout'}`);
  if (r.error) {
    console.error(output.slice(-4000));
    fail(`wrangler pages deploy error: ${r.error.message || r.error.code || 'unknown'}.`);
  }
  if (r.status !== 0) {
    console.error(output);
    fail('wrangler pages deploy failed.');
  }
  // Extract deployment URL and ID from wrangler output
  const urlMatch = output.match(/https:\/\/[a-z0-9-]+(?:\.[a-z0-9-]+)*\.pages\.dev/i);
  const idMatch  = output.match(/Deployment ID[:\s]+([a-f0-9-]+)/i);
  const fallbackUrl = branch && branch !== 'main'
    ? `https://${branch}.rubikvault-site.pages.dev`
    : PROD_BASE;
  if (!urlMatch) warn(`Wrangler output did not include deployment URL; using fallback ${fallbackUrl}.`);
  return {
    deployment_url: urlMatch?.[0] || fallbackUrl,
    deployment_id: idMatch?.[1] || null,
    raw_output: output,
  };
}

function smokeEndpoints(baseUrl = PROD_BASE) {
  const clean = String(baseUrl || PROD_BASE).replace(/\/+$/, '');
  return Object.fromEntries(Object.entries(SMOKE_ENDPOINT_PATHS).map(([name, endpointPath]) => [name, `${clean}${endpointPath}`]));
}

function runSmokes(baseUrl = PROD_BASE) {
  log(`Running smoke tests against ${baseUrl}...`);
  const results = {};
  for (const [name, url] of Object.entries(smokeEndpoints(baseUrl))) {
    const status = smokeTest(url);
    results[name] = status;
    const ok = status === 200 || status === 304;
    log(`  ${ok ? '✓' : '✗'} ${name}: HTTP ${status ?? 'FAIL'} — ${url}`);
  }
  const allOk = Object.values(results).every(s => s === 200 || s === 304);
  return { smokes: results, smokes_ok: allOk };
}

function runUiFieldTruthReport(baseUrl, targetDate = null, options = {}) {
  log(`Running UI field truth report against ${baseUrl}...`);
  const args = [
    path.join(REPO_ROOT, 'scripts/ops/build-ui-field-truth-report.mjs'),
    '--target',
    baseUrl,
  ];
  if (options.pageCoreOnly) args.push('--page-core-only');
  if (options.pageCoreLatestPath) args.push('--page-core-latest-path', options.pageCoreLatestPath);
  if (targetDate) args.push('--date', targetDate);
  const r = spawnSync(process.execPath, args, {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    timeout: 300_000,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  if (r.stdout) log(r.stdout.trim());
  if (r.status !== 0) {
    if (r.stderr) console.error(r.stderr);
    fail(`UI field truth report failed against ${baseUrl}`);
  }
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
const pageCoreCandidatePresent = hasPageCoreCandidate();
if (pageCoreCandidatePresent) {
  overlayPageCoreCandidateIntoBundle();
}

let bundleMeta = readJson(BUNDLE_META_PATH);
log(`Bundle: ${bundleMeta?.bundle_file_count ?? '?'} files, ${bundleMeta?.bundle_size_mb ?? '?'} MB, max file: ${bundleMeta?.bundle_max_file_bytes ? (bundleMeta.bundle_max_file_bytes / 1024 / 1024).toFixed(2) + ' MiB' : '?'}`);
const contractCheck = checkManifestContract(bundleMeta);
writeDeployProof({
  deployedCommit: currentGitSha,
  requestedAt,
  bundleMeta,
  contractCheck,
  releaseStatePhase: proofReleasePhase,
  targetDate: proofTargetDate,
});

if (isDryRun) {
  log('Dry run: stopping before deploy.');
  process.exit(0);
}

// 3. Deploy
let deployResult = null;
if (pageCoreCandidatePresent) {
  const previewDeploy = runWranglerDeploy(PAGE_CORE_STAGING_BRANCH);
  log(`Preview deployed: url=${previewDeploy.deployment_url} id=${previewDeploy.deployment_id}`);
  if (!previewDeploy.deployment_url) {
    fail('page-core candidate preview deploy did not return a deployment URL; production latest.json left unchanged.');
  }
  if (!skipSmokes) {
    log('Waiting 15s for preview deploy propagation...');
    spawnSync('sleep', ['15']);
    const previewSmokes = runSmokes(previewDeploy.deployment_url);
    if (!previewSmokes.smokes_ok) {
      fail('page-core candidate preview smoke failed; production latest.json left unchanged.');
    }
    const previewContracts = verifyRuntimeContractsWithRetry(previewDeploy.deployment_url, proofTargetDate);
    if (!previewContracts.ok) {
      fail(`page-core candidate preview contract smoke failed: ${previewContracts.failures.join('; ')}; production latest.json left unchanged.`);
    }
    runUiFieldTruthReport(previewDeploy.deployment_url, proofTargetDate, {
      pageCoreOnly: true,
      pageCoreLatestPath: 'public/data/page-core/candidates/latest.candidate.json',
    });
  }
  promotePageCoreCandidate();
  buildDeployBundle();
  bundleMeta = readJson(BUNDLE_META_PATH);
}

deployResult = runWranglerDeploy(PAGES_DEPLOY_BRANCH);
log(`Deployed: url=${deployResult.deployment_url} id=${deployResult.deployment_id}`);

// 4. Smokes
let smokeResults = { smokes: {}, smokes_ok: true };
if (!skipSmokes) {
  // Wait a moment for the deploy to propagate
  log('Waiting 15s for deploy propagation...');
  spawnSync('sleep', ['15']);
  smokeResults = runSmokes(deployResult.deployment_url || PROD_BASE);
  if (!smokeResults.smokes_ok) {
    warn('Some smoke tests failed — deploy proof will reflect this. Review manually.');
  }
  const runtimeContracts = verifyRuntimeContractsWithRetry(deployResult.deployment_url || PROD_BASE, proofTargetDate);
  if (!runtimeContracts.ok) {
    fail(`Production runtime contract smoke failed: ${runtimeContracts.failures.join('; ')}`);
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
  contractCheck,
  releaseStatePhase: proofReleasePhase,
  targetDate: proofTargetDate,
});
log(`Deploy proof written: ${DEPLOY_PROOF_PATH}`);

// 6. Verify production serves the sanitized visitor status, not private proofs.
const productionArtifacts = verifyProductionArtifacts(proofTargetDate);
if (!productionArtifacts.ok) {
  fail(`Production artifact smoke failed: ${productionArtifacts.failures.join('; ')}`);
}
log('Production artifact smoke OK.');

log('');
log('═══ Release Gate Summary ═══');
log(`Deployment URL: ${deployResult.deployment_url ?? PROD_BASE}`);
log(`Smokes OK:      ${smokeResults.smokes_ok}`);
log(`Proof written:  ${DEPLOY_PROOF_PATH}`);
log('Done.');

process.exit(smokeResults.smokes_ok ? 0 : 1);
