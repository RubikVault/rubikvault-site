import test from 'node:test';
import assert from 'node:assert/strict';
import { validateControlPlaneConsistency } from '../../scripts/ops/pipeline-artifact-contract.mjs';

test('control-plane consistency fails when target dates diverge', () => {
  const result = validateControlPlaneConsistency({
    release: { run_id: 'r1', target_date: '2026-04-10' },
    runtime: { run_id: 'r1', target_market_date: '2026-04-10' },
    epoch: { run_id: 'r1', target_market_date: '2026-04-09', pipeline_ok: true },
  });
  assert.equal(result.ok, false);
  assert.equal(result.blocking_reasons.some((item) => item.id === 'target_market_date_mismatch'), true);
});

test('control-plane consistency fails when run ids diverge', () => {
  const result = validateControlPlaneConsistency({
    release: { run_id: 'r1', target_date: '2026-04-10' },
    runtime: { run_id: 'r2', target_market_date: '2026-04-10' },
  });
  assert.equal(result.ok, false);
  assert.equal(result.blocking_reasons.some((item) => item.id === 'run_id_mismatch'), true);
});
