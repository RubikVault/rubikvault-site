import test from 'node:test';
import assert from 'node:assert/strict';
import { readJson } from './shared-fixtures.mjs';

test('minimal schema declares compact public blocks', () => {
  const schema = readJson('schemas/decision-core/minimal-stock-decision-bundle.v1.schema.json');
  assert.equal(schema.properties.meta.type, 'object');
  assert.equal(schema.properties.decision.properties.primary_action.enum.includes('INCUBATING'), true);
  assert.equal(schema.properties.decision.properties.reason_codes.maxItems, 5);
  assert.equal(schema.properties.horizons.properties.short_term.$ref, '#/$defs/horizon');
});
