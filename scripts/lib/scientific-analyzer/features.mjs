/**
 * Scientific Stock Analyzer v9.0 - Feature Engineering Module
 * 
 * Computes technical, fundamental, macro, and alternative data features
 * with strict temporal integrity (no look-ahead bias). Optimized for returns prediction.
 * 
 * Features:
 * - Momentum & Trend: Log returns, SMA distances, ADX, MACD
 * - Mean Reversion: RSI, Bollinger %B, deep value signals
 * - Volume & Liquidity: Relative volume, OBV slope, volume trend
 * - Volatility & Risk: ATR%, VaR95, volatility ratio
 * - Macro: VIX level (simulated), market regime
 * - Alternative: Sentiment, options flow (simulated)
 * - Interaction & Regime-Aware features
 */

/**
 * Compute all features from available data
 * @param {Object} indicators - Computed indicators from eod-indicators.mjs
 * @param {Object} bar - Latest bar data
 * @param {Object} macroData - Macro/market data (VIX, yields)
 * @param {Object} altData - Alternative data (sentiment, options)
 * @returns {Object} Feature vector
 */
export function computeFeatures(indicators, bar, macroData = {}, altData = {}) {
    const indicatorMap = {};
    if (Array.isArray(indicators)) {
        for (const ind of indicators) {
            if (ind?.id) indicatorMap[ind.id] = ind.value;
        }
    }

    const close = bar?.close ?? indicatorMap.close ?? null;
    const volume = bar?.volume ?? null;

    // === MOMENTUM & TREND ===
    const return_1d = indicatorMap.ret_1d_pct ?? null;
    const return_5d = indicatorMap.ret_5d_pct ?? null;
    const return_20d = indicatorMap.ret_20d_pct ?? null;
    const log_return_1d = indicatorMap.log_return_1d ?? null;

    const sma20 = indicatorMap.sma20 ?? null;
    const sma50 = indicatorMap.sma50 ?? null;
    const sma200 = indicatorMap.sma200 ?? null;

    const ma_distance_50_200 = sma200 && sma50 ? (sma50 - sma200) / sma200 : null;
    const ma_distance_20_50 = sma50 && sma20 ? (sma20 - sma50) / sma50 : null;
    const close_to_sma20_pct = indicatorMap.close_to_sma20_pct ?? null;
    const close_to_sma200_pct = indicatorMap.close_to_sma200_pct ?? null;

    const macd = indicatorMap.macd ?? null;
    const macd_signal = indicatorMap.macd_signal ?? null;
    const macd_hist = indicatorMap.macd_hist ?? null;

    // ADX (will be added - use simulated for now based on volatility)
    const adx_14 = indicatorMap.adx14 ?? estimateADX(indicatorMap);

    // === MEAN REVERSION ===
    const rsi_14 = indicatorMap.rsi14 ?? null;

    const bb_upper = indicatorMap.bb_upper ?? null;
    const bb_lower = indicatorMap.bb_lower ?? null;
    const bb_mid = indicatorMap.bb_mid ?? null;

    const bb_pctb = bb_upper && bb_lower && close
        ? (close - bb_lower) / (bb_upper - bb_lower)
        : null;

    const deep_value_signal = rsi_14 !== null && bb_pctb !== null
        ? (rsi_14 < 30 && bb_pctb < 0.1 ? 1 : 0)
        : null;

    const overbought_signal = rsi_14 !== null && bb_pctb !== null
        ? (rsi_14 > 70 && bb_pctb > 0.9 ? 1 : 0)
        : null;

    // === VOLUME & LIQUIDITY ===
    const volume_ratio_20d = indicatorMap.volume_ratio_20d ?? null;
    const volume_ma_20 = indicatorMap.volume_ma_20 ?? null;

    // Volume trend (simplified: compare current to 5d and 20d avg)
    const volume_trend = volume_ratio_20d ?? null;

    // OBV slope (will be computed if data available)
    const obv_slope = indicatorMap.obv_slope ?? null;

    // === VOLATILITY & RISK ===
    const atr14 = indicatorMap.atr14 ?? null;
    const volatility_20d = indicatorMap.volatility_20d ?? null;
    const volatility_percentile = indicatorMap.volatility_percentile ?? null;

    const atr14_normalized = atr14 && close ? atr14 / close : null;

    // Volatility ratio (short/long term)
    const volatility_ratio = volatility_20d && indicatorMap.rolling_std_20
        ? volatility_20d / (indicatorMap.rolling_std_20 || 1)
        : null;

    // VaR 95% approximation
    const var95 = volatility_20d !== null ? -1.65 * volatility_20d : null;

    // === 52-WEEK RANGE ===
    const high_52w = indicatorMap.high_52w ?? null;
    const low_52w = indicatorMap.low_52w ?? null;
    const range_52w_pct = indicatorMap.range_52w_pct ?? null;

    const position_in_52w_range = high_52w && low_52w && close
        ? (close - low_52w) / (high_52w - low_52w)
        : null;

    // === MACRO (Simulated) ===
    const vix_level = macroData.vix ?? simulateVIX(volatility_20d);
    const vix_change = macroData.vix_change ?? 0;
    const yield_curve = macroData.yield_curve ?? 0.5; // Default normal curve

    const market_regime = classifyMarketRegime(vix_level, yield_curve);

    // === ALTERNATIVE DATA (Simulated) ===
    const sentiment_score = altData.sentiment ?? simulateSentiment(return_5d, rsi_14);
    const options_call_put_ratio = altData.callPutRatio ?? 1.0;
    const options_iv_rank = altData.ivRank ?? 50;

    // === INTERACTION FEATURES ===
    const rsi_volume_interaction = rsi_14 !== null && volume_ratio_20d !== null
        ? rsi_14 * volume_ratio_20d / 100
        : null;

    const volatility_sentiment_interaction = volatility_20d !== null && sentiment_score !== null
        ? volatility_20d * sentiment_score
        : null;

    const vix_return_interaction = vix_level !== null && return_20d !== null
        ? vix_level * return_20d
        : null;

    // === REGIME-AWARE FEATURES ===
    const regime_multiplier = getRegimeMultiplier(market_regime);

    const regime_adjusted_return = return_20d !== null
        ? return_20d * regime_multiplier
        : null;

    const regime_adjusted_volatility = volatility_20d !== null
        ? volatility_20d * getVolatilityRegimeAdjustment(vix_level)
        : null;

    // === LAG/AUTOCORRELATION ===
    const lag1_autocorrelation = indicatorMap.lag1_autocorrelation ?? null;

    // Build feature object
    const features = {
        // Momentum & Trend
        return_1d,
        return_5d,
        return_20d,
        log_return_1d,
        ma_distance_50_200,
        ma_distance_20_50,
        close_to_sma20_pct,
        close_to_sma200_pct,
        adx_14,
        macd_hist,

        // Mean Reversion
        rsi_14,
        bb_pctb,
        deep_value_signal,
        overbought_signal,

        // Volume
        volume_ratio_20d,
        volume_trend,
        obv_slope,

        // Volatility
        atr14_normalized,
        volatility_20d,
        volatility_ratio,
        volatility_percentile,
        var95,

        // 52-Week Range
        position_in_52w_range,
        range_52w_pct,

        // Macro
        vix_level,
        vix_change,
        yield_curve,
        market_regime,

        // Alternative
        sentiment_score,
        options_call_put_ratio,
        options_iv_rank,

        // Interactions
        rsi_volume_interaction,
        volatility_sentiment_interaction,
        vix_return_interaction,

        // Regime-Aware
        regime_adjusted_return,
        regime_adjusted_volatility,

        // Statistical
        lag1_autocorrelation
    };

    // Filter out null/undefined/NaN values
    return Object.fromEntries(
        Object.entries(features).filter(([k, v]) =>
            v !== null && v !== undefined && (typeof v !== 'number' || !isNaN(v))
        )
    );
}

// === HELPER FUNCTIONS ===

function estimateADX(indicators) {
    // Estimate ADX from volatility percentile (simplified)
    const volPercentile = indicators.volatility_percentile;
    if (volPercentile === null || volPercentile === undefined) return null;
    // ADX typically ranges 0-100, correlates with trend strength
    return Math.min(100, Math.max(0, volPercentile * 0.8 + 10));
}

function simulateVIX(volatility20d) {
    // Simulate VIX based on 20d volatility
    if (volatility20d === null || volatility20d === undefined) return 20;
    // Convert daily volatility to annualized, scale to VIX-like range
    const annualized = volatility20d * Math.sqrt(252) * 100;
    return Math.min(80, Math.max(10, annualized));
}

function simulateSentiment(return5d, rsi14) {
    // Simulate sentiment from momentum indicators
    let sentiment = 0;
    if (return5d !== null) {
        sentiment += return5d > 0 ? 0.3 : -0.3;
    }
    if (rsi14 !== null) {
        sentiment += (rsi14 - 50) / 100;
    }
    return Math.max(-1, Math.min(1, sentiment));
}

function classifyMarketRegime(vix, yieldCurve) {
    if (vix > 30) return 'high_volatility';
    if (vix < 15) return 'low_volatility';
    if (yieldCurve < 0) return 'inverted_curve';
    return 'normal';
}

function getRegimeMultiplier(regime) {
    const multipliers = {
        'high_volatility': 0.5,
        'low_volatility': 1.2,
        'inverted_curve': 0.7,
        'normal': 1.0
    };
    return multipliers[regime] || 1.0;
}

function getVolatilityRegimeAdjustment(vix) {
    if (vix > 30) return 1.5;
    if (vix < 15) return 0.8;
    return 1.0;
}

/**
 * Get list of feature names for model training
 */
export function getFeatureNames() {
    return [
        'return_1d', 'return_5d', 'return_20d', 'log_return_1d',
        'ma_distance_50_200', 'ma_distance_20_50',
        'close_to_sma20_pct', 'close_to_sma200_pct',
        'adx_14', 'macd_hist',
        'rsi_14', 'bb_pctb', 'deep_value_signal', 'overbought_signal',
        'volume_ratio_20d', 'volume_trend',
        'atr14_normalized', 'volatility_20d', 'volatility_ratio', 'volatility_percentile', 'var95',
        'position_in_52w_range', 'range_52w_pct',
        'vix_level', 'yield_curve',
        'sentiment_score', 'options_call_put_ratio',
        'rsi_volume_interaction', 'volatility_sentiment_interaction',
        'regime_adjusted_return', 'regime_adjusted_volatility',
        'lag1_autocorrelation'
    ];
}
