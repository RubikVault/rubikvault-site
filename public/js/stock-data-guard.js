// ─── Stock Data Guard ────────────────────────────────────────────────────────
// Client-side validation layer between API response and UI rendering.
// Returns annotations (warnings, panel gates, corrections) — never mutates payload.

/**
 * @param {object} payload - Raw API response
 * @param {string} ticker - Requested ticker
 * @returns {{ warnings: string[], panelGates: object, corrections: object, integrity: object }}
 */
export function guardPayload(payload, ticker) {
  const warnings = [];
  const corrections = {};
  const data = payload?.data || {};
  const meta = payload?.metadata || {};
  const s = data.market_stats?.stats || {};
  const prices = data.market_prices || {};
  const close = prices.close ?? data.latest_bar?.close ?? null;
  const states = payload?.states || {};
  const decision = payload?.decision || {};
  const explanation = payload?.explanation || {};
  const fund = data.fundamentals || null;
  const ev4 = payload?.evaluation_v4 || null;
  const brk = data.breakout_v12 || data.breakout_v2 || null;
  const priceStack = guardPriceStack(payload);
  const integrity = buildUiIntegrity(payload, { ticker, priceStack });

  // Run all guards
  const r52w = guard52WRange(s, close);
  if (r52w.corrected) corrections.r52label = r52w.label;
  if (r52w.warning) warnings.push(r52w.warning);
  corrections.r52pct = r52w.positionPct;

  const struct = guardStructure(states, s, close);
  if (struct.warning) warnings.push(struct.warning);
  corrections.structureContradiction = struct.contradiction;
  corrections.structureNote = struct.note || null;

  const narr = guardNarrative(explanation, decision, states, s, close);
  if (narr.warning) warnings.push(narr.warning);
  corrections.narrativeContradiction = narr.contradiction;

  const labels = guardLabels(states, s, close);
  corrections.labels = labels;

  const hist = guardHistorical(null, null); // placeholder — called per-horizon in rendering
  corrections.historicalThresholds = { h5d: 0.30, h20d: 0.50, h60d: 0.80 };

  const tp = guardTradePlan(close, s.atr14, decision);
  const fundGuard = guardFundamentals(fund);
  const consensusGuard = guardModelConsensus(decision, ev4);
  corrections.priceStack = {
    valid: priceStack.valid,
    issues: priceStack.issues || [],
    source: priceStack.source || null,
  };
  corrections.fundamentals = {
    availablePrimaryFields: fundGuard.availablePrimaryFields || 0,
  };
  corrections.modelConsensus = {
    available: consensusGuard.available || 0,
    missingModels: consensusGuard.missingModels || [],
    degraded: Boolean(consensusGuard.degraded),
  };

  // Panel gates
  const panelGates = {
    tradePlan: guardPanelGate('tradePlan', { close, atr: s.atr14, verdict: decision.verdict, tradePlanValid: tp.valid }),
    fundamentals: guardPanelGate('fundamentals', { fund, fundValid: fundGuard.valid, fundCoverage: fundGuard.availablePrimaryFields }),
    historical: guardPanelGate('historical', { hasData: true }), // re-evaluated at render time
    breakout: guardPanelGate('breakout', { brk }),
    keyLevels: guardPanelGate('keyLevels', { priceStackValid: priceStack.valid, issues: priceStack.issues }),
    modelConsensus: guardPanelGate('modelConsensus', { ev4, consensusValid: consensusGuard.valid, consensusDegraded: consensusGuard.degraded }),
  };

  if (priceStack.warning) warnings.push(priceStack.warning);
  if (tp.warning) warnings.push(tp.warning);
  if (fundGuard.warning) warnings.push(fundGuard.warning);
  if (consensusGuard.warning) warnings.push(consensusGuard.warning);

  return { warnings, panelGates, corrections, integrity };
}

function finiteNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function unique(values) {
  return Array.from(new Set(values.filter(Boolean)));
}

function isVisibleModuleOnlyReason(reason) {
  const raw = String(reason || '').toLowerCase();
  return /model_coverage_incomplete|historical_profile|breakout_detail|visible_module|fundamentals|ui_banner_not_operational/.test(raw);
}

function isDecisionCoreBusinessReason(reason) {
  const raw = String(reason || '').trim().toUpperCase();
  if (!raw) return false;
  if (raw === 'DECISION_CORE_READY') return true;
  if (/^(WAIT|TAIL_RISK|COST_PROXY|EV_PROXY|RANK|LONG_HORIZON|SHORT_HORIZON|MID_HORIZON)_/.test(raw)) return true;
  if (/_(LOW_RANK|NO_SETUP|RISK_BLOCKER|NOT_POSITIVE|HIGH|UNKNOWN|UNAVAILABLE|EVIDENCE_MISSING)$/.test(raw)) return true;
  return false;
}

function hasUsableDecisionCore(payload) {
  const decisionCore = payload?.decision_core_min || payload?.data?.decision_core_min || null;
  const dailyDecision = payload?.daily_decision || payload?.data?.daily_decision || null;
  const action = String(
    decisionCore?.decision?.primary_action
    || dailyDecision?.primary_action
    || dailyDecision?.verdict
    || payload?.decision?.verdict
    || payload?.data?.decision?.verdict
    || '',
  ).toUpperCase();
  return ['BUY', 'WAIT', 'AVOID', 'SELL', 'INCUBATING'].includes(action);
}

function field(value, status = 'VALID', reason = null, usedInDecision = false, asOf = null) {
  return { value, status, reason, usedInDecision, asOf };
}

export function validateReturnField({ pct, abs = null, close = null, low52w = null, ticker = null, isBenchmark = false, asOf = null } = {}) {
  const value = finiteNumber(pct);
  if (value == null) return field(null, 'BLOCK', 'return missing', true, asOf);
  const price = finiteNumber(close);
  const low = finiteNumber(low52w);
  if (price != null && low != null && low > 0 && value > -0.95) {
    const impliedPrevClose = price / (1 + value);
    if (impliedPrevClose < low * 0.98 && price >= low * 0.98) {
      return field(value, 'BLOCK', 'return conflicts with validated 52W low', true, asOf);
    }
  }
  const threshold = isBenchmark ? 0.20 : 0.50;
  if (Math.abs(value) > threshold) {
    return field(
      value,
      isBenchmark ? 'BLOCK' : 'WARNING',
      isBenchmark ? 'benchmark return plausibility failed' : 'asset return plausibility warning',
      true,
      asOf,
    );
  }
  return field(value, 'VALID', null, true, asOf);
}

function hasPriceSeries(payload, priceStack) {
  const marketContext = payload?.data?.ssot?.market_context || {};
  if (priceStack?.valid === true) return true;
  if (marketContext?.key_levels_ready === true && Array.isArray(marketContext?.issues) && marketContext.issues.length === 0) return true;
  const stats = payload?.data?.market_stats?.stats || {};
  return ['rsi14', 'sma20', 'sma50', 'atr14'].filter((key) => finiteNumber(stats?.[key]) != null).length >= 3;
}

function chartContractStatus(payload) {
  const bars = Array.isArray(payload?.data?.bars) ? payload.data.bars : [];
  const ssotBars = finiteNumber(payload?.data?.ssot?.page_core?.coverage?.bars)
    ?? finiteNumber(payload?.data?.coverage?.bars)
    ?? finiteNumber(payload?.coverage?.bars);
  const histProvider = String(payload?.meta?.historical?.provider || payload?.metadata?.historical?.provider || '').toLowerCase();
  const histAvailability = String(payload?.data?.historical?.availability?.status || payload?.data?.availability?.status || '').toLowerCase();
  const hasDecisionCore = Boolean(payload?.decision_core_min || payload?.data?.decision_core_min);
  const readiness = payload?.analysis_readiness || payload?.data?.analysis_readiness || {};
  const readinessOk = String(readiness?.decision_bundle_status || readiness?.status || '').toUpperCase() === 'OK'
    || String(readiness?.status || '').toUpperCase() === 'READY';
  const minimal = histProvider.includes('page-core-minimal') || histAvailability === 'page_core_minimal';
  if (bars.length >= 3) return field(true, 'VALID', null, false, bars[bars.length - 1]?.date || null);
  if (minimal || (ssotBars != null && ssotBars > 10)) {
    if (hasDecisionCore && readinessOk) {
      return field(null, 'WARNING', 'chart history unavailable', false, null);
    }
    return field(null, 'BLOCK', 'chart contract failed', false, null);
  }
  return field(null, 'WARNING', 'chart history unavailable', false, null);
}

export function buildUiIntegrity(payload, { ticker = null, priceStack = null } = {}) {
  const data = payload?.data || {};
  const stats = data.market_stats?.stats || {};
  const prices = data.market_prices || {};
  const change = data.change || {};
  const moduleFreshness = data.module_freshness || {};
  const close = finiteNumber(prices.close ?? data.latest_bar?.close);
  const priceAsOf = prices.date || moduleFreshness.price_as_of || payload?.metadata?.as_of || null;
  const low52w = finiteNumber(stats.low_52w);
  const fields = {};
  fields.current_price = close != null
    ? field(close, 'VALID', null, true, priceAsOf)
    : field(null, 'BLOCK', 'current price missing', true, priceAsOf);
  fields.asset_return_1d = validateReturnField({
    pct: change.pct ?? change.daily_change_pct,
    abs: change.abs ?? change.daily_change_abs,
    close,
    low52w,
    ticker,
    isBenchmark: false,
    asOf: priceAsOf,
  });
  fields.price_series = hasPriceSeries(payload, priceStack)
    ? field(true, 'VALID', null, true, moduleFreshness.market_stats_as_of || priceAsOf)
    : field(null, 'BLOCK', 'price series basis unavailable', true, moduleFreshness.market_stats_as_of || priceAsOf);
  fields.chart = chartContractStatus(payload);

  const readiness = payload?.analysis_readiness || data.analysis_readiness || {};
  const dailyDecision = payload?.daily_decision || data.daily_decision || {};
  const readinessReasons = unique([
    ...(Array.isArray(readiness.blocking_reasons) ? readiness.blocking_reasons : []),
    ...(Array.isArray(dailyDecision.blocking_reasons) ? dailyDecision.blocking_reasons : []),
  ]);
  const decisionBlockingReasons = hasUsableDecisionCore(payload)
    ? readinessReasons.filter((reason) => !isVisibleModuleOnlyReason(reason) && !isDecisionCoreBusinessReason(reason))
    : readinessReasons;
  const readinessFailed = String(readiness.status || 'READY').toUpperCase() === 'FAILED';
  const decisionContractFailed = readinessFailed && !(hasUsableDecisionCore(payload) && decisionBlockingReasons.length === 0);
  fields.decision_contract = decisionBlockingReasons.length === 0 && !decisionContractFailed
    ? field(true, 'VALID', null, true, priceAsOf)
    : field(null, 'BLOCK', decisionBlockingReasons[0] || 'decision contract failed', true, priceAsOf);

  const decisionCritical = ['current_price', 'asset_return_1d', 'price_series', 'decision_contract'];
  const pageCritical = [...decisionCritical, 'chart'];
  const decisionBlocks = decisionCritical.filter((key) => fields[key]?.status === 'BLOCK');
  const criticalBlocks = pageCritical.filter((key) => fields[key]?.status === 'BLOCK');
  const allBlocks = Object.entries(fields).filter(([, value]) => value?.status === 'BLOCK');
  const pageState = criticalBlocks.length > 0
    ? (criticalBlocks.length / decisionCritical.length > 0.5 ? 'GLOBAL_OUTAGE' : 'DATA_ISSUE')
    : 'OK';
  const flags = criticalBlocks.length ? ['DATA_ISSUE'] : [];
  if (fields.asset_return_1d.status === 'BLOCK') flags.push('RETURN_VALIDATION_FAILED');
  if (fields.chart.status === 'BLOCK') flags.push('CHART_CONTRACT_FAILED');
  if (fields.price_series.status === 'BLOCK') flags.push('PRICE_SERIES_FAILED');

  return {
    fields,
    pageState,
    dataQuality: pageState === 'OK' ? 'OK' : 'FAILED',
    coverage: fields.chart.status === 'BLOCK' || fields.price_series.status === 'BLOCK' ? 'PARTIAL' : 'FULL',
    decisionReadiness: decisionBlocks.length ? 'UNAVAILABLE' : 'READY',
    flags: unique(flags),
    blockingReasons: unique(criticalBlocks.map((key) => fields[key]?.reason)),
    issueCount: allBlocks.length,
  };
}

export function guardPriceStack(payload) {
  const marketContext = payload?.data?.ssot?.market_context || null;
  if (marketContext) {
    const issues = Array.isArray(marketContext.issues) ? marketContext.issues.slice() : [];
    const priceDate = marketContext.price_date || null;
    const statsDate = marketContext.stats_date || null;
    const latestBarDate = marketContext.latest_bar_date || null;
    if (!marketContext.prices_source) issues.push('missing_price_source');
    if (!marketContext.stats_source) issues.push('missing_stats_source');
    if (!priceDate) issues.push('missing_price_date');
    if (!statsDate) issues.push('missing_stats_date');
    if (!latestBarDate) issues.push('missing_latest_bar_date');
    if (priceDate && latestBarDate && priceDate !== latestBarDate) issues.push('price_latest_bar_date_mismatch');
    if (statsDate && latestBarDate && statsDate !== latestBarDate) issues.push('stats_latest_bar_date_mismatch');
    const valid = marketContext.key_levels_ready === true && issues.length === 0;
    return {
      valid,
      issues: Array.from(new Set(issues)),
      source: marketContext.prices_source || null,
      warning: !valid && issues.length ? `Price stack mismatch: ${issues.join('; ')}` : null,
    };
  }
  const prices = payload?.data?.market_prices || {};
  const lastBar = Array.isArray(payload?.data?.bars) && payload.data.bars.length
    ? payload.data.bars[payload.data.bars.length - 1]
    : payload?.data?.latest_bar || null;
  const stats = payload?.data?.market_stats?.stats || {};
  const close = Number(prices?.close);
  const barClose = Number(lastBar?.close ?? lastBar?.adjClose);
  const high52w = Number(stats?.high_52w);
  const low52w = Number(stats?.low_52w);
  const issues = ['missing_ssot_market_context'];

  if (Number.isFinite(close) && Number.isFinite(barClose) && close > 0 && barClose > 0) {
    const ratio = Math.max(close, barClose) / Math.min(close, barClose);
    if (ratio >= 5) issues.push('price_bar_scale_mismatch');
  }
  if (Number.isFinite(close) && Number.isFinite(high52w) && Number.isFinite(low52w) && high52w > low52w && low52w > 0) {
    if (close > high52w * 5 || close < low52w * 0.2) issues.push('price_outside_52w_envelope');
  }

  return {
    valid: false,
    issues: Array.from(new Set(issues)),
    source: null,
    warning: `Price stack mismatch: ${Array.from(new Set(issues)).join('; ')}`,
  };
}

// ─── Individual Guards ───────────────────────────────────────────────────────

export function guard52WRange(stats, close) {
  const high = stats?.high_52w;
  const low = stats?.low_52w;
  if (!Number.isFinite(high) || !Number.isFinite(low) || !Number.isFinite(close) || high <= low) {
    return { positionPct: null, label: '—', corrected: false, valid: false };
  }
  const positionPct = (close - low) / (high - low);
  let label;
  if (positionPct > 0.9) label = 'Near High';
  else if (positionPct > 0.75) label = 'Upper Range';
  else if (positionPct > 0.25) label = 'Mid-Range';
  else if (positionPct > 0.1) label = 'Lower Range';
  else label = 'Near Low';

  // Check if backend label would differ
  const backendPct = stats?.range_52w_pct;
  const corrected = Number.isFinite(backendPct) && Math.abs(backendPct - positionPct) > 0.15;
  const warning = corrected ? `52W range: backend pct ${(backendPct*100).toFixed(0)}% vs computed position ${(positionPct*100).toFixed(0)}%` : null;

  return { positionPct, label, corrected, valid: true, warning };
}

export function guardTradePlan(close, atr, decision) {
  if (!Number.isFinite(close)) return { valid: false, warning: 'Trade plan: no close price' };
  const verdict = decision?.verdict;
  if (verdict !== 'BUY' && verdict !== 'SELL') return { valid: true, warning: null }; // no plan expected

  // For BUY: entry ≈ close, stop < entry, target > entry
  // For SELL: entry ≈ close, stop > entry, target < entry
  const entry = close;
  const stop = atr != null ? (verdict === 'BUY' ? close - atr : close + atr) : null;
  const targetLevels = decision?.trade_plan?.targets || [];

  if (stop != null && Number.isFinite(stop)) {
    const stopDist = Math.abs(stop - entry) / entry;
    if (stopDist > 0.15) {
      return { valid: false, warning: `Trade plan: stop ${stop.toFixed(2)} is ${(stopDist*100).toFixed(0)}% from entry ${entry.toFixed(2)}` };
    }
  }

  return { valid: true, warning: null };
}

export function guardFundamentals(fund) {
  if (!fund) return { valid: false, warning: null }; // no data is not an error
  const typedStatus = String(fund?.typed_status || '').toUpperCase();
  if (typedStatus === 'OUT_OF_SCOPE' || typedStatus === 'NOT_APPLICABLE') {
    return { valid: true, warning: null, availablePrimaryFields: 0 };
  }
  if (typedStatus === 'UPDATING') {
    return { valid: true, warning: null, availablePrimaryFields: 0 };
  }
  const warnings = [];

  const cap = fund.marketCap;
  if (cap != null && (cap <= 0 || cap > 20e12)) {
    warnings.push(`Fundamentals: market cap ${cap} out of range`);
  }

  const pe = fund.pe_ttm;
  if (pe != null && (pe < -1000 || pe > 1000)) {
    warnings.push(`Fundamentals: P/E ${pe} out of range`);
  }

  const eps = fund.eps_ttm;
  if (pe != null && eps != null) {
    if ((pe > 0 && eps < 0) || (pe < 0 && eps > 0)) {
      warnings.push('Fundamentals: P/E and EPS sign mismatch');
    }
  }

  const div = fund.dividendYield;
  if (div != null && (div < 0 || div > 100)) {
    warnings.push(`Fundamentals: dividend yield ${div}% out of range`);
  }

  const valid = warnings.length === 0;
  const availablePrimaryFields = ['marketCap', 'pe_ttm', 'eps_ttm', 'dividendYield'].filter((key) => fund?.[key] != null).length;
  return { valid, warning: warnings.length ? warnings.join('; ') : null, availablePrimaryFields };
}

export function guardStructure(states, stats, close) {
  const trend = states?.trend;
  const sma200 = stats?.sma200;
  const sma50 = stats?.sma50;
  const sma20 = stats?.sma20;

  if (!trend || !Number.isFinite(close)) return { contradiction: false };

  const isUp = trend === 'STRONG_UP' || trend === 'UP';
  const belowSma200 = Number.isFinite(sma200) && close < sma200;
  const belowSma50 = Number.isFinite(sma50) && close < sma50;

  if (isUp && belowSma200) {
    return {
      contradiction: true,
      note: `Trend=${trend} but price ${close.toFixed(2)} is below SMA200 (${sma200.toFixed(2)})${belowSma50 ? ` and SMA50 (${sma50.toFixed(2)})` : ''}`,
      warning: belowSma50
        ? `Structure: ${trend} claim contradicts price below SMA200/SMA50`
        : `Structure: ${trend} claim contradicts price below SMA200`,
    };
  }

  if (trend === 'STRONG_UP') {
    const belowAll = belowSma200 || belowSma50 || (Number.isFinite(sma20) && close < sma20);
    if (belowAll) {
      return {
        contradiction: true,
        note: `STRONG_UP but price below at least one major MA`,
        warning: `Structure: STRONG_UP contradicts MA alignment`,
      };
    }
  }

  return { contradiction: false };
}

export function guardNarrative(explanation, decision, states, stats, close) {
  const sentiment = explanation?.sentiment;
  const verdict = decision?.verdict;
  const synthesis = explanation?.synthesis || '';
  const sma200 = stats?.sma200;

  // Check: positive sentiment with AVOID verdict
  if (sentiment === 'positive' && verdict === 'AVOID') {
    return {
      contradiction: true,
      warning: 'Narrative: positive sentiment contradicts AVOID verdict',
    };
  }

  // Check: "uptrend" claim when price < SMA200
  if (Number.isFinite(close) && Number.isFinite(sma200) && close < sma200) {
    if (synthesis.toLowerCase().includes('structural uptrend') || synthesis.toLowerCase().includes('long-term uptrend')) {
      return {
        contradiction: true,
        warning: `Narrative: claims uptrend but price ${close.toFixed(2)} < SMA200 ${sma200.toFixed(2)}`,
      };
    }
  }

  return { contradiction: false };
}

export function guardHistorical(events, horizonKey) {
  if (!events || !horizonKey) return { suspectKeys: [], valid: true };

  const thresholds = { h5d: 0.30, h20d: 0.50, h60d: 0.80 };
  const maxReturn = thresholds[horizonKey] || 0.50;
  const suspectKeys = [];

  for (const [key, data] of Object.entries(events)) {
    const h = data?.[horizonKey];
    if (!h) continue;
    const avgRet = Math.abs(h.avg_return || 0);
    const mae = Math.abs(h.mae || 0);
    const mfe = Math.abs(h.mfe || 0);

    if (avgRet > maxReturn) {
      suspectKeys.push(key);
    } else if (mae > 0 && mfe > 0 && avgRet > 5 * Math.max(mae, mfe)) {
      suspectKeys.push(key);
    }
  }

  return { suspectKeys, valid: suspectKeys.length === 0 };
}

export function guardLabels(states, stats, close) {
  const labels = {};

  // RSI label enrichment
  const rsi = stats?.rsi14;
  const momentum = states?.momentum;
  if (Number.isFinite(rsi)) {
    if (rsi <= 35 && rsi > 20 && momentum === 'BEARISH') {
      labels.rsiSuffix = ' · Near Oversold';
    } else if (rsi >= 65 && rsi < 80 && momentum === 'BULLISH') {
      labels.rsiSuffix = ' · Near Overbought';
    }
  }

  // Risk label with reason
  const vol = states?.volatility;
  const volPct = stats?.volatility_percentile;
  if (vol === 'EXTREME' && Number.isFinite(volPct)) {
    labels.riskReason = `Volatility at ${volPct}th percentile`;
  } else if (vol === 'HIGH' && Number.isFinite(volPct)) {
    labels.riskReason = `Volatility at ${volPct}th percentile`;
  }
  // Risk governance: detect backend volatility inconsistency
  if ((vol === 'LOW' || vol === 'COMPRESSED') && Number.isFinite(volPct) && volPct > 75) {
    labels.riskOverride = volPct > 90 ? 'Elevated' : 'Medium';
    labels.correctedVolatility = volPct > 90 ? 'EXTREME' : 'HIGH';
    labels.finalVolatility = labels.correctedVolatility;
    labels.correctedVolatilityReason = 'backend_volatility_inconsistency';
    labels.riskReason = `Backend says ${vol} but volatility at ${volPct}th percentile`;
  }

  // Volatility label precision
  const dailyVol = stats?.volatility_20d;
  if (Number.isFinite(dailyVol)) {
    labels.volLabel = `${(dailyVol * 100).toFixed(1)}% (20D daily)`;
  }

  // Percentile label precision
  if (Number.isFinite(volPct)) {
    labels.posLabel = `${volPct}th pctl (ATR vs 252D)`;
  }

  return labels;
}

export function guardModelConsensus(decision, ev4) {
  if (!ev4?.input_states) return { valid: false, warning: null };

  const states = ev4.input_states;
  const entries = ['quantlab', 'forecast', 'scientific'].map((key) => ({ key, state: states[key] || {} }));
  const required = entries.filter(({ state }) => state.status !== 'not_applicable');
  const available = required.filter(({ state }) => state.status === 'ok').length;
  const missingModels = [
    ...required.filter(({ state }) => state.status !== 'ok').map(({ key }) => key),
  ].filter(Boolean);

  if (required.length === 0) return { valid: true, warning: null, available: 0, total: 0, missingModels: [], degraded: false };
  if (available === 0) return { valid: false, warning: 'Model consensus: no required model data available', available, total: required.length, missingModels, degraded: true };
  
  const isUiDegraded = available < required.length;

  return { 
    valid: true, 
    warning: isUiDegraded ? `Model consensus: ${available}/${required.length} required models available` : null,
    available, 
    total: required.length,
    missingModels, 
    degraded: isUiDegraded 
  };
}

export function guardPanelGate(panel, ctx) {
  switch (panel) {
    case 'tradePlan': {
      const v = ctx.verdict;
      if (v !== 'BUY' && v !== 'SELL') return { show: false, reason: 'No active trade signal' };
      if (!ctx.tradePlanValid) return { show: false, reason: 'Trade plan data inconsistency' };
      if (!Number.isFinite(ctx.close)) return { show: false, reason: 'No price data' };
      return { show: true };
    }
    case 'fundamentals': {
      const typedStatus = String(ctx.fund?.typed_status || '').toUpperCase();
      if (typedStatus === 'OUT_OF_SCOPE' || typedStatus === 'NOT_APPLICABLE') return { show: true };
      if (typedStatus === 'UPDATING') return { show: true };
      if (!ctx.fund) return { show: true, degraded: true, reason: 'No fundamentals data' };
      if (!ctx.fundCoverage) return { show: true, degraded: true, reason: 'No verified fundamentals fields' };
      if (!ctx.fundValid) return { show: true, degraded: true, reason: 'Some values out of range' };
      return { show: true };
    }
    case 'historical': {
      if (!ctx.hasData) return { show: false, reason: 'No historical data' };
      return { show: true };
    }
    case 'breakout': {
      if (!ctx.brk || (!ctx.brk.state && !ctx.brk.status && ctx.brk?.scores?.final_signal_score == null && ctx.brk?.final_signal_score == null)) {
        return { show: false, reason: 'No breakout data' };
      }
      return { show: true };
    }
    case 'keyLevels': {
      if (!ctx.priceStackValid) return { show: false, reason: (ctx.issues || []).join('; ') || 'Price stack mismatch' };
      return { show: true };
    }
    case 'modelConsensus': {
      if (!ctx.ev4) return { show: true, degraded: true, reason: 'No evaluation data' };
      if (!ctx.consensusValid) return { show: true, degraded: true, reason: 'No model data' };
      if (ctx.consensusDegraded) return { show: true, degraded: true, reason: 'Partial model coverage' };
      return { show: true };
    }
    default:
      return { show: true };
  }
}
