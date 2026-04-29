#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const ROOT = process.cwd();

function exists(filePath) {
  try {
    fs.accessSync(filePath);
    return true;
  } catch {
    return false;
  }
}

function checkPythonModule(moduleName) {
  try {
    execFileSync('python3', ['-c', `import ${moduleName}`], { stdio: 'ignore' });
    return { ok: true, reason: null };
  } catch (error) {
    return { ok: false, reason: error.message };
  }
}

function checkWritable(dirPath) {
  try {
    fs.mkdirSync(dirPath, { recursive: true });
    const probe = path.join(dirPath, `.probe-${Date.now()}.tmp`);
    fs.writeFileSync(probe, 'ok\n', 'utf8');
    fs.unlinkSync(probe);
    return { ok: true, reason: null };
  } catch (error) {
    return { ok: false, reason: error.message };
  }
}

const scriptPath = path.join(ROOT, 'scripts', 'quantlab', 'run_daily_delta_ingest_q1.py');
const allowlistPath = path.join(ROOT, 'public', 'data', 'universe', 'v7', 'ssot', 'stocks_etfs.us_eu.canonical.ids.json');
const quantlabRoots = [
  process.env.QUANT_ROOT,
  process.env.NAS_QUANT_ROOT,
  process.env.RV_QUANT_ROOT,
  path.join(ROOT, 'mirrors', 'quantlab'),
].filter(Boolean);
const writablePaths = [
  path.join(ROOT, 'tmp', 'nas-q1-preflight'),
  path.join(ROOT, 'tmp', 'nas-open-probes'),
];

const pythonCheck = checkPythonModule('pyarrow');
const quantlabRoot = quantlabRoots.find((candidate) => exists(candidate)) || null;
const latestDateCache = quantlabRoot
  ? path.join(quantlabRoot, 'ops', 'cache', 'q1_daily_delta_latest_date_index.stock_etf.json')
  : null;
const packStateCache = quantlabRoot
  ? path.join(quantlabRoot, 'ops', 'cache', 'q1_daily_delta_v7_pack_state.stock_etf.json')
  : null;
const writableChecks = writablePaths.map((candidate) => ({
  path: candidate,
  ...checkWritable(candidate),
}));

const doc = {
  schema_version: 'nas.q1.delta.preflight.v1',
  generated_at: new Date().toISOString(),
  checks: {
    ingest_script_exists: exists(scriptPath),
    allowlist_exists: exists(allowlistPath),
    pyarrow_importable: pythonCheck.ok,
    quantlab_root_present: Boolean(quantlabRoot),
    quantlab_root: quantlabRoot,
    latest_date_cache_exists: latestDateCache ? exists(latestDateCache) : false,
    pack_state_cache_exists: packStateCache ? exists(packStateCache) : false,
    writable_paths: writableChecks,
  },
};

process.stdout.write(JSON.stringify(doc, null, 2) + '\n');

const ok =
  doc.checks.ingest_script_exists &&
  doc.checks.allowlist_exists &&
  doc.checks.pyarrow_importable &&
  doc.checks.quantlab_root_present &&
  doc.checks.latest_date_cache_exists &&
  doc.checks.pack_state_cache_exists &&
  writableChecks.every((item) => item.ok);

process.exit(ok ? 0 : 2);
