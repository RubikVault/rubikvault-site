/**
 * compute-regime.mjs
 * Phase 2: Historical Probabilities Layer — Regime Builder
 *
 * Computes market_regime, volatility_regime, and breadth_regime
 * for the current date, based on benchmark bars (SPY).
 *
 * NON-DISRUPTIVE: standalone, no existing pipeline modified.
 */

import path from 'node:path';
import fs from 'node:fs/promises';
import { REPO_ROOT, loadLocalBars } from '../best-setups-local-loader.mjs';
import { mean, stddev, sma } from '../../../functions/api/_shared/eod-indicators.mjs';

const REGIME_OUTPUT_PATH = path.join(REPO_ROOT, 'public/data/hist-probs/regime-daily.json');

// Benchmarks for regime detection
const BENCHMARK_TICKER = 'SPY';

// Breadth proxy: a fixed set of well-known US large-cap tickers
// (proxy for S&P 500 membership — deterministic, no survivorship manipulation)
const BREADTH_PROXY_SET = [
  'AAPL','MSFT','AMZN','NVDA','GOOGL','META','BRK-B','LLY','AVGO','JPM',
  'XOM','TSLA','UNH','V','PG','MA','JNJ','HD','COST','MRK','ABBV','CVX','CRM',
  'BAC','NFLX','KO','AMD','PEP','TMO','WMT','LIN','ACN','CSCO','MCD','ABT',
  'ADBE','ORCL','TXN','PM','DIS','INTC','VZ','WFC','NEE','DHR','AMGN','RTX',
  'QCOM','HON','UNP','BMY','LOW','SBUX','MS','C','GE','INTU','SPGI','ISRG',
  'GS','BKNG','CAT','NOW','SYK','MDT','ZTS','BLK','CB','MO','CI','TJX','DE',
  'MMC','REGN','VRTX','PLD','ADP','ETN','SO','DUK','CL','ADI','GILD','TGT',
  'MMM','NSC','ECL','FIS','EW','AIG','USB','AON','SCHW','ICE','CME','ITW'
];

function ema(values, period) {
  if (values.length < period) return null;
  const k = 2 / (period + 1);
  let val = values.slice(0, period).reduce((s, v) => s + v, 0) / period;
  for (let i = period; i < values.length; i++) val = values[i] * k + val * (1 - k);
  return val;
}

function volatility(closes, period = 20) {
  if (closes.length < period + 1) return null;
  const rets = [];
  for (let i = closes.length - period; i < closes.length; i++) {
    const prev = closes[i - 1], cur = closes[i];
    if (prev > 0) rets.push(Math.log(cur / prev));
  }
  return stddev(rets);
}

function rollingVolPercentile(closes) {
  if (closes.length < 60) return null;
  const vols = [];
  for (let i = 20; i < Math.min(closes.length, 252); i++) {
    const v = volatility(closes.slice(0, i + 1), 20);
    if (v !== null) vols.push(v);
  }
  const curVol = volatility(closes, 20);
  if (!curVol || !vols.length) return null;
  const below = vols.filter(v => v <= curVol).length;
  return parseFloat((below / vols.length * 100).toFixed(1));
}

export async function computeRegime() {
  console.log('[regime] Loading benchmark bars:', BENCHMARK_TICKER);
  const bars = await loadLocalBars(BENCHMARK_TICKER, { preferredExchange: 'US' });
  if (!bars.length) {
    console.warn('[regime] No benchmark bars found for', BENCHMARK_TICKER);
    return null;
  }

  const closes = bars.map(b => Number.isFinite(b.adjClose) ? b.adjClose : b.close).filter(Number.isFinite);
  const latestClose = closes[closes.length - 1];
  const latestDate = bars[bars.length - 1]?.date || 'unknown';

  // market_regime: close vs SMA200
  const sma200 = sma(closes, 200);
  const market_regime = sma200 !== null
    ? (latestClose >= sma200 ? 'bull' : 'bear')
    : null;

  // volatility_regime: rolling HV20 percentile
  const volPctile = rollingVolPercentile(closes);
  let volatility_regime = 'normal_vol';
  if (volPctile !== null) {
    if (volPctile > 90) volatility_regime = 'high_vol';
    else if (volPctile < 10) volatility_regime = 'low_vol';
  }

  // breadth_regime: % of proxy set above MA50
  console.log('[regime] Computing breadth over proxy set...');
  let aboveCount = 0, totalCount = 0;
  await Promise.allSettled(BREADTH_PROXY_SET.map(async ticker => {
    try {
      const tickerBars = await loadLocalBars(ticker, { preferredExchange: 'US' });
      if (!tickerBars.length) return;
      const tickerCloses = tickerBars.map(b => Number.isFinite(b.adjClose) ? b.adjClose : b.close).filter(Number.isFinite);
      const ma50 = sma(tickerCloses, 50);
      const lastClose = tickerCloses[tickerCloses.length - 1];
      if (ma50 !== null && Number.isFinite(lastClose)) {
        totalCount++;
        if (lastClose > ma50) aboveCount++;
      }
    } catch { /* skip */ }
  }));

  const breadth_above_ma50_pct = totalCount > 0 ? parseFloat((aboveCount / totalCount * 100).toFixed(1)) : null;
  let breadth_regime = null;
  if (breadth_above_ma50_pct !== null) {
    if (breadth_above_ma50_pct < 30) breadth_regime = 'weak';
    else if (breadth_above_ma50_pct <= 70) breadth_regime = 'normal';
    else breadth_regime = 'strong';
  }

  const result = {
    date: latestDate,
    computed_at: new Date().toISOString(),
    benchmark: BENCHMARK_TICKER,
    market_regime,
    volatility_regime,
    breadth_regime,
    breadth_above_ma50_pct,
    proxy_breadth_set_size: BREADTH_PROXY_SET.length,
    breadth_stocks_above: aboveCount,
    sma200_value: sma200 !== null ? parseFloat(sma200.toFixed(4)) : null,
    latest_close: parseFloat(latestClose.toFixed(4)),
    vol_pctile: volPctile,
  };

  // Write output
  await fs.mkdir(path.dirname(REGIME_OUTPUT_PATH), { recursive: true });
  await fs.writeFile(REGIME_OUTPUT_PATH, JSON.stringify(result, null, 2), 'utf8');
  console.log('[regime] Written to', REGIME_OUTPUT_PATH);
  return result;
}

/**
 * V6.0: Compute regime-conditional fit score.
 * Shrinkage at thin samples to prevent overfitting.
 *
 * @param {number} winRateConditional - Win rate under current regime
 * @param {number} winRateBaseline - Overall baseline win rate
 * @param {number} nRegimeConditional - Sample count under current regime
 * @returns {{ regime_fit: number, insufficient_regime_evidence_flag: boolean, regime_fit_uncertainty_flag: boolean }}
 */
export function computeRegimeFit(winRateConditional, winRateBaseline, nRegimeConditional) {
  if (nRegimeConditional < 30) {
    return { regime_fit: 0.5, insufficient_regime_evidence_flag: true, regime_fit_uncertainty_flag: false };
  }

  const regimeFitRaw = winRateBaseline > 0
    ? winRateConditional / winRateBaseline
    : 0.5;

  if (nRegimeConditional < 100) {
    const w = nRegimeConditional / (nRegimeConditional + 75);
    const regimeFit = w * regimeFitRaw + (1 - w) * 0.5;
    return { regime_fit: Number(regimeFit.toFixed(4)), insufficient_regime_evidence_flag: false, regime_fit_uncertainty_flag: true };
  }

  return { regime_fit: Number(Math.min(2, regimeFitRaw).toFixed(4)), insufficient_regime_evidence_flag: false, regime_fit_uncertainty_flag: false };
}

/**
 * V6.0: Compute regime fit across ALL registered events (not just active/production).
 * Prevents selection bias from only evaluating surviving signals.
 *
 * @param {Array} allRegisteredEvents - [{ win_rate_conditional, n_conditional }]
 * @param {number} baselineWinRate - Overall baseline win rate
 * @returns {{ regime_fit: number, n_total_events: number, n_regime_conditional: number }}
 */
export function computeRegimeFitAllEvents(allRegisteredEvents, baselineWinRate) {
  if (!allRegisteredEvents?.length) {
    return { regime_fit: 0.5, n_total_events: 0, n_regime_conditional: 0 };
  }

  let totalWeightedWr = 0;
  let totalN = 0;

  for (const evt of allRegisteredEvents) {
    const n = evt.n_conditional || 0;
    const wr = evt.win_rate_conditional ?? 0.5;
    totalWeightedWr += wr * n;
    totalN += n;
  }

  const aggregateWr = totalN > 0 ? totalWeightedWr / totalN : 0.5;
  const { regime_fit } = computeRegimeFit(aggregateWr, baselineWinRate, totalN);

  return {
    regime_fit,
    n_total_events: allRegisteredEvents.length,
    n_regime_conditional: totalN,
  };
}

// CLI entrypoint
if (process.argv[1] && process.argv[1].includes('compute-regime')) {
  computeRegime()
    .then(r => console.log('[regime] Done:', JSON.stringify(r, null, 2)))
    .catch(err => { console.error('[regime] Error:', err); process.exit(1); });
}
