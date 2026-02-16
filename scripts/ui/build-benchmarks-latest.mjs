#!/usr/bin/env node
import {
  nowIso,
  writeJson,
  computeReturnsFromBars,
  loadAdjustedSeries
} from './lib-stock-ui.mjs';

const BENCHMARKS = ['SPY', 'QQQ', 'DIA', 'IWM'];

function pickLatestIso(values) {
  const list = values.filter((v) => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v));
  if (!list.length) return null;
  list.sort();
  return list[list.length - 1];
}

async function main() {
  const generatedAt = nowIso();
  const benchmarks = {};
  const dataDates = [];

  for (const symbol of BENCHMARKS) {
    const series = await loadAdjustedSeries(symbol, 'US');
    const returns = computeReturnsFromBars(series);
    if (series.length >= 20) {
      benchmarks[symbol] = {
        series_ref: `/data/v3/series/adjusted/US__${symbol}.ndjson.gz`,
        as_of: returns.as_of,
        source: 'v3-series-adjusted',
        returns: {
          d1: returns.d1,
          ytd: returns.ytd,
          y1: returns.y1,
          y5: returns.y5
        }
      };
      if (returns.as_of) dataDates.push(returns.as_of);
      continue;
    }

    benchmarks[symbol] = {
      series_ref: null,
      as_of: null,
      source: 'missing',
      returns: {
        d1: null,
        ytd: null,
        y1: null,
        y5: null
      }
    };
  }

  const dataDate = pickLatestIso(dataDates);
  const sourceChain = ['public/data/v3/series/adjusted/*.ndjson.gz'];

  const doc = {
    schema_version: 'ui.benchmarks.v1',
    meta: {
      generated_at: generatedAt,
      data_date: dataDate,
      as_of: dataDate,
      provider: 'local-artifacts',
      source_chain: sourceChain,
      schema_version: 'ui.benchmarks.v1'
    },
    data: {
      benchmarks
    }
  };

  await writeJson('public/data/ui/benchmarks/latest.json', doc);
  console.log(`OK: wrote public/data/ui/benchmarks/latest.json benchmarks=${Object.keys(benchmarks).length}`);
}

main().catch((error) => {
  console.error(`FAIL: build-benchmarks-latest ${error?.message || error}`);
  process.exit(1);
});
