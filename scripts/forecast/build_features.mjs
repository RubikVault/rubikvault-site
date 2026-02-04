/**
 * Forecast System v3.0 — Feature Factory
 * 
 * Computes deterministic features for probabilistic forecasting.
 * Feature groups: basic, technical, trend_context, relative_strength, momentum, volume_flow, regime, events
 * 
 * All features must be deterministic given the same inputs.
 */

import { computeDigest, canonicalJSON } from '../lib/digest.js';

// ─────────────────────────────────────────────────────────────────────────────
// Basic Feature Group
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Compute log returns over N days
 * @param {number[]} closes - Array of closing prices (oldest first)
 * @param {number} n - Number of days
 * @returns {number|null}
 */
export function logReturn(closes, n) {
    if (!Array.isArray(closes) || closes.length < n + 1) return null;
    const current = closes[closes.length - 1];
    const past = closes[closes.length - 1 - n];
    if (!Number.isFinite(current) || !Number.isFinite(past) || past <= 0 || current <= 0) return null;
    return Math.log(current / past);
}

/**
 * Compute rolling volatility (std of daily returns)
 * @param {number[]} closes - Array of closing prices
 * @param {number} window - Window size
 * @returns {number|null}
 */
export function volatility(closes, window) {
    if (!Array.isArray(closes) || closes.length < window + 1) return null;
    const returns = [];
    for (let i = closes.length - window; i < closes.length; i++) {
        const prev = closes[i - 1];
        const curr = closes[i];
        if (!Number.isFinite(prev) || !Number.isFinite(curr) || prev <= 0 || curr <= 0) continue;
        returns.push(Math.log(curr / prev));
    }
    if (returns.length < 5) return null;
    const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
    const variance = returns.reduce((a, b) => a + (b - mean) ** 2, 0) / returns.length;
    return Math.sqrt(variance);
}

// ─────────────────────────────────────────────────────────────────────────────
// Technical Feature Group
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Compute RSI (Relative Strength Index)
 * @param {number[]} closes - Array of closing prices
 * @param {number} period - RSI period (default 14)
 * @returns {number|null}
 */
export function rsi(closes, period = 14) {
    if (!Array.isArray(closes) || closes.length < period + 1) return null;

    const changes = [];
    for (let i = closes.length - period; i < closes.length; i++) {
        changes.push(closes[i] - closes[i - 1]);
    }

    let avgGain = 0, avgLoss = 0;
    for (const change of changes) {
        if (change > 0) avgGain += change;
        else avgLoss += Math.abs(change);
    }
    avgGain /= period;
    avgLoss /= period;

    if (avgLoss === 0) return 100;
    const rs = avgGain / avgLoss;
    return 100 - (100 / (1 + rs));
}

/**
 * Compute Simple Moving Average
 * @param {number[]} values - Array of values
 * @param {number} period - SMA period
 * @returns {number|null}
 */
export function sma(values, period) {
    if (!Array.isArray(values) || values.length < period) return null;
    const slice = values.slice(-period);
    const sum = slice.reduce((a, b) => a + (Number.isFinite(b) ? b : 0), 0);
    return sum / period;
}

/**
 * Compute SMA ratio (close / SMA)
 * @param {number} close - Current close
 * @param {number} smaValue - SMA value
 * @returns {number|null}
 */
export function smaRatio(close, smaValue) {
    if (!Number.isFinite(close) || !Number.isFinite(smaValue) || smaValue === 0) return null;
    return close / smaValue;
}

// ─────────────────────────────────────────────────────────────────────────────
// Trend Context Feature Group
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Compute distance to SMA (percentage)
 * @param {number} close - Current close
 * @param {number} smaValue - SMA value
 * @returns {number|null}
 */
export function distToSma(close, smaValue) {
    if (!Number.isFinite(close) || !Number.isFinite(smaValue) || smaValue === 0) return null;
    return (close - smaValue) / smaValue;
}

/**
 * Check if price is above SMA
 * @param {number} close - Current close
 * @param {number} smaValue - SMA value
 * @returns {number} 0 or 1
 */
export function isAboveSma(close, smaValue) {
    if (!Number.isFinite(close) || !Number.isFinite(smaValue)) return 0;
    return close > smaValue ? 1 : 0;
}

// ─────────────────────────────────────────────────────────────────────────────
// Relative Strength Feature Group
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Compute relative strength vs benchmark
 * @param {number} tickerReturn - Ticker return over period
 * @param {number} benchmarkReturn - Benchmark return over period
 * @returns {number|null}
 */
export function relativeStrength(tickerReturn, benchmarkReturn) {
    if (!Number.isFinite(tickerReturn) || !Number.isFinite(benchmarkReturn)) return null;
    return tickerReturn - benchmarkReturn;
}

// ─────────────────────────────────────────────────────────────────────────────
// Momentum Feature Group
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Compute Rate of Change
 * @param {number[]} closes - Array of closing prices
 * @param {number} period - ROC period
 * @returns {number|null}
 */
export function roc(closes, period) {
    if (!Array.isArray(closes) || closes.length < period + 1) return null;
    const current = closes[closes.length - 1];
    const past = closes[closes.length - 1 - period];
    if (!Number.isFinite(current) || !Number.isFinite(past) || past === 0) return null;
    return (current - past) / past;
}

/**
 * Compute MACD
 * @param {number[]} closes - Array of closing prices
 * @param {number} fast - Fast EMA period (default 12)
 * @param {number} slow - Slow EMA period (default 26)
 * @param {number} signal - Signal period (default 9)
 * @returns {{value: number, signal: number, histogram: number}|null}
 */
export function macd(closes, fast = 12, slow = 26, signal = 9) {
    if (!Array.isArray(closes) || closes.length < slow + signal) return null;

    // Compute EMAs
    const emaFast = ema(closes, fast);
    const emaSlow = ema(closes, slow);
    if (emaFast === null || emaSlow === null) return null;

    const macdLine = emaFast - emaSlow;
    // Simplified signal line (would need historical MACD values for proper calculation)
    const signalLine = macdLine * 0.9; // Approximation for initial implementation

    return {
        value: macdLine,
        signal: signalLine,
        histogram: macdLine - signalLine
    };
}

/**
 * Compute Exponential Moving Average
 * @param {number[]} values - Array of values
 * @param {number} period - EMA period
 * @returns {number|null}
 */
export function ema(values, period) {
    if (!Array.isArray(values) || values.length < period) return null;
    const k = 2 / (period + 1);
    let emaValue = sma(values.slice(0, period), period);
    if (emaValue === null) return null;

    for (let i = period; i < values.length; i++) {
        if (!Number.isFinite(values[i])) continue;
        emaValue = values[i] * k + emaValue * (1 - k);
    }
    return emaValue;
}

// ─────────────────────────────────────────────────────────────────────────────
// Volume Flow Feature Group
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Compute volume z-score
 * @param {number[]} volumes - Array of volumes
 * @param {number} window - Window size
 * @returns {number|null}
 */
export function volumeZscore(volumes, window) {
    if (!Array.isArray(volumes) || volumes.length < window) return null;
    const slice = volumes.slice(-window);
    const current = volumes[volumes.length - 1];
    const mean = slice.reduce((a, b) => a + b, 0) / slice.length;
    const std = Math.sqrt(slice.reduce((a, b) => a + (b - mean) ** 2, 0) / slice.length);
    if (std === 0) return 0;
    return (current - mean) / std;
}

/**
 * Compute volume ratio (current / avg)
 * @param {number[]} volumes - Array of volumes
 * @param {number} window - Window size
 * @returns {number|null}
 */
export function volumeRatio(volumes, window) {
    if (!Array.isArray(volumes) || volumes.length < window) return null;
    const current = volumes[volumes.length - 1];
    const avg = volumes.slice(-window).reduce((a, b) => a + b, 0) / window;
    if (avg === 0) return null;
    return current / avg;
}

/**
 * Compute On-Balance Volume (OBV)
 * @param {number[]} closes - Array of closing prices
 * @param {number[]} volumes - Array of volumes
 * @returns {number|null}
 */
export function obv(closes, volumes) {
    if (!Array.isArray(closes) || !Array.isArray(volumes) || closes.length < 2) return null;
    if (closes.length !== volumes.length) return null;

    let obvValue = 0;
    for (let i = 1; i < closes.length; i++) {
        if (closes[i] > closes[i - 1]) obvValue += volumes[i];
        else if (closes[i] < closes[i - 1]) obvValue -= volumes[i];
        // No change if closes are equal
    }
    return obvValue;
}

// ─────────────────────────────────────────────────────────────────────────────
// Regime Feature Group
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Determine volatility regime
 * @param {number} vol - Current volatility
 * @param {number[]} historicalVols - Historical volatility values
 * @returns {string} "low" | "mid" | "high"
 */
export function volRegime(vol, historicalVols) {
    if (!Number.isFinite(vol) || !Array.isArray(historicalVols) || historicalVols.length < 10) {
        return 'mid';
    }
    const sorted = [...historicalVols].filter(v => Number.isFinite(v)).sort((a, b) => a - b);
    const p33 = sorted[Math.floor(sorted.length * 0.33)];
    const p66 = sorted[Math.floor(sorted.length * 0.66)];
    if (vol <= p33) return 'low';
    if (vol >= p66) return 'high';
    return 'mid';
}

/**
 * Determine trend regime
 * @param {number} close - Current close
 * @param {number} sma200 - SMA 200 value
 * @param {number} sma50 - SMA 50 value
 * @returns {string} "down" | "flat" | "up"
 */
export function trendRegime(close, sma200, sma50) {
    if (!Number.isFinite(close) || !Number.isFinite(sma200) || !Number.isFinite(sma50)) {
        return 'flat';
    }
    const distTo200 = (close - sma200) / sma200;
    const smaSlope = (sma50 - sma200) / sma200;

    if (distTo200 > 0.05 && smaSlope > 0.02) return 'up';
    if (distTo200 < -0.05 && smaSlope < -0.02) return 'down';
    return 'flat';
}

// ─────────────────────────────────────────────────────────────────────────────
// Events Feature Group
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Compute event bucket
 * @param {object} eventFlags - Event flags
 * @returns {string} "normal_days" | "event_window"
 */
export function eventBucket(eventFlags) {
    if (!eventFlags) return 'normal_days';
    if (eventFlags.earnings_within_5d || eventFlags.macro_today || eventFlags.macro_within_2d) {
        return 'event_window';
    }
    return 'normal_days';
}

// ─────────────────────────────────────────────────────────────────────────────
// Main Feature Builder
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Build complete feature snapshot for a ticker on a trading date
 * @param {object} params
 * @param {string} params.ticker - Stock ticker
 * @param {string} params.tradingDate - Trading date YYYY-MM-DD
 * @param {number[]} params.closes - Historical closing prices (oldest first)
 * @param {number[]} params.volumes - Historical volumes (oldest first)
 * @param {number[]} params.spyCloses - SPY closing prices for relative strength
 * @param {object} params.eventFlags - Event flags
 * @param {string[]} params.enabledGroups - Enabled feature groups
 * @returns {object} Feature snapshot with hash
 */
export function buildFeatureSnapshot({
    ticker,
    tradingDate,
    closes,
    volumes,
    spyCloses = null,
    eventFlags = null,
    enabledGroups = ['basic', 'technical', 'trend_context', 'relative_strength', 'regime', 'events']
}) {
    const features = {};
    const missingFeatures = [];

    const latestClose = closes?.[closes.length - 1] ?? null;

    // Basic group
    if (enabledGroups.includes('basic')) {
        features.returns_1d = logReturn(closes, 1);
        features.returns_5d = logReturn(closes, 5);
        features.returns_20d = logReturn(closes, 20);
        features.vol_20d = volatility(closes, 20);

        if (features.returns_1d === null) missingFeatures.push('returns_1d');
        if (features.vol_20d === null) missingFeatures.push('vol_20d');
    }

    // Technical group
    if (enabledGroups.includes('technical')) {
        features.rsi_14 = rsi(closes, 14);
        features.sma_20 = sma(closes, 20);
        features.sma_50 = sma(closes, 50);
        features.sma_200 = sma(closes, 200);
        features.sma_20_ratio = smaRatio(latestClose, features.sma_20);
        features.sma_50_ratio = smaRatio(latestClose, features.sma_50);
        features.sma_200_ratio = smaRatio(latestClose, features.sma_200);
    }

    // Trend context group
    if (enabledGroups.includes('trend_context')) {
        features.dist_to_200d = distToSma(latestClose, features.sma_200 ?? sma(closes, 200));
        features.dist_to_21w = distToSma(latestClose, sma(closes, 105));
        features.is_above_200d = isAboveSma(latestClose, features.sma_200 ?? sma(closes, 200));
        features.is_above_21w = isAboveSma(latestClose, sma(closes, 105));
    }

    // Relative strength group
    if (enabledGroups.includes('relative_strength') && spyCloses) {
        const tickerRet20 = logReturn(closes, 20);
        const spyRet20 = logReturn(spyCloses, 20);
        features.rs_vs_spy_20d = relativeStrength(tickerRet20, spyRet20);
    }

    // Momentum group
    if (enabledGroups.includes('momentum')) {
        features.roc_10d = roc(closes, 10);
        features.roc_20d = roc(closes, 20);
        features.roc_50d = roc(closes, 50);
        features.macd = macd(closes);
    }

    // Volume flow group
    if (enabledGroups.includes('volume_flow') && volumes) {
        features.volume_zscore_20d = volumeZscore(volumes, 20);
        features.volume_ratio_20d = volumeRatio(volumes, 20);
        features.obv = obv(closes, volumes);
    }

    // Regime group
    if (enabledGroups.includes('regime')) {
        // Collect historical volatilities for regime boundaries
        const historicalVols = [];
        for (let i = 20; i < closes.length; i++) {
            const v = volatility(closes.slice(0, i + 1), 20);
            if (v !== null) historicalVols.push(v);
        }
        features.vol_regime = volRegime(features.vol_20d ?? volatility(closes, 20), historicalVols);
        features.trend_regime = trendRegime(
            latestClose,
            features.sma_200 ?? sma(closes, 200),
            features.sma_50 ?? sma(closes, 50)
        );
        features.regime_id = `${features.vol_regime}_${features.trend_regime}`;
    }

    // Events group
    if (enabledGroups.includes('events')) {
        features.event_bucket = eventBucket(eventFlags);
        features.earnings_within_5d = eventFlags?.earnings_within_5d ?? 0;
        features.earnings_within_2d = eventFlags?.earnings_within_2d ?? 0;
        features.macro_today = eventFlags?.macro_today ?? 0;
        features.macro_within_2d = eventFlags?.macro_within_2d ?? 0;
    }

    // Compute feature snapshot hash
    const hashInput = {
        ticker,
        trading_date: tradingDate,
        features,
        feature_groups_enabled: enabledGroups
    };
    const featureSnapshotHash = computeDigest(hashInput);

    return {
        ticker,
        trading_date: tradingDate,
        features,
        feature_groups_enabled: enabledGroups,
        missing_features: missingFeatures,
        feature_snapshot_hash: featureSnapshotHash
    };
}

export default {
    // Basic
    logReturn,
    volatility,
    // Technical
    rsi,
    sma,
    smaRatio,
    ema,
    // Trend context
    distToSma,
    isAboveSma,
    // Relative strength
    relativeStrength,
    // Momentum
    roc,
    macd,
    // Volume flow
    volumeZscore,
    volumeRatio,
    obv,
    // Regime
    volRegime,
    trendRegime,
    // Events
    eventBucket,
    // Builder
    buildFeatureSnapshot
};
