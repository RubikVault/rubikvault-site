import path from 'node:path';
import { readJson, readNdjson } from './io.mjs';

function normalizeSymbol(value) {
  if (!value) return null;
  return String(value).trim().toUpperCase();
}

function extractSymbolsFromUniverseDoc(doc) {
  if (!doc) return [];
  if (Array.isArray(doc)) {
    return doc.map((item) => normalizeSymbol(item?.symbol || item?.ticker || item)).filter(Boolean);
  }
  if (Array.isArray(doc.tickers)) return doc.tickers.map(normalizeSymbol).filter(Boolean);
  if (Array.isArray(doc.symbols)) return doc.symbols.map(normalizeSymbol).filter(Boolean);
  if (Array.isArray(doc.data)) {
    return doc.data.map((item) => normalizeSymbol(item?.symbol || item?.ticker || item)).filter(Boolean);
  }
  return [];
}

function loadEventRows(repoRoot) {
  const additions = readNdjson(path.join(repoRoot, 'mirrors/forecast/ledgers/universe/events_additions.ndjson'));
  const removals = readNdjson(path.join(repoRoot, 'mirrors/forecast/ledgers/universe/events_removals.ndjson'));
  const unified = readNdjson(path.join(repoRoot, 'mirrors/forecast/ledgers/universe/events.ndjson'));
  const merged = [...additions, ...removals, ...unified]
    .map((row) => ({
      date: row?.date || row?.asof_date || row?.event_date,
      symbol: normalizeSymbol(row?.symbol || row?.ticker),
      action: (row?.action || row?.type || '').toUpperCase(),
      source: row?.source || 'universe_events'
    }))
    .filter((row) => row.date && row.symbol && row.action);
  merged.sort((a, b) => a.date.localeCompare(b.date));
  return merged;
}

function reconstructFromEvents(eventRows, asofDate) {
  const active = new Set();
  const delisted = new Set();
  for (const row of eventRows) {
    if (row.date > asofDate) break;
    if (row.action.includes('ADD')) {
      active.add(row.symbol);
      delisted.delete(row.symbol);
    }
    if (row.action.includes('REMOVE') || row.action.includes('DELETE') || row.action.includes('DELIST')) {
      active.delete(row.symbol);
      if (row.action.includes('DELIST')) delisted.add(row.symbol);
    }
  }
  return { active: [...active].sort(), delisted: [...delisted].sort() };
}

export function applyUniverseFallback({
  action,
  eventUniverse,
  baselineUniverse,
  gapPct
}) {
  if (action === 'RESTRICT') {
    return [...eventUniverse].sort();
  }
  if (action === 'HYBRID') {
    return gapPct < 0.10 ? [...eventUniverse].sort() : [...baselineUniverse].sort();
  }
  if (action === 'CIRCUIT_OPEN') {
    return [];
  }
  return [...eventUniverse].sort();
}

export function chooseFallbackAction(gapPct, fallbackPolicy) {
  const configured = (fallbackPolicy?.fallback_strategy || 'HYBRID').toUpperCase();
  if (configured === 'HYBRID') {
    const threshold = Number(fallbackPolicy?.hybrid_restrict_threshold_pct ?? 10) / 100;
    return gapPct < threshold ? 'RESTRICT' : 'CIRCUIT_OPEN';
  }
  if (configured === 'RESTRICT') return 'RESTRICT';
  if (configured === 'CIRCUIT_OPEN') return 'CIRCUIT_OPEN';
  return 'HYBRID';
}

export function buildPITUniverse({ repoRoot, asofDate, barsBySymbol = {}, fallbackPolicy = {} }) {
  const baselineDoc = readJson(path.join(repoRoot, 'public/data/universe/all.json'), []);
  const baselineUniverse = extractSymbolsFromUniverseDoc(baselineDoc);
  const eventRows = loadEventRows(repoRoot);

  const fromEvents = reconstructFromEvents(eventRows, asofDate);
  const eventUniverse = fromEvents.active.length ? fromEvents.active : baselineUniverse;

  const baselineSet = new Set(baselineUniverse);
  const missingFromEvents = baselineUniverse.filter((sym) => !eventUniverse.includes(sym));
  const gapPct = baselineUniverse.length ? missingFromEvents.length / baselineUniverse.length : 0;
  const fallbackAction = chooseFallbackAction(gapPct, fallbackPolicy);
  const selectedUniverse = applyUniverseFallback({
    action: fallbackAction,
    eventUniverse,
    baselineUniverse,
    gapPct
  });

  const rows = selectedUniverse.map((symbol) => {
    const historyLen = Array.isArray(barsBySymbol[symbol]) ? barsBySymbol[symbol].length : 0;
    return {
      symbol,
      source: baselineSet.has(symbol) ? 'baseline_or_events' : 'events_only',
      cold_start: historyLen < 60,
      history_days: historyLen,
      delisted_flag: fromEvents.delisted.includes(symbol)
    };
  });

  return {
    asof_date: asofDate,
    rows,
    event_rows_count: eventRows.length,
    gap_pct: gapPct,
    fallback_action: fallbackAction,
    delisted_symbols: fromEvents.delisted
  };
}

export default {
  buildPITUniverse,
  chooseFallbackAction,
  applyUniverseFallback
};
