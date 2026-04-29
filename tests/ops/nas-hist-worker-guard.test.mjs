import test from 'node:test';
import assert from 'node:assert/strict';
import { decideHistProbsWorkers } from '../../scripts/ops/nas-hist-probs-worker-guard.mjs';

test('hist worker guard clamps six workers to hard max four', () => {
  const decision = decideHistProbsWorkers({
    requestedWorkers: 6,
    maxWorkers: 6,
    previousPeakRssMb: 4096,
    swapUsedMb: 0,
    memAvailableMb: 4096,
  });
  assert.equal(decision.workers, 4);
  assert.match(decision.reason, /six_workers_forbidden/);
});

test('hist worker guard allows four only with safe resource state', () => {
  const decision = decideHistProbsWorkers({
    requestedWorkers: 4,
    previousPeakRssMb: 4096,
    swapUsedMb: 0,
    memAvailableMb: 4096,
  });
  assert.equal(decision.workers, 4);
  assert.match(decision.reason, /safe_ramp_to_4/);
});

test('hist worker guard falls to two on rss or swap pressure', () => {
  const rssPressure = decideHistProbsWorkers({
    requestedWorkers: 4,
    previousPeakRssMb: 9000,
    swapUsedMb: 0,
    memAvailableMb: 4096,
  });
  assert.equal(rssPressure.workers, 2);

  const swapPressure = decideHistProbsWorkers({
    requestedWorkers: 3,
    previousPeakRssMb: 3000,
    swapUsedMb: 1024,
    memAvailableMb: 4096,
  });
  assert.equal(swapPressure.workers, 2);
});
