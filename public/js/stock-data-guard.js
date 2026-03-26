// ─── Stock Data Guard ────────────────────────────────────────────────────────
// Client-side validation layer between API response and UI rendering.
// Returns annotations (warnings, panel gates, corrections) — never mutates payload.

/**
 * @param {object} payload - Raw API response
 * @param {string} ticker - Requested ticker
 * @returns {{ warnings: string[], panelGates: object, corrections: object }}
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
  const brk = data.breakout_v2 || null;

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

  // Panel gates
  const panelGates = {
    tradePlan: guardPanelGate('tradePlan', { close, atr: s.atr14, verdict: decision.verdict, tradePlanValid: tp.valid }),
    fundamentals: guardPanelGate('fundamentals', { fund, fundValid: fundGuard.valid }),
    historical: guardPanelGate('historical', { hasData: true }), // re-evaluated at render time
    breakout: guardPanelGate('breakout', { brk }),
    modelConsensus: guardPanelGate('modelConsensus', { ev4, consensusValid: consensusGuard.valid }),
  };

  if (tp.warning) warnings.push(tp.warning);
  if (fundGuard.warning) warnings.push(fundGuard.warning);
  if (consensusGuard.warning) warnings.push(consensusGuard.warning);

  return { warnings, panelGates, corrections };
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
  return { valid, warning: warnings.length ? warnings.join('; ') : null };
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

  if (isUp && belowSma200 && belowSma50) {
    return {
      contradiction: true,
      note: `Trend=${trend} but price ${close.toFixed(2)} is below SMA200 (${sma200.toFixed(2)}) and SMA50 (${sma50.toFixed(2)})`,
      warning: `Structure: ${trend} claim contradicts price below SMA200/SMA50`,
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
  const hasScientific = states.scientific?.status === 'ok';
  const hasForecast = states.forecast?.status === 'ok';
  const hasElliott = states.elliott?.status === 'ok';
  const hasQuantlab = states.quantlab?.status === 'ok';
  const available = [hasScientific, hasForecast, hasElliott, hasQuantlab].filter(Boolean).length;

  if (available === 0) return { valid: false, warning: 'Model consensus: no model data available' };
  if (available < 3) return { valid: true, warning: `Model consensus: only ${available}/4 models available`, degraded: true };

  return { valid: true, warning: null };
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
      if (!ctx.fund) return { show: false, reason: 'No fundamentals data' };
      if (!ctx.fundValid) return { show: true, degraded: true, reason: 'Some values out of range' };
      return { show: true };
    }
    case 'historical': {
      if (!ctx.hasData) return { show: false, reason: 'No historical data' };
      return { show: true };
    }
    case 'breakout': {
      if (!ctx.brk || !ctx.brk.state) return { show: false, reason: 'No breakout data' };
      return { show: true };
    }
    case 'modelConsensus': {
      if (!ctx.ev4) return { show: false, reason: 'No evaluation data' };
      if (!ctx.consensusValid) return { show: false, reason: 'No model data' };
      return { show: true };
    }
    default:
      return { show: true };
  }
}
