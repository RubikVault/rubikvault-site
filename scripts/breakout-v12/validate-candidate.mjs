#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import Ajv from 'ajv';

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

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function collectFiles(dir) {
  const out = [];
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...collectFiles(full));
    else out.push(full);
  }
  return out.sort();
}

function sha256File(filePath) {
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

function loadSchemas() {
  const schemaRoot = path.resolve('schemas/breakout-v12');
  const ajv = new Ajv({ allErrors: true, strict: false, validateSchema: false });
  const schemas = {};
  for (const [name, file] of Object.entries({
    coverage: 'coverage.schema.json',
    top500: 'top500.schema.json',
    errors: 'errors.schema.json',
    health: 'health.schema.json',
    resources: 'resources.schema.json',
  })) {
    const schemaPath = path.join(schemaRoot, file);
    if (fs.existsSync(schemaPath)) {
      schemas[name] = ajv.compile(readJson(schemaPath));
    }
  }
  return schemas;
}

function validateJsonFile(filePath, validator) {
  try {
    const payload = readJson(filePath);
    if (!validator) return { ok: true, payload };
    const valid = validator(payload);
    return {
      ok: Boolean(valid),
      payload,
      errors: valid ? [] : (validator.errors || []).map((error) => `${error.instancePath || '/'} ${error.message}`),
    };
  } catch (error) {
    return { ok: false, errors: [String(error?.message || error)] };
  }
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
  const schemas = loadSchemas();
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
  const requiredPublic = ['coverage.json', 'errors.json', 'health.json', 'top500.json'];
  checks.public_required_missing = requiredPublic.filter((name) => !fs.existsSync(path.join(publicDir, name)));
  if (checks.public_required_missing.length) errors.push('PUBLIC_REQUIRED_FILES_MISSING');

  const publicSchemaChecks = {};
  for (const [name, validator] of Object.entries({
    coverage: schemas.coverage,
    errors: schemas.errors,
    health: schemas.health,
    top500: schemas.top500,
    all_scored: schemas.top500,
  })) {
    const file = path.join(publicDir, `${name}.json`);
    if (!fs.existsSync(file)) continue;
    const result = validateJsonFile(file, validator);
    publicSchemaChecks[name] = { ok: result.ok, errors: result.errors || [] };
    if (!result.ok) errors.push(`PUBLIC_SCHEMA_INVALID_${name.toUpperCase()}`);
    if (result.payload?.as_of && String(result.payload.as_of).slice(0, 10) !== args.asOf) {
      errors.push(`PUBLIC_AS_OF_MISMATCH_${name.toUpperCase()}`);
    }
  }
  checks.public_schema = publicSchemaChecks;

  const shardFiles = collectFiles(path.join(publicDir, 'shards')).filter((file) => file.endsWith('.json'));
  const shardMissingSuccess = [];
  const shardSchemaInvalid = [];
  for (const shardFile of shardFiles) {
    const successPath = shardFile.replace(/\.json$/, '._SUCCESS');
    if (!fs.existsSync(successPath)) shardMissingSuccess.push(path.relative(publicDir, shardFile).split(path.sep).join('/'));
    const result = validateJsonFile(shardFile, schemas.top500);
    if (!result.ok) shardSchemaInvalid.push({ shard: path.relative(publicDir, shardFile).split(path.sep).join('/'), errors: result.errors || [] });
    if (result.payload?.as_of && String(result.payload.as_of).slice(0, 10) !== args.asOf) {
      shardSchemaInvalid.push({ shard: path.relative(publicDir, shardFile).split(path.sep).join('/'), errors: ['as_of mismatch'] });
    }
  }
  checks.shard_count = shardFiles.length;
  checks.shard_missing_success = shardMissingSuccess;
  checks.shard_schema_invalid = shardSchemaInvalid;
  if (!shardFiles.length) errors.push('SHARDS_MISSING');
  if (shardMissingSuccess.length) errors.push('SHARD_SUCCESS_MISSING');
  if (shardSchemaInvalid.length) errors.push('SHARD_SCHEMA_INVALID');

  const resources = readNdjson(path.join(root, 'resources.ndjson'));
  checks.resources_present = resources.length > 0;
  if (!checks.resources_present) errors.push('RESOURCES_MISSING');
  const resourceSchemaInvalid = [];
  if (schemas.resources) {
    resources.forEach((row, index) => {
      const valid = schemas.resources(row);
      if (!valid) resourceSchemaInvalid.push({ index, errors: schemas.resources.errors || [] });
    });
  }
  checks.resource_schema_invalid = resourceSchemaInvalid.length;
  if (resourceSchemaInvalid.length) errors.push('RESOURCE_SCHEMA_INVALID');
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
  const publicHashes = {};
  for (const file of collectFiles(publicDir)) {
    const rel = path.relative(publicDir, file).split(path.sep).join('/');
    publicHashes[rel] = sha256File(file);
  }
  writeJson(path.join(root, 'hashes.json'), {
    schema_version: 'breakout_v12_hashes_v1',
    generated_at: new Date().toISOString(),
    run_id: path.basename(root),
    as_of: args.asOf,
    public_files: publicHashes,
  });
  checks.public_file_hash_count = Object.keys(publicHashes).length;
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
