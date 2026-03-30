/**
 * enrich-snapshot-with-hist-probs.mjs
 * Phase 5: Snapshot Integration
 *
 * Reads public/data/snapshots/best-setups-v4.json (the existing snapshot)
 * and enriches every ticker row with hist_probs_context from
 * public/data/hist-probs/<TICKER>.json and regime-daily.json.
 *
 * Writes the enriched output to:
 *   public/data/snapshots/best-setups-v4-enriched.json
 *
 * NON-DISRUPTIVE: never overwrites the original snapshot file.
 * The original pipeline remains 100% unchanged.
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { REPO_ROOT } from '../best-setups-local-loader.mjs';

const SNAPSHOT_IN = path.join(REPO_ROOT, 'public/data/snapshots/best-setups-v4.json');
const SNAPSHOT_OUT = path.join(REPO_ROOT, 'public/data/snapshots/best-setups-v4-enriched.json');
const HIST_PROBS_DIR = path.join(REPO_ROOT, 'public/data/hist-probs');
const REGIME_PATH = path.join(HIST_PROBS_DIR, 'regime-daily.json');

// Key event buckets we highlight in the context summary
const HIGHLIGHT_EVENTS = [
  'event_new_52w_high', 'event_new_52w_low',
  'event_new_high_20', 'event_new_low_20',
  'event_volume_spike_2x',
  'event_mfi_lt_20', 'event_mfi_gt_80',
  'event_ppo_cross_signal',
  'event_adx_gt_25',
  'event_zscore_lt_neg3',
];

// Which outcome horizon to surface as the "primary" view in dashboard
const PRIMARY_HORIZONS = ['h5d', 'h20d', 'h60d'];

async function loadHistProbs(ticker) {
  try {
    const raw = await fs.readFile(path.join(HIST_PROBS_DIR, `${ticker.toUpperCase()}.json`), 'utf8');
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function buildContext(histProbs, regime) {
  if (!histProbs) return null;

  // Which events are currently active (based on name convention)
  const events = histProbs.events || {};
  const eventKeys = Object.keys(events);

  // Collect outcomes for primary horizons across all active events
  const summaryByHorizon = {};
  for (const h of PRIMARY_HORIZONS) {
    const winRates = [], avgRets = [], ns = [];
    for (const eventKey of eventKeys) {
      const outcomes = events[eventKey]?.[h];
      if (!outcomes) continue;
      winRates.push(outcomes.win_rate);
      avgRets.push(outcomes.avg_return);
      ns.push(outcomes.n);
    }
    if (!winRates.length) continue;
    const totalN = ns.reduce((s, v) => s + v, 0);
    const weightedWR = winRates.reduce((s, v, i) => s + v * ns[i], 0) / totalN;
    const weightedRet = avgRets.reduce((s, v, i) => s + v * ns[i], 0) / totalN;
    summaryByHorizon[h] = {
      win_rate: parseFloat(weightedWR.toFixed(3)),
      avg_return: parseFloat(weightedRet.toFixed(4)),
      total_observations: totalN,
    };
  }

  // Top 3 active events with best 20d win_rate
  const eventRanked = eventKeys
    .filter(k => events[k]?.h20d)
    .sort((a, b) => (events[b].h20d?.win_rate ?? 0) - (events[a].h20d?.win_rate ?? 0))
    .slice(0, 3);

  return {
    bars_count: histProbs.bars_count,
    latest_date: histProbs.latest_date,
    active_event_count: eventKeys.length,
    top_events_20d: eventRanked,
    outcomes_summary: summaryByHorizon,
    regime: regime ? {
      market: regime.market_regime,
      vol: regime.volatility_regime,
      breadth: regime.breadth_regime,
      breadth_pct: regime.breadth_above_ma50_pct,
    } : null,
  };
}

function enrichRows(rows, histProbsByTicker, regime) {
  if (!Array.isArray(rows)) return rows;
  return rows.map(row => {
    if (!row?.ticker) return row;
    const histProbs = histProbsByTicker.get(row.ticker.toUpperCase());
    const ctx = buildContext(histProbs, regime);
    if (!ctx) return row;
    return { ...row, hist_probs_context: ctx };
  });
}

async function main() {
  console.log('[enrich-snapshot] Loading snapshot...');
  let snapshot;
  try {
    const raw = await fs.readFile(SNAPSHOT_IN, 'utf8');
    snapshot = JSON.parse(raw);
  } catch {
    console.error('[enrich-snapshot] Could not read snapshot file:', SNAPSHOT_IN);
    process.exit(1);
  }

  // Load regime
  let regime = null;
  try {
    regime = JSON.parse(await fs.readFile(REGIME_PATH, 'utf8'));
  } catch {
    console.warn('[enrich-snapshot] No regime file found — skipping regime context');
  }

  // Collect all tickers from the snapshot
  const data = snapshot.data || {};
  const allTickers = new Set();
  for (const assetClass of ['stocks', 'etfs']) {
    for (const horizon of ['short', 'medium', 'long']) {
      for (const row of (data[assetClass]?.[horizon] || [])) {
        if (row?.ticker) allTickers.add(row.ticker.toUpperCase());
      }
    }
  }

  console.log(`[enrich-snapshot] Loading hist-probs for ${allTickers.size} tickers...`);
  const histProbsEntries = await Promise.all(
    [...allTickers].map(async ticker => [ticker, await loadHistProbs(ticker)])
  );
  const histProbsByTicker = new Map(histProbsEntries.filter(([, v]) => v !== null));
  console.log(`[enrich-snapshot] Found hist-probs data for ${histProbsByTicker.size}/${allTickers.size} tickers`);

  // Enrich all rows
  const enrichedData = {};
  for (const assetClass of ['stocks', 'etfs']) {
    enrichedData[assetClass] = {};
    for (const horizon of ['short', 'medium', 'long']) {
      enrichedData[assetClass][horizon] = enrichRows(
        data[assetClass]?.[horizon] || [],
        histProbsByTicker,
        regime
      );
    }
  }

  const enrichedSnapshot = {
    ...snapshot,
    hist_probs_enriched: true,
    hist_probs_enriched_at: new Date().toISOString(),
    hist_probs_regime: regime ? {
      market_regime: regime.market_regime,
      volatility_regime: regime.volatility_regime,
      breadth_regime: regime.breadth_regime,
      breadth_above_ma50_pct: regime.breadth_above_ma50_pct,
    } : null,
    data: enrichedData,
  };

  await fs.mkdir(path.dirname(SNAPSHOT_OUT), { recursive: true });
  await fs.writeFile(SNAPSHOT_OUT, JSON.stringify(enrichedSnapshot, null, 2), 'utf8');
  console.log('[enrich-snapshot] Written to:', SNAPSHOT_OUT);
  console.log('[enrich-snapshot] Enriched tickers:', histProbsByTicker.size);
}

main().catch(err => {
  console.error('[enrich-snapshot] Error:', err);
  process.exit(1);
});
