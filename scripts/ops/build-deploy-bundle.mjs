#!/usr/bin/env node
/**
 * Build Deploy Bundle
 *
 * Builds dist/pages-prod/ from public/ by:
 *  1. Syncing all public/ content except gitignored/local-only heavy dirs
 *  2. Enforcing Cloudflare Pages file count budget (<= BUNDLE_FILE_LIMIT)
 *  3. Writing var/private/ops/build-bundle-meta.json as local proof artifact
 *
 * Usage:
 *   node scripts/ops/build-deploy-bundle.mjs [--dry-run] [--strict]
 *
 * --dry-run : count files and report budget without writing dist/
 * --strict  : exit 1 if bundle exceeds budget (default: warn only)
 *
 * Integrated into: npm run build:deploy
 * Called by:       scripts/ops/release-gate-check.mjs before wrangler deploy
 */

import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const REPO_ROOT      = path.resolve(fileURLToPath(new URL('.', import.meta.url)), '../..');
const PUBLIC_DIR     = path.join(REPO_ROOT, 'public');
const DIST_DIR       = path.join(REPO_ROOT, 'dist/pages-prod');
const MANIFEST_PATH  = path.join(REPO_ROOT, 'config/runtime-manifest.json');
const PRIVATE_OPS_DIR = path.join(REPO_ROOT, 'var/private/ops');
const DECISION_RETENTION_REPORT_PATH = path.join(REPO_ROOT, 'public/data/reports/decision-bundle-retention-latest.json');

// Cloudflare Pages hard limit: 20k files. We use 18k as safety margin.
// Note: Cloudflare Pages now supports 20,000 files (as of 2024 pricing tier change).
const BUNDLE_FILE_LIMIT = 18_000;
const BUNDLE_HEADROOM_CRITICAL_THRESHOLD = 17_900;

// Directories inside public/ to exclude from the deploy bundle.
// These are either gitignored (local-only) or too large for Pages.
// Order matters: more specific paths should come before general ones.
const RSYNC_EXCLUDES = [
  // Gitignored locally — not in the git repo, must not go to Pages
  'data/hist-probs/',          // 40K+ files, 1.4GB — ticker prob JSON files
  'data/v3/series/adjusted_all/', // gitignored bulk series
  'data/features-v2/',         // gitignored
  'data/forecast/reports/',    // gitignored
  'data/forecast/v6/',         // gitignored
  'data/eod/bars/',            // gitignored bars JSON
  'data/eod/history/packs',   // symlink → QuantLabHot/storage/universe-v7-history (local-only, up to 56MB files)
  'data/rvci/',                // gitignored
  'data/features-v4/stock-insights/index.json', // gitignored
  'data/snapshots/stock-analysis.json',          // gitignored
  // Large local dirs that are also gitignored or superseded by KV/R2
  'data/marketphase/',         // 53K+ files — market phase per-ticker
  'data/v3/series/',           // 13K+ files — v3 per-ticker series
  'data/quantlab/reports/',    // large model report archives
  'data/quantlab/',            // QuantLab internals — local/NAS only
  'data/reports/',             // internal reports — local/NAS only
  'data/ops/',                 // release proofs, ops state, audits — local/NAS only
  'data/ops-daily.json',       // ops dashboard state — local/NAS only
  'data/pipeline/',            // pipeline internals — local/NAS only
  'data/ui/',                  // dashboard/supervisor UI state — local/NAS only
  'data/runblock/',            // local validation state
  'data/runtime/',             // control/gate internals
  'data/decisions/',           // full decision bundles expose internal model output
  'data/universe/v7/reports/', // audit/gap reports — local/NAS only
  'data/universe/v7/registry/*report*.json',
  'data/universe/v7/ssot/*report*.json',
  'data/v3/audit/',
  'mirror/',                   // legacy public mirror data moved local-only
  'mirrors/',                  // public mirror dashboards/data moved local-only
  'js/stock-ui/modules/audit.js',
  // Universe v7 search buckets: locally the pipeline generates 23K+ gitignored buckets;
  // only the ~1K git-tracked buckets should be deployed. We exclude all here and
  // then explicitly copy git-tracked bucket files below.
  'data/universe/v7/search/buckets/',
  // Too large for Cloudflare Pages (25 MiB per-file limit)
  'data/ops/stock-analyzer-operability-latest.json', // full universe audit — 50–60 MB, not served by Pages
  'data/ops/mac-history-rescue-all-latest.json',     // rescue audit snapshot — build-only
  'data/eod/history/pack-manifest.global.json',      // global pack manifest — 40 MB, build-only; runtime uses us-eu
  'data/eod/history/pack-manifest.global.lookup.json', // global lookup — also build-only
  'data/universe/v7/read_models/marketphase_deep_summary.json', // 35 MB NAS-generated deep summary — build-only
  // Mac metadata artifacts — never appropriate in a web bundle
  '.DS_Store',
  '._*',
  '__MACOSX/',
  // Atomic write temp files — hidden files with extra extensions (.json.RANDOM_SUFFIX)
  '.*.json.*',
  // Placeholder files — directory markers only, no runtime value
  '.gitkeep',
  // Backup files — development artifacts
  '*.bak',
  // Debug directory — contains AI trace artifacts and development proofs
  'debug/',
  // Build-only feature reports — not runtime data
  'data/features-v4/reports/',
  // Developer documentation in public/ root — not for end users
  'BLOCK_ANALYSIS.md',
  'DEBUG_README.md',
  'RUNBOOK.md',
  // Internal Dashboards & Tools - Local/NAS only, not for public Cloudflare.
  '/dashboard*.html',
  '/dashboard_v*/',
  '/dashboard_v6_meta_data.json',
  '/internal-dashboard*',
  '/mission-control*',
  '/quantlab-v4-daily*',
  '/runblock-v3-local-check.html',
  '/diagnose.js',
  '/internal/',
  '/ops/',
  '/learning.html',
  '/proof.html',      // internal verification
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function log(msg) { console.log(`[build-deploy-bundle] ${msg}`); }

function countFiles(dir) {
  if (!fs.existsSync(dir)) return 0;
  let count = 0;
  function walk(d) {
    for (const entry of fs.readdirSync(d, { withFileTypes: true })) {
      if (entry.isDirectory()) walk(path.join(d, entry.name));
      else count++;
    }
  }
  walk(dir);
  return count;
}

function dirSizeMb(dir) {
  if (!fs.existsSync(dir)) return 0;
  const r = spawnSync('du', ['-sm', dir], { encoding: 'utf8', timeout: 30000 });
  return parseInt(r.stdout?.split('\t')[0] || '0', 10);
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

function utcNow() { return new Date().toISOString(); }

function readJson(p) {
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return null; }
}

function escapeRegexChar(ch) {
  return /[\\^$+?.()|[\]{}]/.test(ch) ? `\\${ch}` : ch;
}

function globMatches(relPath, pattern) {
  if (pattern.endsWith('/**')) {
    const prefix = pattern.slice(0, -3);
    return relPath === prefix || relPath.startsWith(`${prefix}/`);
  }
  let source = '^';
  for (let i = 0; i < pattern.length; i += 1) {
    const ch = pattern[i];
    const next = pattern[i + 1];
    if (ch === '*' && next === '*') {
      source += '.*';
      i += 1;
    } else if (ch === '*') {
      source += '[^/]*';
    } else {
      source += escapeRegexChar(ch);
    }
  }
  source += '$';
  return new RegExp(source).test(relPath);
}

function runDecisionBundleRetention() {
  if (process.env.RV_DECISION_BUNDLE_RETENTION === '0') {
    log('Decision bundle retention skipped via RV_DECISION_BUNDLE_RETENTION=0');
    return null;
  }
  const keepDays = process.env.RV_DECISION_BUNDLE_KEEP_MARKET_DAYS || '1';
  const args = [
    path.join(REPO_ROOT, 'scripts/ops/retention-decision-bundles.mjs'),
    `--keep-market-days=${keepDays}`,
    '--keep-latest-only',
  ];
  log(`Running decision bundle retention before deploy bundle (keep_market_days=${keepDays}, keep_latest_only=true)...`);
  const r = spawnSync(process.execPath, args, {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    timeout: 300_000,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  if (r.status !== 0) {
    log(`ERROR: decision bundle retention failed with exit ${r.status ?? 'timeout'}`);
    if (r.stderr) log(r.stderr.slice(0, 1000));
    process.exit(5);
  }
  const report = readJson(DECISION_RETENTION_REPORT_PATH);
  log(`Decision bundle retention OK: archived ${report?.archived_snapshots?.length ?? 0} snapshots`);
  return report;
}

function runPageCoreRetention() {
  if (process.env.RV_PAGE_CORE_RETENTION === '0') {
    log('Page-core retention skipped via RV_PAGE_CORE_RETENTION=0');
    return null;
  }
  const args = [
    path.join(REPO_ROOT, 'scripts/ops/retention-page-core-bundles.mjs'),
    `--keep-daily=${process.env.RV_PAGE_CORE_KEEP_DAILY || '7'}`,
  ];
  log('Running page-core retention before deploy bundle...');
  const r = spawnSync(process.execPath, args, {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    timeout: 300_000,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  if (r.status !== 0) {
    log(`ERROR: page-core retention failed with exit ${r.status ?? 'timeout'}`);
    if (r.stderr) log(r.stderr.slice(0, 1000));
    process.exit(5);
  }
  try {
    return JSON.parse(String(r.stdout || '').trim().split('\n').pop() || 'null');
  } catch {
    return null;
  }
}

function buildPublicStatus() {
  if (process.env.RV_PUBLIC_STATUS_BUILD === '0') {
    log('Public status build skipped via RV_PUBLIC_STATUS_BUILD=0');
    return;
  }
  const r = spawnSync(process.execPath, [
    path.join(REPO_ROOT, 'scripts/ops/build-public-status.mjs'),
  ], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    timeout: 30_000,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  if (r.status !== 0) {
    log(`ERROR: build-public-status failed with exit ${r.status ?? 'timeout'}`);
    if (r.stderr) log(r.stderr.slice(0, 1000));
    process.exit(5);
  }
  if (r.stdout.trim()) log(r.stdout.trim());
}

// ─── Runtime Manifest Validation ──────────────────────────────────────────────
// Checks every file in the bundle against config/runtime-manifest.json.
// Default: unmatched files or violations cause exit 4.
// --no-strict-manifest: unmatched files warn only.
function validateBundleAgainstManifest(bundleDir, manifest) {
  const defaultMax  = manifest.defaults?.maxFileSizeBytes ?? 26214400;
  const allowRules  = manifest.allow ?? [];
  const denyHints   = (manifest.denyNameHints ?? []).map(h => h.toLowerCase());
  const requiredDefs = manifest.required ?? [];

  const violations = []; // hard failures: deny hint hit or size exceeds class budget
  const unmatched  = []; // no allow rule matched (warning in default, failure in strict)
  const missing    = []; // required files absent

  function walk(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) { walk(full); continue; }
      const relPath = path.relative(bundleDir, full).replace(/\\/g, '/');
      const size    = fs.statSync(full).size;
      const nameLow = entry.name.toLowerCase();

      // denyNameHints check (secondary safety net for obviously wrong files)
      const hitHint = denyHints.find(h => nameLow.includes(h));
      if (hitHint) {
        violations.push({ file: relPath, reason: 'deny_hint', hint: hitHint, size_bytes: size });
        continue;
      }

      // match against allow rules (first match wins)
      let matched = null;
      for (const rule of allowRules) {
        if (globMatches(relPath, rule.pattern)) { matched = rule; break; }
      }

      if (!matched) {
        unmatched.push({ file: relPath, size_bytes: size });
        continue;
      }

      const budget = matched.maxFileSizeBytes ?? defaultMax;
      if (size > budget) {
        violations.push({
          file: relPath,
          reason: 'size_exceeds_budget',
          class: matched.class,
          size_mb: +(size / 1024 / 1024).toFixed(2),
          budget_mb: +(budget / 1024 / 1024).toFixed(2),
          size_bytes: size,
          budget_bytes: budget,
        });
      }
    }
  }
  walk(bundleDir);

  for (const req of requiredDefs) {
    if (!fs.existsSync(path.join(bundleDir, req.path))) {
      missing.push({ path: req.path, reason: 'required_file_missing' });
    }
  }

  const hasFatal    = violations.length > 0 || missing.length > 0;
  const hasUnmatched = unmatched.length > 0;
  const manifestCheck = hasFatal ? 'failed' : hasUnmatched ? 'warnings' : 'passed';

  return {
    manifest_check: manifestCheck,
    manifest_version: manifest.version ?? null,
    violations,
    missing,
    unmatched,
  };
}

// ─── Main ─────────────────────────────────────────────────────────────────────

const argv           = process.argv.slice(2);
const isDryRun       = argv.includes('--dry-run');
const isStrict       = argv.includes('--strict');
const isStrictManifest = !argv.includes('--no-strict-manifest');

if (!fs.existsSync(PUBLIC_DIR)) {
  log('ERROR: public/ directory not found.');
  process.exit(1);
}

log(`Source:      ${PUBLIC_DIR}`);
log(`Destination: ${DIST_DIR}`);
log(`Dry run:     ${isDryRun}`);
log(`Strict mode: ${isStrict}`);
log(`Strict manifest: ${isStrictManifest}`);

const retentionReport = isDryRun ? null : runDecisionBundleRetention();
const pageCoreRetentionReport = isDryRun ? null : runPageCoreRetention();
if (!isDryRun) buildPublicStatus();

// Build rsync exclude args
const excludeArgs = RSYNC_EXCLUDES.flatMap(e => ['--exclude', e]);

log('Syncing public/ → dist/pages-prod/ (excluding heavy dirs)...');

const rsyncArgs = [
  '-a',                   // archive mode (preserves permissions, symlinks, etc.)
  '--delete',             // remove files in dest not in source
  '--delete-excluded',    // also remove previously synced excluded files
  '--prune-empty-dirs',   // don't create empty dirs from excluded subtrees
  '--stats',              // summary statistics
  ...excludeArgs,
  `${PUBLIC_DIR}/`,       // trailing slash = sync contents, not the dir itself
  `${DIST_DIR}/`,
];

if (isDryRun) {
  rsyncArgs.unshift('-n');  // dry-run: simulate without writing
} else {
  fs.mkdirSync(DIST_DIR, { recursive: true });
}

const rsyncResult = spawnSync('rsync', rsyncArgs, {
  cwd: REPO_ROOT,
  encoding: 'utf8',
  timeout: 300_000,
  stdio: ['ignore', 'pipe', 'pipe'],
});

if (rsyncResult.status !== 0) {
  log(`ERROR: rsync failed with exit ${rsyncResult.status ?? 'timeout'}`);
  if (rsyncResult.stderr) log(rsyncResult.stderr.slice(0, 1000));
  process.exit(1);
}

if (!isDryRun) {
  // Print rsync stats to console
  const statsLines = (rsyncResult.stdout || '').split('\n').filter(l => l.trim());
  for (const line of statsLines.slice(-10)) log(line);
  const removedAppleDouble = removeAppleDoubleArtifacts(DIST_DIR);
  if (removedAppleDouble > 0) log(`Removed ${removedAppleDouble} AppleDouble metadata artifacts from dist/`);

  // Copy only git-tracked search bucket files (excludes 22K+ gitignored local buckets)
  const bucketsResult = spawnSync('git', ['ls-files', 'public/data/universe/v7/search/buckets'], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  if (bucketsResult.status === 0 && bucketsResult.stdout.trim()) {
    const bucketFiles = bucketsResult.stdout.trim().split('\n').filter(Boolean);
    const destBuckets = path.join(DIST_DIR, 'data/universe/v7/search/buckets');
    fs.mkdirSync(destBuckets, { recursive: true });
    // Remove any stale bucket files in dest not in git
    if (fs.existsSync(destBuckets)) {
      const gitTrackedNames = new Set(bucketFiles.map(f => path.basename(f)));
      for (const name of fs.readdirSync(destBuckets)) {
        if (!gitTrackedNames.has(name)) fs.rmSync(path.join(destBuckets, name), { force: true });
      }
    }
    for (const relPath of bucketFiles) {
      const src = path.join(REPO_ROOT, relPath);
      const dest = path.join(REPO_ROOT, 'dist/pages-prod', relPath.replace(/^public\//, ''));
      if (fs.existsSync(src)) fs.copyFileSync(src, dest);
    }
    log(`Copied ${bucketFiles.length} git-tracked search bucket files to dist/`);
  }
}

// Count bundle files: in dry-run parse rsync --stats output; otherwise count actual files
let bundleFileCount;
let bundleSizeMb;
if (isDryRun) {
  // Parse "Number of files: N (reg: M, dir: D)" — M is the total regular files in the bundle
  // This is the TOTAL count (not just incremental delta), which is what we need for budget checks.
  const statsOut = rsyncResult.stdout || '';
  const totalMatch = statsOut.match(/Number of files:\s*[\d,]+\s*\(reg:\s*([\d,]+)/);
  bundleFileCount = totalMatch ? parseInt(totalMatch[1].replace(/,/g, ''), 10) : 0;
  // Parse total file size from stats (bytes of all files in the source subset)
  const szMatch = statsOut.match(/Total file size:\s*([\d,]+)/);
  const szBytes = szMatch ? parseInt(szMatch[1].replace(/,/g, ''), 10) : 0;
  bundleSizeMb = Math.round(szBytes / 1024 / 1024);
} else {
  bundleFileCount = countFiles(DIST_DIR);
  bundleSizeMb    = dirSizeMb(DIST_DIR);
}
const publicFileCount = countFiles(PUBLIC_DIR);

log('');
log('═══════════════════════════════════════════════');
log('           DEPLOY BUNDLE SUMMARY');
log('═══════════════════════════════════════════════');
log(`public/ total files:         ${publicFileCount.toLocaleString()}`);
log(`dist/pages-prod/ files:      ${bundleFileCount.toLocaleString()} / ${BUNDLE_FILE_LIMIT.toLocaleString()} limit`);
log(`dist/pages-prod/ size:       ${bundleSizeMb} MB`);
log('═══════════════════════════════════════════════');

const bundleHeadroom = BUNDLE_FILE_LIMIT - bundleFileCount;
const headroomCritical = bundleFileCount > BUNDLE_HEADROOM_CRITICAL_THRESHOLD;
const overBudget = bundleFileCount >= BUNDLE_FILE_LIMIT;
if (overBudget) {
  log(`BUDGET EXCEEDED: ${bundleFileCount} >= ${BUNDLE_FILE_LIMIT} — add more excludes to RSYNC_EXCLUDES`);
  if (isStrict) process.exit(2);
} else {
  log(`Budget OK: ${bundleFileCount} files (${bundleHeadroom} headroom)`);
  if (headroomCritical) {
    log(`HEADROOM CRITICAL: ${bundleFileCount} files exceeds warning threshold ${BUNDLE_HEADROOM_CRITICAL_THRESHOLD}`);
  }
}

// ── Cloudflare Pages 25 MiB per-file size guard ────────────────────────────
// Scan the bundle for files exceeding Cloudflare's hard 25 MiB limit.
// This catches regressions early (before wrangler fails mid-deploy) and gives
// a clear list of violators so the fix is obvious. Add violators to RSYNC_EXCLUDES
// or redirect their pipeline output to NAS_OPS_ROOT/pipeline-artifacts/.
let bundleMaxFileBytes = 0;
if (!isDryRun && fs.existsSync(DIST_DIR)) {
  const CF_MAX_BYTES = 25 * 1024 * 1024; // 25 MiB
  const violators = [];
  function scanSizes(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) { scanSizes(full); continue; }
      const { size } = fs.statSync(full);
      if (size > bundleMaxFileBytes) bundleMaxFileBytes = size;
      if (size > CF_MAX_BYTES) {
        violators.push({ file: path.relative(DIST_DIR, full), size_mb: (size / 1024 / 1024).toFixed(1) });
      }
    }
  }
  scanSizes(DIST_DIR);
  if (violators.length > 0) {
    log('');
    log('FATAL: Cloudflare Pages 25 MiB per-file limit violated:');
    for (const v of violators) log(`  ${v.size_mb} MiB  ${v.file}`);
    log('Fix: add to RSYNC_EXCLUDES or redirect output to NAS_OPS_ROOT/pipeline-artifacts/');
    process.exit(3);
  } else {
    log(`Size guard OK: no file exceeds 25 MiB. Max file: ${(bundleMaxFileBytes / 1024 / 1024).toFixed(2)} MiB`);
  }
}

// ── Runtime Manifest Contract Check ────────────────────────────────────────
// Validates every bundle file against config/runtime-manifest.json.
// Requires an explicit allow rule; catches deny-hinted names and over-budget files.
// Default: unmatched files fail. --no-strict-manifest: unmatched files warn only.
let manifestResult = null;
if (!isDryRun && fs.existsSync(DIST_DIR) && fs.existsSync(MANIFEST_PATH)) {
  let manifest;
  try { manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8')); }
  catch (e) { log(`WARN: could not parse runtime-manifest.json — skipping manifest check: ${e.message}`); }

  if (manifest) {
    log('');
    log('Running runtime manifest contract check...');
    manifestResult = validateBundleAgainstManifest(DIST_DIR, manifest);

    if (manifestResult.violations.length > 0) {
      log('MANIFEST VIOLATIONS (hard failures):');
      for (const v of manifestResult.violations) {
        if (v.reason === 'deny_hint') {
          log(`  DENY  ${v.file}  (matches denyNameHint: "${v.hint}", ${(v.size_bytes / 1024 / 1024).toFixed(2)} MiB)`);
        } else {
          log(`  SIZE  ${v.file}  (class: ${v.class}, ${v.size_mb} MiB > budget ${v.budget_mb} MiB)`);
        }
      }
    }
    if (manifestResult.missing.length > 0) {
      log('REQUIRED FILES MISSING:');
      for (const m of manifestResult.missing) log(`  MISSING  ${m.path}`);
    }
    if (manifestResult.unmatched.length > 0) {
      const label = isStrictManifest ? 'UNMATCHED (strict — will fail)' : 'UNMATCHED (warning — add pattern to runtime-manifest.json to silence)';
      log(`${label}:`);
      for (const u of manifestResult.unmatched.slice(0, 20)) {
        log(`  UNMATCHED  ${u.file}  (${(u.size_bytes / 1024).toFixed(0)} KB)`);
      }
      if (manifestResult.unmatched.length > 20) log(`  ... and ${manifestResult.unmatched.length - 20} more`);
    }

    const checkStatus = manifestResult.manifest_check;
    log(`Manifest check result: ${checkStatus} (violations: ${manifestResult.violations.length}, missing: ${manifestResult.missing.length}, unmatched: ${manifestResult.unmatched.length})`);

    const hasFatal = manifestResult.violations.length > 0 || manifestResult.missing.length > 0;
    const hasUnmatched = manifestResult.unmatched.length > 0;
    if (hasFatal) {
      log('FATAL: manifest contract violations found. Fix violations before deploy.');
      log('Fix: add RSYNC_EXCLUDES entries or redirect output to NAS_OPS_ROOT/pipeline-artifacts/');
      process.exit(4);
    }
    if (hasUnmatched && isStrictManifest) {
      log('FATAL (--strict-manifest): unmatched files found. Add allow patterns to config/runtime-manifest.json.');
      process.exit(4);
    }
    if (checkStatus === 'passed') {
      log('Manifest contract OK: all bundle files are allowlisted and within budgets.');
    }
  }
} else if (!isDryRun && !fs.existsSync(MANIFEST_PATH)) {
  log('WARN: config/runtime-manifest.json not found — skipping manifest contract check.');
}

// Write bundle meta proof artifact
if (!isDryRun) {
  const metaDir = PRIVATE_OPS_DIR;
  fs.mkdirSync(metaDir, { recursive: true });
  const metaPath = path.join(metaDir, 'build-bundle-meta.json');
  fs.writeFileSync(metaPath, JSON.stringify({
    schema: 'rv_build_bundle_meta_v2',
    generated_at: utcNow(),
    source_dir: 'public/',
    dest_dir: 'dist/pages-prod/',
    public_file_count: publicFileCount,
    bundle_file_count: bundleFileCount,
    bundle_size_mb: bundleSizeMb,
    bundle_max_file_bytes: bundleMaxFileBytes,
    budget_limit: BUNDLE_FILE_LIMIT,
    budget_headroom: bundleHeadroom,
    headroom_critical: headroomCritical,
    budget_ok: !overBudget,
    decision_bundle_retention: retentionReport ? {
      keep_market_days: retentionReport.keep_market_days,
      keep_latest_only: retentionReport.keep_latest_only,
      latest_kept: retentionReport.latest_kept,
      archived_snapshots: retentionReport.archived_snapshots?.length ?? 0,
    } : null,
    page_core_retention: pageCoreRetentionReport,
    manifest_version: manifestResult?.manifest_version ?? null,
    manifest_check: manifestResult?.manifest_check ?? 'skipped',
    manifest_violations: manifestResult?.violations?.length ?? 0,
    manifest_missing: manifestResult?.missing?.length ?? 0,
    manifest_unmatched: manifestResult?.unmatched?.length ?? 0,
    excludes: RSYNC_EXCLUDES,
  }, null, 2) + '\n');
  log(`Bundle meta written: ${metaPath}`);
}

log('Done.');
process.exit(overBudget && isStrict ? 2 : 0);
