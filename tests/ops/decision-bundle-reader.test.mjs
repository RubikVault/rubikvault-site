import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import { readDecisionForTicker, clearDecisionBundleReaderCache } from '../../functions/api/_shared/decision-bundle-reader.js';
import {
  decisionHash,
  hashMod64,
  partName,
} from '../../scripts/lib/decision-bundle-contract.mjs';

function writeJson(filePath, payload) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
}

test('decision bundle reader resolves symbol to partition and verifies hash', async () => {
  clearDecisionBundleReaderCache();
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'rv-decision-reader-'));
  const snapshotPath = '/data/decisions/snapshots/2026-04-16/dec-20260416-testhash0001';
  const snapshotDir = path.join(root, 'public', snapshotPath.slice(1));
  const decision = {
    schema: 'rv.asset_daily_decision.v1',
    schema_version: '1.0',
    run_id: 'run',
    snapshot_id: 'dec-20260416-testhash0001',
    target_market_date: '2026-04-16',
    generated_at: '2026-04-17T06:00:00Z',
    canonical_id: 'US:AAPL',
    symbol: 'AAPL',
    asset_class: 'STOCK',
    tradability: true,
    evaluation_role: 'tradable',
    coverage_class: 'eligible',
    pipeline_status: 'OK',
    verdict: 'WAIT',
    reason_codes: ['risk_known'],
    blocking_reasons: [],
    warnings: [],
    risk_assessment: { level: 'LOW', score: 20, reasoning: 'fixture' },
    model_coverage: { bars: 'OK' },
    data_freshness: { bars_as_of: '2026-04-16' },
    input_fingerprints: {},
  };
  const partition = hashMod64('US:AAPL');
  const part = partName(partition);
  const index = {
    schema: 'rv.decision_bundle_index.v1',
    schema_version: '1.0',
    partition_strategy: 'hash_mod_64',
    target_market_date: '2026-04-16',
    assets: {
      'US:AAPL': {
        symbol: 'AAPL',
        asset_class: 'STOCK',
        partition,
        part,
        decision_hash: decisionHash(decision),
      },
    },
    symbols: {
      AAPL: ['US:AAPL'],
    },
  };
  fs.mkdirSync(snapshotDir, { recursive: true });
  fs.writeFileSync(path.join(snapshotDir, part), zlib.gzipSync(`${JSON.stringify(decision)}\n`));
  writeJson(path.join(snapshotDir, 'index.json'), index);
  writeJson(path.join(root, 'public/data/decisions/latest.json'), {
    schema: 'rv.decision_bundle_latest.v1',
    schema_version: '1.0',
    status: 'OK',
    snapshot_id: 'dec-20260416-testhash0001',
    run_id: 'run',
    target_market_date: '2026-04-16',
    generated_at: '2026-04-17T06:00:00Z',
    valid_until: '2099-01-01T00:00:00Z',
    snapshot_path: snapshotPath,
    index_path: `${snapshotPath}/index.json`,
    blocking_reasons: [],
    warnings: [],
  });

  const result = await readDecisionForTicker('AAPL', { rootDir: root });
  assert.equal(result.ok, true);
  assert.equal(result.decision.canonical_id, 'US:AAPL');
  assert.equal(result.analysis_readiness.status, 'OK');
});

test('decision bundle reader returns synthetic incomplete decision when bundle is missing', async () => {
  clearDecisionBundleReaderCache();
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'rv-decision-reader-missing-'));
  const result = await readDecisionForTicker('AAPL', { rootDir: root });
  assert.equal(result.ok, false);
  assert.equal(result.decision.verdict, 'WAIT_PIPELINE_INCOMPLETE');
  assert.deepEqual(result.decision.blocking_reasons, ['bundle_missing']);
  assert.equal(result.analysis_readiness.status, 'FAILED');
});
