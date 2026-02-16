#!/usr/bin/env node
import {
  nowIso,
  readJson,
  writeJson,
  loadUniverse,
  loadAdjustedSeries,
  overlapReturnSeries,
  pearsonCorrelation
} from './lib-stock-ui.mjs';

const WINDOW = 90;
const MIN_OVERLAP = 30;
const MIN_BARS_REQUIRED = MIN_OVERLAP + 2;

function pickLatestIso(values) {
  const list = values.filter((v) => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v));
  if (!list.length) return null;
  list.sort();
  return list[list.length - 1];
}

async function main() {
  const generatedAt = nowIso();
  const universe = await loadUniverse('public/data/universe/all.json');
  const tickers = universe.map((row) => row.ticker);

  const peersDoc = await readJson('public/data/ui/peers/latest.json', { data: { peers: {} } });
  const peers = peersDoc?.data?.peers && typeof peersDoc.data.peers === 'object' ? peersDoc.data.peers : {};

  const benchmarksDoc = await readJson('public/data/ui/benchmarks/latest.json', { data: { benchmarks: {} } });
  const benchmarkEntries = benchmarksDoc?.data?.benchmarks && typeof benchmarksDoc.data.benchmarks === 'object'
    ? benchmarksDoc.data.benchmarks
    : {};

  const benchmarkSymbols = Object.keys(benchmarkEntries).filter((symbol) => benchmarkEntries[symbol]?.series_ref);
  const barsCache = new Map();
  const latestDates = [];

  async function getBars(symbol) {
    if (barsCache.has(symbol)) return barsCache.get(symbol);
    const bars = await loadAdjustedSeries(symbol, 'US');
    barsCache.set(symbol, bars);
    if (bars.length) latestDates.push(bars[bars.length - 1].date);
    return bars;
  }

  const correlations = {};
  let usedPeerFallback = false;
  const statusCounts = {
    computed: 0,
    missing: 0,
    not_supported: 0
  };

  for (const ticker of tickers) {
    const tickerBars = await getBars(ticker);
    if (tickerBars.length < MIN_BARS_REQUIRED) {
      correlations[ticker] = {
        window: WINDOW,
        status: 'not_supported',
        reason: 'INSUFFICIENT_BARS',
        bars: tickerBars.length,
        min_bars: MIN_BARS_REQUIRED,
        items: []
      };
      statusCounts.not_supported += 1;
      continue;
    }

    let refs = benchmarkSymbols.filter((sym) => sym !== ticker);
    if (!refs.length) {
      refs = Array.isArray(peers[ticker]) ? peers[ticker].filter((sym) => sym !== ticker) : [];
      usedPeerFallback = usedPeerFallback || refs.length > 0;
    }

    const items = [];
    for (const refSymbol of refs.slice(0, 6)) {
      const refBars = await getBars(refSymbol);
      if (refBars.length < MIN_OVERLAP + 2) continue;

      const overlap = overlapReturnSeries(tickerBars, refBars, WINDOW);
      if (overlap.a.length < MIN_OVERLAP || overlap.b.length < MIN_OVERLAP) continue;

      const corr = pearsonCorrelation(overlap.a, overlap.b);
      if (!Number.isFinite(corr)) continue;

      items.push({
        symbol: refSymbol,
        corr: Number(corr.toFixed(6)),
        overlap_days: overlap.a.length
      });
    }

    items.sort((a, b) => {
      const absA = Math.abs(a.corr);
      const absB = Math.abs(b.corr);
      if (absA !== absB) return absB - absA;
      return a.symbol.localeCompare(b.symbol);
    });

    if (items.length) {
      correlations[ticker] = {
        window: WINDOW,
        status: 'computed',
        items
      };
      statusCounts.computed += 1;
      continue;
    }

    correlations[ticker] = {
      window: WINDOW,
      status: 'missing',
      reason: refs.length ? 'NO_VALID_OVERLAP' : 'NO_REFERENCES',
      items: []
    };
    statusCounts.missing += 1;
  }

  const dataDate = pickLatestIso(latestDates);
  const coverageCount = Object.keys(correlations).length;
  const sourceChain = [
    'public/data/v3/series/adjusted/*.ndjson.gz',
    'public/data/ui/benchmarks/latest.json',
    'public/data/ui/peers/latest.json'
  ];
  if (usedPeerFallback) sourceChain.push('fallback:peer-based-references');

  const doc = {
    schema_version: 'ui.correlations.v1',
    meta: {
      generated_at: generatedAt,
      data_date: dataDate,
      as_of: dataDate,
      provider: 'local-artifacts',
      source_chain: sourceChain,
      schema_version: 'ui.correlations.v1',
      window: WINDOW,
      min_overlap: MIN_OVERLAP,
      coverage: {
        symbols: coverageCount,
        universe: tickers.length,
        status_counts: statusCounts
      }
    },
    data: {
      correlations
    }
  };

  await writeJson('public/data/ui/correlations/latest.json', doc);
  console.log(`OK: wrote public/data/ui/correlations/latest.json correlations=${coverageCount}`);
}

main().catch((error) => {
  console.error(`FAIL: build-correlations-latest ${error?.message || error}`);
  process.exit(1);
});
