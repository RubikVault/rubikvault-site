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
  assert.match(content, /run-breakout-pipeline\.mjs --as-of='\$TARGET_MARKET_DATE'/);
  assert.doesNotMatch(content, /breakout_v12[\s\S]{0,240}eodhd\.lock/);

  const laneMatch = content.match(/lane_steps\(\)[\s\S]*?printf '%s\\n' \\\n([\s\S]*?)\n  else/);
  assert.ok(laneMatch);
  const lane = laneMatch[1];
  assert.ok(lane.indexOf('quantlab_daily_report') < lane.indexOf('breakout_v12'));
  assert.ok(lane.indexOf('breakout_v12') < lane.indexOf('snapshot'));
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
