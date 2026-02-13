#!/usr/bin/env node
import {
  nowIso,
  readJson,
  writeJson,
  computeReturnsFromBars,
  normalizeBars
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
  const mirrorHealth = await readJson('public/mirrors/market-health.json', null);
  const mirrorItems = Array.isArray(mirrorHealth?.items) ? mirrorHealth.items : [];
  const mirrorBySymbol = new Map(mirrorItems.map((item) => [String(item?.symbol || '').toUpperCase(), item]));

  const benchmarks = {};
  const dataDates = [];

  for (const symbol of BENCHMARKS) {
    const rel = `public/data/eod/bars/${symbol}.json`;
    const barsRaw = await readJson(rel, null);
    const bars = normalizeBars(barsRaw);
    const returns = computeReturnsFromBars(bars);

    if (bars.length >= 20) {
      benchmarks[symbol] = {
        bars_ref: `/data/eod/bars/${symbol}.json`,
        as_of: returns.as_of,
        source: 'eod-bars',
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

    const mirror = mirrorBySymbol.get(symbol);
    if (mirror) {
      const lastBarDate = typeof mirror.lastBarDate === 'string' ? mirror.lastBarDate : null;
      benchmarks[symbol] = {
        bars_ref: null,
        as_of: lastBarDate,
        source: 'mirror-market-health',
        returns: {
          d1: Number.isFinite(Number(mirror.changePct)) ? Number(mirror.changePct) / 100 : null,
          ytd: null,
          y1: null,
          y5: null
        }
      };
      if (lastBarDate) dataDates.push(lastBarDate);
      continue;
    }

    benchmarks[symbol] = {
      bars_ref: null,
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
  const sourceChain = [];
  if (BENCHMARKS.some((symbol) => benchmarks[symbol]?.source === 'eod-bars')) sourceChain.push('public/data/eod/bars/*.json');
  if (BENCHMARKS.some((symbol) => benchmarks[symbol]?.source === 'mirror-market-health')) sourceChain.push('public/mirrors/market-health.json');

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
