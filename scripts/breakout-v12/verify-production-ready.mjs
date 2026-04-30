#!/usr/bin/env node
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = path.resolve(fileURLToPath(new URL('../..', import.meta.url)));
const DEFAULT_QUANT_ROOT = process.env.QUANT_ROOT
  || path.join(process.env.HOME || path.dirname(REPO_ROOT), 'QuantLabHot/rubikvault-quantlab');
const MAX_PUBLIC_FILE_BYTES = 25 * 1024 * 1024;

function parseArgs(argv) {
  const args = {
    asOf: process.env.RV_TARGET_MARKET_DATE || process.env.TARGET_MARKET_DATE || '',
    quantRoot: DEFAULT_QUANT_ROOT,
    publicRoot: path.join(REPO_ROOT, 'public/data/breakout'),
    pythonBin: process.env.RV_BREAKOUT_PYTHON_BIN || process.env.RV_Q1_PYTHON_BIN || process.env.PYTHON || 'python3',
    bucketCount: Number.parseInt(process.env.RV_BREAKOUT_BUCKET_COUNT || '128', 10) || 128,
    json: false,
  };
  for (const arg of argv) {
    if (arg === '--json') args.json = true;
    else if (arg.startsWith('--as-of=')) args.asOf = arg.split('=')[1] || '';
    else if (arg.startsWith('--quant-root=')) args.quantRoot = arg.split('=')[1] || args.quantRoot;
    else if (arg.startsWith('--public-root=')) args.publicRoot = arg.split('=')[1] || args.publicRoot;
    else if (arg.startsWith('--python-bin=')) args.pythonBin = arg.split('=')[1] || args.pythonBin;
    else if (arg.startsWith('--bucket-count=')) args.bucketCount = Number.parseInt(arg.split('=')[1] || '128', 10) || 128;
  }
  args.quantRoot = path.resolve(args.quantRoot);
  args.publicRoot = path.resolve(args.publicRoot);
  return args;
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function readJsonIfExists(filePath) {
  try {
    return readJson(filePath);
  } catch {
    return null;
  }
}

function stableStringify(value) {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function normalizeForHash(value) {
  if (Array.isArray(value)) return value.map(normalizeForHash);
  if (value && typeof value === 'object') {
    const out = {};
    for (const key of Object.keys(value).sort()) {
      if (['generated_at', 'updated_at', 'promoted_at', 'run_id'].includes(key)) continue;
      out[key] = normalizeForHash(value[key]);
    }
    return out;
  }
  return value;
}

function sha256File(filePath) {
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

function canonicalSha256File(filePath) {
  if (filePath.endsWith('.json')) {
    return crypto.createHash('sha256')
      .update(stableStringify(normalizeForHash(readJson(filePath))))
      .digest('hex');
  }
  return sha256File(filePath);
}

function checkPython(pythonBin) {
  const code = [
    'import importlib, json, sys',
    'missing=[]',
    'versions={}',
    'for name in ["polars","pyarrow","duckdb"]:',
    '  try:',
    '    mod=importlib.import_module(name); versions[name]=getattr(mod, "__version__", "unknown")',
    '  except Exception as exc:',
    '    missing.append({"module": name, "error": str(exc)})',
    'print(json.dumps({"ok": not missing, "missing": missing, "versions": versions}, sort_keys=True))',
    'raise SystemExit(0 if not missing else 1)',
  ].join('\n');
  const res = spawnSync(pythonBin, ['-c', code], { encoding: 'utf8' });
  let detail = {};
  try { detail = JSON.parse(String(res.stdout || '').trim() || '{}'); } catch { /* ignore */ }
  return { ok: res.status === 0, python_bin: pythonBin, exit_status: res.status, stderr: String(res.stderr || '').trim(), ...detail };
}

function activeBreakoutProcesses() {
  if (os.platform() === 'win32') return [];
  const res = spawnSync('ps', ['-eo', 'pid,ppid,stat,rss,etime,cmd'], { encoding: 'utf8' });
  if (res.status !== 0) return [];
  const patterns = [
    'catchup-daily.mjs',
    'compute-local-daily.py',
    'compute-global-daily.py',
    'prepare-daily-delta.py',
    'build-tail-state.py',
    'run-breakout-nightly-safe.mjs',
  ];
  return String(res.stdout || '').split('\n')
    .filter((line) => patterns.some((pattern) => line.includes(pattern)))
    .filter((line) => !line.includes('verify-production-ready.mjs'));
}

function checkPublicArtifacts(args, failures) {
  const latestPath = path.join(args.publicRoot, 'manifests/latest.json');
  const lastGoodPath = path.join(args.publicRoot, 'manifests/last_good.json');
  const statusPath = path.join(args.publicRoot, 'status.json');
  const latest = readJsonIfExists(latestPath);
  const lastGood = readJsonIfExists(lastGoodPath);
  const status = readJsonIfExists(statusPath);
  if (!latest) failures.push(`latest manifest missing or invalid: ${latestPath}`);
  if (!lastGood) failures.push(`last_good manifest missing or invalid: ${lastGoodPath}`);
  if (!latest || !lastGood) return { latest, lastGood, status };
  if (args.asOf && latest.as_of !== args.asOf) failures.push(`latest as_of ${latest.as_of} != expected ${args.asOf}`);
  if (latest.validation?.publishable !== true) failures.push('latest manifest not publishable');
  if (lastGood.validation?.publishable !== true) failures.push('last_good manifest not publishable');
  if (latest.content_hash !== lastGood.content_hash) failures.push('latest/last_good content_hash mismatch');
  if (status && status.status !== 'ok') failures.push(`status.json not ok: ${status.status}/${status.reason}`);
  const required = ['coverage', 'errors', 'health', 'top500'];
  for (const key of required) {
    const rel = latest.files?.[key];
    const filePath = rel ? path.join(args.publicRoot, rel) : '';
    if (!rel || !fs.existsSync(filePath)) failures.push(`public ${key} missing: ${rel || '<none>'}`);
    else if (fs.statSync(filePath).size > MAX_PUBLIC_FILE_BYTES) failures.push(`public ${key} exceeds 25 MiB: ${rel}`);
  }
  const topPath = latest.files?.top500 ? path.join(args.publicRoot, latest.files.top500) : '';
  const top500 = topPath && fs.existsSync(topPath) ? readJsonIfExists(topPath) : null;
  const topCount = Array.isArray(top500?.items) ? top500.items.length : Number(top500?.count || 0);
  if (topCount !== 500) failures.push(`top500 count ${topCount} != 500`);
  const shards = Array.isArray(latest.files?.shards) ? latest.files.shards : [];
  if (!shards.length) failures.push('manifest has no shards');
  for (const rel of shards) {
    const shard = path.join(args.publicRoot, rel);
    const success = path.join(args.publicRoot, rel.replace(/\.json$/, '._SUCCESS'));
    if (!fs.existsSync(shard)) failures.push(`shard missing: ${rel}`);
    if (!fs.existsSync(success)) failures.push(`shard _SUCCESS missing: ${rel}`);
  }
  for (const [rel, expected] of Object.entries(latest.file_hashes || {})) {
    const filePath = path.join(args.publicRoot, rel);
    if (!fs.existsSync(filePath)) failures.push(`hashed file missing: ${rel}`);
    else {
      const actual = canonicalSha256File(filePath);
      if (actual !== expected) failures.push(`hash mismatch: ${rel}`);
    }
  }
  return { latest, lastGood, status, topCount, shardCount: shards.length };
}

function checkQuantPointer(args, latest, failures) {
  const pointerPath = path.join(args.quantRoot, 'breakout-v12/last_good.json');
  const pointer = readJsonIfExists(pointerPath);
  if (!pointer) {
    failures.push(`quant last_good missing or invalid: ${pointerPath}`);
    return { pointer: null, tailBucketCount: 0 };
  }
  if (pointer.status !== 'ok') failures.push(`quant last_good status not ok: ${pointer.status}`);
  if (latest?.as_of && pointer.as_of !== latest.as_of) failures.push(`quant pointer as_of ${pointer.as_of} != latest ${latest.as_of}`);
  if (latest?.content_hash && pointer.content_hash !== latest.content_hash) failures.push('quant pointer content_hash mismatch');
  const tailRoot = String(pointer.state_tail_root || '');
  const tailBucketCount = fs.existsSync(tailRoot)
    ? fs.readdirSync(tailRoot).filter((name) => /^bucket=\d{3}\.parquet$/.test(name)).length
    : 0;
  if (tailBucketCount !== args.bucketCount) failures.push(`tail bucket count ${tailBucketCount} != ${args.bucketCount}`);
  return { pointer, tailBucketCount };
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const failures = [];
  const python = checkPython(args.pythonBin);
  if (!python.ok) failures.push(`python dependency check failed: ${args.pythonBin}`);
  const active = activeBreakoutProcesses();
  if (active.length) failures.push(`active breakout process found: ${active.length}`);
  const publicCheck = checkPublicArtifacts(args, failures);
  const quant = checkQuantPointer(args, publicCheck.latest, failures);
  const result = {
    ok: failures.length === 0,
    generated_at: new Date().toISOString(),
    checks: {
      python,
      active_processes: active,
      public: {
        latest_as_of: publicCheck.latest?.as_of || null,
        publishable: publicCheck.latest?.validation?.publishable === true,
        top_count: publicCheck.topCount || 0,
        shard_count: publicCheck.shardCount || 0,
        status: publicCheck.status?.status || null,
      },
      quant: {
        as_of: quant.pointer?.as_of || null,
        tail_bucket_count: quant.tailBucketCount,
        content_hash: quant.pointer?.content_hash || null,
      },
    },
    failures,
  };
  if (args.json) console.log(JSON.stringify(result, null, 2));
  else if (result.ok) console.log(`BREAKOUT_V12_PRODUCTION_READY as_of=${result.checks.public.latest_as_of} tail_buckets=${result.checks.quant.tail_bucket_count}`);
  else console.error(`BREAKOUT_V12_NOT_READY failures=${failures.length}\n${failures.map((item) => `- ${item}`).join('\n')}`);
  return result.ok ? 0 : 1;
}

process.exitCode = main();
