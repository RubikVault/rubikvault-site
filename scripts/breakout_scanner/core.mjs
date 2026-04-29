/**
 * BREAKOUT-SCANNER legacy_v1 — Core Utility Logic
 *
 * Frozen comparison path for Breakout Engine V1.2. Do not build new product
 * logic on these discrete states.
 */

import { evaluateBreakoutState } from '../runblock/layers/02b-breakout-state.mjs';

/**
 * Compute average true range (ATR)
 * 
 * @param {Array} bars - [{ close, high, low }, ...]
 * @param {number} period - default 14
 * @returns {number[]} - Array of ATRs matching the index of bars
 */
export function calculateAtr(bars, period = 14) {
  const atrs = new Array(bars.length).fill(0);
  let trSum = 0;

  for (let i = 0; i < bars.length; i++) {
    const current = bars[i];
    const previous = bars[i - 1];
    
    const curHigh = current.high ?? current.close;
    const curLow = current.low ?? current.close;
    
    let tr = curHigh - curLow;
    if (previous) {
      const c1 = Math.abs(curHigh - previous.close);
      const c2 = Math.abs(curLow - previous.close);
      tr = Math.max(tr, c1, c2);
    }

    if (i < period) {
      trSum += tr;
      atrs[i] = trSum / (i + 1); // incremental avg
    } else {
      atrs[i] = (atrs[i - 1] * (period - 1) + tr) / period;
    }
  }
  return atrs;
}

/**
 * Calculate Relative Volume (RVOL)
 * 
 * @param {Array} bars 
 * @param {number} period 
 */
export function calculateRvol(bars, period = 20) {
  const rvol = new Array(bars.length).fill(1).map((_, i) => {
    if (i < period) return 1;
    const previousVolumeSlice = bars.slice(i - period, i).map(b => b.volume || 0);
    const avgVolume = previousVolumeSlice.reduce((a, b) => a + b, 0) / period;
    if (avgVolume === 0) return 1.6; // Bypass volume check if volume data is missing from file
    return (bars[i].volume || 0) / avgVolume;
  });
  return rvol;
}

/**
 * Calculate Exponential Moving Average (EMA)
 */
export function calculateEma(bars, period = 20) {
  const emas = new Array(bars.length).fill(0);
  const k = 2 / (period + 1);
  let sum = 0;

  for (let i = 0; i < bars.length; i++) {
    const val = bars[i].close || 0;
    if (i < period) {
      sum += val;
      emas[i] = sum / (i + 1);
    } else {
      emas[i] = val * k + emas[i - 1] * (1 - k);
    }
  }
  return emas;
}

/**
 * Calculate SMA
 */
export function calculateSma(bars, period = 200) {
  const smas = new Array(bars.length).fill(0);
  let sum = 0;
  for (let i = 0; i < bars.length; i++) {
    sum += bars[i].close || 0;
    if (i >= period) {
      sum -= bars[i - period].close || 0;
      smas[i] = sum / period;
    } else {
      smas[i] = sum / (i + 1);
    }
  }
  return smas;
}

/**
 * Detect Pivots High/Low with causal delay (Confirmed after `right` bars).
 * 
 * @param {Array} bars 
 * @param {number} left 
 * @param {number} right 
 */
export function calculatePivots(bars, left = 3, right = 3) {
  const pivots = new Array(bars.length).fill(null).map(() => ({
    high: null,
    low: null
  }));

  for (let i = 0; i < bars.length; i++) {
    if (i < left || i + right >= bars.length) continue;

    const start = Math.max(0, i - left);
    const end = Math.min(bars.length - 1, i + right);
    const currentBar = bars[i];
    const highVal = currentBar.high ?? currentBar.close;
    const lowVal = currentBar.low ?? currentBar.close;

    let isPivotHigh = true;
    let isPivotLow = true;

    for (let j = start; j <= end; j++) {
      if (j === i) continue;
      const b = bars[j];
      const h = b.high ?? b.close;
      const l = b.low ?? b.close;
      if (h >= highVal) isPivotHigh = false;
      if (l <= lowVal) isPivotLow = false;
    }

    if (isPivotHigh) pivots[i].high = highVal;
    if (isPivotLow) pivots[i].low = lowVal;
  }
  return pivots;
}

/**
 * Detect Absorption and Failed Low structure at a given index.
 */
export function detectAbsorption(bars, pivots, index, config = {}) {
  const failed_low_lookback = config.failed_low_lookback || 80;
  const reclaim_tol = config.reclaim_tol || 0.002;
  
  const currentBar = bars[index];
  const curLow = currentBar.low ?? currentBar.close;
  const curClose = currentBar.close;

  let failed_low_event = false;
  let pivot_low_level = null;

  for (let j = index - 1; j >= Math.max(0, index - failed_low_lookback); j--) {
       if (pivots[j] && pivots[j].low !== null) {
            pivot_low_level = pivots[j].low;
            break;
       }
  }

  if (pivot_low_level !== null) {
       const cutoff = pivot_low_level * (1 - reclaim_tol);
       if (curLow < pivot_low_level && curClose >= cutoff) {
            failed_low_event = true;
       }
  }

  const vol_ratio_window = config.vol_ratio_window || 40;
  const slice = bars.slice(Math.max(0, index - vol_ratio_window + 1), index + 1);
  const down_vols = slice.filter(b => b.close < b.open).map(b => b.volume || 0);
  const up_vols = slice.filter(b => b.close >= b.open).map(b => b.volume || 0);

  const avg_down_vol = down_vols.length ? down_vols.reduce((a, b) => a + b, 0) / down_vols.length : 1;
  const avg_up_vol = up_vols.length ? up_vols.reduce((a, b) => a + b, 0) / up_vols.length : 1;
  const absorption_vol_ratio = avg_down_vol / avg_up_vol;

  return {
       failed_low_event,
       pivot_low_level,
       absorption_vol_ratio
  };
}

/**
 * Numerical Scoring System (0 - 100)
 */
export function calculateScores(bar, stateContext, stats = {}) {
  let structure = 0;
  if (stats.is_base) structure += 10;
  if (bar.close > (stats.ema20 || 0)) structure += 5;
  if ((stats.ema20_slope || 0) > 0) structure += 5;
  if (stats.weekly_trend_up) structure += 10;

  let absorption = 0;
  const failed_count = stats.failed_low_count || 0;
  if (failed_count >= 1) absorption += 10;
  if (failed_count >= 2) absorption += 10;
  if (stats.absorption_vol_ratio > 1.25) absorption += 10;

  let trigger = 0;
  if (stateContext.state === 'TRIGGERED' || stateContext.state === 'CONFIRMED') {
       if (bar.close > (stats.breakout_level || 999999)) trigger += 10;
       if (stats.rvol20 > 1.5) trigger += 10;
       if (stats.close_pos_in_bar > 0.70) trigger += 5;
  }

  let validation = 0;
  if (stateContext.state === 'CONFIRMED') {
       if (stats.holds_breakout_level) validation += 10;
       if (stats.follow_through) validation += 5;
  }

  return {
       structure,
       absorption,
       trigger,
       validation,
       total: structure + absorption + trigger + validation
  };
}

/**
 * Check for Base Structure (Setup Condition)
 * 
 * @param {Array} bars 
 * @param {number} index 
 * @param {number} window 
 * @param {number} closeVsHighMin 
 */
export function isBaseStructure(bars, index, window = 60, closeVsHighMin = 0.92) {
  if (index < window) return { is_base: false };
  const slice = bars.slice(index - window, index);
  const maxHigh = Math.max(...slice.map(b => b.high ?? b.close));
  const currentClose = bars[index].close;
  
  // Close must be close to the high of the window
  if (currentClose >= maxHigh * closeVsHighMin) {
    return { is_base: true, max_level: maxHigh };
  }
  return { is_base: false };
}

/**
 * Full Scanner Loop for a Ticker's dataset
 * 
 * @param {Array} bars 
 * @param {Object} config 
 * @param {Object} regime 
 * @returns {Object} { finalState, states: Array }
 */
export function processTickerSeries(bars = [], config = {}, regime = { regime_tag: 'UP' }) {
  if (bars.length < 2) return { state: "NONE", history: [] };

  const finalConfig = config.state_machine || {};
  const atrs = calculateAtr(bars, 14);
  const rvols = calculateRvol(bars, 20);
  const emas = calculateEma(bars, 20);
  const pivots = calculatePivots(bars, finalConfig.pivot_left || 3, finalConfig.pivot_right || 3);

  let currentState = { state: "NONE", state_age_bars: 0, max_level: 0 };
  const history = [];
  
  let failed_low_count = 0; // Incremental density counter

  for (let i = 0; i < bars.length; i++) {
    const currentBar = bars[i];
    const prevBar = bars[i - 1];
    
    const baseCheck = isBaseStructure(bars, i, finalConfig.base_window, finalConfig.close_vs_high_min);
    const atr = atrs[i] || 1;
    const rvol = rvols[i] || 1;
    const ema = emas[i] || 0;
    const prevEma = i > 0 ? emas[i - 1] : ema;
    const ema20_slope = ema - prevEma;
    
    // V2.0 Absorption Stats
    const absStats = detectAbsorption(bars, pivots, i, finalConfig);
    if (absStats.failed_low_event) failed_low_count++;

    let nextStateName = currentState.state;
    let nextLevel = currentState.max_level || baseCheck.max_level || 0;
    
    // Close comparison stats for scoring
    const close_pos_in_bar = (currentBar.high - currentBar.low) > 0 ? (currentBar.close - currentBar.low) / (currentBar.high - currentBar.low) : 0.5;
    const weekly_trend_up = currentBar.close > (calculateEma(bars, 50)[i] || 0); // 10-weeks proxy

    // 13. State-Regeln V2.0
    switch (currentState.state) {
      case "NONE":
        if (baseCheck.is_base) {
          nextStateName = "SETUP";
          nextLevel = baseCheck.max_level;
        }
        break;

      case "SETUP":
        if (currentBar.close < nextLevel * 0.85) {
          nextStateName = "NONE"; 
        } else {
          const buffer = nextLevel - (atr * (finalConfig.breakout_buffer_atr || 0.15));
          if (currentBar.close > (nextLevel + (atr * 0.15)) && rvol >= 1.5) {
            nextStateName = "TRIGGERED";
          } else if (currentBar.close >= buffer && currentBar.close <= nextLevel) {
            nextStateName = "ARMED";
          }
        }
        if (currentState.state_age_bars > (finalConfig.max_setup_age_bars || 90)) {
          nextStateName = "NONE"; // expired or stale
        }
        break;

      case "ARMED":
        if (currentBar.close > (nextLevel + (atr * 0.15)) && rvol >= 1.5) {
          nextStateName = "TRIGGERED";
        } else if (currentBar.close < (nextLevel * 0.95)) {
          nextStateName = "SETUP";
        }
        if (currentState.state_age_bars > (finalConfig.max_armed_age_bars || 10)) {
          nextStateName = "SETUP";
        }
        break;

      case "TRIGGERED":
        // 13.5 CONFIRMED dentro 3 bars
        if (currentBar.close > nextLevel) {
          nextStateName = "CONFIRMED";
        } else if (currentBar.close < (nextLevel - atr * 0.25)) {
          nextStateName = "FAILED";
        }
        break;

      case "CONFIRMED":
        if (currentBar.close < (nextLevel - atr * 0.25)) {
          nextStateName = "FAILED";
        } else if (currentState.state_age_bars > 10) {
          nextStateName = "COOLDOWN";
        }
        break;

      case "FAILED":
        nextStateName = "COOLDOWN";
        break;

      case "COOLDOWN":
        if (currentState.state_age_bars >= 10) {
          nextStateName = "NONE";
        }
        break;
    }

    // Apply Regime filter
    const stateEval = evaluateBreakoutState(
      { close: currentBar.close, high: currentBar.high },
      { state: nextStateName, state_age_bars: currentState.state_age_bars },
      regime,
      config
    );

    let resolvedState = nextStateName;
    const isSuppressed = !!stateEval.regime_suppressed;

    currentState = {
      state: resolvedState,
      state_age_bars: (resolvedState === currentState.state) ? currentState.state_age_bars + 1 : 0,
      max_level: nextLevel,
      is_suppressed: isSuppressed
    };

    // Calculate V2.0 Total Score
    const scoreStats = {
         is_base: baseCheck.is_base,
         ema20: ema,
         ema20_slope: ema20_slope,
         weekly_trend_up: weekly_trend_up,
         failed_low_count: failed_low_count,
         absorption_vol_ratio: absStats.absorption_vol_ratio,
         breakout_level: nextLevel,
         rvol20: rvol,
         close_pos_in_bar: close_pos_in_bar,
         holds_breakout_level: currentBar.close > nextLevel,
         follow_through: currentBar.close > (prevBar ? prevBar.close : 0)
    };
    
    const scores = calculateScores(currentBar, currentState, scoreStats);

    history.push({
      date: currentBar.date,
      close: currentBar.close,
      high: currentBar.high,
      low: currentBar.low,
      volume: currentBar.volume,
      state: currentState.state,
      age: currentState.state_age_bars,
      max_level: currentState.max_level,
      is_suppressed: isSuppressed,
      // V2.0 Schema
      atr14: atr,
      rvol20: rvol,
      ema20: ema,
      failed_low_event: absStats.failed_low_event,
      failed_low_count: failed_low_count,
      absorption_vol_ratio: absStats.absorption_vol_ratio,
      structure_score: scores.structure,
      absorption_score_raw: scores.absorption,
      trigger_score: scores.trigger,
      validation_score: scores.validation,
      total_score: scores.total
    });
  }

  return {
    state: currentState.state,
    max_level: currentState.max_level,
    scores: history.length ? { total: history[history.length - 1].total_score } : { total: 0 },
    history
  };
}
