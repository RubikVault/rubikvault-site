#!/usr/bin/env node

import { normalizeSymbol } from '../scripts/providers/universe-v2.mjs';

function assert(condition, message) {
  if (!condition) throw new Error(message || 'assertion_failed');
}

const cases = [
  { input: 'brk.b', expected: 'BRK-B' },
  { input: ' brk.b ', expected: 'BRK-B' },
  { input: 'aapl.us', expected: 'AAPL' },
  { input: 'spy.us', expected: 'SPY' },
  { input: 'bf.b', expected: 'BF-B' },
  { input: 'TEST-LON', expected: 'TEST-LON' },
  { input: 'TEST.LN', expected: 'TEST' },
  { input: 'ABC.DEF', expected: 'ABC-DEF' }
];

for (const { input, expected } of cases) {
  const warnings = [];
  const normalized = normalizeSymbol(input, warnings);
  assert(normalized === expected, `normalizeSymbol(${input}) expected ${expected}, got ${normalized}`);
}

const invalid = ['A B', '123$', '', '   '];
for (const value of invalid) {
  const warnings = [];
  const normalized = normalizeSymbol(value, warnings);
  assert(normalized === null, `Expected ${value} to be rejected`);
}

console.log('✅ universe normalize tests');
