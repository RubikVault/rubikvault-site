/**
 * compute-outcomes.mjs
 * Phase 3: Historical Probabilities Layer — Historical Outcome Aggregator
 *
 * For a given ticker, looks back through all historical bars and for each
 * trading day where a Tier-1 event was active, records what happened
 * over the next 5/10/20/60/120/250 days (outcomes).
 *
 * Aggregates: avg_return, median_return, std_return, win_rate,
 *             max_drawdown, mae, mfe per event × horizon.
 *
 * NON-DISRUPTIVE: new output files only, no existing pipeline modified.
 */

import path from 'node:path';
import fs from 'node:fs/promises';
import { REPO_ROOT, loadLocalBars, setLocalBarsRuntimeOverrides } from '../best-setups-local-loader.mjs';
import { HistProbsRollingCore } from '../indicators/rolling-core.mjs';
import { histProbsWriteTargets, resolveHistProbsWriteMode } from './path-resolver.mjs';

const OUTPUT_BASE = path.join(REPO_ROOT, 'public/data/hist-probs');
const HORIZONS = [5, 10, 20, 60, 120, 250];
const MIN_SAMPLE = 50; // minimum events needed to report a statistic

// ─── Maths helpers ────────────────────────────────────────────────────────────

function median(arr) {
  if (!arr.length) return null;
  const sorted = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function stddev(arr) {
  if (arr.length < 2) return null;
  const m = arr.reduce((s, v) => s + v, 0) / arr.length;
  const variance = arr.reduce((s, v) => s + (v - m) ** 2, 0) / (arr.length - 1);
  return Math.sqrt(variance);
}

function maxDrawdown(returns_path) {
  // returns_path: array of cumulative returns day by day
  if (!returns_path.length) return null;
  let peak = returns_path[0], maxDD = 0;
  for (const v of returns_path) {
    if (v > peak) peak = v;
    const dd = (v - peak) / (1 + peak);
    if (dd < maxDD) maxDD = dd;
  }
  return maxDD;
}

function aggregateOutcomes(observations) {
  // observations: Array<{ ret, mae, mfe, drawdown }>
  if (observations.length < MIN_SAMPLE) return null;
  const rets = observations.map(o => o.ret);
  const maes = observations.map(o => o.mae);
  const mfes = observations.map(o => o.mfe);
  const dds = observations.map(o => o.drawdown);
  return {
    n: observations.length,
    avg_return: parseFloat((rets.reduce((s, v) => s + v, 0) / rets.length).toFixed(4)),
    median_return: parseFloat(median(rets).toFixed(4)),
    std_return: parseFloat((stddev(rets) ?? 0).toFixed(4)),
    win_rate: parseFloat((rets.filter(r => r > 0).length / rets.length).toFixed(4)),
    max_drawdown: parseFloat((dds.reduce((a, b) => Math.min(a, b), 0)).toFixed(4)),
    mae: parseFloat((maes.reduce((s, v) => s + v, 0) / maes.length).toFixed(4)),
    mfe: parseFloat((mfes.reduce((s, v) => s + v, 0) / mfes.length).toFixed(4)),
  };
}

// ─── Extract all active events from a computed indicator snapshot ─────────────

export function activeEventKeys(snap) {
  const keys = [];
  if (!snap || snap.short_history_flag) return keys;

  // RSI bin
  if (snap.rsi14_bin) keys.push(`rsi14_bin_${snap.rsi14_bin}`);
  // Z-Score bin
  if (snap.zscore_sma50_bin) keys.push(`zscore_sma50_bin_${snap.zscore_sma50_bin}`);
  // Distance to SMA200
  if (snap.dist_sma200_bin) keys.push(`dist_sma200_bin_${snap.dist_sma200_bin}`);
  // Bool events
  for (const key of [
    'event_zscore_lt_neg3', 'event_zscore_gt_pos2',
    'event_mfi_lt_20', 'event_mfi_gt_80',
    'event_ppo_cross_signal',
    'event_adx_gt_25', 'event_adx_lt_20',
    'event_volume_spike_2x',
    'event_new_high_20', 'event_new_low_20',
    'event_new_high_50', 'event_new_low_50',
    'event_new_52w_high', 'event_new_52w_low',
  ]) {
    if (snap[key] === true) keys.push(key);
  }
  // PPO state
  if (snap.ppo_bin_gt_0 !== undefined) keys.push(snap.ppo_bin_gt_0 ? 'ppo_bin_gt_0' : 'ppo_bin_lt_0');
  // 52W bins
  if (snap.dist_to_52w_high_bin) keys.push(`dist_to_52w_high_bin_${snap.dist_to_52w_high_bin}`);
  if (snap.dist_to_52w_low_bin) keys.push(`dist_to_52w_low_bin_${snap.dist_to_52w_low_bin}`);
  // Volume bin
  if (snap.volume_ratio_20d_bin_gt_2x) keys.push('volume_ratio_20d_bin_gt_2x');

  return keys;
}

export function configureComputeOutcomesRuntime(overrides = {}) {
  setLocalBarsRuntimeOverrides(overrides);
}

// ─── Main: compute for a single ticker ───────────────────────────────────────

export async function computeOutcomes(ticker, options = {}) {
  const bars = await loadLocalBars(ticker, options);
  if (bars.length < 60) {
    console.log(`[outcomes] ${ticker}: insufficient history (${bars.length} bars)`);
    return null;
  }

  // Accumulate per-event observations across all historical windows
  const eventObservations = {}; // { eventKey: { h: [{ret, mae, mfe, drawdown}] } }

  const n = bars.length;
  const MIN_WINDOW = 30; // minimum bars needed to compute indicators
  const rollingCore = new HistProbsRollingCore();

  for (let t = 0; t < n; t++) {
    const snap = rollingCore.push(bars[t]);
    if (t < MIN_WINDOW || t >= n - 1) continue;
    const events = activeEventKeys(snap);
    if (!events.length) continue;

    // For each horizon, compute forward outcome starting from Open(t+1)
    for (const h of HORIZONS) {
      const endIdx = t + h;
      if (endIdx >= n) continue;

      // Entry at Open(t+1), exit at Close(t+h)
      const entryPrice = bars[t + 1]?.open;
      if (!entryPrice || entryPrice <= 0) continue;

      // Compute path for MAE / MFE / Drawdown
      let mae = 0, mfe = 0;
      const path_returns = [];
      for (let d = t + 1; d <= endIdx; d++) {
        const lo = bars[d]?.low ?? bars[d]?.close;
        const hi = bars[d]?.high ?? bars[d]?.close;
        const cl = bars[d]?.close;
        if (!cl || cl <= 0) continue;
        const retLow = (lo - entryPrice) / entryPrice;
        const retHigh = (hi - entryPrice) / entryPrice;
        const retClose = (cl - entryPrice) / entryPrice;
        if (retLow < mae) mae = retLow;
        if (retHigh > mfe) mfe = retHigh;
        path_returns.push(retClose);
      }

      const exitClose = bars[endIdx]?.close;
      if (!exitClose || exitClose <= 0) continue;
      const ret = (exitClose - entryPrice) / entryPrice;
      const drawdown = maxDrawdown(path_returns);

      const obs = { ret, mae, mfe, drawdown: drawdown ?? 0 };

      for (const eventKey of events) {
        if (!eventObservations[eventKey]) eventObservations[eventKey] = {};
        if (!eventObservations[eventKey][h]) eventObservations[eventKey][h] = [];
        eventObservations[eventKey][h].push(obs);
      }
    }
  }

  // Aggregate
  const result = {
    ticker,
    computed_at: new Date().toISOString(),
    bars_count: n,
    latest_date: bars[n - 1]?.date ?? null,
    events: {},
  };

  for (const [eventKey, horizonMap] of Object.entries(eventObservations)) {
    result.events[eventKey] = {};
    for (const [h, observations] of Object.entries(horizonMap)) {
      const agg = aggregateOutcomes(observations);
      if (agg) result.events[eventKey][`h${h}d`] = agg;
    }
  }

  // Write output
  const { primaryPath, flatPath, shardPath } = histProbsWriteTargets(OUTPUT_BASE, ticker, {
    mode: resolveHistProbsWriteMode(),
  });
  const tmpPath = path.join(path.dirname(primaryPath), `.${ticker.toUpperCase()}.${process.pid}.${Date.now()}.tmp`);
  await fs.mkdir(OUTPUT_BASE, { recursive: true });
  await fs.mkdir(path.dirname(primaryPath), { recursive: true });
  if (flatPath) await fs.mkdir(path.dirname(flatPath), { recursive: true });
  if (shardPath) await fs.mkdir(path.dirname(shardPath), { recursive: true });
  try {
    await fs.writeFile(tmpPath, JSON.stringify(result, null, 2), 'utf8');
    await fs.rename(tmpPath, primaryPath);
    if (flatPath && flatPath !== primaryPath) await fs.copyFile(primaryPath, flatPath);
    if (shardPath && shardPath !== primaryPath) await fs.copyFile(primaryPath, shardPath);
  } finally {
    await fs.rm(tmpPath, { force: true }).catch(() => {});
  }
  return result;
}

// CLI entrypoint: node compute-outcomes.mjs --ticker AAPL
if (process.argv[1] && process.argv[1].includes('compute-outcomes')) {
  const tickerArg = process.argv.find(a => a.startsWith('--ticker='))?.split('=')[1]
    || process.argv[process.argv.indexOf('--ticker') + 1];
  if (!tickerArg) {
    console.error('Usage: node compute-outcomes.mjs --ticker AAPL');
    process.exit(1);
  }
  computeOutcomes(tickerArg.toUpperCase())
    .then(r => {
      if (r) {
        const eventCount = Object.keys(r.events).length;
        console.log(`[outcomes] Done: ${tickerArg} — ${eventCount} event types, ${r.bars_count} bars`);
      } else {
        console.log(`[outcomes] No result for ${tickerArg}`);
      }
    })
    .catch(err => { console.error('[outcomes] Error:', err); process.exit(1); });
}
