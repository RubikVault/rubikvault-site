#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = path.resolve(fileURLToPath(new URL('../..', import.meta.url)));
const DEFAULT_QUANT_ROOT = process.env.QUANT_ROOT
  || path.join(process.env.HOME || path.dirname(REPO_ROOT), 'QuantLabHot/rubikvault-quantlab');

function parseArgs(argv) {
  const args = {
    asOf: process.env.RV_TARGET_MARKET_DATE || process.env.TARGET_MARKET_DATE || '',
    dates: [],
    quantRoot: DEFAULT_QUANT_ROOT,
    dailyDeltaRoot: '',
    deltaManifest: '',
    lastGoodRoot: '',
    publicRoot: path.join(REPO_ROOT, 'public/data/breakout'),
    bucketCount: 128,
    tailBars: 300,
    pythonBin: process.env.RV_BREAKOUT_PYTHON_BIN || process.env.RV_Q1_PYTHON_BIN || process.env.PYTHON || 'python3',
    metadataParquet: '',
    keepCandidate: false,
    skipPrepareDailyDelta: false,
  };
  for (const arg of argv) {
    if (arg === '--keep-candidate') args.keepCandidate = true;
    else if (arg === '--skip-prepare-daily-delta') args.skipPrepareDailyDelta = true;
    else if (arg.startsWith('--as-of=')) args.asOf = arg.split('=')[1] || '';
    else if (arg.startsWith('--dates=')) args.dates = (arg.split('=')[1] || '').split(',').filter(Boolean);
    else if (arg.startsWith('--quant-root=')) args.quantRoot = arg.split('=')[1] || args.quantRoot;
    else if (arg.startsWith('--daily-delta-root=')) args.dailyDeltaRoot = arg.split('=')[1] || '';
    else if (arg.startsWith('--delta-manifest=')) args.deltaManifest = arg.split('=')[1] || '';
    else if (arg.startsWith('--last-good-root=')) args.lastGoodRoot = arg.split('=')[1] || '';
    else if (arg.startsWith('--public-root=')) args.publicRoot = arg.split('=')[1] || args.publicRoot;
    else if (arg.startsWith('--bucket-count=')) args.bucketCount = Number.parseInt(arg.split('=')[1] || '128', 10) || 128;
    else if (arg.startsWith('--tail-bars=')) args.tailBars = Number.parseInt(arg.split('=')[1] || '300', 10) || 300;
    else if (arg.startsWith('--python-bin=')) args.pythonBin = arg.split('=')[1] || args.pythonBin;
    else if (arg.startsWith('--metadata-parquet=')) args.metadataParquet = arg.split('=')[1] || '';
  }
  if (!args.dates.length && args.asOf) args.dates = [args.asOf];
  args.quantRoot = path.resolve(args.quantRoot);
  args.publicRoot = path.resolve(args.publicRoot);
  return args;
}

function readJsonIfExists(filePath) {
  try { return JSON.parse(fs.readFileSync(filePath, 'utf8')); } catch { return null; }
}

function writeJson(filePath, payload) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(payload, null, 2)}\n`);
}

function run(cmd, args, opts = {}) {
  const res = spawnSync(cmd, args, { cwd: REPO_ROOT, stdio: 'inherit', env: { ...process.env, POLARS_MAX_THREADS: process.env.POLARS_MAX_THREADS || '2', OMP_NUM_THREADS: process.env.OMP_NUM_THREADS || '2', DUCKDB_THREADS: process.env.DUCKDB_THREADS || '2' }, ...opts });
  if (res.status !== 0) throw new Error(`${cmd} ${args.join(' ')} failed with exit ${res.status}`);
}

function resolveLastGoodRoot(args, storeRoot) {
  if (args.lastGoodRoot) return path.resolve(args.lastGoodRoot);
  const ptr = readJsonIfExists(path.join(storeRoot, 'last_good.json'));
  if (ptr?.run_root) return String(ptr.run_root);
  const fallback = path.join(storeRoot, 'last_good');
  return fallback;
}

function candidateRunId(asOf) {
  const stamp = new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14);
  return `breakout_v12_${asOf.replace(/-/g, '')}_${stamp}_${process.pid}`;
}

function deltaBucketPath(root, asOf, bucket) {
  const dated = path.join(root, `date=${asOf}`, `bucket=${String(bucket).padStart(3, '0')}.parquet`);
  if (fs.existsSync(dated)) return dated;
  return path.join(root, `bucket=${String(bucket).padStart(3, '0')}.parquet`);
}

function hasAllDeltaBuckets(root, asOf, bucketCount) {
  for (let bucket = 0; bucket < bucketCount; bucket += 1) {
    if (!fs.existsSync(deltaBucketPath(root, asOf, bucket))) return false;
  }
  return true;
}

function yyyymmdd(asOf) {
  return String(asOf || '').replace(/-/g, '').slice(0, 8);
}

function resolveDeltaManifestForDate(args, asOf) {
  if (args.deltaManifest && args.dates.length <= 1) return path.resolve(args.deltaManifest);
  const direct = path.join(args.quantRoot, 'jobs', `q1_daily_delta_${yyyymmdd(asOf)}`, 'manifest.json');
  if (fs.existsSync(direct)) return direct;
  if (args.deltaManifest) return path.resolve(args.deltaManifest);
  return '';
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.dates.length) throw new Error('as-of/dates missing');
  const storeRoot = path.join(args.quantRoot, 'breakout-v12');
  const dailyDeltaRoot = path.resolve(args.dailyDeltaRoot || path.join(storeRoot, 'daily-delta'));
  const statusPath = path.join(storeRoot, 'catchup-status.json');
  const completed = [];
  for (const asOf of args.dates) {
    const runId = candidateRunId(asOf);
    const candidateRoot = path.join(storeRoot, 'candidate', runId);
    const lastGoodRoot = resolveLastGoodRoot(args, storeRoot);
    fs.mkdirSync(candidateRoot, { recursive: true });
    writeJson(statusPath, { schema_version: 'breakout_v12_catchup_status_v1', generated_at: new Date().toISOString(), status: 'running', as_of: asOf, run_id: runId, candidate_root: candidateRoot });
    run(process.execPath, ['scripts/breakout-v12/audit-feature-semantics.mjs', `--out=${path.join(candidateRoot, 'feature_classification.json')}`]);
    if (!args.skipPrepareDailyDelta && !hasAllDeltaBuckets(dailyDeltaRoot, asOf, args.bucketCount)) {
      const prepareArgs = [
        'scripts/breakout-v12/prepare-daily-delta.py',
        `--as-of=${asOf}`,
        `--quant-root=${args.quantRoot}`,
        `--output-root=${dailyDeltaRoot}`,
        `--bucket-count=${args.bucketCount}`,
      ];
      const deltaManifest = resolveDeltaManifestForDate(args, asOf);
      if (deltaManifest) prepareArgs.push(`--delta-manifest=${deltaManifest}`);
      run(args.pythonBin, prepareArgs);
    }
    run(process.execPath, [
      'scripts/breakout-v12/preflight.mjs',
      `--as-of=${asOf}`,
      `--quant-root=${args.quantRoot}`,
      `--candidate-root=${candidateRoot}`,
      `--last-good-root=${lastGoodRoot}`,
      `--daily-delta-root=${dailyDeltaRoot}`,
      `--bucket-count=${args.bucketCount}`,
      `--python-bin=${args.pythonBin}`,
      `--out=${path.join(candidateRoot, 'preflight.json')}`,
    ]);
    run(process.execPath, [
      'scripts/breakout-v12/audit-parquet-layout.mjs',
      `--as-of=${asOf}`,
      `--tail-root=${path.join(lastGoodRoot, 'state/tail-bars')}`,
      `--daily-delta-root=${dailyDeltaRoot}`,
      `--bucket-count=${args.bucketCount}`,
      `--out=${path.join(candidateRoot, 'parquet_layout_audit.json')}`,
    ]);
    run(args.pythonBin, [
      'scripts/breakout-v12/compute-local-daily.py',
      `--as-of=${asOf}`,
      `--candidate-root=${candidateRoot}`,
      `--last-good-root=${lastGoodRoot}`,
      `--daily-delta-root=${dailyDeltaRoot}`,
      `--bucket-count=${args.bucketCount}`,
      `--tail-bars=${args.tailBars}`,
    ]);
    const globalArgs = [
      'scripts/breakout-v12/compute-global-daily.py',
      `--as-of=${asOf}`,
      `--candidate-root=${candidateRoot}`,
      `--duckdb-temp-dir=${path.join(storeRoot, 'tmp', runId)}`,
    ];
    if (args.metadataParquet) globalArgs.push(`--metadata-parquet=${path.resolve(args.metadataParquet)}`);
    run(args.pythonBin, globalArgs);
    run(process.execPath, [
      'scripts/breakout-v12/validate-candidate.mjs',
      `--as-of=${asOf}`,
      `--candidate-root=${candidateRoot}`,
      `--bucket-count=${args.bucketCount}`,
      `--python-bin=${args.pythonBin}`,
    ]);
    run(process.execPath, [
      'scripts/breakout-v12/promote-candidate.mjs',
      `--as-of=${asOf}`,
      `--candidate-root=${candidateRoot}`,
      `--quant-root=${args.quantRoot}`,
      `--public-root=${args.publicRoot}`,
    ]);
    completed.push({ as_of: asOf, run_id: runId, candidate_root: candidateRoot });
  }
  writeJson(statusPath, { schema_version: 'breakout_v12_catchup_status_v1', generated_at: new Date().toISOString(), status: 'ok', completed });
  console.log(JSON.stringify({ ok: true, completed }));
  return 0;
}

try {
  process.exitCode = main();
} catch (error) {
  console.error(error?.stack || error?.message || String(error));
  try {
    const args = parseArgs(process.argv.slice(2));
    const storeRoot = path.join(path.resolve(args.quantRoot), 'breakout-v12');
    writeJson(path.join(storeRoot, 'catchup-status.json'), {
      schema_version: 'breakout_v12_catchup_status_v1',
      generated_at: new Date().toISOString(),
      status: 'failed',
      as_of: args.asOf || null,
      dates: args.dates,
      error: String(error?.message || error),
    });
  } catch {
    // Preserve original failure.
  }
  process.exitCode = 1;
}
