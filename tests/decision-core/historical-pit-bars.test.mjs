import test from 'node:test';
import assert from 'node:assert/strict';
import {
  assertNoFeatureAfterAsOf,
  buildRegistryRowFromBars,
  sliceBarsAsOf,
} from '../../scripts/decision-core/load-historical-bars-asof.mjs';

test('PIT guard rejects feature rows after target date', () => {
  const out = assertNoFeatureAfterAsOf([{ canonical_id: 'US:TEST', last_trade_date: '2026-05-08' }], '2026-05-07');
  assert.equal(out.ok, false);
  assert.equal(out.violations[0].asset_id, 'US:TEST');
});

test('PIT guard accepts feature rows at or before target date', () => {
  const out = assertNoFeatureAfterAsOf([{ canonical_id: 'US:TEST', last_trade_date: '2026-05-07' }], '2026-05-07');
  assert.equal(out.ok, true);
});

test('historical bar slicing excludes bars after target date', () => {
  const bars = sliceBarsAsOf([
    { date: '2026-05-06', close: 100, volume: 10 },
    { date: '2026-05-08', close: 120, volume: 20 },
    { date: '2026-05-07', close: 110, volume: 30 },
  ], '2026-05-07');
  assert.deepEqual(bars.map((row) => row.date), ['2026-05-06', '2026-05-07']);
});

test('historical registry row derives as-of fields from sliced bars', () => {
  const row = buildRegistryRowFromBars({
    canonical_id: 'US:TEST',
    type_norm: 'STOCK',
    pointers: { history_pack: 'history/US/0/test.ndjson.gz' },
    computed: { score_0_100: 88, staleness_bd: 99 },
  }, [
    { date: '2026-05-05', close: 100, volume: 10 },
    { date: '2026-05-07', adjusted_close: 110, volume: 30 },
    { date: '2026-05-08', close: 120, volume: 20 },
  ], '2026-05-07');
  assert.equal(row.last_trade_date, '2026-05-07');
  assert.equal(row.bars_count, 2);
  assert.equal(row.close, 110);
  assert.equal(row.computed.staleness_bd, 0);
  assert.deepEqual(row._tmp_recent_closes, [100, 110]);
});

test('historical loader source documents corrupt-pack failure field', async () => {
  const src = await import('node:fs/promises').then((fs) => fs.readFile(new URL('../../scripts/decision-core/load-historical-bars-asof.mjs', import.meta.url), 'utf8'));
  assert.match(src, /history_pack_corrupt_count/);
  assert.match(src, /rowsByPack/);
});
