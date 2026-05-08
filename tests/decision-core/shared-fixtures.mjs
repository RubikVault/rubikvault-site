import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(fileURLToPath(new URL('.', import.meta.url)), '../..');

export function readJson(rel) {
  return JSON.parse(fs.readFileSync(path.join(ROOT, rel), 'utf8'));
}

export function baseRow(overrides = {}) {
  return {
    canonical_id: 'US:TEST',
    symbol: 'TEST',
    exchange: 'US',
    type_norm: 'STOCK',
    last_trade_date: '2026-05-07',
    bars_count: 300,
    avg_volume_30d: 1000000,
    computed: { score_0_100: 95, staleness_bd: 0 },
    flags: { ghost_price: false },
    _tmp_recent_closes: [100, 101, 102, 103, 104, 105, 106, 107, 108, 109],
    _tmp_recent_volumes: [1000000, 1000000, 1000000, 1000000, 1000000, 1000000, 1000000, 1000000, 1000000, 1000000],
    ...overrides,
  };
}

export function assertNoGermanPublicText(value) {
  const text = JSON.stringify(value);
  for (const word of [' kaufen ', ' verkaufen ', ' warten ', ' Treffer ', ' Wahrscheinlichkeit ']) {
    assert.equal(text.toLowerCase().includes(word.trim()), false, `German public text detected: ${word}`);
  }
}
