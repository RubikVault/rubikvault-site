import { finiteNumber, normalizeId } from './shared.mjs';

export function buildFastFeatures({ row, indicators = null, eligibility } = {}) {
  const stats = indicatorListToMap(indicators);
  const recentCloses = Array.isArray(row?._tmp_recent_closes) ? row._tmp_recent_closes.map(finiteNumber).filter((n) => n != null) : [];
  const close = eligibility?.close ?? recentCloses.at(-1) ?? finiteNumber(stats.close);
  const avgVolume = finiteNumber(row?.avg_volume_30d ?? row?.avg_volume_10d);
  const dollarVolume = close != null && avgVolume != null ? close * avgVolume : finiteNumber(stats.adv20_dollar);
  const volumeRatio20d = finiteNumber(stats.volume_ratio_20d) ?? ratioLastToAverage(row?._tmp_recent_volumes);
  const liquidityScore = finiteNumber(stats.liquidity_score) ?? liquidityScoreFromDollarVolume(dollarVolume);
  const ret5 = finiteNumber(stats.ret_5d_pct) ?? pctReturn(recentCloses, 5);
  const ret20 = finiteNumber(stats.ret_20d_pct) ?? pctReturn(recentCloses, Math.min(9, Math.max(1, recentCloses.length - 1)));
  const syntheticVolPct = recentCloses.length >= 6 ? Math.min(100, Math.max(0, volatilityPct(recentCloses) * 5000)) : null;
  const volatilityPercentile = finiteNumber(stats.volatility_percentile) ?? syntheticVolPct;
  const atr14 = finiteNumber(stats.atr14) ?? (close != null && volatilityPercentile != null ? close * Math.max(0.005, volatilityPercentile / 10000) : null);
  const sma20 = finiteNumber(stats.sma20) ?? mean(recentCloses.slice(-10));
  const sma50 = finiteNumber(stats.sma50) ?? mean(recentCloses.slice(-10));
  const sma200 = finiteNumber(stats.sma200);
  const rsi14 = finiteNumber(stats.rsi14) ?? roughRsi(recentCloses);

  return {
    asset_id: normalizeId(row?.canonical_id),
    close,
    bars_count: eligibility?.bars_count || finiteNumber(row?.bars_count) || 0,
    last_trade_date: eligibility?.as_of_date || row?.last_trade_date || null,
    sma20,
    sma50,
    sma200,
    rsi14,
    macd_hist: finiteNumber(stats.macd_hist),
    atr14,
    volatility_percentile: volatilityPercentile,
    volume_ratio_20d: volumeRatio20d,
    liquidity_score: liquidityScore,
    dollar_volume_20d: dollarVolume,
    ret_5d_pct: ret5,
    ret_20d_pct: ret20,
    close_to_sma20_pct: close != null && sma20 ? (close - sma20) / sma20 : null,
    close_to_sma200_pct: close != null && sma200 ? (close - sma200) / sma200 : null,
  };
}

export function buyCriticalFeaturesAvailable(features) {
  return ['close', 'bars_count', 'last_trade_date', 'liquidity_score', 'volatility_percentile', 'atr14']
    .every((key) => features?.[key] != null && features?.[key] !== '');
}

function indicatorListToMap(indicators) {
  const map = {};
  const list = Array.isArray(indicators?.indicators) ? indicators.indicators : Array.isArray(indicators) ? indicators : [];
  for (const item of list) {
    if (item?.id) map[item.id] = item.value;
  }
  return map;
}

function mean(values) {
  const clean = values.map(finiteNumber).filter((n) => n != null);
  if (!clean.length) return null;
  return clean.reduce((sum, n) => sum + n, 0) / clean.length;
}

function pctReturn(values, days) {
  const clean = values.map(finiteNumber).filter((n) => n != null);
  if (clean.length <= days) return null;
  const last = clean.at(-1);
  const prev = clean[clean.length - 1 - days];
  return prev ? (last - prev) / prev : null;
}

function volatilityPct(values) {
  const rets = [];
  for (let i = 1; i < values.length; i += 1) {
    if (values[i - 1]) rets.push((values[i] - values[i - 1]) / values[i - 1]);
  }
  if (rets.length < 2) return 0;
  const m = rets.reduce((s, v) => s + v, 0) / rets.length;
  const variance = rets.reduce((s, v) => s + (v - m) ** 2, 0) / (rets.length - 1);
  return Math.sqrt(variance);
}

function ratioLastToAverage(values) {
  const clean = Array.isArray(values) ? values.map(finiteNumber).filter((n) => n != null) : [];
  if (clean.length < 2) return null;
  const avg = clean.reduce((s, n) => s + n, 0) / clean.length;
  return avg > 0 ? clean.at(-1) / avg : null;
}

function liquidityScoreFromDollarVolume(dollarVolume) {
  const n = finiteNumber(dollarVolume);
  if (n == null) return null;
  if (n >= 1e9) return 95;
  if (n >= 1e8) return 85;
  if (n >= 1e7) return 70;
  if (n >= 1e6) return 55;
  if (n >= 250000) return 40;
  return 20;
}

function roughRsi(values) {
  const clean = values.map(finiteNumber).filter((n) => n != null);
  if (clean.length < 3) return null;
  let gains = 0;
  let losses = 0;
  for (let i = 1; i < clean.length; i += 1) {
    const delta = clean[i] - clean[i - 1];
    if (delta >= 0) gains += delta;
    else losses -= delta;
  }
  if (losses === 0) return 70;
  return 100 - (100 / (1 + gains / losses));
}
