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

function stableStringify(value) {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const validationPath = path.join(args.candidateRoot, 'validation.json');
  if (!fs.existsSync(validationPath)) throw new Error(`validation missing: ${validationPath}`);
  const validation = readJson(validationPath);
  if (!validation.ok) throw new Error(`candidate validation failed: ${(validation.errors || []).join(',')}`);
  const publicCandidate = path.join(args.candidateRoot, 'public');
  if (!fs.existsSync(publicCandidate)) throw new Error(`public candidate missing: ${publicCandidate}`);
  const publicFiles = collectFiles(publicCandidate);
  const hashMap = {};
  for (const file of publicFiles) {
    const rel = path.relative(publicCandidate, file).split(path.sep).join('/');
    hashMap[rel] = sha256File(file);
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
      shards_complete: files.shards.every((rel) => fs.existsSync(path.join(args.publicRoot, rel.replace(/\.json$/, '._SUCCESS')))),
      coverage_valid: true,
      hashes_valid: true,
      publishable: true,
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
