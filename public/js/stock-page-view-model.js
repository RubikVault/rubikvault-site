function toNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function clamp(value, min, max) {
  const n = toNumber(value);
  if (n == null) return min;
  return Math.min(max, Math.max(min, n));
}

function parseDate(value) {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

function normalizeAsOf(value) {
  if (!value) return null;
  return String(value).slice(0, 10);
}

function calendarDaysBetween(startValue, endValue = new Date()) {
  const start = parseDate(startValue);
  const end = parseDate(endValue);
  if (!start || !end) return null;
  const a = new Date(start);
  const b = new Date(end);
  a.setHours(0, 0, 0, 0);
  b.setHours(0, 0, 0, 0);
  return Math.max(0, Math.round((b.getTime() - a.getTime()) / 86400000));
}

function formatMarketCap(value) {
  const n = toNumber(value);
  if (n == null || n === 0) return null;
  if (n >= 1e12) return `$${(n / 1e12).toFixed(2)}T`;
  if (n >= 1e9) return `$${(n / 1e9).toFixed(1)}B`;
  if (n >= 1e6) return `$${(n / 1e6).toFixed(0)}M`;
  return `$${n.toLocaleString()}`;
}

function formatMoney(value, digits = 2) {
  const n = toNumber(value);
  return (n == null) ? null : `$${n.toFixed(digits)}`;
}

function formatRatio(value, digits = 1) {
  const n = toNumber(value);
  return (n == null) ? null : n.toFixed(digits);
}

function formatPercent(value, digits = 1) {
  const n = toNumber(value);
  if (n == null) return null;
  const safe = n === 0 || Object.is(n, -0) ? 0 : n;
  return `${safe.toFixed(digits)}%`;
}

export function businessDaysBetween(startValue, endValue = new Date()) {
  const start = parseDate(startValue);
  const end = parseDate(endValue);
  if (!start || !end) return null;
  const a = new Date(start);
  const b = new Date(end);
  a.setHours(0, 0, 0, 0);
  b.setHours(0, 0, 0, 0);
  if (a > b) return 0;
  let days = 0;
  const cursor = new Date(a);
  while (cursor < b) {
    cursor.setDate(cursor.getDate() + 1);
    const dow = cursor.getDay();
    if (dow !== 0 && dow !== 6) days += 1;
  }
  return days;
}

export function classifyHistoricalFreshness(asOfValue, now = new Date()) {
  if (!asOfValue) {
    return {
      status: 'unavailable',
      ageBusinessDays: null,
      opacity: 0.45,
      badge: 'UNAVAILABLE',
      muted: true,
      subtitle: 'Historical regime data unavailable.',
      warningText: null,
    };
  }
  const ageBusinessDays = businessDaysBetween(asOfValue, now);
  if (ageBusinessDays == null) {
    return {
      status: 'unavailable',
      ageBusinessDays: null,
      opacity: 0.45,
      badge: 'UNAVAILABLE',
      muted: true,
      subtitle: 'Historical regime data unavailable.',
      warningText: null,
    };
  }
  if (ageBusinessDays <= 1) {
    return {
      status: 'fresh',
      ageBusinessDays,
      opacity: 1,
      badge: 'LIVE',
      muted: false,
      subtitle: 'Historical regime context is current.',
      warningText: null,
    };
  }
  if (ageBusinessDays === 2) {
    return {
      status: 'delayed',
      ageBusinessDays,
      opacity: 0.72,
      badge: 'DELAYED',
      muted: true,
      subtitle: 'Delayed regime overlay — background context only.',
      warningText: null,
    };
  }
  if (ageBusinessDays > 10) {
    return {
      status: 'stale',
      ageBusinessDays,
      opacity: 0.5,
      badge: 'STALE',
      muted: true,
      subtitle: `Historical regime data is ${ageBusinessDays} business days old. Background context only.`,
      warningText: 'Historical regime overlay is delayed and may not reflect current market conditions.',
    };
  }
  return {
    status: 'stale',
    ageBusinessDays,
    opacity: 0.6,
    badge: 'STALE',
    muted: true,
    subtitle: `Historical regime data is ${ageBusinessDays} business days old. Background context only.`,
    warningText: null,
  };
}

function baseRiskState(volatility) {
  return {
    EXTREME: 'High',
    HIGH: 'High',
    NORMAL: 'Medium',
    LOW: 'Low',
    COMPRESSED: 'Low',
    UNKNOWN: 'Unknown',
  }[volatility] || 'Unknown';
}

function riskSeverityColor(state) {
  return {
    High: 'var(--red)',
    Elevated: 'var(--yellow)',
    Medium: 'var(--yellow)',
    Low: 'var(--green)',
    Unknown: 'var(--text-dim)',
  }[state] || 'var(--text-dim)';
}

function qualityColor(score, finalState) {
  if (!Number.isFinite(score)) return 'var(--text-dim)';
  if (finalState === 'High' || finalState === 'Elevated' || finalState === 'Medium') return 'var(--yellow)';
  if (score >= 65) return 'var(--green)';
  if (score >= 40) return 'var(--yellow)';
  return 'var(--red)';
}

export function buildRiskPresentation({ decision = {}, states = {}, stats = {} } = {}) {
  const rawScore = toNumber(decision?.scores?.risk_score ?? decision?.scores?.risk);
  const volatility = states?.volatility || 'UNKNOWN';
  const volPct = toNumber(stats?.volatility_percentile);
  const finalBaseState = baseRiskState(volatility);
  let finalState = finalBaseState;
  let overrideApplied = false;
  let overrideReason = null;

  if ((volatility === 'LOW' || volatility === 'COMPRESSED' || volatility === 'UNKNOWN') && Number.isFinite(volPct)) {
    if (volPct > 90) {
      finalState = 'Elevated';
      overrideApplied = true;
      overrideReason = `Raw volatility is at the ${volPct.toFixed(0)}th percentile.`;
    } else if (volPct > 75 && volatility !== 'UNKNOWN') {
      finalState = 'Medium';
      overrideApplied = finalState !== finalBaseState;
      overrideReason = overrideApplied ? `Raw volatility is elevated at the ${volPct.toFixed(0)}th percentile.` : null;
    }
  }

  const finalColor = riskSeverityColor(finalState);
  const regimeLabel = volatility === 'EXTREME'
    ? 'Extreme volatility'
    : volatility === 'HIGH'
      ? 'High volatility'
      : volatility === 'LOW' || volatility === 'COMPRESSED'
        ? 'Compressed volatility'
        : volatility === 'NORMAL'
          ? 'Normal volatility'
          : 'Unknown regime';

  const verdict = String(decision?.verdict || decision?.final_verdict || '').toUpperCase();
  let displaySentence = `Final risk is ${finalState}.`;
  if (overrideApplied && Number.isFinite(volPct)) {
    displaySentence = `Raw volatility is extreme at the ${volPct.toFixed(0)}th percentile, but final risk is moderated to ${finalState} by structural context.`;
  } else if (Number.isFinite(volPct)) {
    displaySentence = `Final risk is ${finalState} based on ${regimeLabel.toLowerCase()} and ${volPct.toFixed(0)}th-percentile volatility.`;
  } else if (regimeLabel) {
    displaySentence = `Final risk is ${finalState} in a ${regimeLabel.toLowerCase()} regime.`;
  }
  if (verdict === 'WAIT' || verdict === 'AVOID') {
    displaySentence += ' This measures structural conditions, not trade readiness.';
  }
  const percentileText = Number.isFinite(volPct) ? `Volatility percentile: ${volPct.toFixed(0)}th` : 'Volatility percentile unavailable';
  const contextText = Number.isFinite(volPct)
    ? (volPct >= 95
        ? 'Current volatility is extremely elevated relative to recent history.'
        : volPct >= 75
          ? 'Current volatility remains elevated relative to recent history.'
          : 'Current volatility is not elevated relative to recent history.')
    : `Current risk context is driven by ${regimeLabel.toLowerCase()}.`;
  const overrideDisplayReason = overrideApplied
    ? (overrideReason ? `Risk override active: ${overrideReason.replace(/\.$/, '')}.` : 'Risk override active: structural context moderated the raw volatility signal.')
    : 'Risk override active: no.';

  return {
    scoreRaw: rawScore,
    scoreLabel: Number.isFinite(rawScore) ? 'Risk Quality' : 'Risk',
    scoreDirection: 'higher_is_safer',
    scoreColor: qualityColor(rawScore, finalState),
    finalState,
    displayLabel: finalState,
    finalColor,
    overrideApplied,
    overrideReason,
    regimeLabel,
    rawSignalBand: Number.isFinite(volPct) ? `${volPct.toFixed(0)}th percentile volatility` : regimeLabel,
    displaySentence,
    scoreHelperText: 'Higher = better structural quality, not lower final risk.',
    rawSignalText: percentileText,
    driverText: percentileText,
    contextText,
    overrideDisplayReason,
    volPercentile: volPct,
  };
}

export function inferAssetClass({ ticker, name, universe, fundamentals } = {}) {
  const hay = `${ticker || ''} ${name || ''} ${universe?.name || ''} ${universe?.asset_class || ''} ${universe?.security_type || ''} ${universe?.industry || ''}`.toLowerCase();
  
  if (/\bindex\b|\bcomposite\b|\baverages\b/.test(hay) || ticker?.startsWith('^') || ticker?.includes(':')) {
    return 'Index';
  }
  
  if (/\betf\b|\bexchange traded fund\b|\bindex fund\b|\btrust\b|\bucits\b/.test(hay)) {
    return 'ETF';
  }
  
  if (!fundamentals && /\bspy\b|\bqqq\b|\bivv\b|\bvti\b|\bhyg\b|\baggg\b|\bxlf\b|\biwm\b/.test((ticker || '').toLowerCase())) {
    return 'ETF';
  }
  
  return 'Stock';
}

export function buildCatalystPresentation({ ticker, name, fundamentals, universe } = {}) {
  const assetClass = inferAssetClass({ ticker, name, universe, fundamentals });
  const nextEarningsDate = fundamentals?.nextEarningsDate
    || fundamentals?.earningsDate
    || universe?.nextEarningsDate
    || null;
  const asOf = normalizeAsOf(fundamentals?.updatedAt);
  if (Array.isArray(fundamentals?.confirmedCatalysts) && fundamentals.confirmedCatalysts.length > 0) {
    return {
      status: 'confirmed',
      renderMode: 'card',
      variant: 'card',
      assetClass,
      items: fundamentals.confirmedCatalysts,
      title: 'Upcoming Catalysts',
    };
  }
  if (nextEarningsDate && assetClass !== 'ETF') {
    const date = String(nextEarningsDate).slice(0, 10);
    return {
      status: 'estimated',
      renderMode: 'compact',
      variant: 'compact',
      assetClass,
      title: 'Upcoming Catalysts',
      primaryText: `Estimated earnings window: ${date}`,
      secondaryText: `Unconfirmed schedule from fundamentals feed${asOf ? ` as of ${asOf}` : ''}.`,
    };
  }
  if (assetClass === 'ETF') {
    return {
      status: 'unavailable',
      renderMode: 'inline',
      variant: 'inline',
      assetClass,
      title: 'Catalysts',
      primaryText: `Catalysts: No confirmed catalyst currently scheduled${asOf ? ` as of ${asOf}` : ''}.`,
      secondaryText: null,
    };
  }
  return {
    status: 'unavailable',
    renderMode: 'inline',
    variant: 'inline',
    assetClass,
    title: 'Catalysts',
    primaryText: `Catalysts: Earnings schedule unavailable in current feed${asOf ? ` as of ${asOf}` : ''}.`,
    secondaryText: null,
  };
}

export function buildFundamentalsPresentation({ ticker, name, fundamentals, universe } = {}) {
  const assetClass = inferAssetClass({ ticker, name, universe, fundamentals });
  const asOf = normalizeAsOf(fundamentals?.updatedAt);
  const metrics = [
    { label: 'Market Cap', value: formatMarketCap(fundamentals?.marketCap) },
    { label: 'P/E (TTM)', value: formatRatio(fundamentals?.pe_ttm, 1) },
    { label: 'EPS (TTM)', value: formatMoney(fundamentals?.eps_ttm, 2) },
    { label: 'Div Yield', value: formatPercent(fundamentals?.dividendYield, 1) },
  ];
  const availableCount = metrics.filter((metric) => metric.value != null).length;
  const availableLabels = metrics.filter((metric) => metric.value != null).map((metric) => metric.label);
  const unavailableLabels = metrics.filter((metric) => metric.value == null).map((metric) => metric.label);
  const sectorLine = [fundamentals?.sector, fundamentals?.industry].filter(Boolean).join(' · ') || null;

  if (!fundamentals || availableCount === 0) {
    return {
      status: 'unavailable',
      renderMode: 'hidden',
      assetClass,
      title: 'Fundamentals',
      asOf,
      metrics: [],
      availableLabels,
      unavailableLabels,
      sectorLine,
      primaryText: `Fundamentals unavailable${asOf ? ` as of ${asOf}` : ''}.`,
      secondaryText: assetClass === 'ETF' || assetClass === 'Index'
        ? 'No confirmed fund fundamentals.'
        : 'No verified fundamentals fields available.',
      dimOpacity: 0.6,
    };
  }

  let degraded = false;
  if (assetClass === 'Stock') {
    degraded = availableCount < 3;
  } else {
    degraded = false;
  }
  return {
    status: degraded ? 'degraded' : 'ready',
    renderMode: degraded ? 'compact' : 'card',
    assetClass,
    title: degraded ? 'Fundamentals (limited data)' : 'Fundamentals',
    asOf,
    metrics,
    availableLabels,
    unavailableLabels,
    sectorLine,
    primaryText: null,
    secondaryText: degraded
      ? `Available: ${availableLabels.join(', ') || 'None'} · Unavailable: ${unavailableLabels.join(', ') || 'None'}`
      : null,
    dimOpacity: degraded ? 0.72 : 1,
  };
}

export function buildModuleFreshnessPresentation(payload = {}, now = new Date()) {
  const data = payload?.data || {};
  const prices = data?.market_prices || {};
  const bars = data?.bars || [];
  const evaluation = payload?.evaluation_v4 || {};
  const moduleFreshness = data?.module_freshness || {};
  const historicalAsOf = normalizeAsOf(moduleFreshness.historical_as_of || bars[bars.length - 1]?.date);
  const items = [
    { label: 'Price', value: normalizeAsOf(moduleFreshness.price_as_of || prices?.date) },
    { label: 'Historical', value: historicalAsOf },
    { label: 'Scientific', value: normalizeAsOf(moduleFreshness.scientific_as_of || evaluation?.input_states?.scientific?.as_of) },
    { label: 'Forecast', value: normalizeAsOf(moduleFreshness.forecast_as_of || evaluation?.input_states?.forecast?.as_of) },
    { label: 'QuantLab', value: normalizeAsOf(moduleFreshness.quantlab_as_of || evaluation?.input_states?.quantlab?.as_of) },
    { label: 'Fundamentals', value: normalizeAsOf(moduleFreshness.fundamentals_as_of || data?.fundamentals?.updatedAt) },
  ].filter((item) => item.value);

  return items.map((item) => {
    const ageDays = calendarDaysBetween(item.value, now);
    return {
      ...item,
      ageDays,
      state: ageDays == null ? 'unknown' : ageDays > 5 ? 'stale' : ageDays > 2 ? 'delayed' : 'fresh',
    };
  });
}

export function buildTrustPresentation({
  decisionAsOf,
  priceAsOf,
  moduleFreshness = [],
  fundamentalsStatus = 'ready',
  modelEvidenceLimited = false,
} = {}) {
  const historical = moduleFreshness.find((item) => item.label === 'Historical');
  const historicalState = historical?.state === 'fresh'
    ? 'current'
    : historical?.state === 'delayed'
      ? `delayed by ${Math.max(1, historical?.ageDays ?? 1)} trading days`
      : historical?.state === 'stale'
        ? `delayed by ${Math.max(1, historical?.ageDays ?? 4)} trading days`
        : 'unavailable';
  const isPartial = modelEvidenceLimited
    || fundamentalsStatus === 'degraded'
    || fundamentalsStatus === 'unavailable'
    || moduleFreshness.some((item) => item.state === 'stale' || item.state === 'delayed');
  const coverageLabel = isPartial ? 'partial' : 'full';
  const canonicalDate = normalizeAsOf(priceAsOf || decisionAsOf);
  const summaryText = `Analysis & Price as-of: ${canonicalDate || 'latest available'} · Historical context: ${historicalState} · Coverage: ${coverageLabel}`;
  return {
    decisionDate: normalizeAsOf(decisionAsOf || priceAsOf),
    priceDate: normalizeAsOf(priceAsOf || decisionAsOf),
    historicalState,
    coverageLabel,
    summaryText,
  };
}

function sanitizeReason(reason) {
  const raw = String(reason || '').trim();
  if (!raw) return null;
  if (/EXTREME_VOLATILITY/i.test(raw)) return 'volatility remains too high';
  if (/LOW[_ ]CONF/i.test(raw)) return 'signal confidence is still weak';
  if (/INSUFFICIENT_DATA|MINIMUM[_ ]N|BOOTSTRAP/i.test(raw)) return 'coverage is still limited';
  if (/^[A-Z][A-Z0-9_]+$/.test(raw)) return raw.toLowerCase().replace(/_/g, ' ');
  return raw.replace(/\.$/, '');
}

export function buildWaitStatePresentation({ decision = {}, states = {}, explanation = {}, stats = {}, close = null } = {}) {
  const why = [];
  if (states?.trend === 'RANGE' || states?.trend === 'UNKNOWN') why.push('trend remains sideways');
  if (states?.volatility === 'HIGH' || states?.volatility === 'EXTREME' || toNumber(stats?.volatility_percentile) >= 85) {
    why.push('volatility remains too high');
  }
  if (states?.volume === 'WEAK' || states?.volume === 'DRY' || states?.liquidity === 'LOW') why.push('participation is not strong enough');
  if ((states?.momentum === 'NEUTRAL' || states?.momentum === 'BEARISH') && why.length < 3) why.push('momentum lacks confirmation');
  for (const gate of decision?.trigger_gates || []) {
    const clean = sanitizeReason(gate);
    if (clean && !why.includes(clean) && why.length < 4) why.push(clean);
  }
  for (const bullet of explanation?.bullets || []) {
    const clean = sanitizeReason(bullet);
    if (clean && !why.includes(clean) && why.length < 4) why.push(clean);
  }
  const sma20 = toNumber(stats?.sma20);
  const triggerPrice = Number.isFinite(sma20) ? sma20 : close;
  const nextActions = [
    Number.isFinite(triggerPrice) ? `Recheck if price reclaims SMA20 near $${triggerPrice.toFixed(1)}` : 'Recheck when short-term structure improves',
    'Watch for volatility normalization',
    'Stay on alert for a cleaner breakout trigger',
  ];
  return {
    headline: 'No clean setup right now',
    subheadline: 'Stand aside until structure improves',
    whyBullets: why.slice(0, 4),
    nextActions,
    signalBalanceText: 'Signal balance: no strong bullish or bearish trigger',
    reboundTitle: why.includes('volatility remains too high') ? 'Recovery watch' : 'Rebound conditions not yet met',
    setupQualityText: Number.isFinite(toNumber(decision?.scores?.composite))
      ? `Setup quality: Moderate (${toNumber(decision?.scores?.composite).toFixed(0)}/100)`
      : 'Setup quality: Moderate',
    setupQualityNote: 'Entry pattern may be improving, but risk conditions still block action.',
  };
}

export function buildExecutiveDecisionPresentation({ decision = {}, states = {}, explanation = {}, stats = {}, close = null, effectiveVerdict = null } = {}) {
  const waitView = buildWaitStatePresentation({ decision, states, explanation, stats, close });
  const verdict = String(effectiveVerdict || decision?.verdict || 'WAIT').toUpperCase();
  const blocker = waitView.whyBullets[0] || 'risk conditions still block action';
  const trendNeedsWork = states?.trend === 'RANGE' || states?.trend === 'UNKNOWN';
  const volatilityNeedsWork = states?.volatility === 'HIGH' || states?.volatility === 'EXTREME' || toNumber(stats?.volatility_percentile) >= 85;
  const participationNeedsWork = states?.volume === 'WEAK' || states?.volume === 'DRY' || states?.liquidity === 'LOW';
  const whatMustChange = [];
  if (trendNeedsWork) whatMustChange.push('price structure must resolve out of the current range');
  if (volatilityNeedsWork) whatMustChange.push('volatility must normalize before setup quality can clear');
  if (participationNeedsWork) whatMustChange.push('participation must strengthen on the next move');
  if (!whatMustChange.length) whatMustChange.push('a cleaner trigger must confirm before action');
  return {
    verdict,
    summaryLine: verdict === 'WAIT' ? 'Sit on hands. No clean setup yet.' : 'Setup is actionable.',
    headline: waitView.headline,
    subheadline: waitView.subheadline,
    whyNotNow: waitView.whyBullets.slice(0, 3),
    blocker,
    whatMustChange: whatMustChange.slice(0, 3),
    primaryNextAction: waitView.nextActions[0] || 'Recheck when structure improves',
    secondaryWatch: waitView.nextActions[1] || 'Watch for volatility normalization',
    upgradeTrigger: waitView.nextActions[2] || 'Wait for cleaner breakout confirmation',
    setupQualityText: waitView.setupQualityText,
    setupQualityNote: 'Setup quality measures pattern quality only — current risk conditions still block action.',
    signalBalanceText: waitView.signalBalanceText,
    reboundTitle: waitView.reboundTitle,
    readinessSummary: null,
  };
}

export function buildHorizonPresentation(horizons = []) {
  const normalized = Array.isArray(horizons) ? horizons : [];
  const verdicts = normalized.map((item) => String(item?.v?.l || item?.label || '').toUpperCase()).filter(Boolean);
  const allEqual = verdicts.length > 0 && verdicts.every((value) => value === verdicts[0]);
  return {
    showCards: !allEqual,
    compactText: allEqual ? `Across all horizons: ${verdicts[0]}` : null,
    items: normalized,
  };
}

export function buildActiveModelConsensusPresentation({ evaluation = null, decision = {}, missingModels = [], modelStates = {} } = {}) {
  const models = [
    { key: 'quantlab', label: 'QuantLab' },
    { key: 'forecast', label: 'Forecast' },
    { key: 'scientific', label: 'Scientific' },
  ];
  const activeModels = models.filter((model) => !missingModels.includes(model.key) && modelStates[model.key]);
  const coverageCount = activeModels.length;
  const isolatedSignal = coverageCount === 1
    ? `${activeModels[0].label} remains isolated`
    : coverageCount < 3
        ? 'Coverage incomplete'
        : 'Broad model confirmation available';
  const finalInterpretation = coverageCount >= 3
    ? 'Model consensus: Actionable alignment is available'
    : `Model consensus: Not actionable · Coverage incomplete (${coverageCount}/3 models) · ${isolatedSignal}`;
  return {
    title: coverageCount < 4 ? 'Active Model Consensus' : 'Model Consensus',
    compactTitle: coverageCount < 4 ? 'Active Model Consensus' : 'Model Consensus',
    coverageCount,
    activeModels,
    isolatedSignal,
    actionableText: coverageCount >= 3 ? 'Actionable alignment available' : 'Not actionable',
    availabilityText: coverageCount >= 3 ? 'Broad model confirmation available' : `Coverage incomplete (${coverageCount}/4 models)`,
    finalInterpretation,
    primaryVerdict: decision?.verdict || null,
  };
}

export function buildModelConsensusPresentation({ evaluation = null, decision = {}, missingModels = [] } = {}) {
  const fallbackStates = evaluation
    ? {
        quantlab: true,
        forecast: !missingModels.includes('forecast'),
        scientific: !missingModels.includes('scientific'),
      }
    : {};
  const view = buildActiveModelConsensusPresentation({
    evaluation,
    decision,
    missingModels,
    modelStates: fallbackStates,
  });
  return {
    ...view,
    title: view.coverageCount < 3 ? `${view.coverageCount}-model view` : '3-model consensus',
    compactTitle: view.coverageCount < 3 ? `${view.coverageCount}-model view` : '3-model consensus',
    actionableText: view.coverageCount >= 3 ? 'Model alignment available' : 'Consensus not actionable',
    availabilityText: view.coverageCount >= 3 ? 'Broad model confirmation available' : `Only ${view.coverageCount} of 3 models available`,
  };
}

export function buildHistoricalModulePresentation(freshness = {}) {
  const subtitle = freshness.status === 'fresh'
    ? 'Historical signal profile'
    : 'Historical signal profile · background context only';
  const confidenceLabel = freshness.status === 'fresh'
    ? 'Historical confidence'
    : 'Historical confidence (historical only)';
  const regimeLabel = freshness.status === 'fresh'
    ? 'Historical regime snapshot'
    : 'Historical regime snapshot · delayed background context only';
  return {
    subtitle,
    confidenceLabel,
    regimeLabel,
    opacity: freshness.opacity ?? 0.6,
    collapsedByDefault: freshness.status !== 'fresh',
  };
}

export function buildBreakoutDensityPresentation({ breakout = {}, verdict = 'WAIT' } = {}) {
  const state = String(breakout?.state || 'NONE').toUpperCase();
  const score = toNumber(breakout?.scores?.total) ?? 0;
  const compact = state === 'NONE'
    || state === 'EXEC VETO'
    || (state === 'SETUP' && score < 60)
    || (state !== 'CONFIRMED' && breakout?.trigger_confirmed === false);
  return {
    mode: compact ? 'compact' : 'full',
    title: compact ? 'Breakout' : 'Breakout setup',
    headline: compact
      ? (state === 'NONE' ? 'Breakout: No active setup' : 'Breakout: Early setup only — not actionable yet')
      : state,
    detail: compact
      ? (state === 'NONE' ? 'Awaiting compression + trigger confirmation' : (verdict === 'WAIT' ? 'Executive verdict still vetoes the setup.' : 'Trigger confirmation still pending.'))
      : (breakout?.explanation || 'Breakout state active'),
    score,
    state,
  };
}

export function buildInterpretiveChangePresentation({ timeframe = '1D', close = null, stats = {}, change = {}, trendLabel = 'Mixed', maStack = 'Mixed', riskLabel = 'Medium', rsiZone = 'Neutral', bbLabel = 'Range midbound', macdLabel = 'Neutral', rangeLabel = 'Mid range' } = {}) {
  const templates = {
    '1D': {
      summary: `Momentum ${toNumber(change?.pct) > 0 ? 'improved slightly' : 'softened'}, but structure ${close > (stats?.sma20 || 0) ? 'is trying to recover' : 'remains weak'} and no directional confirmation is present.`,
      items: [
        `RSI is ${stats?.rsi14 != null ? stats.rsi14.toFixed(1) : '—'} and remains ${String(rsiZone).toLowerCase()}`,
        `price moved ${formatPercent((change?.pct || 0) * 100, 2) || '—'} today`,
        `structure ${close > (stats?.sma20 || 0) ? 'sits back above' : 'remains below'} SMA20`,
      ],
    },
    '3D': {
      summary: `Trend structure is still ${String(maStack).toLowerCase()}, so recent stabilization has not yet cleared the broader blocker.`,
      items: [
        `price ${close > (stats?.sma50 || 0) ? 'reclaimed' : 'still trails'} SMA50`,
        `trend structure remains ${String(maStack).toLowerCase()}`,
        `final risk stays ${String(riskLabel).toLowerCase()}`,
      ],
    },
    '1W': {
      summary: `The setup remains structurally mixed, with no decisive directional alignment across momentum and moving averages.`,
      items: [
        `moving-average structure is ${String(maStack).toLowerCase()}`,
        `Bollinger position is ${String(bbLabel).toLowerCase()}`,
        `MACD tone is ${String(macdLabel).toLowerCase()}`,
      ],
    },
    '2W': {
      summary: `Longer swing context is still unresolved, so volatility and range position matter more than raw momentum.`,
      items: [
        `52-week position remains ${String(rangeLabel || 'Mid range').toLowerCase()}`,
        `ATR is ${formatMoney(stats?.atr14, 2) || '—'}`,
        `volatility percentile is ${stats?.volatility_percentile != null ? `${Number(stats.volatility_percentile).toFixed(0)}th` : '—'}`,
      ],
    },
    '1M': {
      summary: `The broader trend still decides the tape here, and the longer-term structure has not fully realigned.`,
      items: [
        `price remains ${close > (stats?.sma200 || 0) ? 'above' : 'below'} SMA200`,
        `trend remains ${String(trendLabel).toLowerCase()}`,
        `moving-average structure stays ${String(maStack).toLowerCase()}`,
      ],
    },
  };
  return templates[timeframe] || templates['1D'];
}

export function buildBackgroundModulePresentation({ title, freshnessStatus = 'stale', dimOpacity = 0.6, collapsedByDefault = true } = {}) {
  return {
    title,
    tone: 'background',
    opacity: freshnessStatus === 'fresh' ? 0.82 : dimOpacity,
    collapsedByDefault,
    contextLabel: freshnessStatus === 'fresh' ? 'Historical only' : 'Historical only · background context',
  };
}

export function buildMobileNavigationPresentation({ viewportWidth = 1280 } = {}) {
  const mobile = viewportWidth < 700;
  return {
    enabled: mobile,
    defaultTab: 'overview',
    tabs: [
      { key: 'overview', label: 'Overview' },
      { key: 'technicals', label: 'Technicals' },
      { key: 'evidence', label: 'Evidence' },
    ],
  };
}

export function buildPageHierarchyPresentation() {
  return {
    sections: [
      { key: 'decision', label: 'Decision Layer', tone: 'primary' },
      { key: 'evidence', label: 'Evidence Layer', tone: 'evidence' },
      { key: 'background', label: 'Background Layer', tone: 'background' },
    ],
  };
}

export function validateLevelConsistency(levels, close) {
  const canonicalClose = toNumber(close);
  if (!Array.isArray(levels) || !Number.isFinite(canonicalClose)) {
    return { valid: false, degraded: true, issues: ['Missing canonical close or levels'] };
  }
  const issues = [];
  const byLabel = new Map(levels.map((level) => [level.label, level]));
  const checkEnvelope = (highLabel, lowLabel) => {
    const high = toNumber(byLabel.get(highLabel)?.price);
    const low = toNumber(byLabel.get(lowLabel)?.price);
    if (Number.isFinite(high) && canonicalClose > high) issues.push(`Canonical close exceeds ${highLabel}`);
    if (Number.isFinite(low) && canonicalClose < low) issues.push(`Canonical close is below ${lowLabel}`);
  };
  checkEnvelope('5D High', '5D Low');
  checkEnvelope('20D High', '20D Low');
  checkEnvelope('52W High', '52W Low');
  return {
    valid: issues.length === 0,
    degraded: issues.length > 0,
    issues,
  };
}

export function buildTradePlanModel({ verdict, close, atr, levels = [] } = {}) {
  const entry = toNumber(close);
  const atrValue = toNumber(atr);
  if (verdict !== 'BUY' && verdict !== 'SELL') {
    return { status: 'unavailable', invalidReason: 'No active trade signal' };
  }
  if (!Number.isFinite(entry) || !Number.isFinite(atrValue) || atrValue <= 0) {
    return { status: 'unavailable', invalidReason: 'Trade plan unavailable — missing required inputs' };
  }

  const supportLevels = levels.filter((level) => level.kind === 'support' && toNumber(level.price) < entry);
  const resistanceLevels = levels.filter((level) => level.kind === 'resistance' && toNumber(level.price) > entry);

  const stop = verdict === 'BUY' ? entry - atrValue : entry + atrValue;
  const target = verdict === 'BUY'
    ? toNumber(resistanceLevels[0]?.price)
    : toNumber(supportLevels[supportLevels.length - 1]?.price);

  if (!Number.isFinite(stop) || !Number.isFinite(target)) {
    return { status: 'unavailable', invalidReason: 'Trade plan unavailable — missing required inputs' };
  }

  if (verdict === 'BUY' && !(stop < entry && target > entry)) {
    return { status: 'unavailable', invalidReason: 'Trade plan unavailable — invalid BUY geometry' };
  }
  if (verdict === 'SELL' && !(stop > entry && target < entry)) {
    return { status: 'unavailable', invalidReason: 'Trade plan unavailable — invalid SELL geometry' };
  }

  const denominator = verdict === 'BUY' ? entry - stop : stop - entry;
  const numerator = verdict === 'BUY' ? target - entry : entry - target;
  if (!(denominator > 0 && numerator > 0)) {
    return { status: 'unavailable', invalidReason: 'Trade plan unavailable — invalid reward/risk geometry' };
  }

  return {
    status: 'ready',
    entry,
    stop,
    target,
    rr: numerator / denominator,
    invalidReason: null,
  };
}

export function buildExecutiveGovernance({ decision = {}, report = {} } = {}) {
  return [];
}

export function computeTooltipFrame({ pointX, pointY, containerRect, tooltipWidth, tooltipHeight, padding = 12 }) {
  const width = Number.isFinite(tooltipWidth) ? tooltipWidth : 160;
  const height = Number.isFinite(tooltipHeight) ? tooltipHeight : 48;
  const rect = containerRect || { width: 0, height: 0 };
  const left = clamp(pointX + padding, 8, Math.max(8, rect.width - width - 8));
  const top = clamp(pointY - height - padding, 8, Math.max(8, rect.height - height - 8));
  return { left, top };
}

export function buildPageIdentity(payload = {}, requestedTicker = '') {
  const data = payload?.data || {};
  const meta = payload?.metadata || {};
  const universe = payload?.universe || payload?.evaluation_v4?.universe || data?.universe || {};
  const prices = data?.market_prices || {};
  const bars = data?.bars || [];
  const lastBar = bars.length ? bars[bars.length - 1] : {};
  const ticker = meta?.request?.normalized_ticker || data?.ticker || requestedTicker || '';
  const candidates = [data?.name, data?.fundamentals?.companyName, universe?.name];
  const name = candidates.find((candidate) => {
    const label = typeof candidate === 'string' ? candidate.trim() : '';
    return label && label.toUpperCase() !== String(ticker || '').trim().toUpperCase();
  }) || ticker;
  const priceDate = prices?.date || null;
  const barDate = lastBar?.date || null;
  const useBar = Boolean(barDate && (!priceDate || barDate >= priceDate));
  const pageClose = toNumber(useBar ? lastBar?.close : (prices?.close ?? lastBar?.close));
  const pageAsOf = useBar ? barDate : (priceDate || barDate || meta?.as_of || null);
  return {
    ticker,
    name,
    pageClose,
    pageAsOf,
  };
}
