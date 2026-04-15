import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  loadCheckpoints,
  saveCheckpoints,
  setTickerState,
  needsColdRebuild,
} from '../../scripts/lib/hist-probs/checkpoint-store.mjs';
import {
  buildStateSnapshot,
  writeStateSnapshot,
  readStateSnapshot,
} from '../../scripts/lib/hist-probs/state-snapshot.mjs';

describe('hist-probs resume', () => {
  it('forces cold rebuild on version mismatch', () => {
    const store = loadCheckpoints(path.join(os.tmpdir(), `hist-probs-checkpoints-${Date.now()}.json`));
    setTickerState(store, 'AAPL', {
      status: 'processed',
      latest_date: '2026-04-09',
      schema_version: 'old',
      feature_core_version: 'hist_probs_feature_core_v0',
      outcome_logic_version: 'hist_probs_outcome_logic_v0',
      computed_at: '2026-04-10T00:00:00Z',
    });

    const result = needsColdRebuild(store, 'AAPL', {
      schema_version: 'rv_hist_probs_run_summary_v2',
      feature_core_version: 'hist_probs_feature_core_v1',
      outcome_logic_version: 'hist_probs_outcome_logic_v1',
    });

    assert.equal(result.needsRebuild, true);
    assert.match(result.reason, /mismatch/i);
  });

  it('writes and reads state snapshots from checkpoint data', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hist-probs-snapshot-'));
    const checkpointPath = path.join(tmpDir, 'checkpoints.json');
    const snapshotDir = path.join(tmpDir, 'snapshots');
    const store = loadCheckpoints(checkpointPath);
    setTickerState(store, 'AAPL', {
      status: 'processed',
      latest_date: '2026-04-09',
      schema_version: 'rv_hist_probs_run_summary_v2',
      feature_core_version: 'hist_probs_feature_core_v1',
      outcome_logic_version: 'hist_probs_outcome_logic_v1',
      computed_at: '2026-04-10T00:00:00Z',
    });
    saveCheckpoints(store, checkpointPath);

    const snapshot = buildStateSnapshot(store, {
      ran_at: '2026-04-10T00:00:00Z',
      schema_version: 'rv_hist_probs_run_summary_v2',
      feature_core_version: 'hist_probs_feature_core_v1',
      outcome_logic_version: 'hist_probs_outcome_logic_v1',
      source_mode: 'us_eu_scope',
      asset_classes: ['ETF', 'STOCK'],
      tickers_total: 1,
      tickers_covered: 1,
      tickers_remaining: 0,
      tickers_errors: 0,
    });
    writeStateSnapshot(snapshot, snapshotDir);
    const latest = readStateSnapshot(snapshotDir);

    assert.equal(latest?.schema, 'rv_hist_probs_state_snapshot_v1');
    assert.equal(latest?.ticker_count, 1);
    assert.equal(latest?.tickers?.[0]?.ticker, 'AAPL');
  });
});
