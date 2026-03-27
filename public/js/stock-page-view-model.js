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
  if (finalState === 'High' || finalState === 'Elevated' || finalState === 'Medium') return 'rgba(245,158,11,0.72)';
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
    scoreColor: qualityColor(rawScore, finalState),
    displayLabel: overrideApplied ? `${finalState} (override)` : finalState,
    finalState,
    finalColor,
    overrideApplied,
    overrideReason,
    regimeLabel,
    rawSignalBand: Number.isFinite(volPct) ? `${volPct.toFixed(0)}th percentile volatility` : regimeLabel,
    displaySentence,
    scoreHelperText: 'Higher = better structural quality, not lower final risk.',
    rawSignalText: Number.isFinite(volPct) ? `Raw signal: relative volatility at the ${volPct.toFixed(0)}th percentile.` : `Raw signal: ${regimeLabel}.`,
    overrideDisplayReason: overrideApplied
      ? (overrideReason ? `Override reason: ${overrideReason.replace(/\.$/, '')}.` : 'Override reason: structural context moderated the raw signal.')
      : 'Override reason: no override applied.',
    driverText: Number.isFinite(volPct)
      ? `Driver: Relative volatility extreme (${volPct.toFixed(0)}th percentile).`
      : `Driver: ${regimeLabel}.`,
    contextText: overrideApplied
      ? 'Override applied: Low realized volatility and supportive structural context moderate the final classification.'
      : 'Context: No moderation applied to the final classification.',
    volPercentile: volPct,
  };
}

function formatMarketCap(value) {
  const v = toNumber(value);
  if (!Number.isFinite(v) || v <= 0) return '—';
  if (v >= 1e12) return `$${(v / 1e12).toFixed(2)}T`;
  if (v >= 1e9) return `$${(v / 1e9).toFixed(1)}B`;
  if (v >= 1e6) return `$${(v / 1e6).toFixed(0)}M`;
  return `$${v.toLocaleString('en-US')}`;
}

function formatFundamentalMetric(key, value) {
  const n = toNumber(value);
  if (!Number.isFinite(n)) return '—';
  switch (key) {
    case 'marketCap':
      return formatMarketCap(n);
    case 'pe_ttm':
      return n.toFixed(1);
    case 'eps_ttm':
      return `$${n.toFixed(2)}`;
    case 'dividendYield':
      return `${n.toFixed(1)}%`;
    default:
      return String(n);
  }
}

function hasNumericFundamental(value) {
  return value != null && value !== '' && Number.isFinite(Number(value));
}

export function buildFundamentalsPresentation({ fundamentals, meta = null } = {}) {
  const coreMetrics = [
    { key: 'marketCap', label: 'Market Cap', value: formatFundamentalMetric('marketCap', fundamentals?.marketCap), present: hasNumericFundamental(fundamentals?.marketCap) },
    { key: 'pe_ttm', label: 'P/E (TTM)', value: formatFundamentalMetric('pe_ttm', fundamentals?.pe_ttm), present: hasNumericFundamental(fundamentals?.pe_ttm) },
    { key: 'eps_ttm', label: 'EPS (TTM)', value: formatFundamentalMetric('eps_ttm', fundamentals?.eps_ttm), present: hasNumericFundamental(fundamentals?.eps_ttm) },
    { key: 'dividendYield', label: 'Div Yield', value: formatFundamentalMetric('dividendYield', fundamentals?.dividendYield), present: hasNumericFundamental(fundamentals?.dividendYield) },
  ];
  const available = coreMetrics.filter((metric) => metric.present);
  const profileLine = fundamentals?.sector
    ? `${fundamentals.sector}${fundamentals?.industry ? ` · ${fundamentals.industry}` : ''}`
    : null;
  const metaStatus = String(meta?.status || meta?.mode || '').toLowerCase();
  const unavailable = !available.length;
  if (available.length >= 2) {
    return {
      status: 'available',
      renderMode: 'card',
      title: 'Fundamentals',
      metrics: coreMetrics,
      profileLine,
      helperText: null,
    };
  }
  if (available.length === 1) {
    return {
      status: 'limited',
      renderMode: 'compact',
      title: 'Fundamentals',
      metrics: available,
      profileLine,
      helperText: 'Limited fundamentals coverage.',
    };
  }
  if (unavailable && (metaStatus === 'error' || metaStatus === 'degraded' || metaStatus === 'unknown')) {
    return {
      status: 'unavailable',
      renderMode: 'inline',
      title: 'Fundamentals',
      metrics: [],
      profileLine,
      helperText: 'Fundamentals source unavailable for this analysis.',
    };
  }
  return {
    status: 'hidden',
    renderMode: 'hidden',
    title: 'Fundamentals',
    metrics: [],
    profileLine: null,
    helperText: null,
  };
}

export function inferAssetClass({ ticker, name, universe, fundamentals } = {}) {
  const hay = `${ticker || ''} ${name || ''} ${universe?.name || ''} ${universe?.asset_class || ''} ${universe?.security_type || ''} ${universe?.industry || ''}`.toLowerCase();
  if (/\betf\b|\bexchange traded fund\b|\bindex fund\b|\btrust\b|\bucits\b/.test(hay)) return 'ETF';
  if (!fundamentals && /\bspy\b|\bqqq\b|\bivv\b|\bvti\b|\bhyg\b|\baggg\b|\bxlf\b|\biwm\b/.test((ticker || '').toLowerCase())) return 'ETF';
  return 'Stock';
}

export function buildCatalystPresentation({ ticker, name, fundamentals, universe, fundamentalsMeta = null } = {}) {
  const assetClass = inferAssetClass({ ticker, name, universe, fundamentals });
  const nextEarningsDate = fundamentals?.nextEarningsDate || null;
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
      primaryText: '0 confirmed catalysts in the next 30 days',
      secondaryText: `Next expected earnings window: ~${date} (unconfirmed)`,
    };
  }
  if (assetClass === 'ETF') {
    return {
      status: 'hidden',
      renderMode: 'hidden',
      variant: 'hidden',
      assetClass,
      title: 'Catalysts',
      primaryText: null,
      secondaryText: null,
    };
  }
  const fundamentalsStatus = String(fundamentalsMeta?.status || fundamentalsMeta?.mode || '').toLowerCase();
  if (fundamentalsStatus === 'error' || fundamentalsStatus === 'degraded' || fundamentalsStatus === 'unknown') {
    return {
      status: 'unavailable',
      renderMode: 'inline',
      variant: 'inline',
      assetClass,
      title: 'Catalysts',
      primaryText: 'Catalyst feed currently unavailable.',
      secondaryText: 'No confirmed events are available from the current fundamentals source.',
    };
  }
  return {
    status: 'unavailable',
    renderMode: 'hidden',
    variant: 'hidden',
    assetClass,
    title: 'Catalysts',
    primaryText: null,
    secondaryText: null,
  };
}

export function buildModelEvidencePresentation({ evaluationV4 = null, breakout = null, assetClass = 'Stock' } = {}) {
  const hasConsensus = Boolean(evaluationV4);
  const breakoutState = breakout?.state || 'NONE';
  const breakoutScore = toNumber(breakout?.scores?.total) ?? 0;
  const breakoutRelevant = breakoutState !== 'NONE' || breakoutScore > 0;
  if (hasConsensus) {
    return {
      status: 'available',
      renderMode: 'card',
      showSection: true,
      showConsensus: true,
      showBreakoutMini: breakoutRelevant,
      emptyText: null,
    };
  }
  if (breakoutRelevant) {
    return {
      status: 'partial',
      renderMode: 'compact',
      showSection: true,
      showConsensus: false,
      showBreakoutMini: true,
      emptyText: null,
    };
  }
  if (assetClass === 'ETF') {
    return {
      status: 'hidden',
      renderMode: 'hidden',
      showSection: false,
      showConsensus: false,
      showBreakoutMini: false,
      emptyText: null,
    };
  }
  return {
    status: 'hidden',
    renderMode: 'hidden',
    showSection: false,
    showConsensus: false,
    showBreakoutMini: false,
    emptyText: null,
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
  const universe = payload?.universe || payload?.evaluation_v4?.universe || data?.universe || {};
  const prices = data?.market_prices || {};
  const bars = data?.bars || [];
  const lastBar = bars.length ? bars[bars.length - 1] : {};
  const ticker = meta?.request?.normalized_ticker || data?.ticker || requestedTicker || '';
  const name = data?.name || data?.fundamentals?.companyName || universe?.name || ticker;
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
