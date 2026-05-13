import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { guardModelConsensus } from '../../public/js/stock-data-guard.js';
import { buildStockUiState } from '../../public/js/stock-page-view-model.js';

const ROOT = path.resolve(new URL('../..', import.meta.url).pathname);

function tmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'rv-model-projection-'));
}

function writeJson(filePath, doc) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(doc, null, 2)}\n`, 'utf8');
}

test('scientific per-asset projection is current only for scoped STOCK rows', () => {
  const dir = tmpDir();
  const scope = path.join(dir, 'scope.json');
  const rows = path.join(dir, 'rows.json');
  const source = path.join(dir, 'stock-analysis.json');
  const out = path.join(dir, 'scientific');
  writeJson(scope, { canonical_ids: ['US:AAA', 'US:SPY', 'US:DJI.INDX'] });
  writeJson(rows, [
    { canonical_id: 'US:AAA', symbol: 'AAA', type_norm: 'STOCK', name: 'AAA Corp' },
    { canonical_id: 'US:SPY', symbol: 'SPY', type_norm: 'ETF', name: 'SPY ETF' },
    { canonical_id: 'US:DJI.INDX', symbol: 'DJI.INDX', type_norm: 'INDEX', name: 'Dow Jones' },
  ]);
  writeJson(source, {
    _meta: { generated_at: '2026-05-13T08:00:00.000Z', dependency_marketphase_deep_status: 'ok' },
    AAA: { probability: 0.61, setup: { fulfilled: true, score: 80 }, trigger: { fulfilled: false, score: 25 } },
  });
  execFileSync(process.execPath, [
    path.join(ROOT, 'scripts/ops/build-scientific-per-asset-projection.mjs'),
    '--target-market-date=2026-05-12',
    `--scope-file=${scope}`,
    `--rows-file=${rows}`,
    `--source=${source}`,
    `--out-root=${out}`,
  ], { cwd: ROOT, stdio: 'pipe' });
  const latest = JSON.parse(fs.readFileSync(path.join(out, 'latest.json'), 'utf8'));
  assert.equal(latest.scope_count, 3);
  assert.equal(latest.counts.ok, 1);
  assert.equal(latest.counts.not_applicable, 2);
});

test('quantlab legacy top-ideas coverage is typed not-applicable outside current per-asset scope', () => {
  const dir = tmpDir();
  const scope = path.join(dir, 'scope.json');
  const rows = path.join(dir, 'rows.json');
  const qroot = path.join(dir, 'quantlab');
  const out = path.join(dir, 'coverage');
  writeJson(scope, { canonical_ids: ['US:AAA', 'US:BBB', 'US:CCC', 'US:SPY', 'US:DJI.INDX'] });
  writeJson(rows, [
    { canonical_id: 'US:AAA', symbol: 'AAA', type_norm: 'STOCK' },
    { canonical_id: 'US:BBB', symbol: 'BBB', type_norm: 'STOCK' },
    { canonical_id: 'US:CCC', symbol: 'CCC', type_norm: 'STOCK' },
    { canonical_id: 'US:SPY', symbol: 'SPY', type_norm: 'ETF' },
    { canonical_id: 'US:DJI.INDX', symbol: 'DJI.INDX', type_norm: 'INDEX' },
  ]);
  writeJson(path.join(qroot, 'latest.json'), { schema: 'rv_quantlab_stock_publish_meta_v2', asOfDate: '2026-04-20' });
  writeJson(path.join(qroot, 'stocks/A.json'), {
    byTicker: { AAA: { ticker: 'AAA', assetId: 'US:AAA', assetClass: 'stock', asOfDate: '2026-04-20' } },
  });
  writeJson(path.join(qroot, 'etfs/S.json'), {
    byTicker: { SPY: { ticker: 'SPY', assetId: 'US:SPY', assetClass: 'etf', asOfDate: '2026-05-12' } },
  });
  execFileSync(process.execPath, [
    path.join(ROOT, 'scripts/ops/build-quantlab-model-coverage.mjs'),
    '--target-market-date=2026-05-12',
    `--scope-file=${scope}`,
    `--rows-file=${rows}`,
    `--quantlab-root=${qroot}`,
    `--out-root=${out}`,
  ], { cwd: ROOT, stdio: 'pipe' });
  const latest = JSON.parse(fs.readFileSync(path.join(out, 'latest.json'), 'utf8'));
  assert.equal(latest.scope_count, 5);
  assert.equal(latest.coverage_policy.mode, 'top_ideas_legacy');
  assert.equal(latest.coverage_policy.required_for_operational, false);
  assert.equal(latest.counts.stale, 0);
  assert.equal(latest.counts.ok, 1);
  assert.equal(latest.counts.not_applicable, 4);
});

test('not-applicable models are not counted as missing required model evidence', () => {
  const ev4 = {
    input_states: {
      quantlab: { status: 'ok' },
      forecast: { status: 'not_applicable', reason: 'forecast_model_stock_only' },
      scientific: { status: 'not_applicable', reason: 'scientific_model_stock_only' },
    },
  };
  const consensus = guardModelConsensus({}, ev4);
  assert.equal(consensus.valid, true);
  assert.equal(consensus.degraded, false);
  assert.equal(consensus.available, 1);
  assert.equal(consensus.total, 1);
  assert.deepEqual(consensus.missingModels, []);

  const stockUi = buildStockUiState({
    payload: { evaluation_v4: ev4 },
    modelEvidenceLimited: consensus.degraded,
    missingModels: consensus.missingModels,
  });
  assert(stockUi.trustChips.includes('Models: 1/1'));

  const indexUi = buildStockUiState({
    payload: {
      evaluation_v4: {
        input_states: {
          quantlab: { status: 'not_applicable' },
          forecast: { status: 'not_applicable' },
          scientific: { status: 'not_applicable' },
        },
      },
    },
  });
  assert(indexUi.trustChips.includes('Models: N/A'));
});
