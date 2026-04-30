#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

function parseArgs(argv) {
  const args = {
    asOf: '',
    candidateRoot: '',
    quantRoot: process.env.QUANT_ROOT || '',
    publicRoot: path.resolve('public/data/breakout'),
  };
  for (const arg of argv) {
    if (arg.startsWith('--as-of=')) args.asOf = arg.split('=')[1] || '';
    else if (arg.startsWith('--candidate-root=')) args.candidateRoot = arg.split('=')[1] || '';
    else if (arg.startsWith('--quant-root=')) args.quantRoot = arg.split('=')[1] || '';
    else if (arg.startsWith('--public-root=')) args.publicRoot = arg.split('=')[1] || '';
  }
  args.candidateRoot = path.resolve(args.candidateRoot);
  args.publicRoot = path.resolve(args.publicRoot);
  args.quantRoot = path.resolve(args.quantRoot);
  return args;
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function atomicWriteJson(filePath, payload) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const tmp = path.join(path.dirname(filePath), `.${path.basename(filePath)}.${process.pid}.${crypto.randomUUID()}.tmp`);
  fs.writeFileSync(tmp, `${JSON.stringify(payload, null, 2)}\n`);
  fs.renameSync(tmp, filePath);
}

function copyDir(src, dst) {
  fs.mkdirSync(dst, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const from = path.join(src, entry.name);
    const to = path.join(dst, entry.name);
    if (entry.isDirectory()) copyDir(from, to);
    else fs.copyFileSync(from, to);
  }
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

function stableStringify(value) {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function canonicalSha256File(filePath) {
  if (filePath.endsWith('.json')) {
    return crypto.createHash('sha256')
      .update(stableStringify(normalizeForHash(readJson(filePath))))
      .digest('hex');
  }
  return sha256File(filePath);
}

function requireFile(filePath, label) {
  if (!fs.existsSync(filePath)) throw new Error(`${label} missing: ${filePath}`);
}

function buildRequiredPublicCheck(publicCandidate) {
  const missing = [];
  for (const rel of ['coverage.json', 'errors.json', 'health.json', 'top500.json']) {
    if (!fs.existsSync(path.join(publicCandidate, rel))) missing.push(rel);
  }
  const shardFiles = collectFiles(path.join(publicCandidate, 'shards')).filter((file) => file.endsWith('.json'));
  const missingShardSuccess = shardFiles
    .filter((file) => !fs.existsSync(file.replace(/\.json$/, '._SUCCESS')))
    .map((file) => path.relative(publicCandidate, file).split(path.sep).join('/'));
  return {
    required_files_present: missing.length === 0,
    missing,
    shard_count: shardFiles.length,
    shards_complete: shardFiles.length > 0 && missingShardSuccess.length === 0,
    missing_shard_success: missingShardSuccess,
  };
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const validationPath = path.join(args.candidateRoot, 'validation.json');
  if (!fs.existsSync(validationPath)) throw new Error(`validation missing: ${validationPath}`);
  const validation = readJson(validationPath);
  if (!validation.ok) throw new Error(`candidate validation failed: ${(validation.errors || []).join(',')}`);
  const publicCandidate = path.join(args.candidateRoot, 'public');
  if (!fs.existsSync(publicCandidate)) throw new Error(`public candidate missing: ${publicCandidate}`);
  const required = buildRequiredPublicCheck(publicCandidate);
  if (!required.required_files_present) throw new Error(`public required files missing: ${required.missing.join(',')}`);
  if (!required.shards_complete) throw new Error(`public shard _SUCCESS missing: ${required.missing_shard_success.join(',') || 'no shards'}`);
  requireFile(path.join(args.candidateRoot, 'coverage.json'), 'candidate coverage');
  requireFile(path.join(args.candidateRoot, 'hashes.json'), 'candidate hashes');
  const publicFiles = collectFiles(publicCandidate);
  const hashMap = {};
  for (const file of publicFiles) {
    const rel = path.relative(publicCandidate, file).split(path.sep).join('/');
    hashMap[rel] = canonicalSha256File(file);
  }
  const contentHash = crypto.createHash('sha256').update(stableStringify(hashMap)).digest('hex').slice(0, 24);
  const runId = path.basename(args.candidateRoot);
  const storeRoot = path.join(args.quantRoot, 'breakout-v12');
  const internalRunRoot = path.join(storeRoot, 'runs', runId);
  if (!fs.existsSync(internalRunRoot)) copyDir(args.candidateRoot, internalRunRoot);

  const publicRunRoot = path.join(args.publicRoot, 'runs', args.asOf, contentHash);
  if (!fs.existsSync(publicRunRoot)) copyDir(publicCandidate, publicRunRoot);
  const shardFiles = collectFiles(path.join(publicRunRoot, 'shards')).filter((file) => file.endsWith('.json'));
  const files = {
    coverage: `runs/${args.asOf}/${contentHash}/coverage.json`,
    errors: `runs/${args.asOf}/${contentHash}/errors.json`,
    health: `runs/${args.asOf}/${contentHash}/health.json`,
    top500: `runs/${args.asOf}/${contentHash}/top500.json`,
    shards: shardFiles.map((file) => `runs/${args.asOf}/${contentHash}/${path.relative(publicRunRoot, file).split(path.sep).join('/')}`),
  };
  const shardsComplete = files.shards.length > 0 && files.shards.every((rel) => fs.existsSync(path.join(args.publicRoot, rel.replace(/\.json$/, '._SUCCESS'))));
  const requiredPublicFilesPresent = ['coverage', 'errors', 'health', 'top500'].every((key) => fs.existsSync(path.join(args.publicRoot, files[key])));
  const publishable = Boolean(validation.ok && shardsComplete && requiredPublicFilesPresent && Object.keys(hashMap).length > 0);
  if (!publishable) {
    throw new Error(`candidate not publishable: shards_complete=${shardsComplete} required_public_files_present=${requiredPublicFilesPresent}`);
  }
  const manifest = {
    contract_version: 'breakout_manifest_v1',
    run_id: `breakout_${args.asOf}_${contentHash}`,
    as_of: args.asOf,
    generated_at: new Date().toISOString(),
    engine_version: 'breakout_v12_daily_incremental',
    score_version: 'breakout_scoring_v12_incremental_v1',
    input_manifest_hash: sha256File(validationPath),
    content_hash: contentHash,
    files,
    file_hashes: Object.fromEntries(Object.entries(hashMap).map(([rel, hash]) => [`runs/${args.asOf}/${contentHash}/${rel}`, hash])),
    validation: {
      schema_valid: true,
      shards_complete: shardsComplete,
      coverage_valid: true,
      hashes_valid: true,
      publishable,
    },
    manifest_path: `runs/${args.asOf}/${contentHash}/manifest.json`,
  };
  atomicWriteJson(path.join(publicRunRoot, 'manifest.json'), manifest);
  atomicWriteJson(path.join(args.publicRoot, 'manifests/latest.json'), manifest);
  atomicWriteJson(path.join(args.publicRoot, 'manifests/last_good.json'), manifest);
  const pointer = {
    schema_version: 'breakout_v12_internal_pointer_v1',
    updated_at: new Date().toISOString(),
    run_id: runId,
    as_of: args.asOf,
    status: 'ok',
    run_root: internalRunRoot,
    state_tail_root: path.join(internalRunRoot, 'state/tail-bars'),
    public_manifest: path.join(args.publicRoot, 'manifests/latest.json'),
    content_hash: contentHash,
  };
  atomicWriteJson(path.join(storeRoot, 'latest.json'), pointer);
  atomicWriteJson(path.join(storeRoot, 'last_good.json'), pointer);
  atomicWriteJson(path.join(internalRunRoot, 'promoted.json'), { ...pointer, public_manifest_payload: manifest });
  console.log(JSON.stringify({ ok: true, run_id: runId, content_hash: contentHash, public_manifest: path.join(args.publicRoot, 'manifests/latest.json') }));
  return 0;
}

try {
  process.exitCode = main();
} catch (error) {
  console.error(error?.stack || error?.message || String(error));
  process.exitCode = 1;
}
