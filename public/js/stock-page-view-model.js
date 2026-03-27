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
    };
  }
  if (ageBusinessDays <= 1) {
    return {
      status: 'fresh',
      ageBusinessDays,
      opacity: 1,
      badge: 'LIVE',
      muted: false,
    };
  }
  if (ageBusinessDays === 2) {
    return {
      status: 'delayed',
      ageBusinessDays,
      opacity: 0.72,
      badge: 'DELAYED',
      muted: true,
    };
  }
  return {
    status: 'stale',
    ageBusinessDays,
    opacity: 0.6,
    badge: 'STALE',
    muted: true,
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

function qualityColor(score) {
  if (!Number.isFinite(score)) return 'var(--text-dim)';
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

  let displaySentence = `Final risk is ${finalState}.`;
  if (overrideApplied && Number.isFinite(volPct)) {
    displaySentence = `Raw volatility is extreme at the ${volPct.toFixed(0)}th percentile, but final risk is moderated to ${finalState} by structural context.`;
  } else if (Number.isFinite(volPct)) {
    displaySentence = `Final risk is ${finalState} based on ${regimeLabel.toLowerCase()} and ${volPct.toFixed(0)}th-percentile volatility.`;
  } else if (regimeLabel) {
    displaySentence = `Final risk is ${finalState} in a ${regimeLabel.toLowerCase()} regime.`;
  }

  return {
    scoreRaw: rawScore,
    scoreLabel: Number.isFinite(rawScore) ? 'Risk Quality' : 'Risk',
    scoreDirection: 'higher_is_safer',
    scoreColor: qualityColor(rawScore),
    finalState,
    finalColor,
    overrideApplied,
    overrideReason,
    regimeLabel,
    rawSignalBand: Number.isFinite(volPct) ? `${volPct.toFixed(0)}th percentile volatility` : regimeLabel,
    displaySentence,
    volPercentile: volPct,
  };
}

export function inferAssetClass({ ticker, name, universe, fundamentals } = {}) {
  const hay = `${ticker || ''} ${name || ''} ${universe?.name || ''} ${universe?.asset_class || ''} ${universe?.security_type || ''} ${universe?.industry || ''}`.toLowerCase();
  if (/\betf\b|\bexchange traded fund\b|\bindex fund\b|\btrust\b|\bucits\b/.test(hay)) return 'ETF';
  if (!fundamentals && /\bspy\b|\bqqq\b|\bivv\b|\bvti\b|\bhyg\b|\baggg\b|\bxlf\b|\biwm\b/.test((ticker || '').toLowerCase())) return 'ETF';
  return 'Stock';
}

export function buildCatalystPresentation({ ticker, name, fundamentals, universe } = {}) {
  const assetClass = inferAssetClass({ ticker, name, universe, fundamentals });
  const nextEarningsDate = fundamentals?.nextEarningsDate || null;
  if (Array.isArray(fundamentals?.confirmedCatalysts) && fundamentals.confirmedCatalysts.length > 0) {
    return {
      status: 'confirmed',
      variant: 'card',
      items: fundamentals.confirmedCatalysts,
      title: 'Upcoming Catalysts',
    };
  }
  if (nextEarningsDate && assetClass !== 'ETF') {
    const date = String(nextEarningsDate).slice(0, 10);
    return {
      status: 'estimated',
      variant: 'compact-card',
      title: 'Upcoming Catalysts',
      primaryText: `Estimated earnings window: ${date}`,
      secondaryText: 'Unconfirmed schedule from fundamentals feed.',
    };
  }
  if (assetClass === 'ETF') {
    return {
      status: 'unavailable',
      variant: 'inline',
      title: 'Catalysts',
      primaryText: 'Catalyst feed unavailable for ETFs.',
      secondaryText: null,
    };
  }
  return {
    status: 'unavailable',
    variant: 'inline',
    title: 'Catalysts',
    primaryText: 'Catalyst feed currently unavailable.',
    secondaryText: null,
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
  const pills = [];
  if (report?.mode) pills.push({ label: 'Mode', value: report.mode, color: 'var(--text-dim)' });
  if (Array.isArray(report?.top_sources) && report.top_sources.length) {
    pills.push({ label: 'Drivers', value: report.top_sources.join(', '), color: 'var(--accent)' });
  }
  if (decision?.fallback_level && decision.fallback_level !== 'exact') {
    pills.push({ label: 'Fallback', value: decision.fallback_level, color: 'var(--yellow)' });
  }
  if (decision?.regime_transition_active) {
    pills.push({ label: 'Runtime', value: 'Regime transition', color: 'var(--red)' });
  }
  return pills;
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
  const prices = data?.market_prices || {};
  const bars = data?.bars || [];
  const lastBar = bars.length ? bars[bars.length - 1] : {};
  const ticker = meta?.request?.normalized_ticker || data?.ticker || requestedTicker || '';
  const name = data?.name || data?.fundamentals?.companyName || ticker;
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
