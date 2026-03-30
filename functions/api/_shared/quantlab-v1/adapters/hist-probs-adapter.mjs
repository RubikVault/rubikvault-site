/**
 * QuantLab V1 — Historical Probabilities Adapter
 * Converts hist-probs data into a SignalContract with governance gate.
 */
import { createContract } from '../signal-contract.mjs';
import { validateHistProbsEligibility, getHorizonMap } from '../hist-probs-governance.mjs';
import { validateRegimeProbs } from '../regime-probs-validator.mjs';

const MAX_INITIAL_WEIGHT_FACTOR = 0.7; // Conservative cap

/**
 * @param {Object} hpData - Ticker hist-probs JSON
 * @param {Object} regimeData - regime-daily.json
 * @param {Object} context - { symbol, asof, regime_probs, volatility_bucket, horizon }
 * @returns {Object|null} SignalContract or null if governance gate fails
 */
export function adaptHistProbs(hpData, regimeData, context) {
  const horizon = context.horizon || 'medium';
  const gate = validateHistProbsEligibility(hpData, regimeData, horizon);
  if (!gate.eligible) return null;

  const hKey = getHorizonMap()[horizon];
  const events = hpData.events || {};
  const eventKeys = Object.keys(events).filter(k => {
    const evH = events[k]?.[hKey];
    return evH && typeof evH.n === 'number' && evH.n >= 50;
  });

  if (eventKeys.length === 0) return null;

  // Aggregate across eligible events
  let totalWinRate = 0;
  let totalAvgReturn = 0;
  let totalN = 0;
  let count = 0;

  for (const k of eventKeys) {
    const evH = events[k][hKey];
    totalWinRate += evH.win_rate * evH.n;
    totalAvgReturn += evH.avg_return * evH.n;
    totalN += evH.n;
    count++;
  }

  const avgWinRate = totalN > 0 ? totalWinRate / totalN : 0.5;
  const avgReturn = totalN > 0 ? totalAvgReturn / totalN : 0;

  // Direction from win rate: 0.5 = neutral, >0.5 = bullish, <0.5 = bearish
  const directionScore = (avgWinRate - 0.5) * 2 * MAX_INITIAL_WEIGHT_FACTOR;

  // Sample size score: scales from 0 (50 obs) to 1 (1000+ obs)
  const sampleSizeScore = Math.min(1, Math.max(0, (totalN - 50) / 950));

  // Confidence derived from sample size and win rate clarity
  const winRateClarity = Math.abs(avgWinRate - 0.5) * 2; // 0 = useless, 1 = perfect
  const confidence = sampleSizeScore * 0.5 + winRateClarity * 0.5;

  const freshness = computeFreshness(hpData.generated_at || hpData.as_of);

  const regimeProbs = context.regime_probs || mapRegime(regimeData);
  let flags = [];
  const { adjusted_flags } = validateRegimeProbs(regimeProbs, flags);
  flags = adjusted_flags;

  return createContract({
    source: 'hist_probs',
    symbol: context.symbol,
    horizon,
    asof: context.asof || new Date().toISOString(),
    direction_score: directionScore,
    confidence: confidence * MAX_INITIAL_WEIGHT_FACTOR,
    evidence_quality: {
      sample_size_score: sampleSizeScore,
      freshness_score: freshness,
      completeness_score: Math.min(1, count / 5),
      regime_stability_score: regimeData?.regime_stability ?? null,
      composite: sampleSizeScore * freshness * Math.min(1, count / 5),
    },
    regime_probs: regimeProbs,
    volatility_bucket: context.volatility_bucket || 'medium',
    data_freshness_ms: hpData.generated_at ? Date.now() - new Date(hpData.generated_at).getTime() : null,
    fallback_active: false,
    data_quality_flags: flags,
    lifecycle: {
      emitted_at: hpData.generated_at || context.asof || new Date().toISOString(),
      valid_until: new Date(Date.now() + 7 * 86400000).toISOString(),
    },
    raw_payload: { event_count: count, total_n: totalN, avg_win_rate: avgWinRate, avg_return: avgReturn },
  });
}

function mapRegime(regimeData) {
  if (!regimeData) return { bull: 0.33, chop: 0.34, bear: 0.33, high_vol: 0 };
  const r = (regimeData.market_regime || '').toLowerCase();
  const v = (regimeData.volatility_regime || '').toLowerCase();
  return {
    bull: r === 'bull' ? 0.7 : r === 'bear' ? 0.1 : 0.4,
    chop: r === 'bull' || r === 'bear' ? 0.2 : 0.5,
    bear: r === 'bear' ? 0.7 : r === 'bull' ? 0.1 : 0.3,
    high_vol: v === 'high_vol' ? 0.8 : v === 'low_vol' ? 0.1 : 0.3,
  };
}

function computeFreshness(asof) {
  if (!asof) return 0.5;
  const ageDays = (Date.now() - new Date(asof).getTime()) / 86400000;
  if (ageDays <= 1) return 1.0;
  if (ageDays <= 3) return 0.8;
  if (ageDays <= 7) return 0.5;
  return 0.2;
}
