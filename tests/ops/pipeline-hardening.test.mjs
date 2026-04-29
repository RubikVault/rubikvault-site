import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import { readHistoryPackRows } from '../../scripts/lib/history-pack-overlay.mjs';

const ROOT = path.resolve(new URL('../..', import.meta.url).pathname);

function writeNdjsonGz(filePath, rows) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, zlib.gzipSync(`${rows.map((row) => JSON.stringify(row)).join('\n')}\n`));
}

test('history overlay reader keeps base behavior unless deltas are enabled', async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'rv-history-overlay-'));
  const relPack = 'history/US/a/sample.ndjson.gz';
  writeNdjsonGz(path.join(tmp, 'mirrors/universe-v7', relPack), [
    { canonical_id: 'US:A', bars: [{ date: '2026-04-27', close: 1 }, { date: '2026-04-28', close: 2 }] },
  ]);
  writeNdjsonGz(path.join(tmp, 'mirrors/universe-v7/history-deltas', `${relPack}.delta-2026-04-28.ndjson.gz`), [
    { canonical_id: 'US:A', bars: [{ date: '2026-04-28', close: 20 }, { date: '2026-04-29', close: 3 }] },
  ]);

  const baseOnly = await readHistoryPackRows(tmp, relPack, { includeDeltas: false });
  assert.deepEqual(baseOnly[0].bars.map((bar) => [bar.date, bar.close]), [
    ['2026-04-27', 1],
    ['2026-04-28', 2],
  ]);

  const overlay = await readHistoryPackRows(tmp, relPack, { includeDeltas: true });
  assert.deepEqual(overlay[0].bars.map((bar) => [bar.date, bar.close]), [
    ['2026-04-27', 1],
    ['2026-04-28', 20],
    ['2026-04-29', 3],
  ]);
});

test('night supervisor exposes safe hardening flags without changing default data semantics', () => {
  const content = fs.readFileSync(path.join(ROOT, 'scripts/nas/rv-nas-night-supervisor.sh'), 'utf8');
  const env = fs.readFileSync(path.join(ROOT, 'scripts/nas/nas-env.sh'), 'utf8');
  assert.match(content, /perf_wrapped_command/);
  assert.match(content, /RV_STEP_RESOURCE_SAMPLES:-1/);
  assert.match(content, /--resources-ndjson "\$step_dir\/resources\.ndjson"/);
  assert.match(content, /--write-mode '\$\{RV_HISTORY_WRITE_MODE:-merge\}'/);
  assert.match(content, /--workers '\$\{RV_Q1_WORKERS:-1\}'/);
  assert.match(env, /RV_CLOUDFLARE_ENV_FILE/);
  assert.match(env, /CLOUDFLARE_API_TOKEN/);
});

test('history refresh supports merge default plus shadow delta artifacts', () => {
  const refresh = fs.readFileSync(path.join(ROOT, 'scripts/quantlab/refresh_v7_history_from_eodhd.py'), 'utf8');
  assert.match(refresh, /choices=\["merge", "delta-shadow", "delta"\]/);
  assert.match(refresh, /default=os\.environ\.get\("RV_HISTORY_WRITE_MODE", "merge"\)/);
  assert.match(refresh, /def write_delta_pack/);
  assert.match(refresh, /history_effective_sha256/);

  const apply = fs.readFileSync(path.join(ROOT, 'scripts/ops/apply-history-touch-report-to-registry.mjs'), 'utf8');
  assert.match(apply, /history_effective_sha256/);
});

test('q1 ingest keeps worker rollout serial by default and can opt into delta reads', () => {
  const content = fs.readFileSync(path.join(ROOT, 'scripts/quantlab/run_daily_delta_ingest_q1.py'), 'utf8');
  assert.match(content, /--workers/);
  assert.match(content, /effective_workers = 1/);
  assert.match(content, /serial_parent_writes/);
  assert.match(content, /--read-history-deltas/);
  assert.match(content, /iter_history_pack_records/);
});

test('forecast generate phase records load/generate/write timings', () => {
  const content = fs.readFileSync(path.join(ROOT, 'scripts/forecast/run_daily.mjs'), 'utf8');
  assert.match(content, /timings\.load_price_history_ms/);
  assert.match(content, /timings\.generate_forecasts_ms/);
  assert.match(content, /timings\.write_forecast_records_ms/);
  assert.match(content, /timings_ms: timings/);
});

test('hist probs rescue flags support freshness budget and tiered catchup', () => {
  const runner = fs.readFileSync(path.join(ROOT, 'run-hist-probs-turbo.mjs'), 'utf8');
  assert.match(runner, /HIST_PROBS_FRESHNESS_BUDGET_TRADING_DAYS/);
  assert.match(runner, /HIST_PROBS_MAX_TICKERS/);
  assert.match(runner, /HIST_PROBS_TIER/);
  assert.match(runner, /HIST_PROBS_PROTECTED_TICKERS = new Set\(\['T', 'AAPL', 'MSFT', 'F', 'V', 'TSLA', 'SPY', 'QQQ', 'BRK-B', 'BRK\.B', 'BF-B', 'BF\.B'\]\)/);
  assert.match(runner, /budget_fresh_existing_files/);

  const supervisor = fs.readFileSync(path.join(ROOT, 'scripts/nas/rv-nas-night-supervisor.sh'), 'utf8');
  assert.match(supervisor, /HIST_PROBS_FRESHNESS_BUDGET_TRADING_DAYS='\$\{RV_HIST_PROBS_FRESHNESS_BUDGET_TRADING_DAYS:-2\}'/);
  assert.match(supervisor, /HIST_PROBS_TIER='\$\{RV_HIST_PROBS_TIER:-all\}'/);
  assert.match(supervisor, /nas-hist-probs-worker-guard\.mjs/);
  assert.match(supervisor, /HIST_PROBS_WORKERS='\$\{RV_HIST_PROBS_WORKERS:-3\}'/);
  assert.match(supervisor, /HIST_PROBS_WORKER_BATCH_SIZE='\$\{RV_HIST_PROBS_WORKER_BATCH_SIZE:-50\}'/);
  assert.match(supervisor, /build-hist-probs-public-projection\.mjs/);

  const freshness = fs.readFileSync(path.join(ROOT, 'scripts/ops/build-data-freshness-report.mjs'), 'utf8');
  assert.match(freshness, /histProbsReadCandidates/);
  assert.match(freshness, /budget_fresh_count/);
});

test('page core smoke validates candidate artifacts without localhost runtime', () => {
  const supervisor = fs.readFileSync(path.join(ROOT, 'scripts/nas/rv-nas-night-supervisor.sh'), 'utf8');
  assert.match(supervisor, /--page-core-only/);
  assert.match(supervisor, /--page-core-latest-path public\/data\/page-core\/candidates\/latest\.candidate\.json/);

  const truth = fs.readFileSync(path.join(ROOT, 'scripts/ops/build-ui-field-truth-report.mjs'), 'utf8');
  assert.match(truth, /pageCoreOnly/);
  assert.match(truth, /readPageCoreSmokeLocal/);
  assert.match(truth, /PAGE_CORE_SCHEMA/);

  const releaseGate = fs.readFileSync(path.join(ROOT, 'scripts/ops/release-gate-check.mjs'), 'utf8');
  assert.match(releaseGate, /DEFAULT_CLOUDFLARE_ENV_PATH/);
  assert.match(releaseGate, /loadSecretEnvFile/);
  assert.match(releaseGate, /\*\\.pages\\.dev/);
  assert.match(releaseGate, /pageCoreOnly: true/);
  assert.match(releaseGate, /preview deploy did not return a deployment URL/);

  const envelope = fs.readFileSync(path.join(ROOT, 'functions/api/_shared/envelope.js'), 'utf8');
  assert.match(envelope, /"expired"/);

  const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'config/runtime-manifest.json'), 'utf8'));
  const pageCoreManifest = manifest.allow.find((entry) => entry.class === 'page-core-manifest');
  assert.ok(pageCoreManifest.maxFileSizeBytes >= 65536);
});
