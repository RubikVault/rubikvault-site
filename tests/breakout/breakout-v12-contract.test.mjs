import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';
import Ajv from 'ajv';

const ROOT = path.resolve(new URL('../..', import.meta.url).pathname);

function readJson(rel) {
  return JSON.parse(fs.readFileSync(path.join(ROOT, rel), 'utf8'));
}

function hasPythonPolars() {
  const res = spawnSync('python3', ['-c', 'import polars, pyarrow'], { encoding: 'utf8' });
  return res.status === 0;
}

function hasPythonBreakoutV12() {
  const res = spawnSync('python3', ['-c', 'import polars, pyarrow, duckdb'], { encoding: 'utf8' });
  return res.status === 0;
}

function runSafeWrapper(extraEnv = {}, extraArgs = []) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'rv-breakout-safe-'));
  const statusOut = path.join(tmp, 'status.json');
  const runtimeStatusOut = path.join(tmp, 'runtime-status.json');
  const lockPath = path.join(tmp, 'breakout.lock');
  const run = spawnSync(process.execPath, [
    'scripts/breakout/run-breakout-nightly-safe.mjs',
    '--as-of=2026-04-28',
    `--status-out=${statusOut}`,
    `--runtime-status-out=${runtimeStatusOut}`,
    `--lock-path=${lockPath}`,
    ...extraArgs,
  ], {
    cwd: ROOT,
    encoding: 'utf8',
    env: {
      ...process.env,
      RV_BREAKOUT_V12_DISABLED: '',
      RV_BREAKOUT_V12_LEGACY_FULL_COMPUTE: '',
      RV_BREAKOUT_MIN_FREE_MB: '0',
      QUANT_ROOT: path.join(tmp, 'quant'),
      RV_BREAKOUT_PUBLIC_ROOT: path.join(tmp, 'public'),
      RV_BREAKOUT_BUCKET_COUNT: '2',
      ...extraEnv,
    },
  });
  const status = fs.existsSync(statusOut) ? JSON.parse(fs.readFileSync(statusOut, 'utf8')) : null;
  const runtimeStatus = fs.existsSync(runtimeStatusOut) ? JSON.parse(fs.readFileSync(runtimeStatusOut, 'utf8')) : null;
  fs.rmSync(tmp, { recursive: true, force: true });
  return { run, status, runtimeStatus };
}

function writeJson(filePath, payload) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(payload, null, 2)}\n`);
}

function makePromoteCandidate(root, { asOf = '2026-04-29', generatedAt = '2026-04-30T00:00:00Z', shardSuccess = true } = {}) {
  const candidate = path.join(root, `candidate-${generatedAt.replace(/\W/g, '')}`);
  const publicRoot = path.join(candidate, 'public');
  const shardDir = path.join(publicRoot, 'shards/region=US');
  fs.mkdirSync(shardDir, { recursive: true });
  const item = {
    event_id: 'evt-1',
    asset_id: 'US:A',
    as_of: asOf,
    score_version: 'breakout_scoring_v12_incremental_v1',
    scores: { final_signal_score: 0.75 },
    ui: { rank: 1 },
  };
  const top = {
    schema_version: 'breakout_top_scores_v1',
    as_of: asOf,
    generated_at: generatedAt,
    score_version: 'breakout_scoring_v12_incremental_v1',
    count: 1,
    items: [item],
  };
  writeJson(path.join(candidate, 'validation.json'), {
    schema_version: 'breakout_v12_validation_v1',
    generated_at: generatedAt,
    run_id: path.basename(candidate),
    as_of: asOf,
    ok: true,
    checks: {},
    errors: [],
    warnings: [],
  });
  writeJson(path.join(candidate, 'coverage.json'), {
    schema_version: 'breakout_v12_coverage_v1',
    generated_at: generatedAt,
    run_id: path.basename(candidate),
    as_of: asOf,
    ok: true,
    counts: {},
    errors: [],
  });
  writeJson(path.join(candidate, 'hashes.json'), {
    schema_version: 'breakout_v12_hashes_v1',
    generated_at: generatedAt,
    run_id: path.basename(candidate),
    as_of: asOf,
    public_files: {},
  });
  writeJson(path.join(publicRoot, 'coverage.json'), {
    schema_version: 'breakout_v12_coverage_v1',
    generated_at: generatedAt,
    run_id: path.basename(candidate),
    as_of: asOf,
    ok: true,
    counts: {},
  });
  writeJson(path.join(publicRoot, 'errors.json'), { schema_version: 'breakout_errors_v1', as_of: asOf, errors: [] });
  writeJson(path.join(publicRoot, 'health.json'), { schema_version: 'breakout_health_v1', as_of: asOf, generated_at: generatedAt, status: 'ok', hard_fail: false, alert: false });
  writeJson(path.join(publicRoot, 'top500.json'), top);
  writeJson(path.join(shardDir, 'shard_000.json'), top);
  if (shardSuccess) fs.writeFileSync(path.join(shardDir, 'shard_000._SUCCESS'), 'ok\n');
  return candidate;
}

test('breakout v1.2 schemas compile and required configs exist', () => {
  const ajv = new Ajv({ allErrors: true, strict: false, validateSchema: false });
  for (const rel of [
    'schemas/breakout/manifest.schema.json',
    'schemas/breakout/coverage.schema.json',
    'schemas/breakout/errors.schema.json',
    'schemas/breakout/score.schema.json',
    'schemas/breakout/outcome.schema.json',
  ]) {
    assert.doesNotThrow(() => ajv.compile(readJson(rel)), rel);
  }
  for (const rel of [
    'config/breakout/tradable_universe.v1.yaml',
    'config/breakout/breakout_features.v1.2.yaml',
    'config/breakout/breakout_scoring.v1.2.yaml',
    'config/breakout/outcome_labels.v1.yaml',
    'config/breakout/health_guards.v1.yaml',
  ]) {
    assert.equal(fs.existsSync(path.join(ROOT, rel)), true, rel);
  }
});

test('breakout v12 schemas compile', () => {
  const ajv = new Ajv({ allErrors: true, strict: false, validateSchema: false });
  for (const rel of [
    'schemas/breakout-v12/coverage.schema.json',
    'schemas/breakout-v12/errors.schema.json',
    'schemas/breakout-v12/health.schema.json',
    'schemas/breakout-v12/manifest.schema.json',
    'schemas/breakout-v12/resources.schema.json',
    'schemas/breakout-v12/top500.schema.json',
    'schemas/breakout-v12/validation.schema.json',
  ]) {
    assert.doesNotThrow(() => ajv.compile(readJson(rel)), rel);
  }
});

test('nas data-plane runs breakout_v12 after quantlab report and before snapshot', () => {
  const content = fs.readFileSync(path.join(ROOT, 'scripts/nas/rv-nas-night-supervisor.sh'), 'utf8');
  assert.match(content, /breakout_v12\)/);
  assert.match(content, /run-breakout-nightly-safe\.mjs --as-of='\$TARGET_MARKET_DATE'/);
  assert.doesNotMatch(content, /breakout_v12[\s\S]{0,240}eodhd\.lock/);
  const stepBlock = content.match(/breakout_v12\)\n([\s\S]*?)\n\s*;;/)?.[1] || '';
  assert.doesNotMatch(stepBlock, /run-breakout-pipeline\.mjs/);
  assert.match(content, /optional_step_degraded=breakout_v12/);

  const laneStart = content.indexOf('lane_steps()');
  const laneEnd = content.indexOf('else', laneStart);
  const lane = content.slice(laneStart, laneEnd);
  assert.ok(lane.indexOf('quantlab_daily_report') >= 0);
  assert.ok(lane.indexOf('breakout_v12') > lane.indexOf('quantlab_daily_report'));
  assert.ok(lane.indexOf('snapshot') > lane.indexOf('breakout_v12'));
});

test('breakout nightly safe wrapper disabled mode degrades and exits zero', () => {
  const { run, status, runtimeStatus } = runSafeWrapper({ RV_BREAKOUT_V12_DISABLED: '1' });
  assert.equal(run.status, 0, run.stderr || run.stdout);
  assert.equal(status.status, 'degraded');
  assert.equal(status.reason, 'disabled_by_env');
  assert.equal(status.latest_unchanged, true);
  assert.equal(runtimeStatus.reason, 'disabled_by_env');
});

test('breakout nightly safe wrapper does not run legacy full compute by default', { skip: !hasPythonBreakoutV12() }, () => {
  const { run, status } = runSafeWrapper({ RV_BREAKOUT_PYTHON_BIN: 'python3' });
  assert.equal(run.status, 0, run.stderr || run.stdout);
  assert.equal(status.status, 'degraded');
  assert.equal(status.reason, 'incremental_daily_failed');
  assert.equal(status.latest_unchanged, true);
  assert.equal(status.config.legacy_full_compute_allowed, false);
});

test('breakout nightly safe wrapper dependency failure degrades and exits zero', () => {
  const { run, status } = runSafeWrapper({ RV_BREAKOUT_PYTHON_BIN: '/definitely/missing/python' });
  assert.equal(run.status, 0, run.stderr || run.stdout);
  assert.equal(status.status, 'degraded');
  assert.equal(status.reason, 'dependency_missing');
  assert.equal(status.latest_unchanged, true);
});

test('breakout nightly safe wrapper memory guard degrades and exits zero', { skip: !hasPythonBreakoutV12() }, () => {
  const { run, status } = runSafeWrapper({
    RV_BREAKOUT_PYTHON_BIN: 'python3',
    RV_BREAKOUT_MIN_FREE_MB: '999999999',
  });
  assert.equal(run.status, 0, run.stderr || run.stdout);
  assert.equal(status.status, 'degraded');
  assert.equal(status.reason, 'memory_guard');
  assert.equal(status.latest_unchanged, true);
});

test('breakout nightly safe wrapper requires duckdb before child catchup', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'rv-breakout-python-'));
  const fakePython = path.join(tmp, 'python3');
  fs.writeFileSync(fakePython, '#!/usr/bin/env node\nconst mod = process.argv.slice(2).find((v) => v === "duckdb"); if (mod) { console.log(JSON.stringify({ok:false,missing:[{module:"duckdb",error:"No module named duckdb"}]})); process.exit(1); } console.log(JSON.stringify({ok:true,missing:[]}));\n');
  fs.chmodSync(fakePython, 0o755);
  const { run, status } = runSafeWrapper({ RV_BREAKOUT_PYTHON_BIN: fakePython });
  assert.equal(run.status, 0, run.stderr || run.stdout);
  assert.equal(status.status, 'degraded');
  assert.equal(status.reason, 'dependency_missing');
  assert.equal(status.latest_unchanged, true);
  assert.match(run.stdout, /dependency_missing/);
  fs.rmSync(tmp, { recursive: true, force: true });
});

test('breakout nightly safe wrapper no-ops when as_of already promoted', () => {
  const tmp = fs.mkdtempSync(path.join(ROOT, '.tmp-rv-breakout-already-'));
  const fakePython = path.join(tmp, 'python3');
  fs.writeFileSync(fakePython, '#!/bin/sh\necho \'{"ok":true,"missing":[]}\'\nexit 0\n');
  fs.chmodSync(fakePython, 0o755);
  const publicRoot = path.join(tmp, 'public');
  writeJson(path.join(publicRoot, 'runs/2026-04-28/hash/top500.json'), { schema_version: 'breakout_top_scores_v1', as_of: '2026-04-28', items: [] });
  writeJson(path.join(publicRoot, 'manifests/latest.json'), {
    as_of: '2026-04-28',
    content_hash: 'hash',
    files: { top500: 'runs/2026-04-28/hash/top500.json' },
    validation: { publishable: true },
  });
  const statusOut = path.join(tmp, 'status.json');
  const runtimeStatusOut = path.join(tmp, 'runtime-status.json');
  const run = spawnSync(process.execPath, [
    'scripts/breakout/run-breakout-nightly-safe.mjs',
    '--as-of=2026-04-28',
    `--status-out=${statusOut}`,
    `--runtime-status-out=${runtimeStatusOut}`,
    `--lock-path=${path.join(tmp, 'lock.json')}`,
    `--python-bin=${fakePython}`,
    `--public-root=${publicRoot}`,
  ], {
    cwd: ROOT,
    encoding: 'utf8',
    env: { ...process.env, RV_BREAKOUT_MIN_FREE_MB: '0' },
  });
  const status = JSON.parse(fs.readFileSync(statusOut, 'utf8'));
  assert.equal(run.status, 0, run.stderr || run.stdout);
  assert.equal(status.status, 'ok');
  assert.equal(status.reason, 'already_promoted');
  assert.equal(status.latest_unchanged, true);
  assert.match(run.stdout, /already_promoted/);
  fs.rmSync(tmp, { recursive: true, force: true });
});

test('breakout v12 local daily path uses exact bucket files only', () => {
  const localSource = fs.readFileSync(path.join(ROOT, 'scripts/breakout-v12/compute-local-daily.py'), 'utf8');
  assert.ok(localSource.includes('bucket={bucket_id:03d}.parquet'));
  assert.equal(localSource.includes('scan_parquet'), false);
  assert.equal(localSource.includes('bucket=*'), false);
  assert.equal(localSource.includes('is_in(chunk'), false);
});

test('breakout v12 catchup resolves per-date q1 delta manifests', () => {
  const source = fs.readFileSync(path.join(ROOT, 'scripts/breakout-v12/catchup-daily.mjs'), 'utf8');
  assert.match(source, /q1_daily_delta_\$\{yyyymmdd\(asOf\)\}/);
  assert.match(source, /resolveDeltaManifestForDate\(args,\s*asOf\)/);
  assert.doesNotMatch(source, /latest_success\.json/);
});

test('breakout v12 outcomes wrapper is manual full-scan only', () => {
  const source = fs.readFileSync(path.join(ROOT, 'scripts/breakout-v12/evaluate-promoted-outcomes.mjs'), 'utf8');
  assert.match(source, /RV_BREAKOUT_OUTCOMES_ALLOW_FULL_SCAN/);
  assert.match(source, /scores\.parquet/);
  assert.match(source, /evaluate_outcomes\.py/);
  const pkg = readJson('package.json');
  assert.equal(pkg.scripts['breakout:v12:outcomes'], 'node scripts/breakout-v12/evaluate-promoted-outcomes.mjs');
});

test('breakout v12 production verifier is wired and checks hard readiness facts', () => {
  const source = fs.readFileSync(path.join(ROOT, 'scripts/breakout-v12/verify-production-ready.mjs'), 'utf8');
  assert.match(source, /polars/);
  assert.match(source, /pyarrow/);
  assert.match(source, /duckdb/);
  assert.match(source, /tail bucket count/);
  assert.match(source, /top500 count/);
  assert.match(source, /shard _SUCCESS missing/);
  assert.match(source, /hash mismatch/);
  const pkg = readJson('package.json');
  assert.equal(pkg.scripts['breakout:v12:verify'], 'node scripts/breakout-v12/verify-production-ready.mjs');
});

test('breakout v12 incremental catchup builds, validates, and promotes fixture', { skip: !hasPythonBreakoutV12() }, () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'rv-breakout-inc-'));
  const setup = String.raw`
import hashlib, json, sys
from pathlib import Path
from datetime import date, timedelta
import polars as pl

root=Path(sys.argv[1])
history=root/'history'
history.mkdir(parents=True)
assets=[('US:A','stock',100,2000000),('US:B','stock',50,1000000),('US:SPY','etf',400,10000000),('KO:C','stock',30,700000)]
rows=[]
start=date(2025,1,1)
for aid, cls, base, vol in assets:
    t=0
    cur=start
    while t < 330:
        if cur.weekday() < 5:
            close=base*(1+0.001*t)
            rows.append({'asset_id':aid,'asset_class':cls,'date':cur.isoformat(),'open_raw':close*0.99,'high_raw':close*1.01,'low_raw':close*0.98,'close_raw':close,'volume_raw':vol+(t%9)*1000})
            t+=1
        cur += timedelta(days=1)
pl.DataFrame(rows).write_parquet(history/'part-history.parquet')

def bucket(aid, n):
    return int.from_bytes(hashlib.sha256(aid.encode()).digest()[:8], 'big') % n

raw_delta_root=root/'quant/raw/provider=eodhd/ingest_date=2026-04-28'
(raw_delta_root/'asset_class=stock').mkdir(parents=True)
schema={'asset_id':pl.Utf8,'asset_class':pl.Utf8,'date':pl.Utf8,'open_raw':pl.Float64,'high_raw':pl.Float64,'low_raw':pl.Float64,'close_raw':pl.Float64,'volume_raw':pl.Float64}
delta_rows=[]
for aid, cls, base, vol in assets:
    close=base*1.4
    delta_rows.append({'asset_id':aid,'asset_class':cls,'date':'2026-04-28','open_raw':close*0.99,'high_raw':close*1.04,'low_raw':close*0.98,'close_raw':close,'volume_raw':vol*2})
pl.DataFrame(delta_rows, schema=schema).write_parquet(raw_delta_root/'asset_class=stock/delta_fixture.parquet')
delta_manifest=root/'delta_manifest.json'
delta_manifest.write_text(json.dumps({'schema':'q1_daily_delta_ingest_manifest_v1','ingest_date':'2026-04-28','raw_ingest_root':str(raw_delta_root)}, indent=2)+'\n')
print(json.dumps({'history':str(history),'delta_root':str(root/'quant/breakout-v12/daily-delta'),'delta_manifest':str(delta_manifest)}))
`;
  const py = spawnSync('python3', ['-', tmp], { input: setup, encoding: 'utf8', cwd: ROOT });
  assert.equal(py.status, 0, py.stderr);
  const info = JSON.parse(py.stdout.trim());

  const tail = spawnSync('python3', [
    'scripts/breakout-v12/build-tail-state.py',
    `--history-root=${info.history}`,
    `--output-root=${path.join(tmp, 'last_good')}`,
    '--as-of=2026-04-27',
    '--bucket-count=4',
    '--tail-bars=300',
  ], { cwd: ROOT, encoding: 'utf8', env: { ...process.env, RV_BREAKOUT_MIN_FREE_MB: '0' } });
  assert.equal(tail.status, 0, tail.stderr || tail.stdout);

  const run = spawnSync(process.execPath, [
    'scripts/breakout-v12/catchup-daily.mjs',
    '--as-of=2026-04-28',
    `--quant-root=${path.join(tmp, 'quant')}`,
    `--last-good-root=${path.join(tmp, 'last_good')}`,
    `--daily-delta-root=${info.delta_root}`,
    `--delta-manifest=${info.delta_manifest}`,
    `--public-root=${path.join(tmp, 'public')}`,
    '--bucket-count=4',
    '--tail-bars=300',
    '--python-bin=python3',
  ], { cwd: ROOT, encoding: 'utf8', env: { ...process.env, RV_BREAKOUT_MIN_FREE_MB: '0' } });
  assert.equal(run.status, 0, run.stderr || run.stdout);
  const latest = JSON.parse(fs.readFileSync(path.join(tmp, 'public/manifests/latest.json'), 'utf8'));
  assert.equal(latest.as_of, '2026-04-28');
  assert.equal(latest.validation.publishable, true);
  assert.ok(latest.files.top500);
  const top = JSON.parse(fs.readFileSync(path.join(tmp, 'public', latest.files.top500), 'utf8'));
  assert.ok(top.items.length > 0);
  const internal = JSON.parse(fs.readFileSync(path.join(tmp, 'quant/breakout-v12/last_good.json'), 'utf8'));
  assert.equal(internal.as_of, '2026-04-28');
  assert.ok(fs.existsSync(internal.state_tail_root));
  fs.rmSync(tmp, { recursive: true, force: true });
});

test('breakout v12 promote blocks missing shard success marker', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'rv-breakout-promote-'));
  const candidate = makePromoteCandidate(tmp, { shardSuccess: false });
  const run = spawnSync(process.execPath, [
    'scripts/breakout-v12/promote-candidate.mjs',
    '--as-of=2026-04-29',
    `--candidate-root=${candidate}`,
    `--quant-root=${path.join(tmp, 'quant')}`,
    `--public-root=${path.join(tmp, 'public')}`,
  ], { cwd: ROOT, encoding: 'utf8' });
  assert.notEqual(run.status, 0);
  assert.match(run.stderr, /shard _SUCCESS missing/);
  assert.equal(fs.existsSync(path.join(tmp, 'public/manifests/latest.json')), false);
  fs.rmSync(tmp, { recursive: true, force: true });
});

test('breakout v12 content hash ignores generated timestamps', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'rv-breakout-hash-'));
  const publicRoot = path.join(tmp, 'public');
  const first = makePromoteCandidate(tmp, { generatedAt: '2026-04-30T00:00:00Z' });
  const second = makePromoteCandidate(tmp, { generatedAt: '2026-04-30T01:23:45Z' });
  const a = spawnSync(process.execPath, [
    'scripts/breakout-v12/promote-candidate.mjs',
    '--as-of=2026-04-29',
    `--candidate-root=${first}`,
    `--quant-root=${path.join(tmp, 'quant')}`,
    `--public-root=${publicRoot}`,
  ], { cwd: ROOT, encoding: 'utf8' });
  const b = spawnSync(process.execPath, [
    'scripts/breakout-v12/promote-candidate.mjs',
    '--as-of=2026-04-29',
    `--candidate-root=${second}`,
    `--quant-root=${path.join(tmp, 'quant')}`,
    `--public-root=${publicRoot}`,
  ], { cwd: ROOT, encoding: 'utf8' });
  assert.equal(a.status, 0, a.stderr || a.stdout);
  assert.equal(b.status, 0, b.stderr || b.stdout);
  const hashA = JSON.parse(a.stdout.trim()).content_hash;
  const hashB = JSON.parse(b.stdout.trim()).content_hash;
  assert.equal(hashA, hashB);
  fs.rmSync(tmp, { recursive: true, force: true });
});

test('breakout v12 validate blocks schema-invalid top500', { skip: !hasPythonPolars() }, () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'rv-breakout-invalid-'));
  const asOf = '2026-04-29';
  const candidate = path.join(tmp, 'candidate');
  const localDir = path.join(candidate, `local/date=${asOf}`);
  const globalDir = path.join(candidate, `global/date=${asOf}`);
  fs.mkdirSync(localDir, { recursive: true });
  fs.writeFileSync(path.join(localDir, 'bucket=000.parquet'), 'placeholder');
  fs.writeFileSync(path.join(localDir, 'bucket=000._SUCCESS'), 'ok\n');
  fs.mkdirSync(globalDir, { recursive: true });
  const py = spawnSync('python3', ['-', path.join(globalDir, 'scores.parquet')], {
    cwd: ROOT,
    encoding: 'utf8',
    input: 'import sys, polars as pl\npl.DataFrame({"asset_id":["US:A"],"as_of":["2026-04-29"]}).write_parquet(sys.argv[1])\n',
  });
  assert.equal(py.status, 0, py.stderr);
  fs.writeFileSync(path.join(candidate, 'resources.ndjson'), '{"step":"local","status":"ok","peak_rss_mb":1}\n');
  writeJson(path.join(candidate, 'public/coverage.json'), { schema_version: 'breakout_v12_coverage_v1', run_id: 'candidate', as_of: asOf, ok: true, counts: {} });
  writeJson(path.join(candidate, 'public/errors.json'), { schema_version: 'breakout_errors_v1', as_of: asOf, errors: [] });
  writeJson(path.join(candidate, 'public/health.json'), { schema_version: 'breakout_health_v1', as_of: asOf, status: 'ok', hard_fail: false, alert: false });
  writeJson(path.join(candidate, 'public/top500.json'), { schema_version: 'breakout_top_scores_v1', as_of: asOf, count: 1 });
  writeJson(path.join(candidate, 'public/shards/region=US/shard_000.json'), { schema_version: 'breakout_top_scores_v1', as_of: asOf, score_version: 'x', count: 0, items: [] });
  fs.writeFileSync(path.join(candidate, 'public/shards/region=US/shard_000._SUCCESS'), 'ok\n');
  const run = spawnSync(process.execPath, [
    'scripts/breakout-v12/validate-candidate.mjs',
    `--as-of=${asOf}`,
    `--candidate-root=${candidate}`,
    '--bucket-count=1',
    '--python-bin=python3',
  ], { cwd: ROOT, encoding: 'utf8' });
  assert.equal(run.status, 72, run.stderr || run.stdout);
  const validation = JSON.parse(fs.readFileSync(path.join(candidate, 'validation.json'), 'utf8'));
  assert.equal(validation.ok, false);
  assert.ok(validation.errors.includes('PUBLIC_SCHEMA_INVALID_TOP500'));
  fs.rmSync(tmp, { recursive: true, force: true });
});

test('breakout v12 api falls back to last_good when latest is missing', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url) => {
    const pathname = new URL(url).pathname;
    if (pathname === '/data/breakout/manifests/latest.json') return new Response('', { status: 404 });
    if (pathname === '/data/breakout/manifests/last_good.json') {
      return Response.json({
        as_of: '2026-04-29',
        score_version: 'breakout_scoring_v12_incremental_v1',
        files: { top500: 'runs/2026-04-29/hash/top500.json' },
      });
    }
    if (pathname === '/data/breakout/runs/2026-04-29/hash/top500.json') {
      return Response.json({ schema_version: 'breakout_top_scores_v1', as_of: '2026-04-29', score_version: 'breakout_scoring_v12_incremental_v1', count: 0, items: [] });
    }
    return new Response('', { status: 404 });
  };
  try {
    const mod = await import(`${pathToFileURL(path.join(ROOT, 'functions/api/breakout-v12.js')).href}?cache=${Date.now()}`);
    const response = await mod.onRequestGet({ request: new Request('https://example.com/api/breakout-v12') });
    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.equal(payload.ok, true);
    assert.equal(payload.data.manifest.as_of, '2026-04-29');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('breakout v12 api falls back to last_good when latest is not publishable', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url) => {
    const pathname = new URL(url).pathname;
    if (pathname === '/data/breakout/manifests/latest.json') {
      return Response.json({
        as_of: '2026-04-29',
        validation: { publishable: false },
        files: { top500: 'runs/2026-04-29/bad/top500.json' },
      });
    }
    if (pathname === '/data/breakout/manifests/last_good.json') {
      return Response.json({
        as_of: '2026-04-28',
        validation: { publishable: true },
        files: { top500: 'runs/2026-04-28/good/top500.json' },
      });
    }
    if (pathname === '/data/breakout/runs/2026-04-28/good/top500.json') {
      return Response.json({ schema_version: 'breakout_top_scores_v1', as_of: '2026-04-28', count: 0, items: [] });
    }
    return new Response('', { status: 404 });
  };
  try {
    const mod = await import(`${pathToFileURL(path.join(ROOT, 'functions/api/breakout-v12.js')).href}?cache=${Date.now()}`);
    const response = await mod.onRequestGet({ request: new Request('https://example.com/api/breakout-v12') });
    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.equal(payload.ok, true);
    assert.equal(payload.data.manifest.as_of, '2026-04-28');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('stock product paths expose static breakout_v12 and keep legacy comparison non-canonical', () => {
  const source = fs.readFileSync(path.join(ROOT, 'functions/api/_shared/data-interface.js'), 'utf8');
  assert.doesNotMatch(source, /processTickerSeries\(effectiveTicker,\s*bars\)/);
  assert.match(source, /processTickerSeries\(bars,\s*\{\},\s*\{\s*regime_tag:\s*'UP'\s*\}\)/);
  assert.match(source, /breakout_v12:\s*breakoutV12/);
  assert.match(source, /breakout_v2_legacy:\s*breakoutV2/);
  assert.match(source, /breakout_v2:\s*toBreakoutV2Compat\(breakoutV12\)/);
  assert.match(source, /fetchBreakoutV12ForRequest\(request,\s*env/);
  assert.match(source, /\/data\/breakout\/manifests\/latest\.json/);

  const stockSource = fs.readFileSync(path.join(ROOT, 'functions/api/stock.js'), 'utf8');
  assert.match(stockSource, /breakout_v12:\s*breakoutV12/);
  assert.match(stockSource, /breakout_v2_legacy:\s*breakoutV2Legacy/);
  assert.match(stockSource, /breakout_v2:\s*toBreakoutV2Compat\(breakoutV12\)/);
  assert.doesNotMatch(stockSource, /breakoutState:\s*payload\.data\?\.breakout_v2\?\.state/);

  const guard = fs.readFileSync(path.join(ROOT, 'public/js/stock-data-guard.js'), 'utf8');
  assert.match(guard, /data\.breakout_v12 \|\| data\.breakout_v2/);
  const page = fs.readFileSync(path.join(ROOT, 'public/stock.html'), 'utf8');
  assert.match(page, /data\.breakout_v12 \|\| data\.breakout_v2/);
});

test('breakout v1.2 dry-run publishes no state or probability fields', { skip: !hasPythonPolars() }, () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'rv-breakout-test-'));
  const fixture = String.raw`
import json, sys
from pathlib import Path
from datetime import date, timedelta
import polars as pl
root=Path(sys.argv[1])
snap=root/'data/snapshots/snapshot_id=test'
bars=snap/'bars/asset_class=stock'
bars.mkdir(parents=True)
rows=[]
start=date(2024,6,1)
assets=[('US:A','stock','US','Technology',100,2000000),('US:B','stock','US','Technology',50,1000000),('US:SPY','etf','US','Benchmark',400,10000000),('KO:IDX','index','ASIA','Benchmark',300,0)]
for aid, cls, region, sector, base, vol in assets:
    t=0
    for i in range(540):
        d=start+timedelta(days=i)
        if d.weekday()>=5:
            continue
        close=base*(1+0.001*t)
        if aid=='US:A' and t>250:
            close=base*(1+0.001*250)+0.08*(t-250)
        rows.append({'asset_id':aid,'asset_class':cls,'date':d.isoformat(),'open_raw':close*0.99,'high_raw':close*1.01,'low_raw':close*0.98,'close_raw':close,'volume_raw':vol+(t%7)*1000})
        t+=1
pl.DataFrame(rows).write_parquet(bars/'part-fixture.parquet')
universe=[]
for aid, cls, region, sector, base, vol in assets:
    universe.append({'asset_id':aid,'asset_class':cls,'symbol':aid.split(':')[-1],'name':aid,'exchange':aid.split(':')[0],'region':region,'sector':sector,'bars_count':380,'adv20_dollar':base*vol})
pl.DataFrame(universe).write_parquet(snap/'universe.parquet')
manifest={'snapshot_id':'test','asof_date':'2025-11-21','artifacts':{'bars_dataset_root':str(snap/'bars'),'universe_parquet':str(snap/'universe.parquet')}}
(snap/'snapshot_manifest.json').write_text(json.dumps(manifest, indent=2)+'\n')
`;
  const py = spawnSync('python3', ['-', tmp], { input: fixture, encoding: 'utf8', cwd: ROOT });
  assert.equal(py.status, 0, py.stderr);
  const scopeFile = path.join(tmp, 'assets.index_core.canonical.ids.json');
  writeJson(scopeFile, { schema_version: 'rv_v7_scope_canonical_ids_v1', canonical_ids: ['US:A', 'US:B', 'US:SPY'] });

  const run = spawnSync(process.execPath, [
    'scripts/breakout/run-breakout-pipeline.mjs',
    '--dry-run',
    '--keep-temp',
    `--quant-root=${tmp}`,
    '--snapshot-id=test',
    '--as-of=2025-11-21',
    `--scope-file=${scopeFile}`,
  ], { cwd: ROOT, encoding: 'utf8' });
  assert.equal(run.status, 0, run.stderr || run.stdout);
  const workDir = /work_dir=([^ ]+)/.exec(run.stdout)?.[1];
  assert.ok(workDir, run.stdout);
  const manifest = JSON.parse(fs.readFileSync(path.join(workDir, 'manifest.dry-run.json'), 'utf8'));
  assert.equal(manifest.contract_version, 'breakout_manifest_v1');
  assert.equal(manifest.validation.publishable, true);
  assert.ok(manifest.files.legacy_comparison);
  const top = JSON.parse(fs.readFileSync(path.join(workDir, 'public_candidate/top500.json'), 'utf8'));
  assert.ok(top.items.length > 0);
  for (const item of top.items) {
    assert.equal(Object.hasOwn(item, 'state'), false);
    assert.equal(Object.hasOwn(item, 'probability'), false);
    assert.equal(Object.hasOwn(item, 'ml_score'), false);
  }
  fs.rmSync(workDir, { recursive: true, force: true });
  fs.rmSync(tmp, { recursive: true, force: true });
});
