/**
 * compute-hist-indicators.mjs
 * Phase 1: Historical Probabilities Layer — Indicator & Event Builder
 *
 * For a given ticker's bars array, computes all Tier-1 indicator fields
 * as specified in history_probabilities_spec_v1.0.md.
 *
 * NON-DISRUPTIVE: reads only, never modifies existing pipelines.
 */

import { mean, stddev, sma } from '../../../functions/api/_shared/eod-indicators.mjs';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function ema(values, period) {
  if (values.length < period) return null;
  const k = 2 / (period + 1);
  let val = values.slice(0, period).reduce((s, v) => s + v, 0) / period;
  for (let i = period; i < values.length; i++) val = values[i] * k + val * (1 - k);
  return val;
}

function rsi(closes, period = 14) {
  if (closes.length < period + 1) return null;
  let avgGain = 0, avgLoss = 0;
  for (let i = 1; i <= period; i++) {
    const d = closes[i] - closes[i - 1];
    if (d >= 0) avgGain += d; else avgLoss -= d;
  }
  avgGain /= period; avgLoss /= period;
  for (let i = period + 1; i < closes.length; i++) {
    const d = closes[i] - closes[i - 1];
    const g = d >= 0 ? d : 0;
    const l = d < 0 ? -d : 0;
    avgGain = (avgGain * (period - 1) + g) / period;
    avgLoss = (avgLoss * (period - 1) + l) / period;
  }
  if (avgLoss === 0) return 100;
  return 100 - 100 / (1 + avgGain / avgLoss);
}

function mfi(bars, period = 14) {
  if (bars.length < period + 1) return null;
  const window = bars.slice(-period - 1);
  let posFlow = 0, negFlow = 0;
  for (let i = 1; i < window.length; i++) {
    const cur = window[i];
    const prev = window[i - 1];
    const tp = (cur.high + cur.low + cur.close) / 3;
    const tpPrev = (prev.high + prev.low + prev.close) / 3;
    const rawFlow = tp * (cur.volume || 0);
    if (tp >= tpPrev) posFlow += rawFlow; else negFlow += rawFlow;
  }
  if (negFlow === 0) return 100;
  return 100 - 100 / (1 + posFlow / negFlow);
}

function adx(bars, period = 14) {
  if (bars.length < period * 2 + 1) return null;
  const dms = [];
  for (let i = 1; i < bars.length; i++) {
    const prev = bars[i - 1], cur = bars[i];
    const upMove = cur.high - prev.high;
    const downMove = prev.low - cur.low;
    const dmPlus = (upMove > downMove && upMove > 0) ? upMove : 0;
    const dmMinus = (downMove > upMove && downMove > 0) ? downMove : 0;
    const tr = Math.max(cur.high - cur.low, Math.abs(cur.high - prev.close), Math.abs(cur.low - prev.close));
    dms.push({ dmPlus, dmMinus, tr });
  }
  // Wilder smoothing
  let smoothPlus = dms.slice(0, period).reduce((s, d) => s + d.dmPlus, 0);
  let smoothMinus = dms.slice(0, period).reduce((s, d) => s + d.dmMinus, 0);
  let smoothTr = dms.slice(0, period).reduce((s, d) => s + d.tr, 0);
  const dxValues = [];
  for (let i = period; i < dms.length; i++) {
    smoothPlus = smoothPlus - smoothPlus / period + dms[i].dmPlus;
    smoothMinus = smoothMinus - smoothMinus / period + dms[i].dmMinus;
    smoothTr = smoothTr - smoothTr / period + dms[i].tr;
    if (smoothTr === 0) continue;
    const diPlus = 100 * smoothPlus / smoothTr;
    const diMinus = 100 * smoothMinus / smoothTr;
    const diSum = diPlus + diMinus;
    const dx = diSum === 0 ? 0 : 100 * Math.abs(diPlus - diMinus) / diSum;
    dxValues.push(dx);
  }
  if (dxValues.length < period) return null;
  return dxValues.slice(-period).reduce((s, v) => s + v, 0) / period;
}

function ppo(closes, fast = 12, slow = 26, signal = 9) {
  if (closes.length < slow + signal) return { ppo: null, signal: null, prevPpo: null };
  const emaFastAll = [], emaSlowAll = [];
  let ef = ema(closes.slice(0, fast), fast);
  let es = ema(closes.slice(0, slow), slow);
  for (let i = fast; i < closes.length; i++) {
    ef = closes[i] * (2 / (fast + 1)) + ef * (1 - 2 / (fast + 1));
    if (i >= slow - 1) {
      es = closes[i] * (2 / (slow + 1)) + es * (1 - 2 / (slow + 1));
      emaFastAll.push(ef);
      emaSlowAll.push(es);
    }
  }
  const ppoSeries = emaFastAll.map((f, i) => emaSlowAll[i] !== 0 ? (f - emaSlowAll[i]) / emaSlowAll[i] * 100 : null).filter(v => v !== null);
  if (ppoSeries.length < signal) return { ppo: null, signal: null, prevPpo: null };
  const ppoVal = ppoSeries[ppoSeries.length - 1];
  const signalVal = ema(ppoSeries, signal);
  const prevPpo = ppoSeries.length > 1 ? ppoSeries[ppoSeries.length - 2] : null;
  return { ppo: ppoVal, signal: signalVal, prevPpo };
}

/** Rolling 252d percentile rank of a value within its own time series */
function rollingPercentile252(allCloses, currentIdx, computeFn) {
  const window = allCloses.slice(Math.max(0, currentIdx - 252), currentIdx + 1);
  if (window.length < 30) return null;
  const currentVal = computeFn(window);
  if (currentVal === null || !Number.isFinite(currentVal)) return null;
  // compute the indicator for multiple sub-windows to build the distribution
  const vals = [];
  for (let i = 20; i < window.length; i++) {
    const v = computeFn(window.slice(0, i + 1));
    if (v !== null && Number.isFinite(v)) vals.push(v);
  }
  if (vals.length < 10) return null;
  const below = vals.filter(v => v <= currentVal).length;
  return parseFloat((below / vals.length * 100).toFixed(1));
}

// ─── RSI Bin ─────────────────────────────────────────────────────────────────

function rsiBin(value) {
  if (value === null) return null;
  if (value < 10) return 'lt_10';
  if (value < 20) return '10_20';
  if (value < 30) return '20_30';
  if (value < 50) return '30_50';
  if (value < 70) return '50_70';
  if (value < 80) return '70_80';
  return 'gt_80';
}

// ─── Z-Score Bin ─────────────────────────────────────────────────────────────

function zscoreBin(value) {
  if (value === null) return null;
  if (value < -3) return 'lt_neg3';
  if (value < -2) return 'neg3_neg2';
  if (value <= 2) return 'neg2_pos2';
  return 'gt_pos2';
}

// ─── Distance to SMA200 Bin ───────────────────────────────────────────────────

function distSma200Bin(pct) {
  if (pct === null) return null;
  if (pct < -0.20) return 'lt_neg20';
  if (pct < -0.10) return 'neg20_neg10';
  if (pct <= 0.10) return 'neg10_pos10';
  if (pct <= 0.20) return 'pos10_pos20';
  return 'gt_pos20';
}

// ─── 52W Distance Bin ────────────────────────────────────────────────────────

function dist52wBin(pct) {
  // pct = close / high52w — 1 (should be ≤ 0 since close ≤ high)
  // We flip to distance from top: 0 = at the high
  const dist = Math.abs(pct); // how far below high (0 = at high)
  if (dist <= 0.01) return '99_100';
  if (dist <= 0.05) return '95_99';
  if (dist <= 0.10) return '90_95';
  return 'gt_10pct_below';
}

// ─── Liquidity bucket ────────────────────────────────────────────────────────

function liquidityBucket(dollarVolume20d) {
  if (!Number.isFinite(dollarVolume20d)) return 'low';
  if (dollarVolume20d >= 2_500_000) return 'high';
  if (dollarVolume20d >= 250_000) return 'mid';
  return 'low';
}

// ─── Market Cap bucket ───────────────────────────────────────────────────────

function marketCapBucket(marketCapUsd) {
  if (!Number.isFinite(marketCapUsd) || marketCapUsd <= 0) return null;
  if (marketCapUsd >= 10e9) return 'large';
  if (marketCapUsd >= 2e9) return 'mid';
  if (marketCapUsd >= 250e6) return 'small';
  return 'micro';
}

// ─── Main Export ─────────────────────────────────────────────────────────────

/**
 * computeHistIndicators(bars, opts)
 * @param {Array} bars - normalized OHLCV bars sorted ASC, with adjClose
 * @param {Object} [opts]
 * @param {number} [opts.marketCapUsd] - optional market cap for bucket
 * @returns {Object} - all Tier-1 fields per spec
 */
export function computeHistIndicators(bars, opts = {}) {
  const cleanBars = (Array.isArray(bars) ? bars : []).filter(
    b => b && Number.isFinite(b.close) && b.close > 0
  );

  const closes = cleanBars.map(b => Number.isFinite(b.adjClose) ? b.adjClose : b.close);
  const volumes = cleanBars.map(b => Number.isFinite(b.volume) ? b.volume : 0);
  const n = closes.length;

  if (n < 30) {
    return { short_history_flag: true };
  }

  const short_history_flag = n < 252;
  const latestClose = closes[n - 1];
  const latest = cleanBars[n - 1];

  // ── RSI (14) ────────────────────────────────────────────────────────────────
  const rsi14_value = rsi(closes, 14);
  const rsi14_bin = rsiBin(rsi14_value);
  const rsi14_pctile_252 = short_history_flag ? null : rollingPercentile252(closes, n - 1, c => rsi(c, 14));

  // ── Z-Score vs SMA50 ────────────────────────────────────────────────────────
  let zscore_sma50_value = null;
  if (n >= 60) {
    const s50 = sma(closes, 50);
    const priceStd = stddev(closes.slice(-60));
    if (s50 !== null && priceStd && priceStd > 0) {
      zscore_sma50_value = parseFloat(((latestClose - s50) / priceStd).toFixed(4));
    }
  }
  const zscore_sma50_bin = zscoreBin(zscore_sma50_value);
  const event_zscore_lt_neg3 = zscore_sma50_value !== null && zscore_sma50_value < -3;
  const event_zscore_gt_pos2 = zscore_sma50_value !== null && zscore_sma50_value > 2;

  // ── Distance to SMA200 ──────────────────────────────────────────────────────
  const sma200_value = sma(closes, 200);
  let dist_sma200_value = null;
  if (sma200_value !== null && sma200_value !== 0) {
    dist_sma200_value = parseFloat(((latestClose - sma200_value) / sma200_value).toFixed(4));
  }
  const dist_sma200_bin = distSma200Bin(dist_sma200_value);

  // ── MFI (14) ────────────────────────────────────────────────────────────────
  const mfi14_value = mfi(cleanBars, 14);
  const event_mfi_lt_20 = mfi14_value !== null && mfi14_value < 20;
  const event_mfi_gt_80 = mfi14_value !== null && mfi14_value > 80;

  // ── PPO (12,26,9) ───────────────────────────────────────────────────────────
  const ppoResult = ppo(closes, 12, 26, 9);
  const ppo_value = ppoResult.ppo;
  const ppo_signal_value = ppoResult.signal;
  const ppo_bin_gt_0 = ppo_value !== null && ppo_value > 0;
  // Cross signal: PPO crossed above or below signal line
  const event_ppo_cross_signal = (() => {
    if (ppo_value === null || ppo_signal_value === null || ppoResult.prevPpo === null) return false;
    const crossedAbove = ppoResult.prevPpo <= ppo_signal_value && ppo_value > ppo_signal_value;
    const crossedBelow = ppoResult.prevPpo >= ppo_signal_value && ppo_value < ppo_signal_value;
    return crossedAbove || crossedBelow;
  })();

  // ── ADX (14) ────────────────────────────────────────────────────────────────
  const adx14_value = adx(cleanBars, 14);
  const event_adx_gt_25 = adx14_value !== null && adx14_value > 25;
  const event_adx_lt_20 = adx14_value !== null && adx14_value < 20;

  // ── Volume Spike ────────────────────────────────────────────────────────────
  const avgVol20 = n >= 20 ? sma(volumes, 20) : null;
  const latestVol = volumes[n - 1];
  const volume_ratio_20d_value = avgVol20 && avgVol20 > 0 ? parseFloat((latestVol / avgVol20).toFixed(3)) : null;
  const volume_ratio_20d_bin_gt_2x = volume_ratio_20d_value !== null && volume_ratio_20d_value > 2;
  const event_volume_spike_2x = volume_ratio_20d_bin_gt_2x;

  // ── Donchian (20d, 50d) — Close-confirmed ───────────────────────────────────
  const donchian20High = n >= 20 ? Math.max(...closes.slice(-21, -1)) : null;
  const donchian20Low = n >= 20 ? Math.min(...closes.slice(-21, -1)) : null;
  const donchian50High = n >= 50 ? Math.max(...closes.slice(-51, -1)) : null;
  const donchian50Low = n >= 50 ? Math.min(...closes.slice(-51, -1)) : null;
  const event_new_high_20 = donchian20High !== null && latestClose > donchian20High;
  const event_new_low_20 = donchian20Low !== null && latestClose < donchian20Low;
  const event_new_high_50 = donchian50High !== null && latestClose > donchian50High;
  const event_new_low_50 = donchian50Low !== null && latestClose < donchian50Low;

  // ── 52W High/Low — Close-confirmed ──────────────────────────────────────────
  const lookback252 = cleanBars.slice(-253, -1); // excluding today
  const high52w_prior = lookback252.length ? Math.max(...lookback252.map(b => b.high ?? b.close)) : null;
  const low52w_prior = lookback252.length ? Math.min(...lookback252.map(b => b.low ?? b.close)) : null;
  const event_new_52w_high = high52w_prior !== null && latestClose > high52w_prior;
  const event_new_52w_low = low52w_prior !== null && latestClose < low52w_prior;

  // Distance to 52W high (negative = below high)
  const current52wHigh = lookback252.length ? Math.max(...lookback252.map(b => b.high ?? b.close), latestClose) : null;
  const dist_to_52w_high_pct = current52wHigh && current52wHigh > 0 ? parseFloat(((latestClose - current52wHigh) / current52wHigh).toFixed(4)) : null;
  const dist_to_52w_high_bin = dist52wBin(dist_to_52w_high_pct);
  const current52wLow = lookback252.length ? Math.min(...lookback252.map(b => b.low ?? b.close), latestClose) : null;
  const dist_to_52w_low_pct = current52wLow && current52wLow > 0 ? parseFloat(((latestClose - current52wLow) / current52wLow).toFixed(4)) : null;
  const dist_to_52w_low_bin = (() => {
    if (dist_to_52w_low_pct === null) return null;
    if (dist_to_52w_low_pct <= 0.01) return '99_100';
    if (dist_to_52w_low_pct <= 0.05) return '95_99';
    if (dist_to_52w_low_pct <= 0.10) return '90_95';
    return 'gt_10pct_above';
  })();

  // ── Meta-fields ─────────────────────────────────────────────────────────────
  const dollarVol20d = avgVol20 !== null ? avgVol20 * latestClose : null;
  const liquidity_bucket_val = liquidityBucket(dollarVol20d);
  const liquidity_flag = liquidity_bucket_val !== 'low';
  const market_cap_bucket_val = opts.marketCapUsd ? marketCapBucket(opts.marketCapUsd) : null;

  return {
    short_history_flag,
    bars_count: n,
    latest_date: latest?.date ?? null,
    latest_close: parseFloat(latestClose.toFixed(4)),

    // RSI
    rsi14_value: rsi14_value !== null ? parseFloat(rsi14_value.toFixed(2)) : null,
    rsi14_bin,
    rsi14_pctile_252,

    // Z-Score
    zscore_sma50_value,
    zscore_sma50_bin,
    event_zscore_lt_neg3,
    event_zscore_gt_pos2,

    // Distance to SMA200
    sma200_value: sma200_value !== null ? parseFloat(sma200_value.toFixed(4)) : null,
    dist_sma200_value,
    dist_sma200_bin,

    // MFI
    mfi14_value: mfi14_value !== null ? parseFloat(mfi14_value.toFixed(2)) : null,
    event_mfi_lt_20,
    event_mfi_gt_80,

    // PPO
    ppo_value: ppo_value !== null ? parseFloat(ppo_value.toFixed(4)) : null,
    ppo_signal_value: ppo_signal_value !== null ? parseFloat(ppo_signal_value.toFixed(4)) : null,
    ppo_bin_gt_0,
    event_ppo_cross_signal,

    // ADX
    adx14_value: adx14_value !== null ? parseFloat(adx14_value.toFixed(2)) : null,
    event_adx_gt_25,
    event_adx_lt_20,

    // Volume
    volume_ratio_20d_value,
    volume_ratio_20d_bin_gt_2x,
    event_volume_spike_2x,

    // Donchian
    event_new_high_20,
    event_new_low_20,
    event_new_high_50,
    event_new_low_50,

    // 52W
    event_new_52w_high,
    event_new_52w_low,
    dist_to_52w_high_pct,
    dist_to_52w_high_bin,
    dist_to_52w_low_pct,
    dist_to_52w_low_bin,

    // Meta
    liquidity_bucket: liquidity_bucket_val,
    liquidity_flag,
    market_cap_bucket: market_cap_bucket_val,
  };
}
