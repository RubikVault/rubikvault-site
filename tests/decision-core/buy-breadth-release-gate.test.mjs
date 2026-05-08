import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { ROOT } from './shared-fixtures.mjs';

test('release gate enforces accelerated certification and BUY breadth artifacts', () => {
  const src = fs.readFileSync(`${ROOT}/scripts/ops/release-gate-check.mjs`, 'utf8');
  assert.match(src, /RV_DECISION_CORE_SWITCH_MODE/);
  assert.match(src, /accelerated_historical_certification/);
  assert.match(src, /us_stock_etf_buy_count/);
  assert.match(src, /eu_stock_etf_buy_count/);
});
