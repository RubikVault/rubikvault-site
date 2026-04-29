import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
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

test('breakout v1.2 schemas compile and required configs exist', () => {
  const ajv = new Ajv({ allErrors: true, strict: false });
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

test('nas data-plane runs breakout_v12 after quantlab report and before snapshot', () => {
  const content = fs.readFileSync(path.join(ROOT, 'scripts/nas/rv-nas-night-supervisor.sh'), 'utf8');
  assert.match(content, /breakout_v12\)/);
  assert.match(content, /run-breakout-nightly-safe\.mjs --as-of='\$TARGET_MARKET_DATE'/);
  assert.doesNotMatch(content, /breakout_v12[\s\S]{0,240}eodhd\.lock/);
  const stepBlock = content.match(/breakout_v12\)\n([\s\S]*?)\n\s*;;/)?.[1] || '';
  assert.doesNotMatch(stepBlock, /run-breakout-pipeline\.mjs/);
  assert.match(content, /optional_step_degraded=breakout_v12/);

  const laneMatch = content.match(/lane_steps\(\)[\s\S]*?printf '%s\\n' \\\n([\s\S]*?)\n  else/);
  assert.ok(laneMatch);
  const lane = laneMatch[1];
  assert.ok(lane.indexOf('quantlab_daily_report') < lane.indexOf('breakout_v12'));
  assert.ok(lane.indexOf('breakout_v12') < lane.indexOf('snapshot'));
});

test('breakout nightly safe wrapper disabled mode degrades and exits zero', () => {
  const { run, status, runtimeStatus } = runSafeWrapper({ RV_BREAKOUT_V12_DISABLED: '1' });
  assert.equal(run.status, 0, run.stderr || run.stdout);
  assert.equal(status.status, 'degraded');
  assert.equal(status.reason, 'disabled_by_env');
  assert.equal(status.latest_unchanged, true);
  assert.equal(runtimeStatus.reason, 'disabled_by_env');
});

test('breakout nightly safe wrapper does not run legacy full compute by default', { skip: !hasPythonPolars() }, () => {
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

test('breakout nightly safe wrapper memory guard degrades and exits zero', { skip: !hasPythonPolars() }, () => {
  const { run, status } = runSafeWrapper({
    RV_BREAKOUT_PYTHON_BIN: 'python3',
    RV_BREAKOUT_MIN_FREE_MB: '999999999',
  });
  assert.equal(run.status, 0, run.stderr || run.stdout);
  assert.equal(status.status, 'degraded');
  assert.equal(status.reason, 'memory_guard');
  assert.equal(status.latest_unchanged, true);
});

test('breakout v12 local daily path uses exact bucket files only', () => {
  const localSource = fs.readFileSync(path.join(ROOT, 'scripts/breakout-v12/compute-local-daily.py'), 'utf8');
  assert.ok(localSource.includes('bucket={bucket_id:03d}.parquet'));
  assert.equal(localSource.includes('scan_parquet'), false);
  assert.equal(localSource.includes('bucket=*'), false);
  assert.equal(localSource.includes('is_in(chunk'), false);
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

  const run = spawnSync(process.execPath, [
    'scripts/breakout/run-breakout-pipeline.mjs',
    '--dry-run',
    '--keep-temp',
    `--quant-root=${tmp}`,
    '--snapshot-id=test',
    '--as-of=2025-11-21',
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
