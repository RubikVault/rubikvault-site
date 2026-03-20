// stock-decisions-v1.js — DECISION LAYER
// Shared final interpretation for the stock analyzer.
// Emits a conservative overall verdict plus real short/medium/long horizon slices.

export const VERDICT = Object.freeze({
  BUY: 'BUY',
  WAIT: 'WAIT',
  SELL: 'SELL',
  AVOID: 'AVOID',
  INSUFFICIENT_DATA: 'INSUFFICIENT_DATA',
});

export const CONFIDENCE = Object.freeze({
  HIGH: 'HIGH',
  MEDIUM: 'MEDIUM',
  LOW: 'LOW',
  NONE: 'NONE',
});

export const SETUP_TYPE = Object.freeze({
  TREND_FOLLOW: 'TREND_FOLLOW',
  MEAN_REVERSION: 'MEAN_REVERSION',
  BREAKOUT: 'BREAKOUT',
  DEFENSIVE: 'DEFENSIVE',
  NONE: 'NONE',
});

export const STRATEGIC_BIAS = Object.freeze({
  BULLISH: 'BULLISH',
  NEUTRAL: 'NEUTRAL',
  BEARISH: 'BEARISH',
  UNKNOWN: 'UNKNOWN',
});

export const HORIZON_KEYS = Object.freeze({
  short: 'short',
  medium: 'medium',
  long: 'long',
});

export const LEARNING_STATUS = Object.freeze({
  BOOTSTRAP: 'BOOTSTRAP',
  ACTIVE: 'ACTIVE',
  COOLDOWN: 'COOLDOWN',
  SAFE_MODE: 'SAFE_MODE',
});

const HORIZON_POLICIES = Object.freeze({
  short: {
    key: 'short',
    weights: { trend: 0.24, entry: 0.42, risk: 0.18, context: 0.16 },
    multipliers: { trend: 1.0, entry: 1.5, risk: 1.0, context: 0.95 },
  },
  medium: {
    key: 'medium',
    weights: { trend: 0.30, entry: 0.30, risk: 0.20, context: 0.20 },
    multipliers: { trend: 1.0, entry: 1.0, risk: 1.0, context: 1.0 },
  },
  long: {
    key: 'long',
    weights: { trend: 0.36, entry: 0.18, risk: 0.16, context: 0.30 },
    multipliers: { trend: 1.5, entry: 0.9, risk: 1.0, context: 1.3 },
  },
});

const META_LABELER_RULE_VERSION = 'v1_bootstrap_rules';
const META_LABELER_DEFAULTS = Object.freeze({
  min_raw_probability: 0.62,
  min_expected_edge: 0.08,
  min_contributor_agreement: 0.45,
  min_liquidity_score: 40,
});

function fin(value) {
  return Number.isFinite(Number(value)) ? Number(value) : null;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, Math.round(value)));
}

function boolish(value) {
  if (typeof value === 'boolean') return value;
  const normalized = String(value ?? '').trim().toLowerCase();
  return normalized === '1' || normalized === 'true' || normalized === 'yes' || normalized === 'on';
}

function safeRatio(num, den) {
  if (!Number.isFinite(num) || !Number.isFinite(den) || den === 0) return null;
  return num / den;
}

function deriveRegimeTag(stats = {}, states = {}) {
  const volPct = fin(stats?.volatility_percentile);
  const trendDuration = fin(stats?.trend_duration_days);
  if (volPct != null && volPct >= 85) return 'high_vol';
  if ((states?.trend === 'UP' || states?.trend === 'STRONG_UP') && (trendDuration == null || trendDuration >= 10)) {
    return 'trend';
  }
  return 'chop';
}

function resolveForecastDirection(forecast, preferredHorizon = '5d') {
  const horizons = forecast?.horizons || forecast?.value?.horizons || null;
  const direct = String(forecast?.direction || '').trim().toLowerCase();
  if (direct) return direct;
  if (horizons && typeof horizons === 'object') {
    return String(horizons?.[preferredHorizon]?.direction || horizons?.['5d']?.direction || horizons?.['1d']?.direction || horizons?.['20d']?.direction || '').trim().toLowerCase();
  }
  return '';
}

function resolveScientificDirection(scientific) {
  const trigger = fin(scientific?.trigger?.score);
  const setup = fin(scientific?.setup?.score);
  const score = trigger ?? setup;
  if (score == null) return '';
  if (score >= 60) return 'bullish';
  if (score <= 40) return 'bearish';
  return '';
}

function resolveElliottDirection(elliott) {
  return String(
    elliott?.completedPattern?.direction
      || elliott?.developingPattern?.direction
      || elliott?.direction
      || '',
  ).trim().toLowerCase();
}

function resolveQuantlabDirection(quantlab) {
  const buyExperts = fin(quantlab?.consensus?.buyExperts);
  const avoidExperts = fin(quantlab?.consensus?.avoidExperts);
  if (buyExperts == null || avoidExperts == null) return '';
  if (buyExperts > avoidExperts) return 'bullish';
  if (avoidExperts > buyExperts) return 'bearish';
  return '';
}

function computeContributorAgreement({ scientific = null, forecast = null, elliott = null, quantlab = null, preferredHorizon = '5d' } = {}) {
  const votes = [
    resolveScientificDirection(scientific),
    resolveForecastDirection(forecast, preferredHorizon),
    resolveElliottDirection(elliott),
    resolveQuantlabDirection(quantlab),
  ].filter(Boolean);
  if (!votes.length) return null;
  const bullish = votes.filter((vote) => vote.includes('bull')).length;
  const bearish = votes.filter((vote) => vote.includes('bear')).length;
  return Number((Math.max(bullish, bearish) / votes.length).toFixed(4));
}

function computeExpectedEdge(scores, stats = {}) {
  const compositeEdge = ((scores?.composite || 0) / 100) - 0.5;
  const riskMultiplier = ((scores?.risk || 0) / 100);
  const ret20 = fin(stats?.ret_20d_pct) ?? 0;
  const ret5 = fin(stats?.ret_5d_pct) ?? 0;
  return Number((compositeEdge * Math.max(0.25, riskMultiplier) + ret20 * 0.35 + ret5 * 0.15).toFixed(4));
}

function applyMetaLabeler({ horizon, verdict, confidence, gates, scores, regimeTag, contributorAgreement, expectedEdge, stats = {}, states = {} }) {
  const rawProbability = Number((scores.composite / 100).toFixed(4));
  const liquidityScore = fin(stats?.liquidity_score);
  if (verdict !== VERDICT.BUY) {
    return {
      buyEligible: false,
      abstainReason: gates[0] || 'NO_CLEAR_EDGE',
      rawProbability,
      contributorAgreement,
      expectedEdge,
      liquidityScore,
    };
  }
  if (gates.length) {
    return {
      buyEligible: false,
      abstainReason: gates[0],
      rawProbability,
      contributorAgreement,
      expectedEdge,
      liquidityScore,
    };
  }
  if (confidence !== CONFIDENCE.HIGH) {
    return {
      buyEligible: false,
      abstainReason: 'META_LABELER_LOW_CONFIDENCE',
      rawProbability,
      contributorAgreement,
      expectedEdge,
      liquidityScore,
    };
  }
  if (regimeTag === 'high_vol') {
    return {
      buyEligible: false,
      abstainReason: 'META_LABELER_HIGH_VOL',
      rawProbability,
      contributorAgreement,
      expectedEdge,
      liquidityScore,
    };
  }
  if ((states?.liquidity === 'LOW') || (liquidityScore != null && liquidityScore < META_LABELER_DEFAULTS.min_liquidity_score)) {
    return {
      buyEligible: false,
      abstainReason: 'META_LABELER_LOW_LIQUIDITY',
      rawProbability,
      contributorAgreement,
      expectedEdge,
      liquidityScore,
    };
  }
  if (rawProbability < META_LABELER_DEFAULTS.min_raw_probability) {
    return {
      buyEligible: false,
      abstainReason: 'META_LABELER_LOW_PROBABILITY',
      rawProbability,
      contributorAgreement,
      expectedEdge,
      liquidityScore,
    };
  }
  if ((contributorAgreement ?? 1) < META_LABELER_DEFAULTS.min_contributor_agreement) {
    return {
      buyEligible: false,
      abstainReason: 'META_LABELER_WEAK_CONSENSUS',
      rawProbability,
      contributorAgreement,
      expectedEdge,
      liquidityScore,
    };
  }
  if ((expectedEdge ?? 0) < META_LABELER_DEFAULTS.min_expected_edge) {
    return {
      buyEligible: false,
      abstainReason: 'META_LABELER_LOW_EDGE',
      rawProbability,
      contributorAgreement,
      expectedEdge,
      liquidityScore,
    };
  }
  return {
    buyEligible: true,
    abstainReason: null,
    rawProbability,
    contributorAgreement,
    expectedEdge,
    liquidityScore,
    horizon,
  };
}

function normalizeRuntimeControl(runtimeControl = null) {
  const learningStatus = Object.values(LEARNING_STATUS).includes(runtimeControl?.learning_status)
    ? runtimeControl.learning_status
    : LEARNING_STATUS.BOOTSTRAP;
  const safetySwitch = runtimeControl?.safety_switch && typeof runtimeControl.safety_switch === 'object'
    ? runtimeControl.safety_switch
    : null;
  return { learningStatus, safetySwitch };
}

function applyRuntimeSafety({ buyEligible, abstainReason, runtimeControl }) {
  const normalized = normalizeRuntimeControl(runtimeControl);
  const actions = Array.isArray(normalized.safetySwitch?.actions) ? normalized.safetySwitch.actions : [];
  const safetyLevel = String(normalized.safetySwitch?.level || '').trim().toUpperCase() || null;
  const forceDisable = normalized.learningStatus === LEARNING_STATUS.SAFE_MODE
    || safetyLevel === 'RED'
    || actions.includes('buy_eligible_false');
  if (!forceDisable) {
    return {
      buyEligible,
      abstainReason,
      learningStatus: normalized.learningStatus,
      safetySwitch: normalized.safetySwitch,
    };
  }
  return {
    buyEligible: false,
    abstainReason: abstainReason || 'SAFETY_SWITCH_RED',
    learningStatus: LEARNING_STATUS.SAFE_MODE,
    safetySwitch: normalized.safetySwitch,
  };
}

function evaluateHardGates(states) {
  const gates = [];
  const trend = states?.trend;
  const volume = states?.volume;
  const liquidity = states?.liquidity;
  const volatility = states?.volatility;

  if ((trend === 'DOWN' || trend === 'STRONG_DOWN') && (volume === 'WEAK' || volume === 'DRY')) {
    gates.push('DOWNTREND_WEAK_VOLUME');
  }
  if (liquidity === 'LOW') {
    gates.push('LOW_LIQUIDITY');
  }
  if (volatility === 'EXTREME') {
    gates.push('EXTREME_VOLATILITY');
  }
  const unknownCount = Object.values(states || {}).filter((state) => state === 'UNKNOWN').length;
  if (unknownCount >= 3) {
    gates.push('INSUFFICIENT_DATA');
  }
  return gates;
}

function deriveSetupType(states) {
  if (states?.trend === 'STRONG_UP' || states?.trend === 'UP') {
    if (states?.momentum === 'BULLISH' || states?.momentum === 'NEUTRAL') return SETUP_TYPE.TREND_FOLLOW;
    if (states?.momentum === 'OVERSOLD') return SETUP_TYPE.MEAN_REVERSION;
  }
  if (states?.volatility === 'COMPRESSED' || states?.volatility === 'LOW') {
    return SETUP_TYPE.BREAKOUT;
  }
  if (states?.trend === 'DOWN' || states?.trend === 'STRONG_DOWN') {
    return SETUP_TYPE.DEFENSIVE;
  }
  return SETUP_TYPE.NONE;
}

function deriveStrategicBias(trendScore) {
  if (trendScore >= 60) return STRATEGIC_BIAS.BULLISH;
  if (trendScore <= 40) return STRATEGIC_BIAS.BEARISH;
  return STRATEGIC_BIAS.NEUTRAL;
}

function computeBaseScores({ stats = {}, close = null, states = {}, scientific = null, quantlab = null }) {
  const sma20 = fin(stats?.sma20);
  const sma50 = fin(stats?.sma50);
  const sma200 = fin(stats?.sma200);
  const rsi = fin(stats?.rsi14);
  const macdHist = fin(stats?.macd_hist);
  const volPct = fin(stats?.volatility_percentile);
  const breakoutEnergy = fin(stats?.breakout_energy);
  const trendDurationDays = fin(stats?.trend_duration_days);
  const volCompression = fin(stats?.vol_compression_20_60);
  const zScoreSma50 = fin(stats?.z_score_sma50);
  const lag1Autocorrelation = fin(stats?.lag1_autocorrelation);
  const c = fin(close);
  const reversionHint = boolish(stats?.reversion_hint);

  let trend = 50;
  if (c != null && sma50 != null && sma200 != null) {
    if (c > sma50 && sma50 > sma200) trend = 72;
    else if (c < sma50 && sma50 < sma200) trend = 32;
  }

  let entry = 50;
  if (rsi != null) {
    if (rsi >= 45 && rsi <= 65) entry += 8;
    if (rsi > 75) entry -= 10;
    if (rsi < 25) entry += 4;
  }
  if (macdHist != null) entry += macdHist > 0 ? 8 : -8;
  if (c != null && sma20 != null) entry += c > sma20 ? 6 : -6;
  if (breakoutEnergy != null && breakoutEnergy > 0.7) entry += 6;
  if (reversionHint && (states?.trend === 'UP' || states?.trend === 'STRONG_UP')) entry += 4;

  let risk = 60;
  if (volPct != null) {
    if (volPct > 90) risk = 35;
    else if (volPct > 75) risk = 45;
    else if (volPct < 35) risk = 70;
  }
  if (volCompression != null && volCompression < 0.6) risk += 5;
  if (zScoreSma50 != null && Math.abs(zScoreSma50) > 2) risk -= 5;

  let context = 50;
  const setupScore = fin(scientific?.setup?.score);
  const triggerScore = fin(scientific?.trigger?.score);
  if (setupScore != null) context += (setupScore - 50) * 0.20;
  if (triggerScore != null) context += (triggerScore - 50) * 0.12;
  if (trendDurationDays != null && trendDurationDays > 10) context += 4;
  if (trendDurationDays != null && trendDurationDays > 20) context += 4;
  if (lag1Autocorrelation != null && lag1Autocorrelation > 0.35) context += 3;
  if (lag1Autocorrelation != null && lag1Autocorrelation < -0.35) context -= 3;

  const buyExperts = fin(quantlab?.consensus?.buyExperts);
  const avoidExperts = fin(quantlab?.consensus?.avoidExperts);
  const strongExperts = fin(quantlab?.consensus?.strongOrBetterExperts);
  const avgTopPercentile = fin(quantlab?.ranking?.avgTopPercentile);
  const buyLead = safeRatio((buyExperts ?? 0) - (avoidExperts ?? 0), (buyExperts ?? 0) + (avoidExperts ?? 0));
  if (buyLead != null) context += buyLead * 10;
  if (strongExperts != null && strongExperts >= 6) context += 3;
  if (avgTopPercentile != null && avgTopPercentile >= 80) trend += 2;
  if (avgTopPercentile != null && avgTopPercentile >= 90) trend += 2;

  trend = clamp(trend, 0, 100);
  entry = clamp(entry, 0, 100);
  risk = clamp(risk, 0, 100);
  context = clamp(context, 0, 100);

  const composite = clamp(trend * 0.3 + entry * 0.3 + risk * 0.2 + context * 0.2, 0, 100);

  return {
    trend,
    entry,
    risk,
    context,
    composite,
    contributors: {
      breakout_energy: breakoutEnergy,
      trend_duration_days: trendDurationDays,
      vol_compression_20_60: volCompression,
      reversion_hint: reversionHint,
      z_score_sma50: zScoreSma50,
      lag1_autocorrelation: lag1Autocorrelation,
      quantlab_buy_lead: buyLead,
      quantlab_avg_top_percentile: avgTopPercentile,
      quantlab_strong_experts: strongExperts,
      scientific_setup_score: setupScore,
      scientific_trigger_score: triggerScore,
    },
  };
}

function applyHorizonPolicy(baseScores, policy) {
  const trend = clamp(baseScores.trend * policy.multipliers.trend, 0, 100);
  const entry = clamp(baseScores.entry * policy.multipliers.entry, 0, 100);
  const risk = clamp(baseScores.risk * policy.multipliers.risk, 0, 100);
  const context = clamp(baseScores.context * policy.multipliers.context, 0, 100);
  const composite = clamp(
    trend * policy.weights.trend
      + entry * policy.weights.entry
      + risk * policy.weights.risk
      + context * policy.weights.context,
    0,
    100,
  );
  return {
    trend,
    entry,
    risk,
    context,
    composite,
    contributors: baseScores.contributors,
  };
}

function confidenceFromScores(scores, gates) {
  if (gates.includes('INSUFFICIENT_DATA')) return CONFIDENCE.NONE;
  if (gates.includes('EXTREME_VOLATILITY')) return CONFIDENCE.LOW;
  if (scores.composite >= 70 && gates.length === 0) return CONFIDENCE.HIGH;
  if (scores.composite < 40 || gates.length > 0) return CONFIDENCE.LOW;
  return CONFIDENCE.MEDIUM;
}

function tacticalActionForVerdict(verdict) {
  if (verdict === VERDICT.BUY) return 'ENTER_LONG';
  if (verdict === VERDICT.SELL) return 'EXIT';
  if (verdict === VERDICT.AVOID) return 'REDUCE';
  return 'HOLD';
}

function buildDecisionSlice({ horizon, scores, gates, states, stats, scientific, forecast, elliott, quantlab, runtimeControl }) {
  const setupType = deriveSetupType(states);
  const strategicBias = deriveStrategicBias(scores.trend);
  const regimeTag = deriveRegimeTag(stats, states);

  if (gates.includes('INSUFFICIENT_DATA')) {
    return {
      horizon,
      verdict: VERDICT.INSUFFICIENT_DATA,
      confidence_bucket: CONFIDENCE.NONE,
      confidence_calibrated: null,
      setup_type: SETUP_TYPE.NONE,
      strategic_bias: STRATEGIC_BIAS.UNKNOWN,
      tactical_action: 'HOLD',
      trigger_gates: gates,
      constraints_triggered: gates,
      abstain_reason: 'INSUFFICIENT_DATA',
      buy_eligible: false,
      scores,
    };
  }

  const def = { trend: 68, entry: 60, risk: 45, context: 55 };
  const policyThresholds = runtimeControl?.policy?.score_thresholds?.[META_LABELER_RULE_VERSION]?.defaults;
  const thres = policyThresholds || def;

  let verdict = VERDICT.WAIT;
  if (scores.trend >= thres.trend && scores.entry >= thres.entry && scores.risk >= thres.risk && scores.context >= thres.context) {
    verdict = VERDICT.BUY;
  } else if (scores.trend <= 35 && scores.entry <= 40 && scores.risk <= 45) {
    verdict = VERDICT.SELL;
  }

  if (gates.includes('DOWNTREND_WEAK_VOLUME') && verdict === VERDICT.BUY) {
    verdict = VERDICT.WAIT;
  }
  if (gates.includes('LOW_LIQUIDITY') && verdict === VERDICT.BUY) {
    verdict = VERDICT.WAIT;
  }
  if (gates.includes('EXTREME_VOLATILITY') && verdict === VERDICT.BUY) {
    verdict = VERDICT.WAIT;
  }

  const confidence = confidenceFromScores(scores, gates);
  const contributorAgreement = computeContributorAgreement({
    scientific,
    forecast,
    elliott,
    quantlab,
    preferredHorizon: horizon === HORIZON_KEYS.short ? '1d' : horizon === HORIZON_KEYS.long ? '20d' : '5d',
  });
  const expectedEdge = computeExpectedEdge(scores, stats);
  const metaLabeler = applyMetaLabeler({
    horizon,
    verdict,
    confidence,
    gates,
    scores,
    regimeTag,
    contributorAgreement,
    expectedEdge,
    stats,
    states,
  });
  const baseBuyEligible = metaLabeler.buyEligible;
  const baseAbstainReason = baseBuyEligible ? null : (metaLabeler.abstainReason || gates[0] || (verdict === VERDICT.BUY ? null : 'NO_CLEAR_EDGE'));
  const runtimeGate = applyRuntimeSafety({
    buyEligible: baseBuyEligible,
    abstainReason: baseAbstainReason,
    runtimeControl,
  });

  return {
    horizon,
    verdict,
    confidence_bucket: confidence,
    confidence_calibrated: null,
    raw_probability: metaLabeler.rawProbability,
    setup_type: setupType,
    strategic_bias: strategicBias,
    tactical_action: tacticalActionForVerdict(verdict),
    trigger_gates: gates,
    constraints_triggered: gates,
    abstain_reason: runtimeGate.abstainReason,
    buy_eligible: runtimeGate.buyEligible,
    learning_status: runtimeGate.learningStatus,
    safety_switch: runtimeGate.safetySwitch,
    regime_tag: regimeTag,
    contributor_agreement: contributorAgreement,
    expected_edge: expectedEdge,
    meta_labeler_rule_version: META_LABELER_RULE_VERSION,
    scores,
  };
}

function buildOverallDecision(horizonSlices, states, runtimeControl) {
  const short = horizonSlices.short;
  const medium = horizonSlices.medium;
  const long = horizonSlices.long;
  const allGates = Array.from(new Set([
    ...(short?.trigger_gates || []),
    ...(medium?.trigger_gates || []),
    ...(long?.trigger_gates || []),
  ]));

  const averagedScores = {
    trend: clamp(((short?.scores?.trend || 0) + (medium?.scores?.trend || 0) + (long?.scores?.trend || 0)) / 3, 0, 100),
    entry: clamp(((short?.scores?.entry || 0) + (medium?.scores?.entry || 0) + (long?.scores?.entry || 0)) / 3, 0, 100),
    risk: clamp(((short?.scores?.risk || 0) + (medium?.scores?.risk || 0) + (long?.scores?.risk || 0)) / 3, 0, 100),
    context: clamp(((short?.scores?.context || 0) + (medium?.scores?.context || 0) + (long?.scores?.context || 0)) / 3, 0, 100),
    composite: clamp(((short?.scores?.composite || 0) + (medium?.scores?.composite || 0) + (long?.scores?.composite || 0)) / 3, 0, 100),
  };

  const setupType = deriveSetupType(states);
  const strategicBias = deriveStrategicBias(averagedScores.trend);

  let verdict = VERDICT.WAIT;
  if (medium?.verdict === VERDICT.BUY && (long?.verdict === VERDICT.BUY || short?.verdict === VERDICT.BUY) && allGates.length === 0) {
    verdict = VERDICT.BUY;
  } else if (medium?.verdict === VERDICT.SELL && long?.verdict === VERDICT.SELL) {
    verdict = VERDICT.SELL;
  } else if (allGates.includes('INSUFFICIENT_DATA')) {
    verdict = VERDICT.INSUFFICIENT_DATA;
  }

  const confidence = verdict === VERDICT.INSUFFICIENT_DATA
    ? CONFIDENCE.NONE
    : verdict === VERDICT.BUY
      ? CONFIDENCE.HIGH
      : medium?.confidence_bucket || CONFIDENCE.LOW;
  const buyEligible = verdict === VERDICT.BUY && confidence === CONFIDENCE.HIGH && allGates.length === 0;
  const regimeTag = medium?.regime_tag || long?.regime_tag || short?.regime_tag || null;
  const runtimeGate = applyRuntimeSafety({
    buyEligible: buyEligible && Boolean(medium?.buy_eligible || short?.buy_eligible || long?.buy_eligible),
    abstainReason: buyEligible ? null : (medium?.abstain_reason || short?.abstain_reason || long?.abstain_reason || allGates[0] || 'NO_CLEAR_EDGE'),
    runtimeControl,
  });

  return {
    verdict,
    confidence_bucket: confidence,
    confidence_calibrated: null,
    raw_probability: Number((averagedScores.composite / 100).toFixed(4)),
    setup_type: setupType,
    strategic_bias: strategicBias,
    tactical_action: tacticalActionForVerdict(verdict),
    trigger_gates: allGates,
    constraints_triggered: allGates,
    abstain_reason: runtimeGate.abstainReason,
    buy_eligible: runtimeGate.buyEligible,
    learning_status: runtimeGate.learningStatus,
    safety_switch: runtimeGate.safetySwitch,
    regime_tag: regimeTag,
    contributor_agreement: medium?.contributor_agreement ?? short?.contributor_agreement ?? long?.contributor_agreement ?? null,
    expected_edge: medium?.expected_edge ?? short?.expected_edge ?? long?.expected_edge ?? null,
    meta_labeler_rule_version: META_LABELER_RULE_VERSION,
    scores: averagedScores,
  };
}

export function makeDecision(input = {}, legacyStats = null, legacyClose = null) {
  const normalized = (input && typeof input === 'object' && ('states' in input || 'stats' in input || 'close' in input))
    ? input
    : { states: input || {}, stats: legacyStats || {}, close: legacyClose };

  const states = normalized.states || {};
  const stats = normalized.stats || {};
  const close = normalized.close ?? null;
  const scientific = normalized.scientific || null;
  const forecast = normalized.forecast || null;
  const elliott = normalized.elliott || null;
  const quantlab = normalized.quantlab || null;
  const runtimeControl = normalized.runtimeControl || null;
  const gates = evaluateHardGates(states);
  const baseScores = computeBaseScores({ stats, close, states, scientific, quantlab });

  const horizons = Object.fromEntries(
    Object.entries(HORIZON_POLICIES).map(([key, policy]) => {
      const scores = applyHorizonPolicy(baseScores, policy);
      return [key, buildDecisionSlice({ horizon: key, scores, gates, states, stats, scientific, forecast, elliott, quantlab, runtimeControl })];
    }),
  );

  const overall = buildOverallDecision(horizons, states, runtimeControl);

  return {
    ...overall,
    horizons,
    policies: HORIZON_POLICIES,
  };
}
