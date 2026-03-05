#!/usr/bin/env node

import fs from 'node:fs';

function assert(condition, message) {
  if (!condition) throw new Error(message || 'assert_failed');
}

const laws = JSON.parse(fs.readFileSync('policies/universe/law_registry.json', 'utf8'));
const gateRegistry = JSON.parse(fs.readFileSync('scripts/universe-v7/gates/gate-registry.json', 'utf8'));

const lawRows = Array.isArray(laws?.laws) ? laws.laws : [];
const checkRows = Array.isArray(gateRegistry?.checks) ? gateRegistry.checks : [];
const checkIds = new Set(checkRows.map((row) => row.id));

assert(lawRows.length >= 16, 'expected >=16 laws');

const seen = new Set();
for (const law of lawRows) {
  const id = String(law?.law_id || '').trim();
  assert(id, 'law_id missing');
  assert(!seen.has(id), `duplicate law id: ${id}`);
  seen.add(id);

  const refs = Array.isArray(law?.enforced_by_checks) ? law.enforced_by_checks : [];
  assert(refs.length > 0, `${id} has no enforced_by_checks`);
  for (const ref of refs) {
    assert(checkIds.has(ref), `${id} references unknown check ${ref}`);
  }
}

console.log('✅ v7 law registry test passed');
