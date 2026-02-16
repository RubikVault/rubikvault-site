#!/usr/bin/env node
import {
  nowIso,
  readJson,
  writeJson,
  loadUniverse,
  loadIndexUniverseMap,
  getPrimaryIndex,
  loadAdjustedSeries,
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
  const universe = await loadUniverse('public/data/universe/all.json');
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
    const series = await loadAdjustedSeries(ticker, 'US');
    const avgVol = Number(latestByTicker.get(ticker)?.volume);
    if (Number.isFinite(avgVol)) avgVolumeByTicker.set(ticker, avgVol);
    const seriesDate = series.length ? series[series.length - 1].date : null;
    const latestDate = latestByTicker.get(ticker)?.date || null;
    if (seriesDate) latestDates.push(seriesDate);
    else if (latestDate) latestDates.push(latestDate);
  }

  const peers = {};
  const peerMeta = {};

  const sortedTickers = [...tickers].sort((a, b) => a.localeCompare(b));

  for (const ticker of tickers) {
    let candidates = [];
    let strategy = 'index';

    const sector = sectorByTicker.get(ticker);
    if (sector && membersBySector.get(sector)?.size >= PEER_COUNT + 1) {
      candidates = [...membersBySector.get(sector)].filter((sym) => sym !== ticker);
      strategy = `sector:${sector}`;
    } else {
      const primaryIndex = getPrimaryIndex(ticker, indexMap);
      if (primaryIndex !== 'all') {
        candidates = [...(indexMap.get(primaryIndex) || new Set())].filter((sym) => sym !== ticker && universeSet.has(sym));
        strategy = `index:${primaryIndex}`;
      } else {
        candidates = sortedTickers.filter((sym) => sym !== ticker);
        strategy = 'index:all';
      }
    }

    candidates.sort((a, b) => {
      const av = avgVolumeByTicker.get(a);
      const bv = avgVolumeByTicker.get(b);
      const avScore = Number.isFinite(av) ? av : -1;
      const bvScore = Number.isFinite(bv) ? bv : -1;
      if (avScore !== bvScore) return bvScore - avScore;
      return a.localeCompare(b);
    });

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
      const origin = sortedTickers.indexOf(ticker);
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
        'public/data/universe/all.json',
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
