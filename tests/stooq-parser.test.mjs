#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert';
import { parseStooqLatestRow, buildStooqBar } from '../scripts/providers/market-prices-v3.mjs';

const fixture = fs.readFileSync(path.join('tests', 'fixtures', 'stooq', 'valid-spy.csv'), 'utf8');
const row = parseStooqLatestRow(fixture);
assert(row, 'expected stooq row');
const bar = buildStooqBar('SPY', row);
assert.strictEqual(bar.symbol, 'SPY');
assert.strictEqual(bar.volume, null);
assert.strictEqual(bar.source_provider, 'stooq');

const invalidRow = ['2026-01-20', '-1', '463', '462', '461'];
let threw = false;
try {
  buildStooqBar('SPY', invalidRow);
} catch (err) {
  threw = true;
  assert.ok(String(err).includes('STOOQ_ROW_INVALID:SPY'), 'expected structured row error');
}
assert(threw, 'expected invalid row to throw');

console.log('✅ stooq parser regression tests passed');
