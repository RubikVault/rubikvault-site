#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

function parseArgs(argv) {
  const args = {
    asOf: '',
    candidateRoot: '',
    bucketCount: 128,
    pythonBin: process.env.RV_BREAKOUT_PYTHON_BIN || process.env.RV_Q1_PYTHON_BIN || process.env.PYTHON || 'python3',
    hardRssFailMb: Number.parseInt(process.env.RV_BREAKOUT_HARD_RSS_FAIL_MB || '5000', 10),
  };
  for (const arg of argv) {
    if (arg.startsWith('--as-of=')) args.asOf = arg.split('=')[1] || '';
    else if (arg.startsWith('--candidate-root=')) args.candidateRoot = arg.split('=')[1] || '';
    else if (arg.startsWith('--bucket-count=')) args.bucketCount = Number.parseInt(arg.split('=')[1] || '128', 10) || 128;
    else if (arg.startsWith('--python-bin=')) args.pythonBin = arg.split('=')[1] || args.pythonBin;
  }
  return args;
}

function writeJson(filePath, payload) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(payload, null, 2)}\n`);
}

function readNdjson(filePath) {
  if (!fs.existsSync(filePath)) return [];
  return fs.readFileSync(filePath, 'utf8').split(/\n+/).filter(Boolean).map((line) => JSON.parse(line));
}

function parquetCheck(args, scoresPath) {
  const code = `
import json, sys
import polars as pl
path=sys.argv[1]
asof=sys.argv[2]
df=pl.read_parquet(path)
dups=0
future=0
if df.height:
    dups=df.group_by(["asset_id","as_of"]).len().filter(pl.col("len")>1).height
    future=df.filter(pl.col("as_of").cast(pl.Utf8)>asof).height
print(json.dumps({"rows":df.height,"assets":df.select("asset_id").unique().height if df.height else 0,"duplicates":dups,"future_rows":future}))
`;
  const res = spawnSync(args.pythonBin, ['-c', code, scoresPath, args.asOf], { encoding: 'utf8' });
  if (res.status !== 0) return { ok: false, error: String(res.stderr || res.stdout || '').trim() };
  return { ok: true, ...JSON.parse(String(res.stdout || '{}')) };
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const errors = [];
  const warnings = [];
  const root = path.resolve(args.candidateRoot);
  const localDir = path.join(root, 'local', `date=${args.asOf}`);
  const globalDir = path.join(root, 'global', `date=${args.asOf}`);
  const publicDir = path.join(root, 'public');
  const checks = {};
  if (!fs.existsSync(root)) errors.push('CANDIDATE_ROOT_MISSING');
  const missingBuckets = [];
  const missingSuccess = [];
  for (let bucket = 0; bucket < args.bucketCount; bucket += 1) {
    const file = path.join(localDir, `bucket=${String(bucket).padStart(3, '0')}.parquet`);
    if (!fs.existsSync(file)) missingBuckets.push(bucket);
    if (!fs.existsSync(file.replace(/\.parquet$/, '._SUCCESS'))) missingSuccess.push(bucket);
  }
  checks.missing_buckets = missingBuckets;
  checks.missing_success = missingSuccess;
  if (missingBuckets.length) errors.push('LOCAL_BUCKETS_MISSING');
  if (missingSuccess.length) errors.push('LOCAL_SUCCESS_MISSING');
  const scoresPath = path.join(globalDir, 'scores.parquet');
  checks.scores_present = fs.existsSync(scoresPath);
  if (!checks.scores_present) errors.push('SCORES_PARQUET_MISSING');
  const topPath = path.join(publicDir, 'top500.json');
  checks.top500_present = fs.existsSync(topPath);
  if (!checks.top500_present) errors.push('TOP500_MISSING');
  const resources = readNdjson(path.join(root, 'resources.ndjson'));
  checks.resources_present = resources.length > 0;
  if (!checks.resources_present) errors.push('RESOURCES_MISSING');
  const rssBreaches = resources.filter((row) => Number(row.peak_rss_mb || 0) > args.hardRssFailMb);
  checks.rss_breaches = rssBreaches.length;
  if (rssBreaches.length) errors.push('HARD_RSS_BREACH');
  if (checks.scores_present) {
    checks.parquet = parquetCheck(args, scoresPath);
    if (!checks.parquet.ok) errors.push('PARQUET_CHECK_FAILED');
    if (Number(checks.parquet.duplicates || 0) > 0) errors.push('DUPLICATE_ASSET_DATE');
    if (Number(checks.parquet.future_rows || 0) > 0) errors.push('FUTURE_DATE_ROWS');
    if (Number(checks.parquet.rows || 0) <= 0) errors.push('SCORES_EMPTY');
  }
  const ok = errors.length === 0;
  const validation = {
    schema_version: 'breakout_v12_validation_v1',
    generated_at: new Date().toISOString(),
    run_id: path.basename(root),
    as_of: args.asOf,
    ok,
    checks,
    errors,
    warnings,
  };
  const coverage = {
    schema_version: 'breakout_v12_coverage_v1',
    generated_at: new Date().toISOString(),
    run_id: path.basename(root),
    as_of: args.asOf,
    ok,
    counts: {
      scores_rows: Number(checks.parquet?.rows || 0),
      assets: Number(checks.parquet?.assets || 0),
      local_buckets: args.bucketCount - missingBuckets.length,
      resources_events: resources.length,
    },
    errors,
  };
  writeJson(path.join(root, 'validation.json'), validation);
  writeJson(path.join(root, 'coverage.json'), coverage);
  writeJson(path.join(publicDir, 'coverage.json'), coverage);
  console.log(JSON.stringify({ ok, validation: path.join(root, 'validation.json'), coverage: path.join(root, 'coverage.json') }));
  return ok ? 0 : 72;
}

process.exitCode = main();
