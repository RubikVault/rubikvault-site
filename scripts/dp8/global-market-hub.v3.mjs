#!/usr/bin/env node
/**
 * DP8 Global Market Hub Builder
 * Fetches global indices, commodities, crypto, forex from EODHD
 * Produces public/data/v3/derived/market/global-latest.json
 * Includes Money Flow tracking (sector rotation trends, asset flow analysis)
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { createRunContext } from '../lib/v3/run-context.mjs';
import { writeJsonArtifact } from '../lib/v3/artifact-writer.mjs';

const EODHD_BASE = 'https://eodhd.com/api';

async function readJsonSafe(filePath, fallback) {
  try {
    return JSON.parse(await fs.readFile(filePath, 'utf8'));
  } catch { return fallback; }
}

async function fetchEodhdEod(symbol, from, to, apiKey) {
  const url = `${EODHD_BASE}/eod/${encodeURIComponent(symbol)}?from=${from}&to=${to}&fmt=json&api_token=${encodeURIComponent(apiKey)}`;
  try {
    const res = await fetch(url, { headers: { 'user-agent': 'RubikVault-v3-data-plane/1.0' } });
    if (!res.ok) return null;
    const data = await res.json();
    return Array.isArray(data) ? data : null;
  } catch { return null; }
}

function changePct(open, close) {
  if (!Number.isFinite(open) || !Number.isFinite(close) || open === 0) return null;
  return Number((((close - open) / open) * 100).toFixed(4));
}

function trendDirection(values) {
  if (!Array.isArray(values) || values.length < 2) return 'neutral';
  const recent = values.slice(-5);
  const positives = recent.filter((v) => v > 0).length;
  if (positives >= 4) return 'bullish';
  if (positives <= 1) return 'bearish';
  return 'neutral';
}

function trendStrength(values) {
  if (!Array.isArray(values) || values.length < 3) return 'weak';
  const recent = values.slice(-10);
  const avg = recent.reduce((s, v) => s + Math.abs(v), 0) / recent.length;
  const consistent = recent.slice(-5).every((v) => v > 0) || recent.slice(-5).every((v) => v < 0);
  if (consistent && avg > 1) return 'strong';
  if (consistent) return 'moderate';
  return 'weak';
}

function computeFlowSignal(bars) {
  if (!Array.isArray(bars) || bars.length < 5) return null;
  const sorted = bars.sort((a, b) => a.date.localeCompare(b.date));
  const dailyChanges = sorted.map((b) => changePct(b.open, b.close)).filter(Number.isFinite);
  const last = sorted[sorted.length - 1];
  const first5 = sorted.slice(0, Math.min(5, sorted.length));
  const last5 = sorted.slice(-Math.min(5, sorted.length));
  const avgFirst = first5.reduce((s, b) => s + b.close, 0) / first5.length;
  const avgLast = last5.reduce((s, b) => s + b.close, 0) / last5.length;
  const periodChange = changePct(avgFirst, avgLast);
  const direction = trendDirection(dailyChanges);
  const strength = trendStrength(dailyChanges);
  const daysTracked = sorted.length;

  return {
    close: last.close,
    open: last.open,
    change_pct: changePct(last.open, last.close),
    period_change_pct: periodChange,
    direction,
    strength,
    days_tracked: daysTracked,
    as_of: last.date
  };
}

async function fetchSymbolWithFlow(symbol, displayName, fromDate, toDate, apiKey) {
  const bars = await fetchEodhdEod(symbol, fromDate, toDate, apiKey);
  if (!bars || bars.length === 0) {
    return {
      symbol, name: displayName,
      close: null, change_pct: null, as_of: toDate,
      unavailable: true, flow: null
    };
  }
  const flow = computeFlowSignal(bars);
  const last = bars[bars.length - 1];
  return {
    symbol, name: displayName,
    close: last.close,
    open: last.open,
    change_pct: changePct(last.open, last.close),
    volume: last.volume || null,
    as_of: String(last.date || '').slice(0, 10),
    unavailable: false,
    flow,
    bars // raw bars for card computation
  };
}

// ═══ TREND LIFECYCLE ENGINE ═══════════════════════════════════════
// Unified Score/Phase/Confidence schema for every asset

function computeMomentum(bars) {
  if (!Array.isArray(bars) || bars.length < 5) return { m20: 0, m60: 0, m200: 0, bars_available: 0 };
  const sorted = [...bars].sort((a, b) => a.date.localeCompare(b.date));
  const closes = sorted.map((b) => b.close).filter(Number.isFinite);
  const n = closes.length;
  if (n < 5) return { m20: 0, m60: 0, m200: 0, bars_available: 0 };
  const last = closes[n - 1];
  const avg = (arr) => arr.reduce((s, v) => s + v, 0) / arr.length;
  // Only compute each timeframe if we have enough distinct bars
  const m20 = n >= 10 ? (last / avg(closes.slice(-20)) - 1) * 100 : (last / avg(closes.slice(-n)) - 1) * 100;
  // m60 requires at least 40 bars to be meaningful (not just reusing m20 data)
  const m60 = n >= 40 ? (last / avg(closes.slice(-60)) - 1) * 100 : null;
  // m200 requires at least 120 bars
  const m200 = n >= 120 ? (last / avg(closes.slice(-200)) - 1) * 100 : null;
  return {
    m20: Number((m20 || 0).toFixed(4)),
    m60: m60 !== null ? Number(m60.toFixed(4)) : null,
    m200: m200 !== null ? Number(m200.toFixed(4)) : null,
    bars_available: n,
  };
}

function computeVolZ(bars) {
  if (!Array.isArray(bars) || bars.length < 5) return 0;
  const sorted = [...bars].sort((a, b) => a.date.localeCompare(b.date));
  const returns = [];
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i].close && sorted[i - 1].close) {
      returns.push(Math.abs((sorted[i].close - sorted[i - 1].close) / sorted[i - 1].close));
    }
  }
  if (returns.length < 3) return 0;
  const avg = returns.reduce((s, v) => s + v, 0) / returns.length;
  const recent = returns.slice(-5);
  const recentAvg = recent.reduce((s, v) => s + v, 0) / recent.length;
  const std = Math.sqrt(returns.reduce((s, v) => s + (v - avg) ** 2, 0) / returns.length);
  return std > 0 ? Number(((recentAvg - avg) / std).toFixed(4)) : 0;
}

function computePhase(m20, m60, m200, flowDirection, volz) {
  // When m60/m200 are null (insufficient data), use short-term only
  const has60 = m60 !== null;
  const has200 = m200 !== null;
  const eff60 = has60 ? m60 : m20 * 0.8; // fallback: dampened m20
  const eff200 = has200 ? m200 : null;

  // With very limited data, classify based on m20 + flow only
  if (!has60 && !has200) {
    if (m20 > 1) return flowDirection === 'bullish' ? 'MID' : 'EARLY';
    if (m20 > 0) return 'EARLY';
    if (m20 > -1) return 'NEUTRAL';
    return flowDirection === 'bearish' ? 'LATE' : 'NEUTRAL';
  }

  // Full decision tree when sufficient data
  if (has60 && eff60 < 0 && (eff200 === null || eff200 < 0)) return 'REVERSAL_RISK';
  if ((eff200 || eff60) > 0 && eff60 > 0 && m20 < 0 && (volz > 1 || Math.abs(m20) > 3)) return 'EXHAUSTED';
  if ((eff200 || eff60) > 0 && eff60 > 0 && m20 <= 0) return 'LATE';
  if (m20 > 0 && eff60 > 0 && (eff200 === null || eff200 > 0)) return 'MID';
  if (m20 > 0 && eff60 <= 0) return 'EARLY';
  if (m20 > 0 && eff60 > 0) return 'MID';
  return 'NEUTRAL';
}

function computeAssetScore(momentum, flowSignal, volz, type, weightsConfig) {
  const weights = weightsConfig?.score_weights?.[type] || weightsConfig?.score_weights?.default || { momentum: 0.35, flows: 0.20, valuation: 0.15, macro: 0.20, risk: 0.10 };
  // Momentum subscore: normalized from momentum values (handle null m60/m200)
  const m60v = momentum.m60 ?? momentum.m20 * 0.8;
  const m200v = momentum.m200 ?? m60v * 0.6;
  const momRaw = (momentum.m20 + m60v * 0.8 + m200v * 0.5) / 3;
  const momSub = Math.max(-1, Math.min(1, momRaw / 10));
  // Flow subscore: from flow direction/strength
  let flowSub = 0;
  if (flowSignal) {
    if (flowSignal.direction === 'bullish') flowSub = flowSignal.strength === 'strong' ? 0.8 : flowSignal.strength === 'moderate' ? 0.5 : 0.2;
    else if (flowSignal.direction === 'bearish') flowSub = flowSignal.strength === 'strong' ? -0.8 : flowSignal.strength === 'moderate' ? -0.5 : -0.2;
  }
  // Risk subscore: inverse of volatility z-score
  const riskSub = Math.max(-1, Math.min(1, -volz / 2));
  // Macro/valuation: use period change as rough proxy
  const macroSub = flowSignal?.period_change_pct ? Math.max(-1, Math.min(1, flowSignal.period_change_pct / 15)) : 0;
  const valSub = 0; // No valuation data available yet

  const raw = (weights.momentum || 0.35) * momSub
    + (weights.flows || 0.20) * flowSub
    + (weights.valuation || 0.15) * valSub
    + (weights.macro || weights.supply_demand || 0.20) * macroSub
    + (weights.risk || 0.10) * riskSub;

  return Math.max(0, Math.min(100, Math.round(50 + 50 * raw)));
}

function computeAssetConfidence(flowSignal, momentum, dataAvailable, staleDays) {
  // Signal agreement: how many independent signals agree on direction
  const signals = [];
  if (momentum.m20 !== 0) signals.push(momentum.m20 > 0 ? 1 : -1);
  if (momentum.m60 !== 0) signals.push(momentum.m60 > 0 ? 1 : -1);
  if (momentum.m200 !== 0) signals.push(momentum.m200 > 0 ? 1 : -1);
  if (flowSignal?.direction === 'bullish') signals.push(1);
  else if (flowSignal?.direction === 'bearish') signals.push(-1);
  const majority = signals.filter((s) => s > 0).length >= signals.filter((s) => s < 0).length ? 1 : -1;
  const aligned = signals.filter((s) => s === majority).length;
  const agreement = signals.length > 0 ? aligned / signals.length : 0;
  // Data quality
  const coverage = dataAvailable ? 0.9 : 0.3;
  const freshness = staleDays <= 1 ? 1.0 : staleDays <= 3 ? 0.8 : staleDays <= 7 ? 0.7 : 0.6;
  const reliability = 0.9; // EODHD = Tier B
  const quality = coverage * freshness * reliability;
  const value = Number((agreement * quality).toFixed(4));
  const label = value >= 0.75 ? 'HIGH' : value >= 0.50 ? 'MEDIUM' : 'LOW';
  return { label, value, explain: { signal_agreement: Number(agreement.toFixed(2)), coverage, freshness, reliability } };
}

function computeRegime(pulseData, regimeProxyResults) {
  let conditions = 0;
  const details = {};
  // Breadth check
  if (pulseData) {
    const total = (pulseData.breadth_up || 0) + (pulseData.breadth_down || 0);
    const breadthRatio = total > 0 ? pulseData.breadth_up / total : 0.5;
    const breadth_z = (breadthRatio - 0.5) / 0.15; // normalized
    details.breadth_z = Number(breadth_z.toFixed(2));
    if (breadth_z < -1.5) conditions++;
  }
  // Credit proxy (HYG trend)
  const hyg = regimeProxyResults?.get('HYG.US');
  if (hyg?.flow) {
    const credit_z = hyg.flow.direction === 'bearish' ? (hyg.flow.strength === 'strong' ? 2.0 : 1.5) : 0;
    details.credit_z = credit_z;
    if (credit_z > 1.5) conditions++;
  }
  // Vol proxy (from SPY realized vol)
  const spy = regimeProxyResults?.get('SPY.US') || regimeProxyResults?.get('GSPC.INDX');
  if (spy?.bars) {
    const vz = computeVolZ(spy.bars);
    details.vol_z = vz;
    if (vz > 1.5) conditions++;
  }
  // TLT as rates stress proxy
  const tlt = regimeProxyResults?.get('TLT.US');
  if (tlt?.flow) {
    details.rates_trend = tlt.flow.direction;
  }

  let mode = 'NORMAL';
  if (conditions >= 3 || (details.credit_z || 0) > 2.5) mode = 'CRISIS';
  else if (conditions >= 2) mode = 'STRESS';

  return { mode, conditions, details };
}

function applyRegimeDamp(score, confidence, regimeMode) {
  const damps = { NORMAL: { s: 1.0, c: 1.0 }, STRESS: { s: 0.6, c: 0.85 }, CRISIS: { s: 0.3, c: 0.70 } };
  const d = damps[regimeMode] || damps.NORMAL;
  const dampedScore = Math.round(50 + (score - 50) * d.s);
  const dampedConf = Number((confidence.value * d.c).toFixed(4));
  const dampedLabel = dampedConf >= 0.75 ? 'HIGH' : dampedConf >= 0.50 ? 'MEDIUM' : 'LOW';
  return {
    score: Math.max(0, Math.min(100, dampedScore)),
    confidence: { ...confidence, value: dampedConf, label: dampedLabel, regime_damped: regimeMode !== 'NORMAL' }
  };
}

function buildCardPayload(id, name, type, bars, flowSignal, regimeMode, weightsConfig, sources, asOf) {
  const momentum = computeMomentum(bars);
  const volz = computeVolZ(bars);
  const phase = computePhase(momentum.m20, momentum.m60, momentum.m200, flowSignal?.direction, volz);
  const rawScore = computeAssetScore(momentum, flowSignal, volz, type, weightsConfig);
  const rawConf = computeAssetConfidence(flowSignal, momentum, bars?.length > 0, 1);
  const { score, confidence } = applyRegimeDamp(rawScore, rawConf, regimeMode);

  // Drivers & risks from momentum components
  const drivers = [];
  const risks = [];
  if (momentum.m20 > 0) drivers.push({ label: 'Short Momentum', value: momentum.m20, unit: '%', dir: 'up' });
  else if (momentum.m20 < 0) risks.push({ label: 'Short Momentum', value: momentum.m20, unit: '%', dir: 'down' });
  if (momentum.m60 !== null && momentum.m60 > 0) drivers.push({ label: 'Medium Momentum', value: momentum.m60, unit: '%', dir: 'up' });
  else if (momentum.m60 !== null && momentum.m60 < 0) risks.push({ label: 'Medium Momentum', value: momentum.m60, unit: '%', dir: 'down' });
  if (flowSignal?.direction === 'bullish') drivers.push({ label: 'Flow Direction', value: flowSignal.strength, unit: '', dir: 'up' });
  if (flowSignal?.direction === 'bearish') risks.push({ label: 'Flow Direction', value: flowSignal.strength, unit: '', dir: 'down' });
  if (volz > 1) risks.push({ label: 'Volatility Spike', value: volz, unit: 'z', dir: 'down' });
  if (flowSignal?.period_change_pct > 10) risks.push({ label: 'Overextended', value: flowSignal.period_change_pct, unit: '%', dir: 'down' });

  // Phase reason
  const phaseReasons = [];
  if (phase === 'EARLY') phaseReasons.push('MOMENTUM_SHORT_POSITIVE', 'MEDIUM_NOT_YET');
  if (phase === 'MID') phaseReasons.push('MOMENTUM_STACKED_POSITIVE');
  if (phase === 'LATE') phaseReasons.push('SHORT_MOMENTUM_FADING');
  if (phase === 'EXHAUSTED') phaseReasons.push('TREND_OVERHEATED', volz > 1 ? 'VOLATILITY_SPIKE' : 'MOMENTUM_DIVERGENCE');
  if (phase === 'REVERSAL_RISK') phaseReasons.push('TREND_BREAKDOWN');
  if (flowSignal?.direction === 'bullish' && flowSignal?.strength !== 'weak') phaseReasons.push('FLOWZ_POSITIVE');
  if (flowSignal?.direction === 'bearish' && flowSignal?.strength !== 'weak') phaseReasons.push('FLOWZ_NEGATIVE');

  // TL;DR
  const phaseText = { EARLY: 'Early trend forming', MID: 'Trend established', LATE: 'Trend maturing', EXHAUSTED: 'Trend overheated', REVERSAL_RISK: 'Trend breaking down', NEUTRAL: 'No clear trend' };
  const tldr = `${phaseText[phase] || 'Mixed signals'}. Score ${score}/100, ${confidence.label} confidence.`;

  return {
    id, name, type, as_of: asOf,
    score, phase, confidence,
    drivers_top3: drivers.slice(0, 3),
    risks_top3: risks.slice(0, 3),
    phase_reason_codes: phaseReasons,
    momentum,
    vol_z: volz,
    data_status: {
      freshness_days: 1,
      stale: false,
      coverage_ratio: bars?.length > 0 ? 0.9 : 0.0,
      missing_inputs: bars?.length > 0 ? [] : ['price_history']
    },
    sources: sources || [{ key: 'prices', name: 'EODHD', as_of: asOf }],
    tldr
  };
}

// ═══ END TREND LIFECYCLE ENGINE ══════════════════════════════════

function computeInvestmentCompass(sessions, sectors, commodities, crypto) {
  // Region strength
  const regionScores = {};
  for (const [region, data] of Object.entries(sessions)) {
    const changes = (data.indices || [])
      .map((i) => i.change_pct)
      .filter(Number.isFinite);
    regionScores[region] = changes.length
      ? changes.reduce((s, v) => s + v, 0) / changes.length
      : null;
  }
  const validRegions = Object.entries(regionScores).filter(([, v]) => v !== null);
  const strongest = validRegions.sort((a, b) => b[1] - a[1])[0];
  const weakest = validRegions.sort((a, b) => a[1] - b[1])[0];

  // Sector strength (from sector ETF data in market latest.json)
  const sectorsSorted = (sectors || [])
    .filter((s) => Number.isFinite(s.change_pct))
    .sort((a, b) => b.change_pct - a.change_pct);
  const topSector = sectorsSorted[0];
  const bottomSector = sectorsSorted[sectorsSorted.length - 1];

  // Risk mode from cyclical vs defensive
  const cyclicalSyms = ['XLY', 'XLI', 'XLF'];
  const defensiveSyms = ['XLP', 'XLU', 'XLV'];
  const cyclicalVals = cyclicalSyms.map((s) => (sectors || []).find((r) => r.symbol === s)?.change_pct).filter(Number.isFinite);
  const defensiveVals = defensiveSyms.map((s) => (sectors || []).find((r) => r.symbol === s)?.change_pct).filter(Number.isFinite);
  const cyclicalAvg = cyclicalVals.length ? cyclicalVals.reduce((s, v) => s + v, 0) / cyclicalVals.length : null;
  const defensiveAvg = defensiveVals.length ? defensiveVals.reduce((s, v) => s + v, 0) / defensiveVals.length : null;
  const riskMode = (cyclicalAvg !== null && defensiveAvg !== null)
    ? (cyclicalAvg >= defensiveAvg ? 'risk-on' : 'risk-off')
    : 'unknown';

  // Crypto & commodity trends
  const cryptoTrend = trendDirection((crypto || []).map((c) => c.flow?.period_change_pct).filter(Number.isFinite));
  const commodityTrend = trendDirection((commodities || []).map((c) => c.flow?.period_change_pct).filter(Number.isFinite));

  // Summary text
  const lines = [];
  if (strongest) lines.push(`${strongest[0] === 'americas' ? 'US/Americas' : strongest[0] === 'europe' ? 'Europe' : 'Asia'} markets lead globally (avg ${strongest[1] > 0 ? '+' : ''}${strongest[1]?.toFixed(2)}%).`);
  if (topSector) lines.push(`${topSector.display_name || topSector.sector} is the top performing sector.`);
  if (commodityTrend === 'bullish') lines.push('Commodities show bullish momentum.');
  if (cryptoTrend === 'bullish') lines.push('Crypto markets trending higher.');
  if (cryptoTrend === 'bearish') lines.push('Crypto markets under pressure.');
  if (riskMode === 'risk-off') lines.push('Defensive sectors outperform — risk-off environment.');

  return {
    risk_mode: riskMode,
    strongest_region: strongest?.[0] || null,
    strongest_region_avg: strongest?.[1] || null,
    weakest_region: weakest?.[0] || null,
    weakest_region_avg: weakest?.[1] || null,
    top_sector: topSector?.display_name || topSector?.sector || null,
    top_sector_change: topSector?.change_pct || null,
    bottom_sector: bottomSector?.display_name || bottomSector?.sector || null,
    bottom_sector_change: bottomSector?.change_pct || null,
    crypto_trend: cryptoTrend,
    commodity_trend: commodityTrend,
    summary: lines.join(' ') || 'Insufficient data for compass.'
  };
}

function computeTrendForecast(flow) {
  if (!flow || !Number.isFinite(flow.period_change_pct)) return null;
  const { direction, strength, period_change_pct, days_tracked } = flow;

  // Trend exhaustion detection: strong trend losing momentum
  let exhaustion = 'none';
  if (strength === 'strong' && Math.abs(period_change_pct) > 8) exhaustion = 'possible';
  if (strength === 'moderate' && direction !== 'neutral' && Math.abs(period_change_pct) > 12) exhaustion = 'likely';

  // Reversal probability based on overextension
  let reversal_probability = 'low';
  if (Math.abs(period_change_pct) > 15 && strength === 'weak') reversal_probability = 'high';
  else if (Math.abs(period_change_pct) > 10 && (strength === 'weak' || strength === 'moderate')) reversal_probability = 'medium';

  // Continuation probability
  let continuation = 'medium';
  if (strength === 'strong' && exhaustion === 'none') continuation = 'high';
  if (strength === 'weak' || exhaustion !== 'none') continuation = 'low';

  // Setup quality: is this a good entry point?
  let setup_quality = 'neutral';
  if (direction === 'bearish' && reversal_probability === 'high') setup_quality = 'bullish-reversal';
  if (direction === 'bullish' && continuation === 'high') setup_quality = 'bullish-continuation';
  if (direction === 'bullish' && exhaustion !== 'none') setup_quality = 'caution-overextended';
  if (direction === 'bearish' && continuation === 'high') setup_quality = 'bearish-continuation';

  // Forecast text
  let forecast = '';
  if (continuation === 'high') forecast = `${direction === 'bullish' ? 'Uptrend' : 'Downtrend'} intact — momentum strong.`;
  else if (exhaustion !== 'none') forecast = `Trend showing fatigue after ${Math.abs(period_change_pct).toFixed(1)}% move — watch for reversal.`;
  else if (reversal_probability === 'high') forecast = `Oversold/overextended — reversal setup forming.`;
  else forecast = `Mixed signals — no clear edge.`;

  return {
    direction,
    strength,
    exhaustion,
    reversal_probability,
    continuation,
    setup_quality,
    period_change_pct,
    forecast
  };
}

function computeAssetRatios(results) {
  // Key ratios: Gold/SPX, BTC/SPX, Bonds(TLT)/SPX, Oil/SPX, Gold/BTC, sector ETFs/SPX
  const RATIO_DEFS = [
    { name: 'Gold / S&P 500', num: 'GC.COMEX', den: 'GSPC.INDX', denAlt: 'SPY.US', insight: 'Rising = flight to safety, stocks expensive vs gold' },
    { name: 'BTC / S&P 500', num: 'BTC-USD.CC', den: 'GSPC.INDX', denAlt: 'SPY.US', insight: 'Rising = crypto outperforming equities' },
    { name: 'Oil / S&P 500', num: 'CL.COMEX', den: 'GSPC.INDX', denAlt: 'SPY.US', insight: 'Rising = energy sector gaining vs broad market' },
    { name: 'Gold / BTC', num: 'GC.COMEX', den: 'BTC-USD.CC', insight: 'Rising = traditional safe haven preferred over crypto' },
    { name: 'EUR / USD', num: 'EURUSD.FOREX', den: null, insight: 'Rising = dollar weakening, good for commodities and EM' }
  ];

  const ratios = [];
  for (const def of RATIO_DEFS) {
    const numData = results.get(def.num);
    if (!numData || numData.unavailable || !numData.flow) continue;

    if (!def.den) {
      // Direct asset (e.g., EUR/USD)
      ratios.push({
        name: def.name,
        current: numData.close,
        direction: numData.flow.direction,
        strength: numData.flow.strength,
        period_change_pct: numData.flow.period_change_pct,
        insight: def.insight,
        type: 'direct'
      });
      continue;
    }

    const denData = results.get(def.den) || results.get(def.denAlt);
    if (!denData || denData.unavailable || !denData.close || denData.close === 0) continue;

    const currentRatio = numData.close / denData.close;
    // Compute ratio change from flows
    const numChange = numData.flow.period_change_pct || 0;
    const denChange = denData.flow?.period_change_pct || 0;
    const ratioChange = numChange - denChange; // approximate ratio change

    let signal = 'neutral';
    if (ratioChange > 5) signal = 'strongly-rising';
    else if (ratioChange > 2) signal = 'rising';
    else if (ratioChange < -5) signal = 'strongly-falling';
    else if (ratioChange < -2) signal = 'falling';

    ratios.push({
      name: def.name,
      numerator: def.num,
      denominator: def.den,
      current_ratio: Number(currentRatio.toFixed(6)),
      ratio_change_pct: Number(ratioChange.toFixed(2)),
      signal,
      insight: def.insight,
      type: 'ratio'
    });
  }
  return ratios;
}

async function loadAndUpdateLearning(rootDir, moneyFlow, ratios, trendForecasts) {
  // Self-learning mechanism: track historical flow snapshots to detect pattern changes
  const learningPath = path.join(rootDir, 'public/data/v3/derived/market/flow-learning.json');
  let learning = await readJsonSafe(learningPath, { snapshots: [], patterns: [] });
  if (!Array.isArray(learning.snapshots)) learning.snapshots = [];
  if (!Array.isArray(learning.patterns)) learning.patterns = [];

  const today = new Date().toISOString().slice(0, 10);

  // Add today's snapshot (one per day)
  const existingToday = learning.snapshots.find((s) => s.date === today);
  if (!existingToday) {
    const snapshot = {
      date: today,
      inflow_categories: (moneyFlow?.inflows || []).map((f) => ({ name: f.name, category: f.category, pct: f.period_change_pct })),
      outflow_categories: (moneyFlow?.outflows || []).map((f) => ({ name: f.name, category: f.category, pct: f.period_change_pct })),
      ratios: (ratios || []).map((r) => ({ name: r.name, signal: r.signal, change: r.ratio_change_pct || r.period_change_pct })),
      setup_count: (trendForecasts || []).filter((t) => t?.setup_quality === 'bullish-reversal').length,
      caution_count: (trendForecasts || []).filter((t) => t?.setup_quality === 'caution-overextended').length
    };
    learning.snapshots.push(snapshot);
    // Keep max 90 days
    if (learning.snapshots.length > 90) learning.snapshots = learning.snapshots.slice(-90);
  }

  // Detect patterns from snapshots (minimum 5 days of data)
  const patterns = [];
  if (learning.snapshots.length >= 5) {
    const recent5 = learning.snapshots.slice(-5);
    const recent20 = learning.snapshots.slice(-20);

    // Pattern: Consistent inflows to same category
    const inflowCounts = {};
    for (const snap of recent5) {
      for (const inf of (snap.inflow_categories || [])) {
        const key = inf.category + ':' + inf.name;
        inflowCounts[key] = (inflowCounts[key] || 0) + 1;
      }
    }
    for (const [key, count] of Object.entries(inflowCounts)) {
      if (count >= 3) {
        const [cat, name] = key.split(':');
        patterns.push({
          type: 'persistent-inflow',
          name,
          category: cat,
          days: count,
          confidence: count >= 4 ? 'high' : 'medium',
          text: `${name} has seen consistent money inflows for ${count} of the last 5 days.`
        });
      }
    }

    // Pattern: Ratio trend reversal
    if (recent20.length >= 10) {
      const first10 = recent20.slice(0, 10);
      const last10 = recent20.slice(-10);
      for (const ratioName of [...new Set(recent20.flatMap((s) => (s.ratios || []).map((r) => r.name)))]) {
        const firstSignals = first10.flatMap((s) => (s.ratios || []).filter((r) => r.name === ratioName).map((r) => r.change || 0));
        const lastSignals = last10.flatMap((s) => (s.ratios || []).filter((r) => r.name === ratioName).map((r) => r.change || 0));
        const firstAvg = firstSignals.length ? firstSignals.reduce((s, v) => s + v, 0) / firstSignals.length : 0;
        const lastAvg = lastSignals.length ? lastSignals.reduce((s, v) => s + v, 0) / lastSignals.length : 0;
        if (Math.sign(firstAvg) !== Math.sign(lastAvg) && Math.abs(lastAvg) > 1) {
          patterns.push({
            type: 'ratio-reversal',
            name: ratioName,
            from: firstAvg > 0 ? 'rising' : 'falling',
            to: lastAvg > 0 ? 'rising' : 'falling',
            confidence: Math.abs(lastAvg) > 3 ? 'high' : 'medium',
            text: `${ratioName} ratio reversed from ${firstAvg > 0 ? 'rising' : 'falling'} to ${lastAvg > 0 ? 'rising' : 'falling'} — shift in capital allocation.`
          });
        }
      }
    }

    // Pattern: Setup accumulation (many reversals = bottom forming)
    const recentSetups = recent5.map((s) => s.setup_count || 0);
    const avgSetups = recentSetups.reduce((s, v) => s + v, 0) / recentSetups.length;
    if (avgSetups >= 3) {
      patterns.push({
        type: 'setup-accumulation',
        avg_setups: avgSetups,
        confidence: avgSetups >= 5 ? 'high' : 'medium',
        text: `Multiple reversal setups detected (avg ${avgSetups.toFixed(1)}/day over 5 days) — potential broad market bottom forming.`
      });
    }
  }

  learning.patterns = patterns;
  learning.last_updated = new Date().toISOString();
  learning.snapshot_count = learning.snapshots.length;

  await fs.writeFile(learningPath, JSON.stringify(learning, null, 2), 'utf8').catch(() => {});
  return { patterns, snapshot_count: learning.snapshots.length };
}

function computeMoneyFlow(sectors, commodities, crypto, forex) {
  // Track where money is flowing based on multi-day trends
  const flows = [];

  // Sector flows
  for (const s of (sectors || [])) {
    if (!s.flow || s.unavailable) continue;
    flows.push({
      category: 'sector',
      name: s.display_name || s.sector || s.symbol,
      symbol: s.symbol,
      direction: s.flow.direction,
      strength: s.flow.strength,
      period_change_pct: s.flow.period_change_pct,
      daily_change_pct: s.flow.change_pct,
      days_tracked: s.flow.days_tracked
    });
  }

  // Commodity flows
  for (const c of (commodities || [])) {
    if (!c.flow || c.unavailable) continue;
    flows.push({
      category: 'commodity',
      name: c.name,
      symbol: c.symbol,
      direction: c.flow.direction,
      strength: c.flow.strength,
      period_change_pct: c.flow.period_change_pct,
      daily_change_pct: c.flow.change_pct,
      days_tracked: c.flow.days_tracked
    });
  }

  // Crypto flows
  for (const c of (crypto || [])) {
    if (!c.flow || c.unavailable) continue;
    flows.push({
      category: 'crypto',
      name: c.name,
      symbol: c.symbol,
      direction: c.flow.direction,
      strength: c.flow.strength,
      period_change_pct: c.flow.period_change_pct,
      daily_change_pct: c.flow.change_pct,
      days_tracked: c.flow.days_tracked
    });
  }

  // Forex flows
  for (const f of (forex || [])) {
    if (!f.flow || f.unavailable) continue;
    flows.push({
      category: 'forex',
      name: f.name,
      symbol: f.symbol,
      direction: f.flow.direction,
      strength: f.flow.strength,
      period_change_pct: f.flow.period_change_pct,
      daily_change_pct: f.flow.change_pct,
      days_tracked: f.flow.days_tracked
    });
  }

  // Sort by absolute period change (strongest flows first)
  flows.sort((a, b) => Math.abs(b.period_change_pct || 0) - Math.abs(a.period_change_pct || 0));

  // Identify inflows (bullish + strong/moderate) and outflows (bearish + strong/moderate)
  const inflows = flows.filter((f) => f.direction === 'bullish' && f.strength !== 'weak');
  const outflows = flows.filter((f) => f.direction === 'bearish' && f.strength !== 'weak');
  const rotating = flows.filter((f) => f.direction === 'neutral' || f.strength === 'weak');

  // Summary text
  const inflowNames = inflows.slice(0, 3).map((f) => f.name);
  const outflowNames = outflows.slice(0, 3).map((f) => f.name);
  let summary = '';
  if (inflowNames.length) summary += `Money flowing into: ${inflowNames.join(', ')}. `;
  if (outflowNames.length) summary += `Money leaving: ${outflowNames.join(', ')}. `;
  if (!inflowNames.length && !outflowNames.length) summary = 'No clear flow trends detected.';

  return {
    all_flows: flows,
    inflows,
    outflows,
    rotating,
    summary: summary.trim()
  };
}

async function main() {
  const runContext = createRunContext();
  const rootDir = runContext.rootDir;
  const apiKey = process.env.EODHD_API_TOKEN || (process.env.EODHD_API_KEY?.length > 10 ? process.env.EODHD_API_KEY : '') || '';

  if (!apiKey) {
    console.log('DP8 global-market-hub: EODHD_API_KEY/EODHD_API_TOKEN not set, generating stub');
  }

  const config = await readJsonSafe(path.join(rootDir, 'config/global-market-symbols.json'), {});
  const marketDoc = await readJsonSafe(path.join(rootDir, 'public/data/v3/derived/market/latest.json'), {});
  const prevGlobal = await readJsonSafe(path.join(rootDir, 'public/data/v3/derived/market/global-latest.json'), {});

  const today = String(runContext.generatedAt).slice(0, 10);
  // Fetch 20 days of history for flow analysis
  const fromDate = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);

  // Collect all symbols to fetch
  const allSymbols = [];
  for (const region of ['asia', 'europe', 'americas']) {
    for (const idx of (config.global_indices?.[region] || [])) {
      allSymbols.push({ ...idx, category: 'index', region });
    }
  }
  for (const c of (config.commodities || [])) allSymbols.push({ ...c, category: 'commodity' });
  for (const c of (config.crypto || [])) allSymbols.push({ ...c, category: 'crypto' });
  for (const f of (config.forex || [])) allSymbols.push({ ...f, category: 'forex' });

  // Also fetch sector ETFs with history for flow tracking
  const sectorETFs = (config.us_etf_proxies?.sectors || []).map((s) => ({ ...s, category: 'sector' }));
  allSymbols.push(...sectorETFs);

  // Regime proxies (HYG, TLT for stress detection)
  const regimeProxies = (config.regime_proxies || []).map((s) => ({ ...s, category: 'regime' }));
  allSymbols.push(...regimeProxies);

  console.log(`DP8 global-market-hub: fetching ${allSymbols.length} symbols...`);

  // Fetch in batches of 5 to avoid rate limits
  const results = new Map();
  for (let i = 0; i < allSymbols.length; i += 5) {
    const batch = allSymbols.slice(i, i + 5);
    const batchResults = await Promise.all(
      batch.map((s) =>
        apiKey
          ? fetchSymbolWithFlow(s.symbol, s.name || s.display, fromDate, today, apiKey)
          : Promise.resolve({
              symbol: s.symbol, name: s.name || s.display,
              close: null, change_pct: null, as_of: today,
              unavailable: true, flow: null
            })
      )
    );
    for (const r of batchResults) results.set(r.symbol, r);
    if (i + 5 < allSymbols.length && apiKey) {
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
  }

  // Build sessions
  const sessions = {};
  for (const region of ['asia', 'europe', 'americas']) {
    const regionIndices = (config.global_indices?.[region] || []).map((idx) => {
      const r = results.get(idx.symbol);
      return {
        symbol: idx.symbol,
        name: idx.name,
        display: idx.display,
        country: idx.country,
        close: r?.close ?? null,
        change_pct: r?.change_pct ?? null,
        as_of: r?.as_of ?? today,
        unavailable: r?.unavailable ?? true,
        flow: r?.flow ?? null
      };
    });
    sessions[region] = {
      label: config.session_hours_utc?.[region]?.label || region,
      indices: regionIndices
    };
  }

  // Build asset class arrays
  const commodities = (config.commodities || []).map((c) => {
    const r = results.get(c.symbol);
    return { ...c, close: r?.close, change_pct: r?.change_pct, as_of: r?.as_of, unavailable: r?.unavailable ?? true, flow: r?.flow ?? null };
  });
  const crypto = (config.crypto || []).map((c) => {
    const r = results.get(c.symbol);
    return { ...c, close: r?.close, change_pct: r?.change_pct, as_of: r?.as_of, unavailable: r?.unavailable ?? true, flow: r?.flow ?? null };
  });
  const forex = (config.forex || []).map((f) => {
    const r = results.get(f.symbol);
    return { ...f, close: r?.close, change_pct: r?.change_pct, as_of: r?.as_of, unavailable: r?.unavailable ?? true, flow: r?.flow ?? null };
  });

  // Build sector ETFs with flow data
  const sectorData = sectorETFs.map((s) => {
    const r = results.get(s.symbol);
    return {
      symbol: s.symbol.replace('.US', ''),
      display_name: s.name,
      order: s.order,
      color: s.color,
      close: r?.close, change_pct: r?.change_pct, as_of: r?.as_of,
      unavailable: r?.unavailable ?? true,
      flow: r?.flow ?? null
    };
  });

  // Use existing market.json sectors if our fetch failed
  const sectorsForCompass = sectorData.some((s) => !s.unavailable)
    ? sectorData
    : (marketDoc?.data?.sectors || []);

  const compass = computeInvestmentCompass(sessions, sectorsForCompass, commodities, crypto);
  const moneyFlow = computeMoneyFlow(sectorData, commodities, crypto, forex);
  const assetRatios = computeAssetRatios(results);

  // Compute trend forecasts for all asset classes
  const trendForecasts = [];
  for (const s of sectorData) {
    if (s.flow) trendForecasts.push({ category: 'sector', name: s.display_name, symbol: s.symbol, ...computeTrendForecast(s.flow) });
  }
  for (const c of commodities) {
    if (c.flow) trendForecasts.push({ category: 'commodity', name: c.name, symbol: c.symbol, ...computeTrendForecast(c.flow) });
  }
  for (const c of crypto) {
    if (c.flow) trendForecasts.push({ category: 'crypto', name: c.name, symbol: c.symbol, ...computeTrendForecast(c.flow) });
  }
  for (const f of forex) {
    if (f.flow) trendForecasts.push({ category: 'forex', name: f.name, symbol: f.symbol, ...computeTrendForecast(f.flow) });
  }
  // Best setups: where reversal or strong continuation is detected
  const bestSetups = trendForecasts
    .filter((t) => t && (t.setup_quality === 'bullish-reversal' || t.setup_quality === 'bullish-continuation'))
    .sort((a, b) => {
      if (a.setup_quality === 'bullish-reversal' && b.setup_quality !== 'bullish-reversal') return -1;
      if (b.setup_quality === 'bullish-reversal' && a.setup_quality !== 'bullish-reversal') return 1;
      return Math.abs(b.period_change_pct || 0) - Math.abs(a.period_change_pct || 0);
    });
  const cautionSignals = trendForecasts.filter((t) => t && t.setup_quality === 'caution-overextended');

  // Self-learning: track patterns over time
  const learning = await loadAndUpdateLearning(rootDir, moneyFlow, assetRatios, trendForecasts);

  // ═══ REGIME ENGINE ═══
  const regime = computeRegime(marketDoc?.data?.pulse, results);

  // ═══ BUILD CARD PAYLOADS (unified score/phase/confidence for every asset) ═══
  const weightsConfig = await readJsonSafe(path.join(rootDir, 'config/market-hub/weights.json'), {});
  const cards = {};
  const defaultSources = [{ key: 'prices', name: 'EODHD', as_of: today }];

  // Sector cards
  for (const s of sectorETFs) {
    const r = results.get(s.symbol);
    const id = `SECTOR:${s.symbol.replace('.US', '')}`;
    cards[id] = buildCardPayload(id, s.name, 'sector', r?.bars || [], r?.flow, regime.mode, weightsConfig, defaultSources, today);
  }
  // Commodity cards
  for (const c of (config.commodities || [])) {
    const r = results.get(c.symbol);
    const id = `CMDTY:${c.symbol.split('.')[0]}`;
    cards[id] = buildCardPayload(id, c.name, 'commodity', r?.bars || [], r?.flow, regime.mode, weightsConfig, defaultSources, today);
  }
  // Crypto cards
  for (const c of (config.crypto || [])) {
    const r = results.get(c.symbol);
    const id = `CRYPTO:${c.symbol.split('-')[0]}`;
    cards[id] = buildCardPayload(id, c.name, 'crypto', r?.bars || [], r?.flow, regime.mode, weightsConfig, defaultSources, today);
  }
  // Forex cards
  for (const f of (config.forex || [])) {
    const r = results.get(f.symbol);
    const id = `FX:${f.symbol.split('.')[0]}`;
    cards[id] = buildCardPayload(id, f.name, 'forex', r?.bars || [], r?.flow, regime.mode, weightsConfig, defaultSources, today);
  }
  // Index cards (per region)
  for (const region of ['asia', 'europe', 'americas']) {
    for (const idx of (config.global_indices?.[region] || [])) {
      const r = results.get(idx.symbol);
      const id = `INDEX:${idx.symbol.split('.')[0]}`;
      cards[id] = buildCardPayload(id, idx.name, 'default', r?.bars || [], r?.flow, regime.mode, weightsConfig, defaultSources, today);
    }
  }

  const available = [...results.values()].filter((r) => !r.unavailable).length;
  const cardCount = Object.keys(cards).length;
  const doc = {
    meta: {
      schema_version: 'rv.derived.global-market.v2',
      generated_at: runContext.generatedAt,
      data_date: today,
      provider: 'eodhd-global',
      symbols_fetched: allSymbols.length,
      symbols_available: available,
      cards_built: cardCount,
      run_id: runContext.runId,
      commit: runContext.commit
    },
    data: {
      regime_mode: regime.mode,
      regime_details: regime.details,
      sessions,
      commodities,
      crypto,
      forex,
      us_sectors: sectorData,
      us_pulse: marketDoc?.data?.pulse || null,
      us_movers: marketDoc?.data?.movers || [],
      investment_compass: compass,
      money_flow: moneyFlow,
      asset_ratios: assetRatios,
      trend_forecasts: trendForecasts,
      best_setups: bestSetups,
      caution_signals: cautionSignals,
      cards,
      learning: {
        patterns: learning.patterns,
        snapshot_count: learning.snapshot_count
      }
    }
  };

  await writeJsonArtifact(rootDir, 'public/data/v3/derived/market/global-latest.json', doc);
  console.log(`DP8 global-market-hub done fetched=${allSymbols.length} available=${available} flows=${moneyFlow.all_flows.length} cards=${cardCount} regime=${regime.mode}`);
}

main().catch((error) => {
  console.error(`DP8_GLOBAL_MARKET_FAILED:${error?.message || error}`);
  process.exitCode = 1;
});
