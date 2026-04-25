#!/usr/bin/env node
/**
 * Build Deploy Bundle
 *
 * Builds dist/pages-prod/ from public/ by:
 *  1. Syncing all public/ content except gitignored/local-only heavy dirs
 *  2. Enforcing Cloudflare Pages file count budget (<= BUNDLE_FILE_LIMIT)
 *  3. Writing dist/pages-prod/data/ops/build-bundle-meta.json as proof artifact
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

const REPO_ROOT = path.resolve(fileURLToPath(new URL('.', import.meta.url)), '../..');
const PUBLIC_DIR = path.join(REPO_ROOT, 'public');
const DIST_DIR   = path.join(REPO_ROOT, 'dist/pages-prod');

// Cloudflare Pages hard limit: 20k files. We use 18k as safety margin.
// Note: Cloudflare Pages now supports 20,000 files (as of 2024 pricing tier change).
const BUNDLE_FILE_LIMIT = 18_000;

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
  // Build artifacts that must not be deployed
  'data/ops/build-bundle-meta.json', // written by this script, added after rsync
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

function utcNow() { return new Date().toISOString(); }

// ─── Main ─────────────────────────────────────────────────────────────────────

const argv = process.argv.slice(2);
const isDryRun = argv.includes('--dry-run');
const isStrict = argv.includes('--strict');

if (!fs.existsSync(PUBLIC_DIR)) {
  log('ERROR: public/ directory not found.');
  process.exit(1);
}

log(`Source:      ${PUBLIC_DIR}`);
log(`Destination: ${DIST_DIR}`);
log(`Dry run:     ${isDryRun}`);
log(`Strict mode: ${isStrict}`);

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

const overBudget = bundleFileCount > BUNDLE_FILE_LIMIT;
if (overBudget) {
  log(`BUDGET EXCEEDED: ${bundleFileCount} > ${BUNDLE_FILE_LIMIT} — add more excludes to RSYNC_EXCLUDES`);
  if (isStrict) process.exit(2);
} else {
  log(`Budget OK: ${bundleFileCount} files (${BUNDLE_FILE_LIMIT - bundleFileCount} headroom)`);
}

// ── Cloudflare Pages 25 MiB per-file size guard ────────────────────────────
// Scan the bundle for files exceeding Cloudflare's hard 25 MiB limit.
// This catches regressions early (before wrangler fails mid-deploy) and gives
// a clear list of violators so the fix is obvious. Add violators to RSYNC_EXCLUDES
// or redirect their pipeline output to NAS_OPS_ROOT/pipeline-artifacts/.
if (!isDryRun && fs.existsSync(DIST_DIR)) {
  const CF_MAX_BYTES = 25 * 1024 * 1024; // 25 MiB
  const violators = [];
  function scanSizes(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) scanSizes(full);
      else {
        const { size } = fs.statSync(full);
        if (size > CF_MAX_BYTES) {
          violators.push({ file: path.relative(DIST_DIR, full), size_mb: (size / 1024 / 1024).toFixed(1) });
        }
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
    log('Size guard OK: no file exceeds 25 MiB.');
  }
}

// Write bundle meta proof artifact
if (!isDryRun) {
  const metaDir = path.join(DIST_DIR, 'data/ops');
  fs.mkdirSync(metaDir, { recursive: true });
  const metaPath = path.join(metaDir, 'build-bundle-meta.json');
  fs.writeFileSync(metaPath, JSON.stringify({
    schema: 'rv_build_bundle_meta_v1',
    generated_at: utcNow(),
    source_dir: 'public/',
    dest_dir: 'dist/pages-prod/',
    public_file_count: publicFileCount,
    bundle_file_count: bundleFileCount,
    bundle_size_mb: bundleSizeMb,
    budget_limit: BUNDLE_FILE_LIMIT,
    budget_ok: !overBudget,
    excludes: RSYNC_EXCLUDES,
  }, null, 2) + '\n');
  log(`Bundle meta written: ${metaPath}`);
}

log('Done.');
process.exit(overBudget && isStrict ? 2 : 0);
