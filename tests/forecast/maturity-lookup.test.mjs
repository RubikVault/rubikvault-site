import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import { resolveMaturityPricePair } from '../../scripts/forecast/maturity-lookup.mjs';

function writeJson(filePath, payload) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
}

function writeGzipNdjson(filePath, rows) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const payload = rows.map((row) => JSON.stringify(row)).join('\n') + '\n';
  fs.writeFileSync(filePath, zlib.gzipSync(payload));
}

describe('maturity lookup', () => {
  it('resolves forecast/outcome prices from history packs', async () => {
    const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'rv-maturity-lookup-'));
    writeJson(path.join(repoRoot, 'public/data/pipeline/epoch.json'), {
      target_market_date: '2026-04-09',
      modules: {
        market_data_refresh: { as_of: '2026-04-09' },
        q1_delta_ingest: { as_of: '2026-04-09' },
      },
    });
    writeGzipNdjson(path.join(repoRoot, 'public/data/universe/v7/registry/registry.ndjson.gz'), [
      {
        symbol: 'AAPL',
        canonical_id: 'US:AAPL',
        exchange: 'US',
        type_norm: 'STOCK',
        bars_count: 300,
        last_trade_date: '2026-04-09',
        pointers: { history_pack: 'packs/us-aapl.ndjson.gz' },
      },
    ]);
    writeGzipNdjson(path.join(repoRoot, 'mirrors/universe-v7/packs/us-aapl.ndjson.gz'), [
      {
        canonical_id: 'US:AAPL',
        bars: [
          { date: '2026-04-08', adjusted_close: 100, close: 100, open: 99, high: 101, low: 98, volume: 10 },
          { date: '2026-04-09', adjusted_close: 103, close: 103, open: 102, high: 104, low: 101, volume: 12 },
        ],
      },
    ]);

    const pair = await resolveMaturityPricePair(repoRoot, {
      ticker: 'AAPL',
      trading_date: '2026-04-08',
      exchange: 'US',
    }, '2026-04-09', '2026-04-09');

    assert.equal(pair.ok, true);
    assert.equal(pair.priceAtForecast, 100);
    assert.equal(pair.priceAtOutcome, 103);
  });

  it('blocks same-day evaluation when epoch is missing', async () => {
    const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'rv-maturity-finality-'));
    const pair = await resolveMaturityPricePair(repoRoot, {
      ticker: 'AAPL',
      trading_date: '2026-04-09',
      exchange: 'US',
    }, '2026-04-10', '2026-04-10');

    assert.equal(pair.ok, false);
    assert.match(pair.reason, /epoch/i);
  });
});
