import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { buildCanonicalMarketContext } from '../public/js/stock-ssot.js';

describe('buildCanonicalMarketContext', () => {
  it('prefers historical bars when summary price scale is incoherent', () => {
    const result = buildCanonicalMarketContext({
      ticker: 'TEST',
      summaryPrices: { date: '2026-03-31', close: 13411, source_provider: 'snapshot' },
      summaryStats: { as_of: '2026-03-31', stats: { high_52w: 10.8, low_52w: 9.8, atr14: 0.01, rsi14: 50, volatility_20d: 0.01, volatility_percentile: 14, bb_upper: 10.6, bb_lower: 9.9, range_52w_pct: 0.5 } },
      historicalBars: [{ date: '2026-03-30', close: 10.1 }, { date: '2026-03-31', close: 10.3 }],
      historicalIndicators: [{ id: 'high_52w', value: 10.8 }, { id: 'low_52w', value: 9.8 }, { id: 'atr14', value: 0.01 }, { id: 'rsi14', value: 50 }, { id: 'volatility_20d', value: 0.01 }, { id: 'volatility_percentile', value: 14 }, { id: 'bb_upper', value: 10.6 }, { id: 'bb_lower', value: 9.9 }, { id: 'range_52w_pct', value: 0.5 }],
    });

    assert.equal(result.marketPrices.close, 10.3);
    assert.equal(result.usedHistoricalBasis, true);
    assert.equal(result.consistency.keyLevelsReady, true);
  });

  it('keeps summary prices when summary and bars are coherent', () => {
    const result = buildCanonicalMarketContext({
      ticker: 'QCOM',
      summaryPrices: { date: '2026-03-31', close: 155.12, source_provider: 'eodhd' },
      summaryStats: { as_of: '2026-03-31', stats: { high_52w: 170, low_52w: 120, atr14: 4.1, rsi14: 55, volatility_20d: 0.02, volatility_percentile: 65, bb_upper: 160, bb_lower: 145, range_52w_pct: 0.7 } },
      historicalBars: [{ date: '2026-03-30', close: 154.5 }, { date: '2026-03-31', close: 155.0 }],
      historicalIndicators: [{ id: 'high_52w', value: 170 }, { id: 'low_52w', value: 120 }, { id: 'atr14', value: 4.1 }, { id: 'rsi14', value: 55 }, { id: 'volatility_20d', value: 0.02 }, { id: 'volatility_percentile', value: 65 }, { id: 'bb_upper', value: 160 }, { id: 'bb_lower', value: 145 }, { id: 'range_52w_pct', value: 0.7 }],
    });

    assert.equal(result.marketPrices.close, 155.12);
    assert.equal(result.consistency.useHistoricalBasis, false);
    assert.equal(result.consistency.keyLevelsReady, true);
  });
});
