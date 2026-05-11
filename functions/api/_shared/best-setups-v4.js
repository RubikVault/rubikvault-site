import { buildAssetSegmentationProfile } from './asset-segmentation.mjs';

const US_TICKER_REGEX = /^[A-Z]{1,5}(?:-[A-Z])?$/;
const SUPPORTED_ASSET_CLASSES = new Set(['stock', 'etf']);

export const BEST_SETUP_LIMIT = 10;
export const BEST_SETUP_CANDIDATE_LIMIT = 36;
export const BEST_SETUP_QUANTLAB_LIMIT = 120;
export const BEST_SETUP_FORECAST_LIMIT = 240;
const MAX_REJECTION_LOGS = Math.max(0, Number(process.env.BEST_SETUPS_MAX_REJECTION_LOGS || 25));
let rejectionLogsEmitted = 0;
let rejectionLogOverflowNoted = false;

export const HORIZON_CONFIG = Object.freeze({
  short: { key: '1d', label: 'Short-Term (1-5 days)', minBullishProbability: 0.6 },
  medium: { key: '5d', label: 'Medium-Term (5-20 days)', minBullishProbability: 0.62 },
  long: { key: '20d', label: 'Long-Term (20-60 days)', minBullishProbability: 0.68 }
});

export function normalizeTicker(raw) {
  const value = String(raw || '').trim().toUpperCase();
  return US_TICKER_REGEX.test(value) ? value : '';
}

function normalizeAssetClass(raw, fallback = 'stock') {
  const value = String(raw || fallback).trim().toLowerCase();
  return SUPPORTED_ASSET_CLASSES.has(value) ? value : fallback;
}

function toNumber(value) {
  if (value === null || value === undefined || value === '') return null;
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

function logRejectedCandidate(message) {
  if (MAX_REJECTION_LOGS <= 0) return;
  if (rejectionLogsEmitted < MAX_REJECTION_LOGS) {
    console.log(message);
    rejectionLogsEmitted += 1;
    return;
  }
  if (!rejectionLogOverflowNoted) {
    console.log(`[best-setups-v4] Additional candidate rejection logs suppressed after ${MAX_REJECTION_LOGS} entries.`);
    rejectionLogOverflowNoted = true;
  }
}

export function bullishProbability(horizonDoc) {
  if (!horizonDoc || typeof horizonDoc !== 'object') return null;
  const raw = toNumber(horizonDoc.probability);
  if (raw == null || raw < 0 || raw > 1) return null;
  const direction = String(horizonDoc.direction || '').trim().toLowerCase();
  if (direction === 'bullish') return raw;
  return null;
}

export function buildForecastCandidatePools(forecastDoc, options = {}) {
  const candidateLimit = Math.max(12, Number(options.candidateLimit) || BEST_SETUP_FORECAST_LIMIT);
  const rows = Array.isArray(forecastDoc?.data?.forecasts) ? forecastDoc.data.forecasts : [];
  const out = { short: [], medium: [], long: [] };

  for (const row of rows) {
    const ticker = normalizeTicker(row?.symbol || row?.ticker || '');
    if (!ticker) continue;
    const horizons = row?.horizons && typeof row.horizons === 'object' ? row.horizons : {};

    for (const [horizon, cfg] of Object.entries(HORIZON_CONFIG)) {
      const horizonDoc = horizons[cfg.key];
      const probability = bullishProbability(horizonDoc);
      if (probability == null || probability < cfg.minBullishProbability) continue;
      out[horizon].push({
        ticker,
        name: typeof row?.name === 'string' && row.name.trim() ? row.name.trim() : null,
        horizon,
        horizon_key: cfg.key,
        probability,
        source: `forecast_latest_${cfg.key}`
      });
    }
  }

  for (const horizon of Object.keys(out)) {
    out[horizon].sort((a, b) => {
      if (b.probability !== a.probability) return b.probability - a.probability;
      return a.ticker.localeCompare(b.ticker);
    });
    out[horizon] = out[horizon].slice(0, candidateLimit);
  }

  return out;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function quantLabBaseScore(row) {
  const pct = clamp(toNumber(row?.ranking?.avgTopPercentile) ?? 0, 0, 100);
  const buyExperts = clamp(toNumber(row?.consensus?.buyExperts) ?? 0, 0, 16);
  const avoidExperts = clamp(toNumber(row?.consensus?.avoidExperts) ?? 0, 0, 16);
  const strongExperts = clamp(toNumber(row?.consensus?.strongOrBetterExperts) ?? 0, 0, 16);
  const trendGate = clamp(toNumber(row?.metrics?.trendGate) ?? 0, 0, 1);
  const macdHist = toNumber(row?.metrics?.macdHist) ?? 0;
  const rsi14 = clamp(toNumber(row?.metrics?.rsi14) ?? 50, 0, 100);
  const globalRank = toNumber(row?.ranking?.globalTop10Rank);
  const continentRank = toNumber(row?.ranking?.continentTop10Rank);

  const buyLeadScore = clamp((buyExperts - avoidExperts + 16) / 32, 0, 1) * 100;
  const strongScore = (strongExperts / 16) * 100;
  const trendScore = trendGate * 100;
  const macdScore = clamp((macdHist + 1) / 2, 0, 1) * 100;
  const rsiScore = clamp(100 - Math.abs(58 - rsi14) * 2.2, 0, 100);
  const globalRankScore = globalRank != null ? clamp(100 - ((globalRank - 1) / 100), 0, 100) : 0;
  const continentRankScore = continentRank != null ? clamp(100 - ((continentRank - 1) / 20), 0, 100) : 0;

  return (
    pct * 0.42 +
    buyLeadScore * 0.18 +
    strongScore * 0.12 +
    trendScore * 0.12 +
    macdScore * 0.06 +
    rsiScore * 0.04 +
    globalRankScore * 0.04 +
    continentRankScore * 0.02
  );
}

export function buildQuantLabCandidates(quantlabRows, options = {}) {
  const candidateLimit = Math.max(20, Number(options.candidateLimit) || BEST_SETUP_QUANTLAB_LIMIT);
  const exchangeAllowlist = Array.isArray(options.exchangeAllowlist)
    ? new Set(options.exchangeAllowlist.map((value) => String(value || '').trim().toUpperCase()).filter(Boolean))
    : new Set(['US']);
  const requireScoredToday = options.requireScoredToday !== false;
  const assetClasses = new Set(
    (Array.isArray(options.assetClasses) ? options.assetClasses : ['stock', 'etf'])
      .map((value) => normalizeAssetClass(value, 'stock')),
  );
  const rows = Array.isArray(quantlabRows) ? quantlabRows : [];
  const out = [];

  for (const row of rows) {
    const ticker = normalizeTicker(row?.ticker || '');
    if (!ticker) continue;
    const assetClass = normalizeAssetClass(row?.assetClassHint || row?.asset_class_hint || row?.assetClass || row?.asset_class || 'stock', 'stock');
    if (!assetClasses.has(assetClass)) continue;
    const exchange = String(row?.exchange || '').toUpperCase();
    const tone = String(row?.state?.tone || '').toLowerCase();
    if (exchangeAllowlist.size > 0 && !exchangeAllowlist.has(exchange)) continue;
    if (requireScoredToday && row?.scoredToday !== true) continue;

    const avgTopPercentile = toNumber(row?.ranking?.avgTopPercentile);
    const buyExperts = toNumber(row?.consensus?.buyExperts);
    const avoidExperts = toNumber(row?.consensus?.avoidExperts);
    const strongExperts = toNumber(row?.consensus?.strongOrBetterExperts);
    const minPercentile = assetClass === 'etf'
      ? Math.max(50, Number(options.minEtfPercentile) || 70)
      : Math.max(60, Number(options.minStockPercentile) || 80);
    const minStrongExperts = assetClass === 'etf'
      ? Math.max(4, Number(options.minEtfStrongExperts) || 8)
      : Math.max(2, Number(options.minStockStrongExperts) || 6);
    if (avgTopPercentile == null || avgTopPercentile < minPercentile) continue;
    if (buyExperts == null || avoidExperts == null) continue;
    if (tone !== 'good' && buyExperts < Math.max(avoidExperts, 2)) continue;
    if (tone === 'good' && buyExperts < avoidExperts) continue;
    if (tone === 'good' && strongExperts != null && strongExperts < minStrongExperts) continue;

    const score = quantLabBaseScore(row);
    out.push({
      ticker,
      asset_class: assetClass,
      name: typeof row?.name === 'string' && row.name.trim() ? row.name.trim() : null,
      source: assetClass === 'etf' ? 'quantlab_etf_publish' : 'quantlab_stock_publish',
      score,
      probability: null,
      as_of_date: row?.asOfDate || null,
      ranking_label: row?.state?.consensusLabel || row?.state?.label || null,
      global_rank: toNumber(row?.ranking?.globalTop10Rank),
      continent_rank: toNumber(row?.ranking?.continentTop10Rank),
      avg_top_percentile: avgTopPercentile,
      buy_experts: buyExperts,
      avoid_experts: avoidExperts,
      strong_experts: strongExperts,
      macd_hist: toNumber(row?.metrics?.macdHist),
      trend_gate: toNumber(row?.metrics?.trendGate),
      rsi14: toNumber(row?.metrics?.rsi14),
      scored_today: row?.scoredToday === true
    });
  }

  out.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    if ((b.avg_top_percentile ?? -Infinity) !== (a.avg_top_percentile ?? -Infinity)) {
      return (b.avg_top_percentile ?? -Infinity) - (a.avg_top_percentile ?? -Infinity);
    }
    if ((a.global_rank ?? Infinity) !== (b.global_rank ?? Infinity)) {
      return (a.global_rank ?? Infinity) - (b.global_rank ?? Infinity);
    }
    return a.ticker.localeCompare(b.ticker);
  });

  return out.slice(0, candidateLimit);
}

export function mergeDiscoveryPools({ forecastPools = {}, quantlabCandidates = [] } = {}) {
  const out = { short: [], medium: [], long: [] };
  const quantlabRows = Array.isArray(quantlabCandidates) ? quantlabCandidates : [];

  for (const horizon of Object.keys(out)) {
    const seen = new Set();
    const merged = [
      ...((Array.isArray(forecastPools?.[horizon]) ? forecastPools[horizon] : []).map((row) => ({
        ...row,
        asset_class: row?.asset_class || 'stock',
      }))),
      ...quantlabRows.map((row) => ({
        ...row,
        horizon,
        horizon_key: HORIZON_CONFIG[horizon]?.key || null,
        source: row?.source || 'quantlab_stock_publish',
      })),
    ];

    for (const row of merged) {
      const ticker = normalizeTicker(row?.ticker || '');
      const assetClass = normalizeAssetClass(row?.asset_class || row?.assetClass || 'stock', 'stock');
      const dedupeKey = `${assetClass}:${ticker}`;
      if (!ticker || seen.has(dedupeKey)) continue;
      seen.add(dedupeKey);
      out[horizon].push({ ...row, ticker, asset_class: assetClass });
    }
  }

  return out;
}

export function buildVerifiedFrontpageRow(stockDoc, candidate) {
  const ticker = normalizeTicker(candidate?.ticker || stockDoc?.data?.ticker || '');
  if (!ticker) { console.log('DEBUG: buildVerifiedFrontpageRow rejected due to !ticker'); return null; }

  const decision = stockDoc?.decision || {};
  const horizon = String(candidate?.horizon || '').trim().toLowerCase() || 'medium';
  const decisionSlice = decision?.horizons?.[horizon] || decision;
  const states = stockDoc?.states || {};
  const stats = stockDoc?.data?.market_stats?.stats || {};
  const gates = Array.isArray(decisionSlice?.trigger_gates) ? decisionSlice.trigger_gates : [];
  const assetClass = normalizeAssetClass(candidate?.asset_class || 'stock', 'stock');
  const segmentationProfile = buildAssetSegmentationProfile({
    ticker,
    assetClass,
    marketCapUsd: stockDoc?.data?.fundamentals?.marketCap ?? null,
    liquidityScore: stats?.liquidity_score,
    liquidityState: states?.liquidity,
    exchange: stockDoc?.data?.universe?.exchange || null,
  });
  
  // Entfernung der Hard-Gates für V6 Top-K Relaxation. Wir geben alle Validen Zeilen strukturiert zurück.
  // Sortierung erfolgt in horizonScore() / buildHorizonRows() basierend auf fundamentaler Stärke.
  if (!decisionSlice) { console.log(`DEBUG: buildVerifiedFrontpageRow rejected due to !decisionSlice for ${ticker}`); return null; }

  const close = toNumber(stockDoc?.data?.market_prices?.close ?? stockDoc?.data?.latest_bar?.close);
  if (close === null || isNaN(close)) { console.log(`DEBUG: buildVerifiedFrontpageRow rejected due to close is null for ${ticker}`); return null; }
  const minimumNNotMet = decisionSlice?.minimum_n_not_met === true || decision?.minimum_n_not_met === true;
  if (minimumNNotMet) {
    logRejectedCandidate(`[best-setups-v4] Rejected ${ticker} — minimum_n_not_met=true`);
    return null;
  }

  const composite = toNumber(decisionSlice?.scores?.composite);
  const trendScore = toNumber(decisionSlice?.scores?.trend);
  const entryScore = toNumber(decisionSlice?.scores?.entry);
  const riskScore = toNumber(decisionSlice?.scores?.risk);
  const contextScore = toNumber(decisionSlice?.scores?.context);
  const candidateScore = toNumber(candidate?.score);
  const forecastProbability = toNumber(candidate?.probability);
  const rawProbability = toNumber(decisionSlice?.raw_probability);
  const calibratedProbability = toNumber(decisionSlice?.confidence_calibrated);
  const effectiveProbability = calibratedProbability ?? rawProbability ?? forecastProbability;
  const breakout = stockDoc?.data?.breakout_v12 || stockDoc?.data?.breakout_v2 || null;
  const breakoutScores = breakout?.scores || {};

  return {
    ticker,
    asset_class: assetClass,
    name: stockDoc?.data?.name || candidate?.name || null,
    price: close,
    probability: effectiveProbability,
    raw_probability: rawProbability,
    calibrated_probability: calibratedProbability,
    score: candidateScore ?? effectiveProbability ?? composite,
    ranking_score: candidateScore,
    setup_score: composite,
    trigger_score: composite,
    trigger_fulfilled: gates.length === 0,
    expected_return: null,
    confidence: String(decisionSlice?.confidence_bucket || 'NA').toUpperCase(),
    verdict: String(decisionSlice?.verdict || 'WAIT').toUpperCase(),
    setup_phase: decision?.setup_phase || null,
    horizon,
    horizon_key: candidate?.horizon_key || null,
    source: candidate?.source || 'stock_api_verified',
    source_rank_label: candidate?.ranking_label || null,
    global_rank: toNumber(candidate?.global_rank),
    continent_rank: toNumber(candidate?.continent_rank),
    avg_top_percentile: toNumber(candidate?.avg_top_percentile),
    buy_experts: toNumber(candidate?.buy_experts),
    avoid_experts: toNumber(candidate?.avoid_experts),
    strong_experts: toNumber(candidate?.strong_experts),
    quantlab_macd_hist: toNumber(candidate?.macd_hist),
    quantlab_trend_gate: toNumber(candidate?.trend_gate),
    quantlab_rsi14: toNumber(candidate?.rsi14),
    quantlab_scored_today: candidate?.scored_today === true,
    analyzer_trend_score: trendScore,
    analyzer_entry_score: entryScore,
    analyzer_risk_score: riskScore,
    analyzer_context_score: contextScore,
    analyzer_composite: composite,
    analyzer_ret_5d_pct: toNumber(stats?.ret_5d_pct),
    analyzer_ret_20d_pct: toNumber(stats?.ret_20d_pct),
    analyzer_macd_hist: toNumber(stats?.macd_hist),
    analyzer_trend_duration_days: toNumber(stats?.trend_duration_days),
    analyzer_liquidity_score: toNumber(stats?.liquidity_score),
    analyzer_volatility_percentile: toNumber(stats?.volatility_percentile),
    abstain_reason: decisionSlice?.abstain_reason || null,
    learning_status: decisionSlice?.learning_status || decision?.learning_status || null,
    learning_gate: decisionSlice?.learning_gate || decision?.learning_gate || null,
    minimum_n_not_met: minimumNNotMet,
    buy_eligible: decisionSlice?.buy_eligible !== false,
    regime_tag: decisionSlice?.regime_tag || decision?.regime_tag || null,
    market_cap_bucket: segmentationProfile.market_cap_bucket,
    liquidity_bucket: segmentationProfile.liquidity_bucket,
    learning_lane: segmentationProfile.learning_lane,
    blue_chip_core: segmentationProfile.blue_chip_core === true,
    promotion_eligible: segmentationProfile.promotion_eligible !== false,
    expected_edge: toNumber(decisionSlice?.expected_edge),
    contributor_agreement: toNumber(decisionSlice?.contributor_agreement),
    meta_labeler_rule_version: decisionSlice?.meta_labeler_rule_version || decision?.meta_labeler_rule_version || null,
    trigger_gates: gates,
    breakout_status: breakout?.breakout_status || breakout?.ui?.status || null,
    breakout_legacy_state: breakout?.legacy_state || breakout?.state || breakout?.ui?.legacy_state || null,
    breakout_support_zone: breakout?.support_zone || null,
    breakout_invalidation: breakout?.invalidation || null,
    breakout_explanation: breakout?.status_explanation || breakout?.explanation || null,
    breakout_selling_exhaustion: toNumber(breakoutScores?.selling_exhaustion_score ?? breakoutScores?.selling_exhaustion),
    breakout_accumulation_proxy: toNumber(breakoutScores?.accumulation_proxy_score ?? breakoutScores?.accumulation_proxy),
  };
}
