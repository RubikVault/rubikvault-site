#!/usr/bin/env node
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = path.resolve(fileURLToPath(new URL('../..', import.meta.url)));

function parseArgs(argv) {
  const args = {
    asOf: process.env.RV_TARGET_MARKET_DATE || process.env.TARGET_MARKET_DATE || '',
    quantRoot: process.env.QUANT_ROOT || '',
    candidateRoot: '',
    lastGoodRoot: '',
    dailyDeltaRoot: '',
    bucketCount: 128,
    pythonBin: process.env.RV_BREAKOUT_PYTHON_BIN || process.env.RV_Q1_PYTHON_BIN || process.env.PYTHON || 'python3',
    runtimeConfig: path.join(REPO_ROOT, 'config/breakout-v12/runtime.json'),
    featuresConfig: path.join(REPO_ROOT, 'config/breakout-v12/features.json'),
    out: '',
  };
  for (const arg of argv) {
    if (arg.startsWith('--as-of=')) args.asOf = arg.split('=')[1] || '';
    else if (arg.startsWith('--quant-root=')) args.quantRoot = arg.split('=')[1] || '';
    else if (arg.startsWith('--candidate-root=')) args.candidateRoot = arg.split('=')[1] || '';
    else if (arg.startsWith('--last-good-root=')) args.lastGoodRoot = arg.split('=')[1] || '';
    else if (arg.startsWith('--daily-delta-root=')) args.dailyDeltaRoot = arg.split('=')[1] || '';
    else if (arg.startsWith('--bucket-count=')) args.bucketCount = Number.parseInt(arg.split('=')[1] || '128', 10) || 128;
    else if (arg.startsWith('--python-bin=')) args.pythonBin = arg.split('=')[1] || args.pythonBin;
    else if (arg.startsWith('--out=')) args.out = arg.split('=')[1] || '';
  }
  return args;
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function writeJson(filePath, payload) {
  if (!filePath) return;
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(payload, null, 2)}\n`);
}

function moduleCheck(pythonBin) {
  const code = 'import importlib,sys,json\nmods=sys.argv[1:]\nmissing=[]\nfor m in mods:\n    try: importlib.import_module(m)\n    except Exception as e: missing.append({"module":m,"error":str(e)})\nprint(json.dumps({"ok":not missing,"missing":missing}))\nsys.exit(0 if not missing else 1)\n';
  const res = spawnSync(pythonBin, ['-c', code, 'polars', 'pyarrow', 'duckdb'], { cwd: REPO_ROOT, encoding: 'utf8' });
  let detail = {};
  try { detail = JSON.parse(String(res.stdout || '').trim() || '{}'); } catch {}
  return { ok: res.status === 0, python_bin: pythonBin, exit_status: res.status, ...detail, stderr: String(res.stderr || '').trim() };
}

function memAvailableMb() {
  try {
    const raw = fs.readFileSync('/proc/meminfo', 'utf8');
    const match = raw.match(/^MemAvailable:\s+(\d+)\s+kB/m);
    if (match) return Math.round(Number(match[1]) / 1024);
  } catch {}
  return Math.round(os.freemem() / 1024 / 1024);
}

function deltaBucketPath(root, asOf, bucket) {
  const dated = path.join(root, `date=${asOf}`, `bucket=${String(bucket).padStart(3, '0')}.parquet`);
  if (fs.existsSync(dated)) return dated;
  return path.join(root, `bucket=${String(bucket).padStart(3, '0')}.parquet`);
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const errors = [];
  const checks = {};
  const runtime = fs.existsSync(args.runtimeConfig) ? readJson(args.runtimeConfig) : {};
  if (!args.asOf || !/^\d{4}-\d{2}-\d{2}$/.test(args.asOf)) errors.push('AS_OF_INVALID');
  for (const [key, filePath] of Object.entries({ runtimeConfig: args.runtimeConfig, featuresConfig: args.featuresConfig })) {
    checks[key] = fs.existsSync(filePath);
    if (!checks[key]) errors.push(`${key.toUpperCase()}_MISSING`);
  }
  const dep = moduleCheck(args.pythonBin);
  checks.dependencies = dep;
  if (!dep.ok) errors.push('DEPENDENCY_MISSING');
  const availableMb = memAvailableMb();
  const minFree = Number(process.env.RV_BREAKOUT_MIN_FREE_MB || runtime.min_free_memory_mb || 5000);
  checks.memory = { available_mb: availableMb, min_free_mb: minFree, ok: availableMb >= minFree };
  if (!checks.memory.ok) errors.push('MEMORY_BUDGET_EXCEEDED');

  const requiredDirs = {
    candidateRoot: args.candidateRoot,
    lastGoodRoot: args.lastGoodRoot,
    dailyDeltaRoot: args.dailyDeltaRoot,
  };
  for (const [key, dir] of Object.entries(requiredDirs)) {
    checks[key] = Boolean(dir) && fs.existsSync(dir);
    if (!checks[key]) errors.push(`${key.toUpperCase()}_MISSING`);
  }
  const missingTailBuckets = [];
  const missingDeltaBuckets = [];
  if (args.lastGoodRoot && args.dailyDeltaRoot) {
    for (let bucket = 0; bucket < args.bucketCount; bucket += 1) {
      const tailPath = path.join(args.lastGoodRoot, 'state/tail-bars', `bucket=${String(bucket).padStart(3, '0')}.parquet`);
      if (!fs.existsSync(tailPath)) missingTailBuckets.push(bucket);
      if (!fs.existsSync(deltaBucketPath(args.dailyDeltaRoot, args.asOf, bucket))) missingDeltaBuckets.push(bucket);
    }
  }
  checks.missing_tail_buckets = missingTailBuckets;
  checks.missing_delta_buckets = missingDeltaBuckets;
  if (missingTailBuckets.length) errors.push('TAIL_BUCKETS_MISSING');
  if (missingDeltaBuckets.length) errors.push('DELTA_BUCKETS_MISSING');

  const payload = {
    schema_version: 'breakout_v12_preflight_v1',
    generated_at: new Date().toISOString(),
    as_of: args.asOf || null,
    ok: errors.length === 0,
    checks,
    errors,
  };
  writeJson(args.out, payload);
  console.log(JSON.stringify(payload));
  if (errors.includes('DEPENDENCY_MISSING')) return 70;
  if (errors.some((e) => e.includes('MISSING'))) return 71;
  if (errors.includes('MEMORY_BUDGET_EXCEEDED')) return 73;
  return payload.ok ? 0 : 72;
}

process.exitCode = main();
