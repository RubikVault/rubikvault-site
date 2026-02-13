#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import { createRunContext } from '../lib/v3/run-context.mjs';
import { writeJsonArtifact } from '../lib/v3/artifact-writer.mjs';

function normalizeTicker(raw) {
  const value = String(raw || '').trim().toUpperCase();
  return /^[A-Z0-9.\-]{1,15}$/.test(value) ? value : '';
}

async function readJsonSafe(filePath, fallback) {
  try {
    const raw = await fs.readFile(filePath, 'utf8');
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

function numberOrNull(value) {
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

function formatPct(value, digits = 1) {
  const num = Number(value);
  if (!Number.isFinite(num)) return '—';
  const sign = num > 0 ? '+' : '';
  return `${sign}${num.toFixed(digits)}%`;
}

function topRows(topSetupsDoc) {
  const rows = Array.isArray(topSetupsDoc?.data?.rows) ? topSetupsDoc.data.rows : [];
  return rows
    .map((row) => ({
      ticker: normalizeTicker(row?.ticker || ''),
      name: row?.name || null,
      scientific: numberOrNull(row?.scientific),
      elliott: numberOrNull(row?.elliott),
      forecast: numberOrNull(row?.forecast),
      composite: numberOrNull(row?.composite),
      consensus: numberOrNull(row?.consensus),
      bullish_count: Number(row?.bullish_count ?? 0),
      engines_available: Number(row?.engines_available ?? 0)
    }))
    .filter((row) => row.ticker)
    .sort((a, b) => {
      const c = Number(b.composite ?? -1) - Number(a.composite ?? -1);
      if (c !== 0) return c;
      const d = Number(b.consensus ?? -1) - Number(a.consensus ?? -1);
      if (d !== 0) return d;
      return a.ticker.localeCompare(b.ticker);
    });
}

function buildIdeaList(name, summary, rows, limit = 12) {
  const items = rows.slice(0, limit).map((row) => ({
    ticker: row.ticker,
    name: row.name,
    rationale: `Composite ${row.composite != null ? row.composite.toFixed(3) : '—'} | Consensus ${row.consensus != null ? formatPct(row.consensus * 100, 0) : '—'} | Signals ${row.bullish_count}/${row.engines_available}`,
    details: {
      scientific: row.scientific,
      elliott: row.elliott,
      forecast: row.forecast,
      composite: row.composite,
      consensus: row.consensus,
      bullish_count: row.bullish_count,
      engines_available: row.engines_available
    }
  }));
  return {
    name,
    summary,
    count: items.length,
    items
  };
}

function buildMoverCrossList(rows, marketDoc, limit = 12) {
  const movers = Array.isArray(marketDoc?.data?.movers) ? marketDoc.data.movers : [];
  const byTicker = new Map(rows.map((row) => [row.ticker, row]));
  const merged = [];

  for (const mover of movers) {
    const ticker = normalizeTicker(mover?.ticker || mover?.symbol || '');
    if (!ticker) continue;
    const row = byTicker.get(ticker);
    if (!row) continue;
    const moverChange = numberOrNull(mover?.change_pct ?? mover?.change);
    merged.push({
      ...row,
      mover_change_pct: moverChange
    });
  }

  merged.sort((a, b) => {
    const c = Number(b.mover_change_pct ?? -999) - Number(a.mover_change_pct ?? -999);
    if (c !== 0) return c;
    return a.ticker.localeCompare(b.ticker);
  });

  const items = merged.slice(0, limit).map((row) => ({
    ticker: row.ticker,
    name: row.name,
    rationale: `Mover ${formatPct(row.mover_change_pct, 2)} | Composite ${row.composite != null ? row.composite.toFixed(3) : '—'} | Consensus ${row.consensus != null ? formatPct(row.consensus * 100, 0) : '—'}`,
    details: {
      mover_change_pct: row.mover_change_pct,
      composite: row.composite,
      consensus: row.consensus
    }
  }));

  return {
    name: 'Momentum Cross-Check',
    summary: 'Top setups that also appear in today\'s market movers.',
    count: items.length,
    items
  };
}

async function main() {
  const runContext = createRunContext();
  const rootDir = runContext.rootDir;

  const [topSetupsDoc, marketDoc] = await Promise.all([
    readJsonSafe(path.join(rootDir, 'public/data/v3/derived/top-setups/latest.json'), {}),
    readJsonSafe(path.join(rootDir, 'public/data/v3/derived/market/latest.json'), {})
  ]);

  const rows = topRows(topSetupsDoc);
  const highConsensusRows = rows
    .filter((row) => row.consensus != null && row.consensus >= 2 / 3)
    .sort((a, b) => Number(b.consensus) - Number(a.consensus) || Number(b.composite ?? -1) - Number(a.composite ?? -1) || a.ticker.localeCompare(b.ticker));

  const lists = [
    buildIdeaList(
      'Best Setups Today',
      'Highest composite signals across scientific, Elliott, and forecast engines.',
      rows
    ),
    buildIdeaList(
      'High Consensus Basket',
      'Symbols with at least two bullish engines (>=67% consensus).',
      highConsensusRows.length ? highConsensusRows : rows
    ),
    buildMoverCrossList(rows, marketDoc)
  ];

  const doc = {
    meta: {
      schema_version: 'rv.derived.ideas.v1',
      generated_at: runContext.generatedAt,
      data_date: runContext.generatedAt.slice(0, 10),
      provider: 'derived-local',
      source_chain: [
        '/data/v3/derived/top-setups/latest.json',
        '/data/v3/derived/market/latest.json'
      ],
      run_id: runContext.runId,
      commit: runContext.commit
    },
    data: {
      count: lists.length,
      lists
    }
  };

  await writeJsonArtifact(rootDir, 'public/data/v3/derived/ideas/latest.json', doc);
  console.log(`DP9 ideas done lists=${lists.length} rows=${rows.length}`);
}

main().catch((error) => {
  console.error(`DP9_IDEAS_FAILED:${error?.message || error}`);
  process.exitCode = 1;
});
