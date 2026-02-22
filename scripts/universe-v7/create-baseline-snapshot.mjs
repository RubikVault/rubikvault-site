#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { execSync } from 'node:child_process';

const REPO_ROOT = process.cwd();
const BASELINES_ROOT = path.join(REPO_ROOT, 'mirrors/universe-v7/baselines');

const COPY_FILES = [
  'public/data/universe/v7/reports/stocks_history_completion_gate.json',
  'public/data/universe/v7/reports/forecast_pack_coverage.json',
  'public/data/universe/v7/reports/marketphase_deep_report.json',
  'public/data/universe/v7/reports/marketphase_deep_canonical_report.json',
  'public/data/universe/v7/reports/marketphase_legacy_bridge_report.json',
  'public/data/universe/v7/reports/feature_universe_parity_report.json',
  'public/data/universe/v7/ssot/feature_stock_universe_report.json'
];

const HASH_ONLY_FILES = [
  'public/data/snapshots/stock-analysis.json',
  'public/data/forecast/latest.json',
  'public/data/marketphase/index.json',
  'public/data/universe/v7/read_models/marketphase_deep_summary.json',
  'public/data/universe/v7/read_models/marketphase_deep_canonical_summary.json'
];

function nowIso() {
  return new Date().toISOString();
}

function compactStamp() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}_${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}`;
}

async function exists(absPath) {
  try {
    await fs.access(absPath);
    return true;
  } catch {
    return false;
  }
}

async function writeJsonAtomic(absPath, payload) {
  await fs.mkdir(path.dirname(absPath), { recursive: true });
  const tmp = `${absPath}.tmp`;
  await fs.writeFile(tmp, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
  await fs.rename(tmp, absPath);
}

async function sha256File(absPath) {
  const buf = await fs.readFile(absPath);
  return crypto.createHash('sha256').update(buf).digest('hex');
}

async function statRel(relPath) {
  const absPath = path.join(REPO_ROOT, relPath);
  if (!(await exists(absPath))) return { path: relPath, exists: false };
  const st = await fs.stat(absPath);
  return {
    path: relPath,
    exists: true,
    size_bytes: st.size,
    mtime: new Date(st.mtimeMs).toISOString(),
    sha256: await sha256File(absPath)
  };
}

async function copyRel(relPath, targetDir) {
  const absSrc = path.join(REPO_ROOT, relPath);
  if (!(await exists(absSrc))) return null;
  const absDest = path.join(targetDir, relPath);
  await fs.mkdir(path.dirname(absDest), { recursive: true });
  await fs.copyFile(absSrc, absDest);
  return relPath;
}

async function main() {
  let gitSha = null;
  try {
    gitSha = execSync('git rev-parse --short HEAD', { cwd: REPO_ROOT, stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
  } catch {}

  const runId = `baseline_${compactStamp()}_${gitSha || 'nogit'}`;
  const outDir = path.join(BASELINES_ROOT, runId);
  await fs.mkdir(outDir, { recursive: true });

  const copied = [];
  for (const rel of COPY_FILES) {
    const wrote = await copyRel(rel, outDir);
    if (wrote) copied.push(wrote);
  }

  const files = [];
  for (const rel of [...COPY_FILES, ...HASH_ONLY_FILES]) {
    files.push(await statRel(rel));
  }

  const manifest = {
    schema: 'rv_v7_baseline_snapshot_v1',
    created_at: nowIso(),
    run_id: runId,
    git_sha: gitSha,
    repo_root: REPO_ROOT,
    output_dir: path.relative(REPO_ROOT, outDir),
    copied_files: copied,
    copy_count: copied.length,
    files
  };

  const manifestPath = path.join(outDir, 'baseline_manifest.json');
  await writeJsonAtomic(manifestPath, manifest);

  process.stdout.write(`${JSON.stringify({
    ok: true,
    run_id: runId,
    out_dir: path.relative(REPO_ROOT, outDir),
    copied_files: copied.length,
    manifest: path.relative(REPO_ROOT, manifestPath)
  })}\n`);
}

main().catch((error) => {
  process.stderr.write(`${JSON.stringify({ ok: false, reason: error?.message || 'baseline_snapshot_failed' })}\n`);
  process.exit(1);
});
