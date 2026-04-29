#!/usr/bin/env node
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import yaml from 'yaml';
import Ajv from 'ajv';

const REPO_ROOT = path.resolve(fileURLToPath(new URL('../..', import.meta.url)));
const PUBLIC_BREAKOUT_ROOT = path.join(REPO_ROOT, 'public/data/breakout');
const CONFIG_DIR = path.join(REPO_ROOT, 'config/breakout');
const SCHEMA_DIR = path.join(REPO_ROOT, 'schemas/breakout');

function parseArgs(argv) {
  const args = {
    dryRun: false,
    keepTemp: false,
    maxAssets: Number.parseInt(process.env.BREAKOUT_MAX_ASSETS || '0', 10) || 0,
    asOf: process.env.RV_TARGET_MARKET_DATE || process.env.TARGET_MARKET_DATE || '',
    quantRoot: process.env.QUANT_ROOT || '',
    snapshotId: '',
    barsDatasetRoot: '',
    universeParquet: '',
  };
  for (const arg of argv) {
    if (arg === '--dry-run') args.dryRun = true;
    else if (arg === '--keep-temp') args.keepTemp = true;
    else if (arg.startsWith('--max-assets=')) args.maxAssets = Number.parseInt(arg.split('=')[1] || '0', 10) || 0;
    else if (arg.startsWith('--as-of=')) args.asOf = arg.split('=')[1] || '';
    else if (arg.startsWith('--date=')) args.asOf = arg.split('=')[1] || '';
    else if (arg.startsWith('--quant-root=')) args.quantRoot = arg.split('=')[1] || '';
    else if (arg.startsWith('--snapshot-id=')) args.snapshotId = arg.split('=')[1] || '';
    else if (arg.startsWith('--bars-dataset-root=')) args.barsDatasetRoot = arg.split('=')[1] || '';
    else if (arg.startsWith('--universe-parquet=')) args.universeParquet = arg.split('=')[1] || '';
  }
  return args;
}

function readYaml(fileName) {
  return yaml.parse(fs.readFileSync(path.join(CONFIG_DIR, fileName), 'utf8'));
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

function sha256Buffer(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

function sha256File(filePath) {
  return sha256Buffer(fs.readFileSync(filePath));
}

function stableStringify(value) {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
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

function copyDir(src, dst) {
  fs.mkdirSync(dst, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const from = path.join(src, entry.name);
    const to = path.join(dst, entry.name);
    if (entry.isDirectory()) copyDir(from, to);
    else fs.copyFileSync(from, to);
  }
}

function removeDir(dir) {
  if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true });
}

function runPython(pythonBin, scriptRel, inputManifestPath) {
  const scriptPath = path.join(REPO_ROOT, scriptRel);
  const res = spawnSync(pythonBin, [scriptPath, '--input-manifest', inputManifestPath], {
    cwd: REPO_ROOT,
    stdio: 'inherit',
    env: { ...process.env },
  });
  if (res.status !== 0) {
    throw new Error(`${scriptRel} failed with exit ${res.status}`);
  }
}

function compileSchemas() {
  const ajv = new Ajv({ allErrors: true, strict: false });
  return {
    manifest: ajv.compile(readJson(path.join(SCHEMA_DIR, 'manifest.schema.json'))),
    coverage: ajv.compile(readJson(path.join(SCHEMA_DIR, 'coverage.schema.json'))),
    errors: ajv.compile(readJson(path.join(SCHEMA_DIR, 'errors.schema.json'))),
    score: ajv.compile(readJson(path.join(SCHEMA_DIR, 'score.schema.json'))),
  };
}

function assertValid(validate, payload, label) {
  if (!validate(payload)) {
    throw new Error(`${label} schema invalid: ${JSON.stringify(validate.errors || [])}`);
  }
}

function relativePublic(filePath) {
  return path.relative(PUBLIC_BREAKOUT_ROOT, filePath).split(path.sep).join('/');
}

function buildManifest({ asOf, runDir, candidateDir, configs, inputManifestPath, schemas }) {
  const candidateFiles = collectFiles(candidateDir);
  const jsonFiles = candidateFiles.filter((file) => file.endsWith('.json'));
  const shardFiles = jsonFiles.filter((file) => file.includes(`${path.sep}shards${path.sep}`));
  const successFiles = candidateFiles.filter((file) => file.endsWith('._SUCCESS'));
  const shardSuccessOk = shardFiles.every((file) => fs.existsSync(file.replace(/\.json$/, '._SUCCESS')));

  assertValid(schemas.coverage, readJson(path.join(candidateDir, 'coverage.json')), 'coverage');
  assertValid(schemas.errors, readJson(path.join(candidateDir, 'errors.json')), 'errors');
  assertValid(schemas.score, readJson(path.join(candidateDir, 'top500.json')), 'top500');
  for (const shard of shardFiles) {
    assertValid(schemas.score, readJson(shard), `shard ${path.basename(shard)}`);
  }

  const candidateHashMap = {};
  for (const file of [...jsonFiles, ...successFiles].sort()) {
    const rel = path.relative(candidateDir, file).split(path.sep).join('/');
    candidateHashMap[rel] = sha256File(file);
  }
  const contentHash = sha256Buffer(Buffer.from(stableStringify(candidateHashMap))).slice(0, 24);
  const finalRunDir = runDir(contentHash);

  const fileRel = (name) => `runs/${asOf}/${contentHash}/${name}`;
  const shardRelPaths = shardFiles.map((file) => fileRel(path.relative(candidateDir, file).split(path.sep).join('/')));
  const fileHashes = {};
  for (const [rel, hash] of Object.entries(candidateHashMap)) {
    fileHashes[fileRel(rel)] = hash;
  }

  const files = {
    coverage: fileRel('coverage.json'),
    errors: fileRel('errors.json'),
    health: fileRel('health.json'),
    metadata: fileRel('metadata.json'),
    top500: fileRel('top500.json'),
    shards: shardRelPaths,
  };
  if (fs.existsSync(path.join(candidateDir, 'legacy-comparison.json'))) {
    files.legacy_comparison = fileRel('legacy-comparison.json');
  }

  const manifest = {
    contract_version: 'breakout_manifest_v1',
    run_id: `breakout_${asOf}_${contentHash}`,
    as_of: asOf,
    generated_at: new Date().toISOString(),
    engine_version: configs.features.engine_version || 'breakout_feature_engine_v1.2',
    score_version: configs.scoring.score_version || 'breakout_scoring_v1.2',
    input_manifest_hash: sha256File(inputManifestPath),
    content_hash: contentHash,
    files,
    file_hashes: fileHashes,
    validation: {
      schema_valid: true,
      shards_complete: shardSuccessOk,
      coverage_valid: true,
      hashes_valid: true,
      publishable: shardSuccessOk,
    },
  };
  assertValid(schemas.manifest, manifest, 'manifest');
  if (!manifest.validation.publishable) {
    throw new Error('breakout run not publishable');
  }
  return { manifest, contentHash, finalRunDir };
}

function writeLegacyComparison(candidateDir) {
  const legacyPath = path.join(REPO_ROOT, 'public/data/snapshots/breakout-all.json');
  const topPath = path.join(candidateDir, 'top500.json');
  if (!fs.existsSync(legacyPath) || !fs.existsSync(topPath)) return;
  const legacy = readJson(legacyPath);
  const top = readJson(topPath);
  const legacyItems = Array.isArray(legacy.items) ? legacy.items : [];
  const topItems = Array.isArray(top.items) ? top.items : [];
  const legacyStateCounts = {};
  for (const item of legacyItems) {
    const state = String(item.state || 'UNKNOWN');
    legacyStateCounts[state] = (legacyStateCounts[state] || 0) + 1;
  }
  const legacyTriggered = new Set(
    legacyItems
      .filter((item) => ['TRIGGERED', 'CONFIRMED'].includes(String(item.state || '')))
      .map((item) => String(item.ticker || item.asset_id || ''))
      .filter(Boolean)
  );
  const v12Top = new Set(topItems.map((item) => String(item.asset_id || item.symbol || '')).filter(Boolean));
  const overlap = [...v12Top].filter((assetId) => legacyTriggered.has(assetId));
  atomicWriteJson(path.join(candidateDir, 'legacy-comparison.json'), {
    schema_version: 'breakout_legacy_comparison_v1',
    generated_at: new Date().toISOString(),
    legacy: {
      source: 'public/data/snapshots/breakout-all.json',
      generated_at: legacy.generated_at || null,
      total: legacyItems.length,
      state_counts: legacyStateCounts,
      triggered_or_confirmed: legacyTriggered.size,
    },
    v1_2: {
      source: 'top500.json',
      as_of: top.as_of || null,
      score_version: top.score_version || null,
      top_items: topItems.length,
    },
    comparison: {
      overlap_triggered_or_confirmed_with_top: overlap.length,
      overlap_asset_ids: overlap.slice(0, 100),
    },
  });
}

function publish({ candidateDir, finalRunDir, manifest }) {
  if (!fs.existsSync(finalRunDir)) {
    copyDir(candidateDir, finalRunDir);
  }
  atomicWriteJson(path.join(finalRunDir, 'manifest.json'), manifest);
  const pointer = {
    ...manifest,
    manifest_path: `runs/${manifest.as_of}/${manifest.content_hash}/manifest.json`,
  };
  atomicWriteJson(path.join(PUBLIC_BREAKOUT_ROOT, 'manifests/latest.json'), pointer);
  atomicWriteJson(path.join(PUBLIC_BREAKOUT_ROOT, 'manifests/last_good.json'), pointer);
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const configs = {
    tradable_universe: readYaml('tradable_universe.v1.yaml'),
    features: readYaml('breakout_features.v1.2.yaml'),
    scoring: readYaml('breakout_scoring.v1.2.yaml'),
    outcomes: readYaml('outcome_labels.v1.yaml'),
    health: readYaml('health_guards.v1.yaml'),
  };
  const stamp = new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14);
  const workDir = path.join(os.tmpdir(), 'rubikvault-breakout', `run_${args.asOf || 'auto'}_${stamp}_${process.pid}`);
  const candidatePublicDir = path.join(workDir, 'public_candidate');
  fs.mkdirSync(candidatePublicDir, { recursive: true });

  const inputManifest = {
    schema_version: 'breakout_pipeline_input_v1',
    generated_at: new Date().toISOString(),
    repo_root: REPO_ROOT,
    work_dir: workDir,
    candidate_public_dir: candidatePublicDir,
    as_of: args.asOf,
    quant_root: args.quantRoot,
    snapshot_id: args.snapshotId,
    bars_dataset_root: args.barsDatasetRoot,
    universe_parquet: args.universeParquet,
    max_assets: args.maxAssets,
    configs,
  };
  const inputManifestPath = path.join(workDir, 'input_manifest.json');
  atomicWriteJson(inputManifestPath, inputManifest);

  const pythonBin = process.env.RV_Q1_PYTHON_BIN || process.env.PYTHON || 'python3';
  const schemas = compileSchemas();
  try {
    runPython(pythonBin, 'scripts/breakout_compute/compute_features.py', inputManifestPath);
    const featureMetadata = readJson(path.join(workDir, 'feature_metadata.json'));
    if (!inputManifest.as_of) {
      inputManifest.as_of = featureMetadata.as_of;
      atomicWriteJson(inputManifestPath, inputManifest);
    }
    runPython(pythonBin, 'scripts/breakout_compute/score_breakouts.py', inputManifestPath);
    writeLegacyComparison(candidatePublicDir);
    const asOf = inputManifest.as_of;
    if (!asOf) throw new Error('as_of missing after feature compute');
    const runDir = (hash) => path.join(PUBLIC_BREAKOUT_ROOT, 'runs', asOf, hash);
    const { manifest, finalRunDir } = buildManifest({
      asOf,
      runDir,
      candidateDir: candidatePublicDir,
      configs,
      inputManifestPath,
      schemas,
    });
    if (args.dryRun) {
      atomicWriteJson(path.join(workDir, 'manifest.dry-run.json'), manifest);
      console.log(`BREAKOUT_V12_DRY_RUN_OK work_dir=${workDir} run_id=${manifest.run_id}`);
      return;
    }
    publish({ candidateDir: candidatePublicDir, finalRunDir, manifest });
    console.log(`BREAKOUT_V12_PUBLISH_OK run_id=${manifest.run_id} manifest=${relativePublic(path.join(finalRunDir, 'manifest.json'))}`);
  } finally {
    if (!args.keepTemp && !args.dryRun) removeDir(workDir);
  }
}

main();
