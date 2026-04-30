#!/usr/bin/env node
import {
  nowIso,
  readJson,
  writeJson,
  loadUniverse,
  loadIndexUniverseMap,
  getPrimaryIndex,
  loadEodLatestMap
} from './lib-stock-ui.mjs';

const PEER_COUNT = 4;

function isValidSector(value) {
  if (typeof value !== 'string') return false;
  const trimmed = value.trim();
  if (!trimmed) return false;
  if (trimmed.toLowerCase() === 'unknown') return false;
  return true;
}

function pickLatestIso(values) {
  const list = values.filter((v) => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v));
  if (!list.length) return null;
  list.sort();
  return list[list.length - 1];
}

async function main() {
  const generatedAt = nowIso();
  const universe = await loadUniverse();
  const tickers = universe.map((row) => row.ticker);
  const universeSet = new Set(tickers);
  const indexMap = await loadIndexUniverseMap();

  const sectorDoc = await readJson('public/data/v3/universe/sector-mapping/latest.json', null);
  const sectorRows = Array.isArray(sectorDoc?.sectors) ? sectorDoc.sectors : [];
  const latestByTicker = await loadEodLatestMap('public/data/v3/eod/US/latest.ndjson.gz');
  const sectorByTicker = new Map();
  const membersBySector = new Map();

  for (const row of sectorRows) {
    const ticker = String(row?.ticker || '').toUpperCase();
    if (!universeSet.has(ticker)) continue;
    if (!isValidSector(row?.sector)) continue;
    const sector = String(row.sector).trim();
    sectorByTicker.set(ticker, sector);
    if (!membersBySector.has(sector)) membersBySector.set(sector, new Set());
    membersBySector.get(sector).add(ticker);
  }

  const avgVolumeByTicker = new Map();
  const latestDates = [];
  for (const ticker of tickers) {
    const latest = latestByTicker.get(ticker);
    const avgVol = Number(latest?.volume);
    if (Number.isFinite(avgVol)) avgVolumeByTicker.set(ticker, avgVol);
    if (latest?.date) latestDates.push(latest.date);
  }

  const peers = {};
  const peerMeta = {};

  const sortedTickers = [...tickers].sort((a, b) => a.localeCompare(b));
  const tickerOrdinal = new Map(sortedTickers.map((ticker, index) => [ticker, index]));
  const rankedCandidateCache = new Map();
  const rankCandidates = (key, iterable) => {
    if (rankedCandidateCache.has(key)) return rankedCandidateCache.get(key);
    const ranked = [...iterable]
      .filter((symbol) => universeSet.has(symbol))
      .sort((a, b) => {
        const av = avgVolumeByTicker.get(a);
        const bv = avgVolumeByTicker.get(b);
        const avScore = Number.isFinite(av) ? av : -1;
        const bvScore = Number.isFinite(bv) ? bv : -1;
        if (avScore !== bvScore) return bvScore - avScore;
        return a.localeCompare(b);
      });
    rankedCandidateCache.set(key, ranked);
    return ranked;
  };

  for (const ticker of tickers) {
    let candidates = [];
    let strategy = 'index';

    const sector = sectorByTicker.get(ticker);
    if (sector && membersBySector.get(sector)?.size >= PEER_COUNT + 1) {
      candidates = rankCandidates(`sector:${sector}`, membersBySector.get(sector));
      strategy = `sector:${sector}`;
    } else {
      const primaryIndex = getPrimaryIndex(ticker, indexMap);
      if (primaryIndex !== 'all') {
        candidates = rankCandidates(`index:${primaryIndex}`, indexMap.get(primaryIndex) || new Set());
        strategy = `index:${primaryIndex}`;
      } else {
        candidates = rankCandidates('index:all', sortedTickers);
        strategy = 'index:all';
      }
    }

    const chosen = [];
    for (const symbol of candidates) {
      if (chosen.length >= PEER_COUNT) break;
      if (!universeSet.has(symbol)) continue;
      if (symbol === ticker) continue;
      if (chosen.includes(symbol)) continue;
      chosen.push(symbol);
    }

    // Deterministic lexical fallback when a group is too small.
    if (chosen.length < PEER_COUNT) {
      const origin = tickerOrdinal.get(ticker) ?? sortedTickers.indexOf(ticker);
      let radius = 1;
      while (chosen.length < PEER_COUNT && radius < sortedTickers.length) {
        const left = origin - radius;
        const right = origin + radius;
        if (left >= 0) {
          const leftTicker = sortedTickers[left];
          if (leftTicker !== ticker && !chosen.includes(leftTicker)) chosen.push(leftTicker);
        }
        if (chosen.length >= PEER_COUNT) break;
        if (right < sortedTickers.length) {
          const rightTicker = sortedTickers[right];
          if (rightTicker !== ticker && !chosen.includes(rightTicker)) chosen.push(rightTicker);
        }
        radius += 1;
      }
      strategy = `${strategy}+lexical`;
    }

    peers[ticker] = chosen.slice(0, PEER_COUNT);
    peerMeta[ticker] = {
      strategy,
      sector: sector || null,
      count: peers[ticker].length
    };
  }

  const dataDate = pickLatestIso(latestDates);
  const doc = {
    schema_version: 'ui.peers.v1',
    meta: {
      generated_at: generatedAt,
      data_date: dataDate,
      as_of: dataDate,
      provider: 'local-artifacts',
      source_chain: [
        'public/data/universe/v7/ssot/stocks.max.symbols.json',
        'public/data/universe/*.json',
        'public/data/v3/eod/US/latest.ndjson.gz',
        'public/data/v3/series/adjusted/*.ndjson.gz',
        'public/data/v3/universe/sector-mapping/latest.json'
      ],
      schema_version: 'ui.peers.v1'
    },
    data: {
      peers,
      peer_meta: peerMeta
    }
  };

  await writeJson('public/data/ui/peers/latest.json', doc);
  console.log(`OK: wrote public/data/ui/peers/latest.json peers=${Object.keys(peers).length}`);
}

main().catch((error) => {
  console.error(`FAIL: build-peers-latest ${error?.message || error}`);
  process.exit(1);
});
