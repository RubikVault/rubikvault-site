import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateDeadman } from '../../scripts/ops/run-pipeline-deadman-guard.mjs';

test('deadman only triggers when heartbeat and final seal are stale', () => {
  const now = Date.parse('2026-04-17T12:00:00Z');
  assert.equal(evaluateDeadman({
    heartbeat: { last_seen: '2026-04-17T11:30:00Z' },
    finalSeal: { generated_at: '2026-04-16T12:00:00Z' },
    now,
  }).trigger_failed, false);

  assert.equal(evaluateDeadman({
    heartbeat: { last_seen: '2026-04-17T10:00:00Z' },
    finalSeal: { generated_at: '2026-04-17T11:00:00Z' },
    now,
  }).trigger_failed, false);

  assert.equal(evaluateDeadman({
    heartbeat: { last_seen: '2026-04-17T10:00:00Z' },
    finalSeal: { generated_at: '2026-04-15T00:00:00Z' },
    now,
  }).trigger_failed, true);
});
