import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(new URL('..', import.meta.url).pathname, '..');

function readRepoFile(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
}

test('hist-probs shard loader prefers gzip shard before legacy json fallback', () => {
  const source = readRepoFile('scripts/lib/best-setups-local-loader.mjs');
  const gzipIndex = source.indexOf('public/data/eod/history/shards/${shard}.json.gz');
  const jsonIndex = source.indexOf('public/data/eod/history/shards/${shard}.json`');
  assert.ok(gzipIndex > 0, 'gzip shard path missing');
  assert.ok(jsonIndex > gzipIndex, 'legacy json fallback must stay after gzip path');
  assert.match(source, /readJsonGzAbs\(shardGzPath\)/);
  assert.match(source, /shard_plain_json_fallback/);
});

test('hist-probs output is compact by default and pretty only behind debug env', () => {
  const source = readRepoFile('scripts/lib/hist-probs/compute-outcomes.mjs');
  assert.match(source, /HIST_PROBS_PRETTY_JSON/);
  assert.match(source, /PRETTY_OUTPUT \? JSON\.stringify\(result, null, 2\) : JSON\.stringify\(result\)/);
});

test('hist-probs skip hotpath uses checkpoint freshness without full output reads by default', () => {
  const source = readRepoFile('run-hist-probs-turbo.mjs');
  assert.match(source, /HIST_PROBS_SKIP_FULL_JSON_FALLBACK/);
  assert.match(source, /inspectCheckpointFreshness\(checkpointStore, entry\)/);
  assert.match(source, /skip_full_json_read_count/);
  assert.match(source, /full_json_reads/);
  assert.match(source, /state_index_hit_count/);
});

test('hist-probs workset blocks unknown decisions', () => {
  const source = readRepoFile('run-hist-probs-turbo.mjs');
  assert.match(source, /decision = 'UNKNOWN'/);
  assert.match(source, /hist_probs_workset_unknown/);
  assert.match(source, /UNKNOWN/);
});

test('buy breadth proof separates available-region and displayed-row targets', () => {
  const source = readRepoFile('scripts/decision-core/build-buy-breadth-proof.mjs');
  assert.match(source, /RV_BUY_BREADTH_AVAILABLE_REGION_TARGET/);
  assert.match(source, /RV_BUY_BREADTH_DISPLAY_REGION_TARGET/);
  assert.match(source, /BUY_BREADTH_EU_DISPLAY_BELOW_TARGET/);
  assert.match(source, /available_region_targets/);
});

test('daily learning streams forecast monthly gzip instead of full string inflate', () => {
  const source = readRepoFile('scripts/learning/run-daily-learning-cycle.mjs');
  assert.match(source, /readNdjsonGzFiltered/);
  assert.match(source, /createReadStream\(p\)\.pipe\(zlib\.createGunzip\(\)\)/);
  assert.match(source, /forecastRowDateMatches/);
  assert.match(source, /await extractForecastPredictions/);
});

test('final integrity treats partial hist-probs as release green when coverage gates pass', () => {
  const source = readRepoFile('scripts/ops/final-integrity-seal.mjs');
  assert.match(source, /catchupReleaseOk/);
  assert.match(source, /catchup === 'partial'/);
  assert.match(source, /coverage >= minCoverage/);
  assert.match(source, /artifactFreshness >= minCoverage/);
});
