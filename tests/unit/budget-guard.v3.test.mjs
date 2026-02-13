import test from 'node:test';
import assert from 'node:assert/strict';
import { assertBudgetBeforeCalls, estimatePlannedCalls } from '../../scripts/lib/v3/budget-guard.mjs';

test('assertBudgetBeforeCalls blocks over safe remaining', () => {
  const planned = estimatePlannedCalls('dp1_eod', 50, { hard_cap: 100, reserve: 30, max_planned_calls: { dp1_eod: 80 } });
  assert.throws(() => {
    assertBudgetBeforeCalls({ hard_cap: 100, reserve: 30, used_calls: 30 }, planned);
  });
});

test('assertBudgetBeforeCalls allows within safe remaining', () => {
  const planned = estimatePlannedCalls('dp1_eod', 20, { hard_cap: 100, reserve: 30, max_planned_calls: { dp1_eod: 80 } });
  assert.doesNotThrow(() => {
    assertBudgetBeforeCalls({ hard_cap: 100, reserve: 30, used_calls: 10 }, planned);
  });
});
