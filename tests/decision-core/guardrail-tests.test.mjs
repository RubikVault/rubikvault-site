import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { ROOT } from './shared-fixtures.mjs';

test('guardrail suite covers mandatory P0 safety checks', () => {
  const schema = fs.readFileSync(`${ROOT}/schemas/decision-core/minimal-stock-decision-bundle.v1.schema.json`, 'utf8');
  assert.match(schema, /decision_grade/);
  assert.match(schema, /max_entry_price/);
  assert.match(schema, /invalidation_level/);
  assert.match(schema, /INCUBATING/);
});
