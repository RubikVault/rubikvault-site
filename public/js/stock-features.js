/* ═══════════════════════════════════════════════════════════════════════════
   Stock Analyzer Features (F-01 … F-40)
   Pure client-side. Depends on globals: fmt, fmtPct, fmtPctSigned, fmtCur,
   fmtVol, clamp, adjC  (defined in stock.html)
   ═══════════════════════════════════════════════════════════════════════════ */

// ── Inject CSS ──────────────────────────────────────────────────────────────
(function () {
  const s = document.createElement('style'); s.textContent = `
.exec-card{display:grid;gap:.35rem;padding:1rem;border-radius:10px;background:linear-gradient(135deg,rgba(99,102,241,.12),rgba(16,185,129,.08));border:1px solid rgba(99,102,241,.25);margin-bottom:1rem}
.exec-row{display:flex;justify-content:space-between;align-items:center;font-size:.85rem;padding:.25rem .4rem;border-radius:6px}
.exec-label{color:var(--text-dim);font-weight:600;min-width:90px}
.exec-val{font-weight:700;text-align:right}
.prov-bar{display:flex;flex-wrap:wrap;gap:.4rem;margin-bottom:.75rem;padding:.5rem .75rem;background:rgba(255,255,255,.02);border-radius:8px;border:1px solid var(--border)}
.prov-chip{font-size:.7rem;padding:.2rem .5rem;border-radius:4px;border:1px solid var(--border);display:inline-flex;align-items:center;gap:.25rem}
.prov-chip .dot{width:6px;height:6px;border-radius:50%;display:inline-block}
.prov-chip .dot.ok{background:var(--green)}.prov-chip .dot.cached{background:var(--yellow)}.prov-chip .dot.na{background:var(--red)}
.ohlcv-strip{display:flex;flex-wrap:wrap;gap:.75rem;padding:.5rem 0;font-size:.82rem}
.ohlcv-item{display:flex;flex-direction:column;align-items:center;gap:.1rem}.ohlcv-lbl{font-size:.65rem;color:var(--text-muted);text-transform:uppercase;letter-spacing:.04em}.ohlcv-val{font-weight:700}
.trend-big{display:flex;align-items:center;gap:.75rem;padding:.6rem .8rem;border-radius:8px;margin-bottom:.6rem;font-size:1rem;font-weight:800}
.trend-big.up{background:var(--green-bg);color:var(--green);border:1px solid rgba(16,185,129,.3)}
.trend-big.down{background:var(--red-bg);color:var(--red);border:1px solid rgba(248,113,113,.3)}
.trend-big.range{background:var(--yellow-bg);color:var(--yellow);border:1px solid rgba(251,191,36,.3)}
.sub-metric{display:flex;justify-content:space-between;padding:.3rem .5rem;font-size:.8rem;border-bottom:1px solid rgba(255,255,255,.03)}
.sub-metric:last-child{border-bottom:none}
.placeholder-card{padding:.75rem;border-radius:8px;background:rgba(255,255,255,.02);border:1px dashed var(--border);font-size:.78rem;color:var(--text-dim)}
.placeholder-card h4{margin:0 0 .3rem;font-size:.82rem;color:var(--text)}
.placeholder-card ul{margin:.3rem 0 0;padding-left:1.2rem}
.placeholder-card li{margin-bottom:.2rem}
.collapse-toggle{cursor:pointer;font-size:.78rem;color:var(--accent);margin-top:.4rem;user-select:none}
.collapse-body{display:none;margin-top:.4rem}
.collapse-body.open{display:block}
.mc-bar{display:flex;align-items:center;gap:.4rem;margin:.2rem 0;font-size:.78rem}
.mc-fill{height:14px;border-radius:3px;opacity:.6}
.heat-row{display:flex;gap:2px;margin:1px 0}.heat-cell{flex:1;text-align:center;padding:3px 2px;border-radius:3px;font-size:.65rem;font-weight:600}
.risk-input{background:rgba(255,255,255,.05);border:1px solid var(--border);border-radius:6px;padding:.3rem .5rem;color:var(--text);font-size:.82rem;width:80px}
`; document.head.appendChild(s)
})();

// ── Helpers ─────────────────────────────────────────────────────────────────
function _returns(bars) { const r = []; for (let i = 1; i < bars.length; i++) { const p = adjC(bars[i - 1]), c = adjC(bars[i]); if (p > 0 && c > 0) r.push({ ret: (c - p) / p, date: bars[i].date, close: c, vol: bars[i].volume || 0 }); } return r; }
function _std(arr) { if (!arr.length) return 0; const m = arr.reduce((a, b) => a + b, 0) / arr.length; return Math.sqrt(arr.reduce((a, v) => a + (v - m) ** 2, 0) / (arr.length - 1 || 1)); }
function _mean(arr) { return arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0; }
function _col(c) { return c >= 0 ? 'var(--green)' : 'var(--red)'; }
function _toNumber(v) { const n = Number(v); return Number.isFinite(n) ? n : null; }
function _fmtMaybe(v, d = 2) { return Number.isFinite(v) ? Number(v).toFixed(d) : '—'; }

function _canonicalContext(context = {}) {
  const can = (typeof window !== 'undefined' && window._rvCanonicalMetrics) || {};
  const stats = context?.stats || {};
  const close = _toNumber(context?.close) ?? _toNumber(can.close);
  const rsi = _toNumber(stats.rsi14) ?? _toNumber(can.rsi14);
  const atr = _toNumber(stats.atr14) ?? _toNumber(can.atr14);
  const atrPct = close > 0 && atr != null ? (atr / close) * 100 : _toNumber(can.atrPct);
  return {
    close,
    rsi14: rsi,
    atr14: atr,
    atrPct,
    asOf: context?.asOf || can.asOf || null
  };
}

function _setQualitySignals(patch = {}, refreshTop = false) {
  if (typeof window === 'undefined') return;
  const prev = window._rvQualitySignals || {};
  window._rvQualitySignals = { ...prev, ...patch };
  if (refreshTop && typeof window._rvRefreshTopSections === 'function') {
    window._rvRefreshTopSections();
  }
}

function _extractMetricFromText(text, metric) {
  if (!text || typeof text !== 'string') return null;
  if (metric === 'rsi') {
    const m = text.match(/RSI[^0-9\-]*([0-9]+(?:\.[0-9]+)?)/i);
    return m ? _toNumber(m[1]) : null;
  }
  if (metric === 'atr_pct') {
    const m = text.match(/ATR[^0-9\-]*([0-9]+(?:\.[0-9]+)?)\s*%/i);
    return m ? _toNumber(m[1]) : null;
  }
  return null;
}

function _detectScientificMetricMismatch(insights, context = {}) {
  const canonical = _canonicalContext(context);
  const drivers = []
    .concat(Array.isArray(insights?.v4_contract?.context_setup_trigger?.value?.setup?.drivers) ? insights.v4_contract.context_setup_trigger.value.setup.drivers : [])
    .concat(Array.isArray(insights?.v4_contract?.context_setup_trigger?.value?.trigger?.drivers) ? insights.v4_contract.context_setup_trigger.value.trigger.drivers : [])
    .concat(Array.isArray(insights?.scientific?.setup?.proof_points) ? insights.scientific.setup.proof_points : [])
    .concat(Array.isArray(insights?.scientific?.trigger?.proof_points) ? insights.scientific.trigger.proof_points : []);
  const rsiCandidates = drivers.map((d) => _extractMetricFromText(d, 'rsi')).filter((v) => v != null);
  const atrPctCandidates = drivers.map((d) => _extractMetricFromText(d, 'atr_pct')).filter((v) => v != null);
  const sampleRsi = rsiCandidates.length ? rsiCandidates[0] : null;
  const sampleAtrPct = atrPctCandidates.length ? atrPctCandidates[0] : null;

  const rsiMismatch = canonical.rsi14 != null && sampleRsi != null && Math.abs(canonical.rsi14 - sampleRsi) > 1.25;
  const atrMismatch = canonical.atrPct != null && sampleAtrPct != null && Math.abs(canonical.atrPct - sampleAtrPct) > 0.45;
  const mismatch = Boolean(rsiMismatch || atrMismatch);
  return {
    mismatch,
    rsiMismatch,
    atrMismatch,
    sampleRsi,
    sampleAtrPct,
    canonicalRsi: canonical.rsi14,
    canonicalAtrPct: canonical.atrPct
  };
}

function _scientificCanonicalProofs(context = {}) {
  const s = context?.stats || {};
  const c = _canonicalContext(context);
  const outSetup = [];
  const outTrigger = [];

  if (c.rsi14 != null) {
    const zone = c.rsi14 >= 70 ? 'overbought' : c.rsi14 <= 30 ? 'oversold' : 'neutral';
    outSetup.push(`RSI14 canonical: ${c.rsi14.toFixed(1)} (${zone})`);
  }
  if (c.close != null && _toNumber(s.sma200) != null && s.sma200 > 0) {
    const dist = ((c.close - s.sma200) / s.sma200) * 100;
    outSetup.push(`Price vs SMA200 canonical: ${dist >= 0 ? '+' : ''}${dist.toFixed(1)}%`);
  }
  if (c.atr14 != null && c.atrPct != null) {
    outSetup.push(`ATR14 canonical: ${c.atr14.toFixed(2)} (${c.atrPct.toFixed(2)}% of price)`);
  }
  if (_toNumber(s.volume_ratio_20d) != null) {
    outSetup.push(`Volume ratio canonical: ${s.volume_ratio_20d.toFixed(2)}x`);
  }

  if (_toNumber(s.macd_hist) != null) {
    outTrigger.push(`MACD histogram canonical: ${s.macd_hist.toFixed(3)}`);
  }
  if (c.close != null && _toNumber(s.sma20) != null && s.sma20 > 0) {
    const dist = ((c.close - s.sma20) / s.sma20) * 100;
    outTrigger.push(`Price vs SMA20 canonical: ${dist >= 0 ? '+' : ''}${dist.toFixed(1)}%`);
  }
  if (_toNumber(s.ret_5d_pct) != null) {
    outTrigger.push(`5d return canonical: ${s.ret_5d_pct >= 0 ? '+' : ''}${(s.ret_5d_pct * 100).toFixed(2)}%`);
  }
  if (_toNumber(s.volatility_percentile) != null) {
    outTrigger.push(`Volatility percentile canonical: ${s.volatility_percentile.toFixed(0)}th`);
  }
  return { setup: outSetup.slice(0, 5), trigger: outTrigger.slice(0, 4) };
}

function _isBiotechUniverse(universe = {}) {
  const hay = `${universe?.sector || ''} ${universe?.industry || ''} ${universe?.name || ''}`.toLowerCase();
  return /\bbiotech|biotechnology|pharma|therapeutics|drug\b/.test(hay);
}

function _proxyScientificSignal(context = {}) {
  const s = context?.stats || {};
  const close = _toNumber(context?.close);
  if (close == null) return null;
  let setup = 0;
  let trigger = 0;
  if (_toNumber(s.rsi14) != null && s.rsi14 >= 40 && s.rsi14 <= 65) setup += 20;
  if (_toNumber(s.sma200) != null && close > s.sma200) setup += 20;
  if (_toNumber(s.sma50) != null && _toNumber(s.sma200) != null && s.sma50 > s.sma200) setup += 20;
  if (_toNumber(s.atr14) != null && close > 0 && (s.atr14 / close) <= 0.03) setup += 20;
  if (_toNumber(s.volume_ratio_20d) != null && s.volume_ratio_20d >= 0.8 && s.volume_ratio_20d <= 1.8) setup += 20;
  if (_toNumber(s.macd_hist) != null && s.macd_hist > 0) trigger += 25;
  if (_toNumber(s.sma20) != null && close > s.sma20) trigger += 25;
  if (_toNumber(s.ret_5d_pct) != null && s.ret_5d_pct > 0) trigger += 25;
  if (_toNumber(s.volatility_percentile) != null && s.volatility_percentile < 85) trigger += 25;
  const setupScore = Math.max(0, Math.min(100, setup));
  const triggerScore = Math.max(0, Math.min(100, trigger));
  const prob = Math.max(0.35, Math.min(0.75, 0.45 + (setupScore / 100) * 0.18 + (triggerScore / 100) * 0.12));
  return {
    setupScore,
    triggerScore,
    probability: Number(prob.toFixed(2)),
    direction: prob >= 0.5 ? 'bullish' : 'bearish',
    expectedReturn10d: Number((((prob - 0.5) * 8)).toFixed(1))
  };
}

function _proxyForecastSignal(context = {}) {
  const s = context?.stats || {};
  const close = _toNumber(context?.close);
  if (close == null) return null;
  let score = 0;
  if (_toNumber(s.sma20) != null) score += close > s.sma20 ? 1 : -1;
  if (_toNumber(s.sma50) != null) score += close > s.sma50 ? 1 : -1;
  if (_toNumber(s.sma200) != null) score += close > s.sma200 ? 1 : -1;
  if (_toNumber(s.macd_hist) != null) score += s.macd_hist > 0 ? 1 : -1;
  if (_toNumber(s.rsi14) != null) {
    if (s.rsi14 < 30) score += 1;
    else if (s.rsi14 > 70) score -= 1;
  }
  const baseProb = Math.max(0.35, Math.min(0.65, 0.5 + score * 0.04));
  const d1 = Math.max(0.35, Math.min(0.65, baseProb));
  const d5 = Math.max(0.35, Math.min(0.70, baseProb + (score > 0 ? 0.02 : -0.02)));
  const d20 = Math.max(0.30, Math.min(0.75, baseProb + (score > 0 ? 0.04 : -0.04)));
  return {
    horizons: {
      '1d': { probability: Number(d1.toFixed(2)), direction: d1 >= 0.5 ? 'bullish' : 'bearish' },
      '5d': { probability: Number(d5.toFixed(2)), direction: d5 >= 0.5 ? 'bullish' : 'bearish' },
      '20d': { probability: Number(d20.toFixed(2)), direction: d20 >= 0.5 ? 'bullish' : 'bearish' },
    },
    model: 'proxy-local-v7',
    freshness: 'derived-from-stock-stats'
  };
}

function _proxyElliottSignal(context = {}) {
  const bars = Array.isArray(context?.bars) ? context.bars : [];
  if (bars.length < 40) return null;
  const recent = bars.slice(-20).map((b) => adjC(b)).filter((x) => Number.isFinite(x) && x > 0);
  if (recent.length < 10) return null;
  const first = recent[0];
  const last = recent[recent.length - 1];
  const change = first > 0 ? (last - first) / first : 0;
  const high = Math.max(...recent);
  const low = Math.min(...recent);
  const range = high > low ? (last - low) / (high - low) : 0.5;
  const direction = change >= 0 ? 'bullish' : 'bearish';
  let wave = 'Wave 4 or ABC';
  if (range > 0.75 && change > 0) wave = 'Wave 3';
  else if (range < 0.25 && change < 0) wave = 'Wave C';
  else if (Math.abs(change) < 0.02) wave = 'Wave 2 / consolidation';
  const conf = Math.max(30, Math.min(78, Math.round(40 + Math.abs(change) * 220)));
  return {
    direction,
    wave,
    confidence: conf,
    fibConformance: Math.max(35, Math.min(72, Math.round(50 + (range - 0.5) * 40))),
    support: Number((low + (high - low) * 0.25).toFixed(2)),
    resistance: Number((low + (high - low) * 0.75).toFixed(2))
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// F-40: EXECUTIVE SUMMARY
// ═══════════════════════════════════════════════════════════════════════════
function buildExecutiveSummary(ticker, close, s, bars, universe) {
  if (close == null) return '';
  const rets = _returns(bars);
  // Trend
  let trend = 'N/A', trendCol = 'var(--text-dim)';
  if (s.sma20 != null && s.sma50 != null && s.sma200 != null) {
    if (s.sma20 > s.sma50 && s.sma50 > s.sma200 && close > s.sma20) { trend = '▲ Uptrend'; trendCol = 'var(--green)'; }
    else if (s.sma20 < s.sma50 && s.sma50 < s.sma200 && close < s.sma20) { trend = '▼ Downtrend'; trendCol = 'var(--red)'; }
    else { trend = '◆ Sideways'; trendCol = 'var(--yellow)'; }
  }
  // Risk
  const vol = s.volatility_20d != null ? (s.volatility_20d * 100).toFixed(1) + '%' : '—';
  const maxDD = rets.length > 20 ? computeMaxDD(rets.map(r => r.ret)) : null;
  const riskLbl = s.volatility_percentile > 70 ? 'High' : 'Medium';
  const riskStr = `${riskLbl} (Vol ${vol}${maxDD != null ? ', MaxDD ' + (maxDD * 100).toFixed(0) + '%' : ''})`;
  // 52W Position (5-tier, consistent with Decision Strip)
  const valHint = s.range_52w_pct != null ? (s.range_52w_pct > 0.95 ? 'At 52W High' : s.range_52w_pct > 0.9 ? 'Near 52W High' : s.range_52w_pct > 0.7 ? 'Upper Range' : s.range_52w_pct < 0.1 ? 'Near 52W Low' : s.range_52w_pct < 0.2 ? 'Lower Range' : 'Mid-Range') : '—';
  // Win Rate (was: "Quality" — renamed: win-rate ≠ quality)
  const winRate = rets.length >= 60 ? (rets.slice(-60).filter(r => r.ret > 0).length / 60 * 100).toFixed(0) + '% (60d)' : '—';
  // Macro hint (placeholder)
  const macro = 'See Macro Regime section below';
  const rows = [
    { l: 'Trend', v: trend, c: trendCol }, { l: 'Risk', v: riskStr, c: s.volatility_percentile > 70 ? 'var(--red)' : 'var(--yellow)' },
    { l: '52W Position', v: valHint, c: s.range_52w_pct > 0.9 ? 'var(--red)' : s.range_52w_pct > 0.7 ? 'var(--yellow)' : s.range_52w_pct < 0.1 ? 'var(--green)' : s.range_52w_pct < 0.2 ? 'var(--green)' : 'var(--text)' },
    { l: 'Win Rate (60d)', v: winRate, c: 'var(--text)' }, { l: 'Macro', v: macro, c: 'var(--text-dim)' }
  ];
  // Synthesized narrative
  const trendWord = trend.includes('Up') ? 'uptrend' : trend.includes('Down') ? 'downtrend' : 'sideways trend';
  const volWord = s.volatility_percentile > 70 ? 'elevated' : s.volatility_percentile > 40 ? 'moderate' : 'low';
  const rangeWord = s.range_52w_pct > 0.9 ? 'near its 52-week high' : s.range_52w_pct > 0.7 ? 'in the upper range of its 52-week band' : s.range_52w_pct < 0.1 ? 'near its 52-week low' : s.range_52w_pct < 0.2 ? 'in the lower range of its 52-week band' : 'in mid-range of its 52-week band';
  const synthesis = `${ticker} is in a <strong>${trendWord}</strong> with <strong>${volWord} volatility</strong> (${vol}), trading ${rangeWord}.`;

  return `<div class="section section-full"><h2>🎯 Executive Summary — ${ticker}</h2>
  <div style="font-size:.82rem;color:var(--text);margin-bottom:.6rem;padding:.5rem .6rem;background:rgba(255,255,255,.02);border-radius:6px;border-left:3px solid var(--accent);line-height:1.5">${synthesis}</div>
  <div class="exec-card">${rows.map(r => `<div class="exec-row"><span class="exec-label">${r.l}</span><span class="exec-val" style="color:${r.c}">${r.v}</span></div>`).join('')}</div>
  <div style="font-size:.7rem;color:var(--text-muted);text-align:center">Auto-generated thesis from technical data. Not financial advice.</div></div>`;
}
function computeMaxDD(rets) { let peak = 1, maxdd = 0, eq = 1; for (const r of rets) { eq *= (1 + r); if (eq > peak) peak = eq; const dd = (peak - eq) / peak; if (dd > maxdd) maxdd = dd; } return maxdd; }

// ═══════════════════════════════════════════════════════════════════════════
// F-00/F-01/F-03: DATA PROVENANCE + MARKET CLOCK
// ═══════════════════════════════════════════════════════════════════════════
function buildDataProvenance(metadata, prices, bars) {
  const now = new Date();
  const nyParts = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', hour: 'numeric', minute: 'numeric', hour12: false, weekday: 'short' }).formatToParts(now);
  const nyH = parseInt(nyParts.find(p => p.type === 'hour')?.value || '0', 10);
  const nyM = parseInt(nyParts.find(p => p.type === 'minute')?.value || '0', 10);
  const nyWd = nyParts.find(p => p.type === 'weekday')?.value || '';
  const isWeekday = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'].includes(nyWd);
  const isOpen = isWeekday && (nyH + nyM / 60) >= 9.5 && (nyH + nyM / 60) < 16;
  const sessionBadge = isOpen ? '🟢 Market Open' : '🔴 Market Closed';
  const delay = isOpen ? '~15min delayed' : 'EOD data';
  const barDate = bars.length ? bars[bars.length - 1].date : '—';
  const sc = metadata?.source_chain; const srcArr = Array.isArray(sc) ? sc : sc && typeof sc === 'object' ? Object.values(sc) : [];
  const src = srcArr.length ? srcArr.map(s => typeof s === 'string' ? s : s?.provider || '—').join(' → ') : 'EODHD';

  // Envelope meta (set by render() in stock.html)
  const em = (typeof window !== 'undefined' && window._rvEnvelopeMeta) || {};
  const cacheState = em.cache?.stale === false && em.freshness === 'fresh' ? 'LIVE'
    : em.degraded ? 'DEGRADED'
      : em.cache?.hit ? 'CACHED'
        : em.freshness === 'stale' ? 'STALE'
          : null;
  const cacheColor = cacheState === 'LIVE' ? 'ok' : cacheState === 'DEGRADED' ? 'na' : 'cached';
  const cacheLabel = cacheState ? `${cacheState === 'LIVE' ? '🟢' : cacheState === 'DEGRADED' ? '🔴' : '🟡'} ${cacheState}` : null;
  const degradedBanner = em.degraded
    ? `<div style="background:rgba(248,113,113,0.12);border:1px solid rgba(248,113,113,0.35);border-radius:6px;padding:0.35rem 0.75rem;font-size:0.75rem;color:#fca5a5;margin-bottom:0.4rem;">⚠️ Data degraded: ${em.degraded_reason || 'scheduler_stale'} — showing last-good snapshot</div>`
    : '';

  const firstDate = bars.length ? bars[0].date : '—';
  const dataYears = bars.length >= 252 ? `~${Math.round(bars.length / 252)}y` : `${bars.length} bars`;
  return `${degradedBanner}<div class="prov-bar">
    <span class="prov-chip"><span class="dot ok"></span>Data: ${firstDate} → ${barDate} (${dataYears})</span>
    <span class="prov-chip">${sessionBadge} · ${delay}</span>
  </div>`;
}

// ═══════════════════════════════════════════════════════════════════════════
// F-04: TODAY OHLCV STRIP
// ═══════════════════════════════════════════════════════════════════════════
function buildOHLCVStrip(close, s, bars) {
  if (!bars.length) return '';
  const b = bars[bars.length - 1];
  const prev = bars.length > 1 ? bars[bars.length - 2] : null;
  const gap = prev && prev.close > 0 ? ((b.open - prev.close) / prev.close * 100).toFixed(2) : null;
  const range = b.high && b.low && b.high > b.low ? ((b.high - b.low) / b.low * 100).toFixed(2) : null;
  const clv = b.high && b.low && b.high > b.low ? ((2 * (b.close || 0) - b.low - b.high) / (b.high - b.low)).toFixed(2) : null;
  const items = [
    { l: 'Open', v: fmtCur(b.open) }, { l: 'High', v: fmtCur(b.high) }, { l: 'Low', v: fmtCur(b.low) },
    { l: 'Close', v: fmtCur(b.close) }, { l: 'Volume', v: fmtVol(b.volume) },
  ];
  if (range) items.push({ l: 'Range', v: range + '%' });
  if (gap) items.push({ l: 'Gap', v: (gap > 0 ? '+' : '') + gap + '%' });
  if (clv) items.push({ l: 'CLV', v: clv });
  return `<div class="ohlcv-strip">${items.map(i => `<div class="ohlcv-item"><span class="ohlcv-lbl">${i.l}</span><span class="ohlcv-val">${i.v}</span></div>`).join('')}</div>`;
}

// ═══════════════════════════════════════════════════════════════════════════
// F-02: CORPORATE ACTIONS TIMELINE
// ═══════════════════════════════════════════════════════════════════════════
function buildCorporateActions(bars) {
  if (bars.length < 100) return '';
  // Detect splits: look for days where adjClose/close ratio changes significantly
  const events = [];
  for (let i = 1; i < bars.length; i++) {
    const b = bars[i], pb = bars[i - 1];
    if (b.close > 0 && pb.close > 0) {
      const rawRet = b.close / pb.close;
      const adjRet = (adjC(b)) / (adjC(pb));
      if (Math.abs(rawRet - adjRet) > 0.05 && rawRet < 0.6) {
        const ratio = Math.round(1 / rawRet);
        events.push({ date: b.date, type: 'Split', detail: `${ratio}:1 split detected` });
      }
    }
  }
  if (!events.length) return `<div style="font-size:.78rem;color:var(--text-muted);padding:.3rem 0">No splits detected in available history.</div>`;
  const html = events.slice(-5).map(e => `<div class="sub-metric"><span>${e.date}</span><span style="font-weight:700">${e.detail}</span></div>`).join('');
  return `<div style="margin-top:.4rem"><div style="font-size:.75rem;color:var(--text-dim);margin-bottom:.3rem">Corporate Actions (detected from price data)</div>${html}</div>`;
}

// ═══════════════════════════════════════════════════════════════════════════
// F-26/F-27/F-28: TREND STATE + BREAKOUT ENERGY + MEAN REVERSION + DURATION EST.
// ═══════════════════════════════════════════════════════════════════════════
function _computeSMA(values, period) {
  if (values.length < period) return null;
  let sum = 0; for (let i = values.length - period; i < values.length; i++) sum += values[i];
  return sum / period;
}

function _analyzeTrendDuration(bars) {
  // Compute rolling SMA20, SMA50, SMA200 and classify each day's trend phase
  if (bars.length < 210) return null;
  const closes = bars.map(b => adjC(b) || 0);
  const phases = []; // [{state, startIdx, endIdx, days, startDate, endDate}]
  let currentPhase = null;

  for (let i = 200; i < closes.length; i++) {
    const c = closes[i];
    const sma20 = _computeSMA(closes.slice(0, i + 1), 20);
    const sma50 = _computeSMA(closes.slice(0, i + 1), 50);
    const sma200 = _computeSMA(closes.slice(0, i + 1), 200);
    if (!sma20 || !sma50 || !sma200 || c === 0) continue;

    const slope20 = (sma20 - sma50) / sma50;
    let dayState = 'RANGE';
    if (c > sma20 && c > sma50 && c > sma200 && slope20 > 0) dayState = 'UP';
    else if (c < sma20 && c < sma50 && c < sma200 && slope20 < 0) dayState = 'DOWN';

    if (!currentPhase || currentPhase.state !== dayState) {
      if (currentPhase) {
        currentPhase.endIdx = i - 1;
        currentPhase.endDate = bars[i - 1].date;
        currentPhase.days = currentPhase.endIdx - currentPhase.startIdx + 1;
        if (currentPhase.days >= 3) phases.push({ ...currentPhase }); // ignore noise phases < 3 days
      }
      currentPhase = { state: dayState, startIdx: i, endIdx: i, startDate: bars[i].date, endDate: bars[i].date, days: 1 };
    } else {
      currentPhase.endIdx = i;
      currentPhase.endDate = bars[i].date;
      currentPhase.days = currentPhase.endIdx - currentPhase.startIdx + 1;
    }
  }
  // Current (ongoing) phase
  if (currentPhase) {
    currentPhase.endIdx = closes.length - 1;
    currentPhase.endDate = bars[closes.length - 1].date;
    currentPhase.days = currentPhase.endIdx - currentPhase.startIdx + 1;
  }

  // Historical stats per state
  const stats = { UP: [], DOWN: [], RANGE: [] };
  for (const p of phases) stats[p.state]?.push(p.days);

  return { phases, stats, current: currentPhase };
}

function _formatDuration(days) {
  if (days >= 60) return `~${(days / 21).toFixed(1)} months`;
  if (days >= 10) return `~${(days / 5).toFixed(1)} weeks`;
  return `~${days} days`;
}

function buildTrendMomentum(close, s, bars) {
  if (close == null || bars.length < 60) return '';
  const rets = _returns(bars); if (rets.length < 20) return '';
  // F-26: Trend State
  let state = 'RANGE', stateCls = 'range', conf = 0.5, reasons = [];
  if (s.sma20 && s.sma50 && s.sma200) {
    const aboveAll = close > s.sma20 && close > s.sma50 && close > s.sma200;
    const belowAll = close < s.sma20 && close < s.sma50 && close < s.sma200;
    const slope20 = s.sma20 && s.sma50 ? (s.sma20 - s.sma50) / s.sma50 : 0;
    if (aboveAll && slope20 > 0) { state = 'UP'; stateCls = 'up'; conf = Math.min(0.95, 0.5 + slope20 * 10); reasons = ['Price above all MAs', 'SMA20 slope positive']; }
    else if (belowAll && slope20 < 0) { state = 'DOWN'; stateCls = 'down'; conf = Math.min(0.95, 0.5 + Math.abs(slope20) * 10); reasons = ['Price below all MAs', 'SMA20 slope negative']; }
    else { reasons = ['Mixed MA alignment']; }
  }
  // F-27: Breakout Energy
  const r20 = rets.slice(-20).map(r => Math.abs(r.ret));
  const r60 = rets.slice(-60).map(r => Math.abs(r.ret));
  const vol20 = _std(rets.slice(-20).map(r => r.ret));
  const vol60 = _std(rets.slice(-60).map(r => r.ret));
  const compression = vol60 > 0 ? vol20 / vol60 : 1;
  const volRecent = rets.slice(-5).map(r => r.vol);
  const volPrior = rets.slice(-20, -5).map(r => r.vol);
  const volDryUp = _mean(volPrior) > 0 ? _mean(volRecent) / _mean(volPrior) : 1;
  const breakoutEnergy = Math.max(0, Math.min(100, Math.round((1 - compression) * 50 + (1 - Math.min(1, volDryUp)) * 50)));
  const beLabel = breakoutEnergy > 60 ? 'Setup Forming' : breakoutEnergy > 30 ? 'Moderate' : 'Low Energy';
  // F-28: Mean Reversion
  const ma50 = s.sma50 || s.sma20;
  const std = _std(rets.slice(-60).map(r => r.ret)) * Math.sqrt(252);
  const z = ma50 && std > 0 ? (close - ma50) / (ma50 * std) : 0;
  const rsi = s.rsi14;
  // Historical after extreme z
  let reversionHint = '';
  if (Math.abs(z) > 1.5) {
    const dir = z > 0 ? 'overextended to upside' : 'overextended to downside';
    reversionHint = `z-score ${z.toFixed(2)} → ${dir}`;
  }

  // ── TREND DURATION ESTIMATOR ──
  let durationHtml = '';
  const tda = _analyzeTrendDuration(bars);
  if (tda && tda.current) {
    const cur = tda.current;
    const curDays = cur.days;
    const histDurations = tda.stats[cur.state] || [];
    const histCount = histDurations.length;
    const histAvg = histCount > 0 ? Math.round(_mean(histDurations)) : 0;
    const histMedian = histCount > 0 ? histDurations.sort((a, b) => a - b)[Math.floor(histCount / 2)] : 0;
    const histMax = histCount > 0 ? Math.max(...histDurations) : 0;
    const histMin = histCount > 0 ? Math.min(...histDurations) : 0;
    const remaining = Math.max(0, histMedian - curDays);
    const progress = histMedian > 0 ? Math.min(100, Math.round((curDays / histMedian) * 100)) : 0;
    const progressColor = progress < 50 ? 'var(--green)' : progress < 80 ? 'var(--yellow)' : 'var(--red)';

    const stateLabel = cur.state === 'UP' ? '▲ Uptrend' : cur.state === 'DOWN' ? '▼ Downtrend' : '◆ Sideways';
    const stateEmoji = cur.state === 'UP' ? '🟢' : cur.state === 'DOWN' ? '🔴' : '🟡';

    // Find how many past phases lasted LONGER than current
    const longerPhases = histDurations.filter(d => d > curDays).length;
    const survivalPct = histCount > 0 ? Math.round((longerPhases / histCount) * 100) : 0;

    durationHtml = `
  <div style="margin-top:.75rem;padding:.75rem;border-radius:10px;background:linear-gradient(135deg,rgba(99,102,241,.08),rgba(16,185,129,.05));border:1px solid rgba(99,102,241,.2)">
    <div style="display:flex;align-items:center;gap:.5rem;margin-bottom:.5rem">
      <span style="font-size:1.1rem">${stateEmoji}</span>
      <span style="font-weight:700;font-size:.9rem;color:var(--text)">Trend Duration Estimate</span>
      <span style="font-size:.7rem;color:var(--text-dim);margin-left:auto">based on ${histCount} hist. ${cur.state} phases</span>
    </div>
    <div class="m-grid" style="margin-bottom:.5rem">
      <div class="m-item">
        <div class="m-label">Current Trend</div>
        <div class="m-val" style="color:${cur.state === 'UP' ? 'var(--green)' : cur.state === 'DOWN' ? 'var(--red)' : 'var(--yellow)'}">${stateLabel}</div>
        <div class="m-sub">since ${cur.startDate}</div>
      </div>
      <div class="m-item">
        <div class="m-label">Duration So Far</div>
        <div class="m-val">${curDays} days</div>
        <div class="m-sub">${_formatDuration(curDays)}</div>
      </div>
      <div class="m-item">
        <div class="m-label">Hist. Median Duration</div>
        <div class="m-val">${histMedian} days</div>
        <div class="m-sub">${_formatDuration(histMedian)} (Ø ${histAvg}d)</div>
      </div>
      <div class="m-item">
        <div class="m-label">Est. Remaining</div>
        <div class="m-val" style="color:${remaining > 0 ? 'var(--green)' : 'var(--red)'}">${remaining > 0 ? _formatDuration(remaining) : 'Overdue'}</div>
        <div class="m-sub">${survivalPct}% of phases lasted longer</div>
      </div>
    </div>
    <div style="margin-bottom:.35rem;display:flex;align-items:center;gap:.5rem;font-size:.75rem">
      <span style="color:var(--text-dim)">Progress:</span>
      <div style="flex:1;height:10px;border-radius:5px;background:rgba(255,255,255,.05);overflow:hidden">
        <div style="width:${progress}%;height:100%;border-radius:5px;background:${progressColor};transition:width .5s"></div>
      </div>
      <span style="color:${progressColor};font-weight:700">${progress}%</span>
    </div>
    <div style="font-size:.7rem;color:var(--text-dim);display:flex;gap:1rem;flex-wrap:wrap">
      <span>Min: ${histMin}d</span>
      <span>Median: ${histMedian}d</span>
      <span>Max: ${histMax}d</span>
      <span>Range: ${histMin}–${histMax}d</span>
    </div>
  </div>`;
  }

  return `<div class="section section-full"><h2>🔮 Trend & Momentum</h2>
  <div class="trend-big ${stateCls}">TREND: ${state} <span style="font-size:.8rem;font-weight:400;opacity:.8">(${(conf).toFixed(2)})</span></div>
  <div style="font-size:.78rem;color:var(--text-dim);margin-bottom:.6rem">${reasons.join(' · ')}</div>${durationHtml}
  <div class="m-grid"><div class="m-item"><div class="m-label" title="Measures vol compression and range breakout potential. 0–100 scale. Higher = more coiled energy for breakout.">Breakout Energy</div><div class="m-val">${breakoutEnergy}/100</div><div class="m-sub">${beLabel} · Compression: ${(compression).toFixed(2)}</div></div>
  <div class="m-item"><div class="m-label" title="Standard deviations from 50-day MA, normalized by annualized vol. |Z|>2 = statistically extreme.">Z-Score (vs MA)</div><div class="m-val" style="color:${Math.abs(z) > 2 ? 'var(--red)' : 'var(--text)'}">${z.toFixed(2)}</div><div class="m-sub">${reversionHint || 'Within normal range'}</div></div>
  <div class="m-item"><div class="m-label" title="Ratio of 20-day to 60-day realized volatility. <0.7 = compression (potential breakout), >1.3 = expansion.">Vol Compression</div><div class="m-val">${(compression).toFixed(2)}x</div><div class="m-sub">20d/60d ratio</div></div>
  <div class="m-item"><div class="m-label" title="Recent 5-day avg volume / prior 15-day avg. Below 0.5 = drying up (often precedes breakout).">Volume Dry-Up</div><div class="m-val">${(volDryUp).toFixed(2)}x</div><div class="m-sub">Recent 5d vs prior 15d</div></div></div></div>`;
}

// ═══════════════════════════════════════════════════════════════════════════
// F-07: DRAWDOWN ANATOMY
// ═══════════════════════════════════════════════════════════════════════════
function buildDrawdownAnatomy(bars) {
  if (bars.length < 60) return '';
  function calcDD(slice) {
    let peak = adjC(slice[0]) || 1, maxdd = 0, worst = '', worstEnd = '', recDays = 0, eq = peak;
    let ddStart = '', inDD = false, curDDstart = '';
    for (let i = 1; i < slice.length; i++) {
      const c = adjC(slice[i]); if (!c) continue;
      if (c > peak) { peak = c; if (inDD) { recDays = i; inDD = false; } }
      const dd = (peak - c) / peak; if (dd > maxdd) { maxdd = dd; worst = curDDstart || slice[0].date; worstEnd = slice[i].date; }
      if (dd > 0.01 && !inDD) { inDD = true; curDDstart = slice[i].date; }
    }
    return { maxdd, worst, worstEnd, recovered: !inDD };
  }
  const totalYears = Math.round(bars.length / 252);
  const periods = [{ label: '1Y', n: 252 }, { label: '3Y', n: 756 }, { label: '5Y', n: 1260 }, { label: `Max (${totalYears}y)`, n: bars.length }]
    .filter(p => (bars.length >= p.n * 0.8 || p.n === bars.length) && !(p.n !== bars.length && bars.length / p.n < 1.15));
  const rows = periods.map(p => {
    const sl = bars.slice(-Math.min(p.n, bars.length)); const d = calcDD(sl);
    const dateRange = `${d.worst || '—'} → ${d.worstEnd || '—'}`;
    return `<div class="sub-metric"><span style="font-weight:600;width:30px">${p.label}</span><span style="color:var(--red);font-weight:700">${(d.maxdd * 100).toFixed(1)}%</span><span style="font-size:.72rem;color:var(--text-dim)">${dateRange} ${d.recovered ? '✅ Recovered' : '⏳ In drawdown'}</span></div>`;
  }).join('');
  // Ulcer Index (simplified)
  const r252 = bars.slice(-252); let sumSqDD = 0, peak = adjC(r252[0]) || 1;
  for (let i = 1; i < r252.length; i++) { const c = adjC(r252[i]); if (!c) continue; if (c > peak) peak = c; const dd = (peak - c) / peak; sumSqDD += dd * dd; }
  const ulcer = Math.sqrt(sumSqDD / r252.length) * 100;
  return `<div class="section"><h2>📉 Drawdown & Recovery</h2>${rows}
  <div class="sub-metric"><span style="font-weight:600" title="Root mean square of drawdowns over 252 days. Measures depth and duration of price declines. Higher = more painful drawdown history.">Ulcer Index</span><span style="font-weight:700">${ulcer.toFixed(2)}</span></div></div>`;
}

// ═══════════════════════════════════════════════════════════════════════════
// F-08: REALIZED VOL TERM STRUCTURE
// ═══════════════════════════════════════════════════════════════════════════
function buildVolTermStructure(bars) {
  const rets = _returns(bars); if (rets.length < 60) return '';
  const windows = [{ l: '20d', n: 20 }, { l: '60d', n: 60 }, { l: '120d', n: 120 }, { l: '252d', n: 252 }];
  const vols = windows.map(w => { const sl = rets.slice(-Math.min(w.n, rets.length)).map(r => r.ret); return { l: w.l, v: _std(sl) * Math.sqrt(252) }; });
  const trend = vols.length >= 2 && vols[0].v > vols[1].v ? '📈 Vol Rising' : '📉 Vol Falling';
  const maxV = Math.max(...vols.map(v => v.v), 0.01);
  const barsHTML = vols.map(v => {
    const w = Math.round(v.v / maxV * 100);
    return `<div class="mc-bar"><span style="width:40px;font-size:.75rem;color:var(--text-dim)">${v.l}</span><div class="mc-fill" style="width:${w}%;background:${v.v > 0.3 ? 'var(--red)' : v.v > 0.2 ? 'var(--yellow)' : 'var(--green)'}"> </div><span style="font-weight:700;font-size:.8rem">${(v.v * 100).toFixed(1)}%</span></div>`;
  }).join('');
  return `<details class="section advanced-collapsible" open><summary class="section-summary-header">📊 Realized Vol Term Structure</summary>${barsHTML}
  <div style="font-size:.78rem;color:var(--text-dim);margin-top:.4rem">${trend}</div></details>`;
}

// ═══════════════════════════════════════════════════════════════════════════
// F-30: MONTE CARLO CONE
// ═══════════════════════════════════════════════════════════════════════════
function buildMonteCarlo(bars) {
  const rets = _returns(bars).map(r => r.ret); if (rets.length < 60) return '';
  const N = 500, horizons = [{ l: '30d', n: 30 }, { l: '90d', n: 90 }, { l: '252d', n: 252 }];
  const lastClose = adjC(bars[bars.length - 1]) || 1;
  const results = horizons.map(h => {
    const finals = [];
    for (let s = 0; s < N; s++) { let eq = lastClose; for (let d = 0; d < h.n; d++) { eq *= (1 + rets[Math.floor(Math.random() * rets.length)]); } finals.push(eq); }
    finals.sort((a, b) => a - b);
    return { l: h.l, p5: finals[Math.floor(N * 0.025)], p25: finals[Math.floor(N * 0.25)], med: finals[Math.floor(N * 0.5)], p75: finals[Math.floor(N * 0.75)], p95: finals[Math.floor(N * 0.975)] };
  });
  const rows = results.map(r => `<div class="sub-metric"><span style="font-weight:600;width:40px">${r.l}</span>
    <span style="color:var(--red);font-size:.75rem">${fmtCur(r.p5)}</span>
    <span style="font-size:.75rem">${fmtCur(r.p25)}</span>
    <span style="font-weight:700">${fmtCur(r.med)}</span>
    <span style="font-size:.75rem">${fmtCur(r.p75)}</span>
    <span style="color:var(--green);font-size:.75rem">${fmtCur(r.p95)}</span></div>`).join('');
  return `<details class="section advanced-collapsible" open><summary class="section-summary-header">🎲 Monte Carlo Projection</summary>
  <div style="font-size:.72rem;color:var(--text-muted);margin-bottom:.4rem;display:flex;justify-content:space-between"><span>Horizon</span><span>2.5%</span><span>25%</span><span style="font-weight:700">Median</span><span>75%</span><span>97.5%</span></div>
  ${rows}<div style="font-size:.7rem;color:var(--text-muted);margin-top:.5rem">Based on ${N} simulations bootstrapping historical daily returns. Not a forecast.</div></details>`;
}

// ═══════════════════════════════════════════════════════════════════════════
// F-24: LIQUIDITY SCORE
// ═══════════════════════════════════════════════════════════════════════════
function buildLiquidityScore(s, bars) {
  if (!bars.length) return '';
  const vols = bars.slice(-60).map(b => b.volume || 0).filter(v => v > 0);
  if (!vols.length) return '';
  const adv20 = _mean(bars.slice(-20).map(b => b.volume || 0));
  const adv60 = _mean(vols);
  const lastClose = bars[bars.length - 1].close || 1;
  const dollarVol = adv20 * lastClose;
  // Gap risk: avg absolute gap
  const gaps = []; for (let i = 1; i < Math.min(60, bars.length); i++) { const g = bars[i].open && bars[i - 1].close ? Math.abs((bars[i].open - bars[i - 1].close) / bars[i - 1].close) : 0; gaps.push(g); }
  const avgGap = _mean(gaps);
  // Score
  let score = 50;
  if (dollarVol > 1e9) score += 30; else if (dollarVol > 1e8) score += 20; else if (dollarVol > 1e7) score += 10;
  if (avgGap < 0.005) score += 15; else if (avgGap > 0.02) score -= 15;
  if (adv20 > 1e6) score += 5;
  score = Math.max(0, Math.min(100, score));
  const label = score > 70 ? 'Highly Liquid' : score > 40 ? 'Moderate' : 'Low Liquidity';
  const suit = score > 70 ? 'Day trading, swing, long-term' : score > 40 ? 'Swing & long-term' : 'Long-term holds only';
  return `<div class="section"><h2>💧 Liquidity & Tradability</h2>
  <div class="m-grid"><div class="m-item"><div class="m-label">Score</div><div class="m-val" style="color:${score > 70 ? 'var(--green)' : score > 40 ? 'var(--yellow)' : 'var(--red)'}">${score}/100 — ${label}</div></div>
  <div class="m-item"><div class="m-label">ADV (20d)</div><div class="m-val">${fmtVol(adv20)}</div></div>
  <div class="m-item"><div class="m-label">$ Volume</div><div class="m-val">${dollarVol >= 1e9 ? (dollarVol / 1e9).toFixed(1) + 'B' : dollarVol >= 1e6 ? (dollarVol / 1e6).toFixed(1) + 'M' : fmtVol(dollarVol)}</div></div>
  <div class="m-item"><div class="m-label">Avg Gap</div><div class="m-val">${(avgGap * 100).toFixed(2)}%</div></div></div>
  <div style="font-size:.78rem;color:var(--text-dim);margin-top:.4rem">Suitable for: ${suit}</div></div>`;
}

// ═══════════════════════════════════════════════════════════════════════════
// F-10: EARNINGS SHOCK PROXY
// ═══════════════════════════════════════════════════════════════════════════
function buildEarningsShockProxy(bars) {
  const rets = _returns(bars); if (rets.length < 100) return '';
  const threshold = 0.03;// 3% absolute day
  const bigDays = rets.filter(r => Math.abs(r.ret) > threshold);
  if (bigDays.length < 3) return '';
  // Stats: avg follow-through 1d and 5d after big move
  const indices = []; for (let i = 0; i < rets.length; i++) { if (Math.abs(rets[i].ret) > threshold) indices.push(i); }
  let follow1d = [], follow5d = [];
  indices.forEach(idx => { if (idx + 1 < rets.length) follow1d.push(rets[idx + 1].ret); if (idx + 5 < rets.length) { let cum = 0; for (let j = 1; j <= 5; j++)cum += rets[idx + j].ret; follow5d.push(cum); } });
  const avg1 = _mean(follow1d), avg5 = _mean(follow5d);
  const upShocks = bigDays.filter(r => r.ret > 0).length, downShocks = bigDays.filter(r => r.ret < 0).length;
  return `<div class="section"><h2>💥 Big Move Analysis (Earnings Proxy)</h2>
  <div style="font-size:.78rem;color:var(--text-dim);margin-bottom:.4rem">Days with |return| > ${(threshold * 100).toFixed(0)}% as proxy for event days</div>
  <div class="m-grid"><div class="m-item"><div class="m-label">Big Move Days</div><div class="m-val">${bigDays.length}</div><div class="m-sub">↑${upShocks} ↓${downShocks}</div></div>
  <div class="m-item"><div class="m-label">Avg 1d Follow</div><div class="m-val" style="color:${_col(avg1)}">${(avg1 * 100).toFixed(2)}%</div></div>
  <div class="m-item"><div class="m-label">Avg 5d Follow</div><div class="m-val" style="color:${_col(avg5)}">${(avg5 * 100).toFixed(2)}%</div></div></div>
  <div style="font-size:.72rem;color:var(--text-muted);margin-top:.3rem">${avg1 < 0 ? 'Tendency to mean-revert after shocks' : 'Tendency for follow-through after shocks'}</div></div>`;
}

// ═══════════════════════════════════════════════════════════════════════════
// F-31: STRESS SCENARIOS
// ═══════════════════════════════════════════════════════════════════════════
function buildStressScenarios(bars) {
  if (bars.length < 252) return '';
  const scenarios = [
    { name: 'COVID Crash', from: '2020-02-19', to: '2020-03-23' },
    { name: '2022 Bear Market', from: '2022-01-03', to: '2022-10-12' },
    { name: '2018 Q4 Selloff', from: '2018-09-20', to: '2018-12-24' },
    { name: 'Flash Crash 2020 Recovery', from: '2020-03-23', to: '2020-06-08' },
  ];
  const firstBarDate = bars.length ? bars[0].date : '9999-12-31';
  const rows = scenarios.map(sc => {
    if (firstBarDate > sc.from) return `<div class="sub-metric"><span style="font-weight:600">${sc.name}</span><span style="font-size:.72rem;color:var(--text-muted)">Pre-data — N/A (history starts ${firstBarDate})</span></div>`;
    const inRange = bars.filter(b => b.date >= sc.from && b.date <= sc.to);
    if (inRange.length < 5) return null;
    const first = adjC(inRange[0]), last = adjC(inRange[inRange.length - 1]);
    if (!first || !last) return null;
    const ret = (last - first) / first;
    return `<div class="sub-metric"><span style="font-weight:600">${sc.name}</span><span style="font-size:.72rem;color:var(--text-dim)">${sc.from} → ${sc.to}</span><span style="color:${_col(ret)};font-weight:700">${ret >= 0 ? '+' : ''}${(ret * 100).toFixed(1)}%</span></div>`;
  }).filter(Boolean).join('');
  if (!rows) return '';
  return `<details class="section advanced-collapsible" open><summary class="section-summary-header">🔥 Stress Scenario Replay</summary>${rows}
  <div style="font-size:.7rem;color:var(--text-muted);margin-top:.4rem">Shows actual stock performance during historical stress periods.</div></details>`;
}

// ═══════════════════════════════════════════════════════════════════════════
// F-25: PRICE LEVEL MAP (ATR Bands)
// ═══════════════════════════════════════════════════════════════════════════
function buildATRBands(close, s) {
  if (close == null || !s.atr14) return '';
  const atr = s.atr14;
  const levels = [
    { name: 'ATR Band +3', price: close + 3 * atr, type: 'resistance' },
    { name: 'ATR Band +2', price: close + 2 * atr, type: 'resistance' },
    { name: 'ATR Band +1', price: close + 1 * atr, type: 'resistance' },
    { name: 'Current', price: close, type: 'current' },
    { name: 'ATR Band -1', price: close - 1 * atr, type: 'support' },
    { name: 'ATR Band -2', price: close - 2 * atr, type: 'support' },
    { name: 'ATR Band -3', price: close - 3 * atr, type: 'support' },
  ];
  const html = levels.map(l => {
    const dist = l.type === 'current' ? '' : `${((l.price - close) / close * 100).toFixed(1)}%`;
    return `<div class="level-item ${l.type}"><span class="level-name">${l.name}</span><span><span class="level-price">${fmtCur(l.price)}</span><span class="level-dist">${dist}</span></span></div>`;
  }).join('');
  return `<div class="section"><h2>📐 ATR Price Bands</h2><div style="font-size:.78rem;color:var(--text-dim);margin-bottom:.4rem">Based on ATR(14): ${fmtCur(atr)}</div><div class="levels-list">${html}</div></div>`;
}

// ═══════════════════════════════════════════════════════════════════════════
// F-29: RISK BUDGET HELPER
// ═══════════════════════════════════════════════════════════════════════════
function buildRiskBudget(close, s) {
  if (close == null || !s.atr14) return '';
  const atr = s.atr14;
  const risks = [0.5, 1, 2];
  const portfolio = 100000;
  const rows = risks.map(r => {
    const riskAmt = portfolio * r / 100; const shares = Math.floor(riskAmt / (2 * atr)); const pos = shares * close; const posPct = (pos / portfolio * 100).toFixed(1);
    return `<div class="sub-metric"><span style="font-weight:600">${r}% Risk</span><span>${shares} shares</span><span>${fmtCur(pos)} (${posPct}%)</span></div>`;
  }).join('');
  return `<div class="section"><h2>🎯 Risk Budget Helper</h2>
  <div style="font-size:.78rem;color:var(--text-dim);margin-bottom:.4rem"><strong>Trading Stop (2×ATR):</strong> $${(2 * atr).toFixed(2)} from entry · $100K portfolio</div>
  <div style="font-size:.7rem;color:var(--text-muted);margin-bottom:.4rem">Volatility-based stop. For structural S/R invalidation levels, see Decision Strip above.</div>${rows}
  <div style="font-size:.68rem;color:var(--text-muted);margin-top:.5rem;padding:.4rem;background:var(--red-bg);border-radius:6px;border:1px solid rgba(248,113,113,.2)">⚠️ Educational only. Not financial advice. Adjust for your risk tolerance and portfolio size.</div></div>`;
}

// ═══════════════════════════════════════════════════════════════════════════
// F-06/F-32/F-34: FACTOR & CORRELATION
// ═══════════════════════════════════════════════════════════════════════════
function buildFactorCorrelation(ticker, bars) {
  const rets = _returns(bars); if (rets.length < 60) return '';
  // Rolling autocorrelation over different windows
  function autoCorr(arr, lag = 1) {
    const n = arr.length; if (n < lag + 2) return 0; const m = _mean(arr); let num = 0, den = 0;
    for (let i = lag; i < n; i++) { num += (arr[i] - m) * (arr[i - lag] - m); den += (arr[i] - m) ** 2; } return den > 0 ? num / den : 0;
  }
  const r60 = rets.slice(-60).map(r => r.ret);
  const r120 = rets.slice(-120).map(r => r.ret);
  const r252 = rets.slice(-252).map(r => r.ret);
  const ac60 = autoCorr(r60), ac120 = autoCorr(r120), ac252 = autoCorr(r252);
  // Stability: variance of 60d rolling vol
  const volWindows = []; for (let i = 60; i <= rets.length; i += 20) { const w = rets.slice(i - 60, i).map(r => r.ret); volWindows.push(_std(w)); }
  const corrStability = volWindows.length > 2 ? _std(volWindows) / _mean(volWindows) : 0;
  const stLabel = corrStability < 0.3 ? 'Stable' : 'Unstable';
  return `<div class="section"><h2>🔗 Factor & Correlation Profile</h2>
  <table class="ma-table"><tr><th>Metric</th><th>60d</th><th>120d</th><th>252d</th></tr>
  <tr><td style="font-weight:600">Autocorrelation</td><td>${ac60.toFixed(3)}</td><td>${ac120.toFixed(3)}</td><td>${ac252.toFixed(3)}</td></tr>
  <tr><td style="font-weight:600">Annualized Vol</td><td>${(_std(r60) * Math.sqrt(252) * 100).toFixed(1)}%</td><td>${(_std(r120) * Math.sqrt(252) * 100).toFixed(1)}%</td><td>${(_std(r252) * Math.sqrt(252) * 100).toFixed(1)}%</td></tr></table>
  <div style="margin-top:.5rem;padding:.4rem;background:rgba(255,255,255,.02);border-radius:6px;border-left:3px solid var(--accent);font-size:.78rem">
  <span style="color:var(--text-dim)">Vol Regime Stability:</span> <span style="font-weight:700">${stLabel}</span> (CV: ${(corrStability).toFixed(2)})</div>
  <div style="font-size:.72rem;color:var(--text-muted);margin-top:.4rem">💡 Cross-asset correlations (SPY, QQQ, Gold, FX) require benchmark data feeds.</div></div>`;
}

// ═══════════════════════════════════════════════════════════════════════════
// F-05: MACRO REGIME (Educational Placeholder)
// ═══════════════════════════════════════════════════════════════════════════
function _showPlaceholderModules() {
  try {
    if (typeof window === 'undefined') return false;
    const qp = new URLSearchParams(window.location.search || '');
    return _flagOn(qp.get('rv_show_placeholders') || qp.get('show_placeholders') || '0');
  } catch {
    return false;
  }
}

function buildMacroRegime() {
  if (!_showPlaceholderModules()) return '';
  return `<details class="section advanced-collapsible" open><summary class="section-summary-header">🌍 Macro Regime Context</summary>
  <div class="placeholder-card"><h4>Macro Data (FRED Integration)</h4>
  <p>Live macro regime analysis requires FRED API data for:</p>
  <ul><li><strong>Fed Funds Rate</strong> (FEDFUNDS) → Rates Up/Down</li>
  <li><strong>CPI</strong> (CPIAUCSL) → Inflation High/Low</li>
  <li><strong>Unemployment</strong> (UNRATE) → Labor Tight/Loose</li></ul>
  <p style="margin-top:.4rem"><strong>Interpretation Framework:</strong></p>
  <ul><li>Rates ↑ → Duration risk high, growth stocks pressured</li>
  <li>Inflation ↓ → Margin pressure easing, consumer tailwind</li>
  <li>Unemployment ↑ → Defensive positioning, quality premium</li></ul>
  <p style="margin-top:.3rem;font-style:italic">Optional data source not enabled. Live regime analysis stays hidden until a FRED feed is connected.</p></div></details>`;
}

// ═══════════════════════════════════════════════════════════════════════════
// F-11 to F-16, F-35: FUNDAMENTALS PLACEHOLDER
// ═══════════════════════════════════════════════════════════════════════════
function buildFundamentalsPlaceholder(ticker) {
  if (!_showPlaceholderModules()) return '';
  const cards = [
    { id: 'F-11', t: 'Dividend Safety', d: 'Yield vs payout ratio, FCF coverage, growth stability → Score 0–100' },
    { id: 'F-12', t: 'Capital Allocation', d: 'Buyback yield + dividend yield = shareholder yield, 5yr trend' },
    { id: 'F-13', t: 'Quality Score', d: 'ROIC proxy, margin trend, revenue stability, leverage → Score 0–100' },
    { id: 'F-14', t: 'Debt & Liquidity', d: 'Debt/EBITDA, interest coverage, current ratio → Risk flags' },
    { id: 'F-15', t: 'Valuation vs History', d: 'P/E, EV/EBITDA, P/S vs 5yr median → Percentile rank' },
    { id: 'F-16', t: 'Fair Value Range', d: 'Provider-based DCF or earnings power estimate' },
    { id: 'F-35', t: 'Earnings Quality', d: 'Accruals proxy (CFO vs Net Income) → Quality flags' },
  ];
  const html = cards.map(c => `<div class="placeholder-card" style="margin-bottom:.4rem"><h4>${c.t} <span style="font-size:.65rem;color:var(--text-muted)">${c.id}</span></h4><p>${c.d}</p></div>`).join('');
  return `<details class="section section-full advanced-collapsible" open><summary class="section-summary-header">📊 Fundamental Analysis</summary>
  <div style="font-size:.78rem;color:var(--text-dim);margin-bottom:.5rem">Requires fundamentals data feed (FMP/similar). Shows what each metric would analyze:</div>${html}
  <div style="font-size:.7rem;color:var(--text-muted);margin-top:.3rem">Optional data source not enabled. Fundamental scores for ${ticker} stay unavailable until a fundamentals feed is connected.</div></details>`;
}

// ═══════════════════════════════════════════════════════════════════════════
// F-17/F-18: PEERS & SECTOR PLACEHOLDER
// ═══════════════════════════════════════════════════════════════════════════
function buildPeersPlaceholder(ticker, universe) {
  if (!_showPlaceholderModules()) return '';
  const sector = universe?.sector || 'Technology';
  return `<details class="section advanced-collapsible" open><summary class="section-summary-header">👥 Peers & Sector</summary>
  <div class="placeholder-card"><h4>Peer Comparison for ${ticker} (${sector})</h4>
  <p>Would rank ${ticker} vs sector peers on: momentum, quality, valuation.</p>
  <p>Sector relative performance (1M/3M/6M/1Y outperformance vs ${sector} ETF) requires benchmark data.</p>
  <p style="font-style:italic;margin-top:.3rem">Add peer tickers to universe for live comparison.</p></div></details>`;
}

// ═══════════════════════════════════════════════════════════════════════════
// F-19 to F-23: MARKET INTELLIGENCE (Collapsed)
// ═══════════════════════════════════════════════════════════════════════════
function buildMarketIntelligence(ticker) {
  if (!_showPlaceholderModules()) return '';
  const uid = 'mi-' + Math.random().toString(36).slice(2, 6);
  const items = [
    { id: 'F-19', t: 'News Buzz & Sentiment', d: 'MarketAux Free (~100 req/day) — article count, sentiment distribution' },
    { id: 'F-20', t: 'Event Calendar', d: 'Next earnings, ex-dividend dates, conference calls' },
    { id: 'F-21', t: 'Insider Trades', d: 'Net insider buying/selling (C-level, Directors) last 90 days' },
    { id: 'F-22', t: 'Institutional Ownership', d: 'Top holders, QoQ changes, concentration (HHI)' },
    { id: 'F-23', t: 'Short Interest', d: 'SI% of float, days-to-cover, squeeze risk heuristic' },
  ];
  const html = items.map(i => `<div class="placeholder-card" style="margin-bottom:.3rem"><h4>${i.t} <span style="font-size:.65rem;color:var(--text-muted)">${i.id}</span></h4><p>${i.d}</p></div>`).join('');
  return `<details class="section section-full advanced-collapsible" open><summary class="section-summary-header">📰 Market Intelligence</summary>
  ${html}
  <div style="font-size:.7rem;color:var(--text-muted);margin-top:.3rem">Optional data sources not enabled. These modules remain informational until matching providers are connected.</div></details>`;
}

// ═══════════════════════════════════════════════════════════════════════════
// F-33: CROSS ASSET RADAR
// ═══════════════════════════════════════════════════════════════════════════
function buildCrossAssetRadar() {
  if (!_showPlaceholderModules()) return '';
  return `<details class="section advanced-collapsible" open><summary class="section-summary-header">🎯 Cross-Asset Radar</summary>
  <div class="placeholder-card"><h4>Gold / Oil / FX Relative Momentum</h4>
  <p>Shows risk-on/risk-off tilt by comparing relative momentum across asset classes.</p>
  <p style="font-style:italic;margin-top:.3rem">Requires Gold (GLD), Oil (USO), and FX ETFs in the data universe.</p></div></details>`;
}

function buildInactiveModulesSummary(ticker, universe = {}) {
  if (_showPlaceholderModules()) {
    return [
      buildMacroRegime(),
      buildFundamentalsPlaceholder(ticker),
      buildPeersPlaceholder(ticker, universe),
      buildCrossAssetRadar(),
      buildMarketIntelligence(ticker)
    ].join('');
  }
  return `<details class="section advanced-collapsible">
    <summary class="section-summary-header">🧩 Additional Modules (Not Live)</summary>
    <div class="placeholder-card">
      <h4>Not enabled in main flow</h4>
      <ul>
        <li>Macro Regime Context</li>
        <li>Fundamentals</li>
        <li>Peers & Sector</li>
        <li>Cross-Asset Radar</li>
        <li>Market Intelligence</li>
      </ul>
      <p style="margin-top:.35rem">These modules are intentionally hidden from the primary decision path until live data feeds are active.</p>
    </div>
  </details>`;
}

// ═══════════════════════════════════════════════════════════════════════════
// F-36 to F-39: INFRASTRUCTURE & OPS
// ═══════════════════════════════════════════════════════════════════════════
function buildInfrastructure(metadata) {
  const uid = 'infra-' + Math.random().toString(36).slice(2, 6);
  const rawSC = metadata?.source_chain; const src = Array.isArray(rawSC) ? rawSC : rawSC && typeof rawSC === 'object' ? Object.values(rawSC) : [];
  const srcHTML = src.length ? src.map(s => `<div class="sub-metric"><span>${typeof s === 'string' ? s : s?.provider || '—'}</span><span>${typeof s === 'object' ? s?.status || 'OK' : 'OK'}</span><span style="font-size:.72rem;color:var(--text-dim)">${typeof s === 'object' ? s?.duration_ms || '—' : '—'}ms</span></div>`).join('') : '<div style="color:var(--text-dim);font-size:.78rem">No source chain data available</div>';
  return `<div class="section section-full"><h2>⚙️ Infrastructure & Data Ops</h2>
  <div class="collapse-toggle" onclick="this.nextElementSibling.classList.toggle('open')">▶ Debug: Provider chain, rate limits, data integrity</div>
  <div class="collapse-body">
  <div style="font-size:.78rem;font-weight:600;margin-bottom:.3rem">Provider Chain</div>${srcHTML}
  <div class="placeholder-card" style="margin-top:.5rem"><h4>Available Ops Features</h4>
  <ul><li><strong>F-36 KPI Drilldown:</strong> "Why this score?" — feature contribution breakdown</li>
  <li><strong>F-37 Data Drift Monitor:</strong> Cross-provider price comparison (Top-10 tickers)</li>
  <li><strong>F-38 API Budget:</strong> Calls/day per provider, error rates, forecast to limit</li>
  <li><strong>F-39 Smart Alerts:</strong> Price/RSI/Breakout rules evaluated on daily snapshots</li></ul></div></div></div>`;
}

// ═══════════════════════════════════════════════════════════════════════════
// F-09 Enhanced: WEEKDAY SEASONALITY (supplement to existing monthly)
// ═══════════════════════════════════════════════════════════════════════════
function buildWeekdaySeasonality(bars) {
  if (bars.length < 252) return '';
  const rets = _returns(bars);
  const dayNames = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'];
  const dayRets = { 0: [], 1: [], 2: [], 3: [], 4: [] };
  rets.forEach(r => { if (!r.date) return; const d = new Date(r.date); if (!isNaN(d)) { const wd = d.getDay(); if (wd >= 1 && wd <= 5) dayRets[wd - 1].push(r.ret); } });
  let anyLow = false;
  const rows = dayNames.map((name, i) => {
    const arr = dayRets[i]; if (!arr.length) return '';
    const avg = _mean(arr), wr = (arr.filter(r => r > 0).length / arr.length * 100).toFixed(0);
    const warn = arr.length < 50 ? ' ⚠️' : '';
    if (arr.length < 50) anyLow = true;
    return `<div class="sub-metric"><span style="width:35px;font-weight:600">${name}</span><span style="color:${_col(avg)};font-weight:700">${avg >= 0 ? '+' : ''}${(avg * 100).toFixed(3)}%</span><span style="font-size:.72rem;color:var(--text-dim)">Win: ${wr}% (n=${arr.length})${warn}</span></div>`;
  }).join('');
  const lowWarn = anyLow ? '<div style="font-size:.68rem;color:var(--yellow);margin-top:.2rem">⚠️ Some weekdays have &lt;50 samples — results may not be statistically significant.</div>' : '';
  return `<div style="margin-top:.6rem"><div style="font-size:.78rem;color:var(--text-dim);margin-bottom:.3rem">Weekday Effects</div>${rows}${lowWarn}</div>`;
}

// ═══════════════════════════════════════════════════════════════════════════
// SCIENTIFIC ANALYZER INTEGRATION
// ═══════════════════════════════════════════════════════════════════════════
// SINGLE-ENDPOINT INSIGHT LOADER (avoids downloading 210MB of JSON client-side)
let _insightsCache = {};
function _flagOn(v) {
  const s = String(v ?? '').trim().toLowerCase();
  return s === '1' || s === 'true' || s === 'on' || s === 'yes';
}

function _useFeaturesV2() {
  try {
    if (typeof window === 'undefined') return false;
    const qp = new URLSearchParams(window.location.search || '');
    if (qp.has('rv_features_v2')) return _flagOn(qp.get('rv_features_v2'));
    if (qp.has('features_v2')) return _flagOn(qp.get('features_v2'));
    if (qp.has('featuresV2')) return _flagOn(qp.get('featuresV2'));
    const winFlag = window.__RV_FLAGS?.featuresV2 ?? window.__RV_FEATURES_V2;
    if (winFlag != null) return _flagOn(winFlag);
    const ls = window.localStorage?.getItem('rv.features.v2');
    if (ls != null) return _flagOn(ls);
  } catch { /* ignore */ }
  return false;
}

function _useFeaturesV4() {
  try {
    if (typeof window === 'undefined') return false;
    const qp = new URLSearchParams(window.location.search || '');
    if (qp.has('rv_features_v4')) return _flagOn(qp.get('rv_features_v4'));
    if (qp.has('features_v4')) return _flagOn(qp.get('features_v4'));
    if (qp.has('featuresV4')) return _flagOn(qp.get('featuresV4'));
    const winFlag = window.__RV_FLAGS?.featuresV4 ?? window.__RV_FEATURES_V4;
    if (winFlag != null) return _flagOn(winFlag);
    const ls = window.localStorage?.getItem('rv.features.v4');
    if (ls != null) return _flagOn(ls);
  } catch { /* ignore */ }
  return false;
}

function _v2ContractValid(payload) {
  const c = payload?.v2_contract;
  if (!c || typeof c !== 'object') return false;
  const req = ['scientific', 'forecast', 'elliott'];
  for (const k of req) {
    const row = c[k];
    if (!row || typeof row !== 'object') return false;
    if (!('value' in row) || !('as_of' in row) || !('source' in row) || !('status' in row) || !('reason' in row)) {
      return false;
    }
  }
  return true;
}

function _v4ContractValid(payload) {
  const c = payload?.v4_contract;
  if (!c || typeof c !== 'object') return false;
  const required = [
    'scientific',
    'forecast',
    'elliott',
    'raw_validation',
    'outcome_labels',
    'scientific_eligibility',
    'fallback_state',
    'timeframe_confluence',
    'decision_trace'
  ];
  for (const k of required) {
    const row = c[k];
    if (!row || typeof row !== 'object') return false;
    if (!('value' in row) || !('as_of' in row) || !('source' in row) || !('status' in row) || !('reason' in row)) {
      return false;
    }
  }
  return true;
}

function _insightsEndpoints() {
  if (_useFeaturesV4()) return ['/api/stock-insights-v4', '/api/stock-insights-v2', '/api/stock-insights'];
  if (_useFeaturesV2()) return ['/api/stock-insights-v2', '/api/stock-insights'];
  return ['/api/stock-insights'];
}

async function _loadInsights(ticker) {
  const key = ticker.toUpperCase();
  const endpoints = _insightsEndpoints();
  for (const endpoint of endpoints) {
    const cacheKey = `${endpoint}::${key}`;
    if (_insightsCache[cacheKey]) return _insightsCache[cacheKey];
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 15000);
      const r = await fetch(`${endpoint}?ticker=${encodeURIComponent(key)}`, { signal: ctrl.signal });
      clearTimeout(timer);
      if (!r.ok) continue;
      const data = await r.json();
      const isV4 = endpoint.includes('stock-insights-v4');
      const isV2 = endpoint.includes('stock-insights-v2');
      if (isV4 && !_v4ContractValid(data)) continue;
      if (isV2 && !_v2ContractValid(data)) continue;
      _insightsCache[cacheKey] = data;
      return data;
    } catch { /* try fallback endpoint */ }
  }
  return null;
}

async function buildScientificInsight(ticker, context = {}) {
  const insights = await _loadInsights(ticker);
  const entry = insights?.scientific;
  const canonical = _canonicalContext(context);
  const mismatch = _detectScientificMetricMismatch(insights, context);
  if (mismatch.mismatch) {
    _setQualitySignals({
      metricMismatch: true,
      metricMismatchDetail: {
        rsi_model: mismatch.sampleRsi,
        rsi_canonical: mismatch.canonicalRsi,
        atr_model_pct: mismatch.sampleAtrPct,
        atr_canonical_pct: mismatch.canonicalAtrPct
      }
    }, true);
  }
  if (!entry || entry.status === 'DATA_UNAVAILABLE') {
    const proxy = _proxyScientificSignal(context);
    if (!proxy) {
      const reason = entry?.reason || `${ticker} is not yet included in the Scientific Analyzer model universe. Coverage expands with each training cycle.`;
      return `<div class="section section-full"><h2>🔬 Scientific Analyzer</h2><div class="placeholder-card" style="text-align:center;padding:1.2rem">
        <div style="font-size:1.1rem;margin-bottom:.4rem;color:var(--text-dim)">⏳ Not Yet Covered</div>
        <div style="font-size:.82rem;color:var(--text-dim);max-width:480px;margin:0 auto">${reason}</div>
      </div></div>`;
    }
    const setupCol = proxy.setupScore >= 80 ? 'var(--green)' : proxy.setupScore >= 55 ? 'var(--yellow)' : 'var(--red)';
    const triggerCol = proxy.triggerScore >= 70 ? 'var(--green)' : proxy.triggerScore >= 45 ? 'var(--yellow)' : 'var(--red)';
    const directionCol = proxy.direction === 'bullish' ? 'var(--green)' : 'var(--red)';
    return `<div class="section section-full"><h2>🔬 Scientific Analyzer</h2>
      <div class="placeholder-card" style="margin-bottom:.55rem">
        Model output unavailable for ${ticker}; showing local proxy from current OHLCV/indicator state.
      </div>
      <div class="m-grid">
        <div class="m-item"><div class="m-label">Setup (proxy)</div><div class="m-val" style="color:${setupCol}">${proxy.setupScore}/100</div></div>
        <div class="m-item"><div class="m-label">Trigger (proxy)</div><div class="m-val" style="color:${triggerCol}">${proxy.triggerScore}/100</div></div>
        <div class="m-item"><div class="m-label">Direction</div><div class="m-val" style="color:${directionCol}">${proxy.direction.toUpperCase()}</div></div>
        <div class="m-item"><div class="m-label">Prob / Exp.10d</div><div class="m-val">${Math.round(proxy.probability * 100)}% / ${proxy.expectedReturn10d > 0 ? '+' : ''}${proxy.expectedReturn10d}%</div></div>
      </div>
    </div>`;
  }

  const setup = entry.setup || {};
  const trigger = entry.trigger || {};
  const prob = entry.probability != null ? (entry.probability * 100).toFixed(0) : '—';
  const expRet = entry.expected_return_10d != null ? (entry.expected_return_10d > 0 ? '+' : '') + entry.expected_return_10d.toFixed(1) + '%' : '—';
  const strength = String(entry.signal_strength || 'N/A').toUpperCase();

  const setupScore = _toNumber(setup.score) || 0;
  const setupCol = setupScore >= 80 ? 'var(--green)' : setupScore >= 50 ? 'var(--yellow)' : 'var(--red)';
  const canonicalProofs = _scientificCanonicalProofs(context);
  const setupProofs = canonicalProofs.setup.map(p => `<div style="font-size:.72rem;color:var(--text-dim);padding:.1rem 0">✓ ${p}</div>`).join('');

  const triggerScore = _toNumber(trigger.score) || 0;
  const triggerCol = triggerScore >= 75 ? 'var(--green)' : triggerScore >= 25 ? 'var(--yellow)' : 'var(--red)';
  const triggerProofs = canonicalProofs.trigger.map(p => `<div style="font-size:.72rem;color:var(--text-dim);padding:.1rem 0">✓ ${p}</div>`).join('');

  const shap = entry.explainability?.shap_values || {};
  const shapEntries = Object.entries(shap).sort((a, b) => Math.abs(b[1]) - Math.abs(a[1])).slice(0, 6);
  const shapHTML = shapEntries.length ? shapEntries.map(([k, v]) => {
    const pct = Math.min(100, Math.abs(v) * 200);
    const col = v > 0 ? 'rgba(16,185,129,.6)' : 'rgba(248,113,113,.6)';
    return `<div style="display:flex;align-items:center;gap:.4rem;margin:.15rem 0;font-size:.75rem"><span style="min-width:130px;color:var(--text-dim)">${k.replace(/_/g, ' ')}</span><div style="flex:1;height:8px;border-radius:4px;background:rgba(255,255,255,.04);overflow:hidden"><div style="width:${pct}%;height:100%;background:${col};border-radius:4px"></div></div><span style="font-weight:700;color:${v > 0 ? 'var(--green)' : 'var(--red)'};min-width:40px;text-align:right">${v > 0 ? '+' : ''}${v.toFixed(2)}</span></div>`;
  }).join('') : '';

  const risk = entry.risk_metrics || {};
  const sharpe = risk.sharpe_proxy != null ? risk.sharpe_proxy.toFixed(2) : '—';
  const var95 = risk.var95 != null ? risk.var95.toFixed(1) + '%' : '—';
  const meta = entry.metadata || {};
  const auc = meta.model_auc != null ? (meta.model_auc * 100).toFixed(0) + '%' : '—';
  const drift = meta.drift_status || 'unknown';
  const rsi = canonical.rsi14;
  const volPct = _toNumber(context?.stats?.volatility_percentile);
  const riskFlags = [];
  if (rsi != null && rsi >= 70) riskFlags.push(`RSI14 ${rsi.toFixed(1)} is overbought`);
  if (volPct != null && volPct >= 85) riskFlags.push(`Volatility percentile ${volPct.toFixed(0)}th is elevated`);
  if (canonical.atrPct != null && canonical.atrPct >= 3.5) riskFlags.push(`ATR ${canonical.atrPct.toFixed(2)}% indicates wide risk bands`);

  let effectiveStrength = strength;
  if (riskFlags.length >= 2 && strength === 'STRONG') effectiveStrength = 'LIMITED';
  else if (riskFlags.length >= 1 && (strength === 'STRONG' || strength === 'MODERATE')) effectiveStrength = 'CAUTION';
  const strengthCol = effectiveStrength === 'STRONG'
    ? 'var(--green)'
    : effectiveStrength === 'MODERATE'
      ? 'var(--yellow)'
      : effectiveStrength === 'CAUTION'
        ? 'var(--yellow)'
        : effectiveStrength === 'LIMITED'
          ? 'var(--red)'
          : 'var(--text-dim)';

  _setQualitySignals({
    scientificStrength: effectiveStrength,
    scientificRiskFlags: riskFlags,
    metricMismatch: Boolean((window._rvQualitySignals || {}).metricMismatch || mismatch.mismatch)
  });

  return `<div class="section section-full"><h2>🔬 Scientific Analyzer</h2>
<div style="display:flex;gap:.5rem;flex-wrap:wrap;margin-bottom:.6rem">
  <div style="padding:.3rem .7rem;border-radius:6px;font-weight:700;font-size:.85rem;background:${strengthCol === 'var(--green)' ? 'var(--green-bg)' : strengthCol === 'var(--yellow)' ? 'var(--yellow-bg)' : 'var(--red-bg)'};color:${strengthCol};border:1px solid ${strengthCol}">Effective Signal: ${effectiveStrength}</div>
  <div style="padding:.3rem .7rem;border-radius:6px;font-size:.82rem;background:rgba(99,102,241,.08);border:1px solid rgba(99,102,241,.2)">Probability: <strong>${prob}%</strong></div>
  <div style="padding:.3rem .7rem;border-radius:6px;font-size:.82rem;background:rgba(255,255,255,.03);border:1px solid var(--border)">Expected 10d: <strong style="color:${entry.expected_return_10d >= 0 ? 'var(--green)' : 'var(--red)'}">${expRet}</strong></div>
  <div style="padding:.3rem .7rem;border-radius:6px;font-size:.82rem;background:rgba(255,255,255,.03);border:1px solid var(--border)">Canonical RSI / ATR: <strong>${_fmtMaybe(canonical.rsi14, 1)} / ${_fmtMaybe(canonical.atr14, 2)}</strong></div>
</div>
${riskFlags.length ? `<div style="margin-bottom:.5rem;padding:.45rem .6rem;border-radius:8px;background:var(--red-bg);border:1px solid rgba(248,113,113,.35);font-size:.76rem;color:#fecaca"><strong>Risk Gate:</strong> ${riskFlags.join(' · ')}</div>` : ''}
${mismatch.mismatch ? `<div style="margin-bottom:.5rem;padding:.45rem .6rem;border-radius:8px;background:var(--red-bg);border:1px solid rgba(248,113,113,.35);font-size:.76rem;color:#fecaca"><strong>Metric mismatch detected:</strong> model snapshot vs canonical RSI/ATR differ. Final verdict is suppressed until values are consistent.</div>` : ''}
<div class="m-grid">
  <div class="m-item"><div class="m-label">Setup ${setup.fulfilled ? '\u2705' : '\u274c'}</div><div class="m-val" style="color:${setupCol}">${setupScore}/100</div><div class="m-sub">${setup.conditions_met || '—'} conditions met</div><div style="margin-top:.3rem;height:6px;border-radius:3px;background:rgba(255,255,255,.05);overflow:hidden"><div style="width:${setupScore}%;height:100%;background:${setupCol};border-radius:3px"></div></div>${setupProofs}</div>
  <div class="m-item"><div class="m-label">Trigger ${trigger.fulfilled ? '\u2705' : '\u274c'}</div><div class="m-val" style="color:${triggerCol}">${triggerScore}/100</div><div class="m-sub">${trigger.conditions_met || '—'} conditions met</div><div style="margin-top:.3rem;height:6px;border-radius:3px;background:rgba(255,255,255,.05);overflow:hidden"><div style="width:${triggerScore}%;height:100%;background:${triggerCol};border-radius:3px"></div></div>${triggerProofs}</div>
  <div class="m-item"><div class="m-label">Risk</div><div class="m-val">${sharpe}</div><div class="m-sub">Sharpe Proxy \u00b7 VaR95: ${var95}</div></div>
  <div class="m-item"><div class="m-label">Model Quality</div><div class="m-val">${auc}</div><div class="m-sub">AUC \u00b7 Drift: ${drift}</div></div>
</div>
${shapHTML ? `<div style="margin-top:.6rem;padding:.5rem .6rem;border-radius:8px;background:rgba(255,255,255,.02);border:1px solid var(--border)"><div style="font-size:.78rem;font-weight:600;margin-bottom:.3rem;color:var(--text-dim)">\ud83e\udde0 SHAP Factor Attribution</div>${shapHTML}</div>` : ''}
</div>`;
}

// ═══════════════════════════════════════════════════════════════════════════
// ML FORECAST INTEGRATION
// ═══════════════════════════════════════════════════════════════════════════
async function buildForecastInsight(ticker, context = {}) {
  const insights = await _loadInsights(ticker);
  const entry = insights?.forecast;
  const horizonOrder = ['1d', '5d', '20d'];
  const horizonLabels = { '1d': '1 Day', '5d': '1 Week', '20d': '1 Month' };

  function horizonCard(h, fc, mode = 'active') {
    if (!fc) return '';
    const isBull = fc.direction === 'bullish';
    const isBear = fc.direction === 'bearish';
    const prob = _toNumber(fc.probability);
    const probText = prob != null ? `${(prob * 100).toFixed(1)}%` : '—';
    const col = mode === 'suppressed' ? 'var(--text-dim)' : isBull ? 'var(--green)' : isBear ? 'var(--red)' : 'var(--yellow)';
    const bgCol = mode === 'suppressed' ? 'rgba(148,163,184,.08)' : isBull ? 'var(--green-bg)' : isBear ? 'var(--red-bg)' : 'var(--yellow-bg)';
    const icon = mode === 'suppressed' ? '⏸' : isBull ? '▲' : isBear ? '▼' : '◆';
    const title = mode === 'suppressed'
      ? `${horizonLabels[h]} · UNAVAILABLE`
      : `${horizonLabels[h]} · ${String(fc.direction || 'neutral').toUpperCase()} ${probText}`;
    const barWidth = prob != null ? Math.round(prob * 100) : 0;
    return `<div style="padding:.5rem .6rem;border-radius:8px;background:${bgCol};border:1px solid ${col}30;margin-bottom:.35rem">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:.3rem">
        <span style="font-weight:600;font-size:.82rem">${horizonLabels[h]}</span>
        <span style="font-weight:800;color:${col};font-size:.86rem">${icon} ${title.replace(`${horizonLabels[h]} · `, '')}</span>
      </div>
      ${mode === 'active' ? `<div style="height:8px;border-radius:4px;background:rgba(255,255,255,.05);overflow:hidden"><div style="width:${barWidth}%;height:100%;border-radius:4px;background:${col};opacity:.6"></div></div>` : ''}
    </div>`;
  }

  if (!entry) {
    _setQualitySignals({ forecastValidated: false, forecastIndependent: false, forecastSuppressed: true }, true);
    const proxy = _proxyForecastSignal(context);
    if (!proxy) return `<div class="section"><h2>\ud83d\udd2e ML Forecast</h2><div class="placeholder-card">No forecast data available for ${ticker}.</div></div>`;
    const barsHtml = horizonOrder.map((h) => horizonCard(h, proxy.horizons[h], 'suppressed')).join('');
    return `<div class="section"><h2>\ud83d\udd2e ML Forecast</h2>
      <div class="placeholder-card" style="margin-bottom:.5rem">Champion output unavailable for ${ticker}. Forecast is marked <strong>not ready</strong> until validation metrics are present.</div>
      ${barsHtml}
      <div style="margin-top:.4rem;padding:.4rem .6rem;border-radius:6px;background:rgba(255,255,255,.02);border:1px solid var(--border);font-size:.72rem;color:var(--text-dim)">
        Status: <strong style="color:var(--yellow)">Validation incomplete</strong> · Model candidate: <strong style="color:var(--text)">${proxy.model}</strong> · Data: <strong style="color:var(--text)">${proxy.freshness}</strong>
      </div>
    </div>`;
  }

  const modelAccuracy = insights?.forecast_meta?.accuracy || {};
  const champion = insights?.forecast_meta?.champion_id || 'N/A';
  const freshness = insights?.forecast_meta?.freshness || '—';
  const horizons = entry.horizons || {};
  const directional = _toNumber(modelAccuracy.directional);
  const brierValue = _toNumber(modelAccuracy.brier);
  const sampleNum = _toNumber(modelAccuracy.sample_count);
  const validationReady = directional != null && brierValue != null && sampleNum != null && sampleNum > 0;

  const existing = horizonOrder.map((h) => horizons[h]).filter(Boolean);
  const probs = existing.map((h) => _toNumber(h.probability)).filter((v) => v != null);
  const dirs = existing.map((h) => String(h.direction || '').toLowerCase()).filter(Boolean);
  const nearlyEqual = probs.length >= 2 && (Math.max(...probs) - Math.min(...probs)) <= 0.003;
  const sameDir = dirs.length >= 2 && dirs.every((d) => d === dirs[0]);
  const nonIndependent = existing.length >= 3 && nearlyEqual && sameDir;

  const horizonMode = {};
  horizonOrder.forEach((h, i) => {
    if (!validationReady) horizonMode[h] = 'suppressed';
    else if (nonIndependent && i > 0) horizonMode[h] = 'suppressed';
    else horizonMode[h] = 'active';
  });
  const barsHtml = horizonOrder.map((h) => horizonCard(h, horizons[h], horizonMode[h])).join('');
  const dirAccuracy = directional != null ? `${(directional * 100).toFixed(1)}%` : '—';
  const brier = brierValue != null ? brierValue.toFixed(4) : '—';
  const sampleCount = sampleNum != null ? Math.round(sampleNum).toLocaleString() : '—';

  _setQualitySignals({
    forecastValidated: validationReady,
    forecastIndependent: !nonIndependent,
    forecastSuppressed: !validationReady || nonIndependent
  }, true);

  const validationMsg = !validationReady
    ? 'Forecast suppressed: required validation metrics (Accuracy, Brier, Samples) are missing.'
    : nonIndependent
      ? 'Forecast partially suppressed: 5d/20d outputs are non-independent duplicates of 1d.'
      : 'Forecast available and validated.';
  const validationCol = !validationReady ? 'var(--red)' : nonIndependent ? 'var(--yellow)' : 'var(--green)';

  return `<div class="section"><h2>\ud83d\udd2e ML Forecast</h2>
${barsHtml}
<div style="margin-top:.4rem;padding:.4rem .6rem;border-radius:6px;background:rgba(255,255,255,.02);border:1px solid var(--border);font-size:.72rem;color:var(--text-dim);display:flex;gap:.8rem;flex-wrap:wrap">
  <span>Model: <strong style="color:var(--text)">${champion}</strong></span>
  <span>Accuracy: <strong style="color:var(--text)">${dirAccuracy}</strong></span>
  <span>Brier: <strong style="color:var(--text)">${brier}</strong></span>
  <span>Samples: <strong style="color:var(--text)">${sampleCount}</strong></span>
  <span>Data: <strong style="color:var(--text)">${freshness}</strong></span>
</div>
<div style="margin-top:.45rem;font-size:.75rem;color:${validationCol}">${validationMsg}</div>
</div>`;
}

// ═══════════════════════════════════════════════════════════════════════════
// ELLIOTT WAVE INTEGRATION
// ═══════════════════════════════════════════════════════════════════════════
async function buildElliottInsight(ticker, context = {}) {
  const insights = await _loadInsights(ticker);
  const entry = insights?.elliott;
  const close = _toNumber(context?.close);
  const quality = (typeof window !== 'undefined' && window._rvQualitySignals) || {};
  const primaryBias = String(quality.overallAction || quality.decisionSummary || '').toUpperCase();

  function levelPlausibility(levels = []) {
    if (close == null || close <= 0 || !levels.length) return { ok: true, maxDist: 0 };
    const dists = levels.map((v) => Math.abs((_toNumber(v) - close) / close)).filter((v) => Number.isFinite(v));
    if (!dists.length) return { ok: true, maxDist: 0 };
    const maxDist = Math.max(...dists);
    return { ok: maxDist <= 0.35, maxDist };
  }

  if (!entry) {
    const proxy = _proxyElliottSignal(context);
    if (!proxy) return `<div class="section"><h2>\ud83c\udf0a Elliott Wave Analysis</h2><div class="placeholder-card">No Elliott Wave data available for ${ticker}.</div></div>`;
    const trendCol = proxy.direction === 'bullish' ? 'var(--green)' : 'var(--red)';
    const p = levelPlausibility([proxy.support, proxy.resistance]);
    if (!p.ok) {
      _setQualitySignals({ elliottState: 'suppressed', elliottConflict: true });
      return `<div class="section"><h2>\ud83c\udf0a Elliott Wave Analysis</h2>
        <div class="placeholder-card">Elliott output suppressed: price levels are desynchronized from the current price zone.</div>
      </div>`;
    }
    _setQualitySignals({ elliottState: 'proxy', elliottConflict: false });
    return `<div class="section"><h2>\ud83c\udf0a Elliott Wave Analysis</h2>
      <div class="placeholder-card" style="margin-bottom:.5rem">Wave model output unavailable for ${ticker}; showing deterministic local wave proxy.</div>
      <div style="display:flex;gap:.75rem;flex-wrap:wrap;margin-bottom:.45rem">
        <div style="padding:.5rem .8rem;border-radius:8px;background:rgba(99,102,241,.08);border:1px solid rgba(99,102,241,.25);flex:1;min-width:120px"><div style="font-size:.72rem;color:var(--text-dim)">Developing Wave</div><div style="font-size:1.05rem;font-weight:800;color:var(--accent)">${proxy.wave}</div></div>
        <div style="padding:.5rem .8rem;border-radius:8px;background:rgba(255,255,255,.03);border:1px solid var(--border);flex:1;min-width:120px"><div style="font-size:.72rem;color:var(--text-dim)">Direction</div><div style="font-size:1rem;font-weight:700;color:${trendCol}">${proxy.direction.toUpperCase()}</div></div>
        <div style="padding:.5rem .8rem;border-radius:8px;background:rgba(255,255,255,.03);border:1px solid var(--border);flex:1;min-width:120px"><div style="font-size:.72rem;color:var(--text-dim)">Confidence</div><div style="font-size:1rem;font-weight:700">${proxy.confidence}%</div></div>
        <div style="padding:.5rem .8rem;border-radius:8px;background:rgba(255,255,255,.03);border:1px solid var(--border);flex:1;min-width:120px"><div style="font-size:.72rem;color:var(--text-dim)">Fib Conformance</div><div style="font-size:1rem;font-weight:700">${proxy.fibConformance}%</div></div>
      </div>
      <div style="font-size:.75rem;color:var(--text-dim)">Support: <strong style="color:var(--green)">$${proxy.support.toFixed(2)}</strong> · Resistance: <strong style="color:var(--red)">$${proxy.resistance.toFixed(2)}</strong></div>
    </div>`;
  }

  const completed = entry.completedPattern || {};
  const developing = entry.developingPattern || {};
  const uncertainty = entry.uncertainty || {};
  const fib = entry.fib || {};

  // Wave position from developing pattern
  const wave = developing.possibleWave || 'N/A';
  const trendDir = String(completed.direction || 'N/A');
  const trendCol = trendDir.toLowerCase().includes('bull') ? 'var(--green)' : trendDir.toLowerCase().includes('bear') ? 'var(--red)' : 'var(--yellow)';

  // Confidence from developing first, fallback to completed adjusted confidence
  const rawConf = developing.confidence != null ? developing.confidence : (uncertainty?.confidenceDecay?.adjusted != null ? uncertainty.confidenceDecay.adjusted : null);
  const confPct = rawConf != null ? Math.round(rawConf) : null;
  const confBar = confPct != null ? `<div style="margin-top:.3rem;height:6px;border-radius:3px;background:rgba(255,255,255,.05);overflow:hidden"><div style="width:${confPct}%;height:100%;background:${confPct > 60 ? 'var(--green)' : confPct > 30 ? 'var(--yellow)' : 'var(--red)'};border-radius:3px"></div></div>` : '';

  // Fibonacci conformance score
  const fibScore = fib.conformanceScore != null ? Math.round(fib.conformanceScore) : null;

  // Fib support/resistance levels
  const fibSupport = developing?.fibLevels?.support || [];
  const fibResist = developing?.fibLevels?.resistance || [];
  const plausible = levelPlausibility([...(Array.isArray(fibSupport) ? fibSupport : []), ...(Array.isArray(fibResist) ? fibResist : [])]);
  const elliottBias = trendDir.toLowerCase().includes('bull') ? 'BUY' : trendDir.toLowerCase().includes('bear') ? 'AVOID' : 'WAIT';
  const conflictsPrimary = Boolean(primaryBias && primaryBias !== 'SUPPRESSED' && elliottBias !== 'WAIT' && primaryBias !== elliottBias);
  const conflict = conflictsPrimary || !plausible.ok;
  _setQualitySignals({ elliottConflict: conflict, elliottState: plausible.ok ? (conflict ? 'conflict' : 'aligned') : 'suppressed' });

  if (!plausible.ok) {
    return `<div class="section"><h2>\ud83c\udf0a Elliott Wave Analysis</h2>
      <div style="padding:.55rem .65rem;border-radius:8px;background:var(--red-bg);border:1px solid rgba(248,113,113,.35);font-size:.78rem;color:#fecaca">
        Elliott module suppressed: projected levels are > ${(plausible.maxDist * 100).toFixed(1)}% away from current price and are not in sync with the active market regime.
      </div>
    </div>`;
  }

  // Explanation based on wave position
  const waveExplain = {
    'Wave 1': 'Early trend emergence \u2014 low confidence, potential false starts.',
    'Wave 2': 'Corrective pullback \u2014 tests conviction, often retraces 50-61.8%.',
    'Wave 3': 'Strongest impulse wave \u2014 highest momentum, typically extends.',
    'Wave 4': 'Consolidation / correction \u2014 complex, watch for reversal signals.',
    'Wave 4 or ABC': 'Corrective structure in progress \u2014 either a 4th wave consolidation or a full ABC correction.',
    'Wave 5': 'Final impulse \u2014 divergences common, exhaustion signals.',
    'Wave A': 'First corrective leg \u2014 often mistaken for a dip-buy opportunity.',
    'Wave B': 'Counter-trend rally \u2014 potential bull trap.',
    'Wave C': 'Final corrective leg \u2014 often sharp and decisive.'
  };
  const explanation = waveExplain[wave] || 'Structural wave analysis based on Elliott price action patterns.';

  // Completed pattern status
  const completedHtml = completed.direction ? `<div style="margin-top:.4rem;font-size:.75rem;color:var(--text-dim)">Last completed pattern: <strong style="color:${trendCol}">${completed.direction}</strong>${completed.endedAt ? ` (ended ${completed.endedAt})` : ''}${completed.guidelineScore != null ? ` \u2014 guideline score: ${completed.guidelineScore}%` : ''}</div>` : '';

  return `<div class="section"><h2>\ud83c\udf0a Elliott Wave Analysis</h2>
${conflict
    ? `<div style="margin-bottom:.5rem;padding:.45rem .6rem;border-radius:8px;background:var(--yellow-bg);border:1px solid rgba(251,191,36,.35);font-size:.76rem;color:#fde68a"><strong>Conflict marker:</strong> Elliott bias (${elliottBias}) diverges from main decision flow (${primaryBias || 'N/A'}). Treat as alternative scenario, not primary verdict.</div>`
    : `<div style="margin-bottom:.5rem;padding:.45rem .6rem;border-radius:8px;background:rgba(16,185,129,.08);border:1px solid rgba(16,185,129,.35);font-size:.76rem;color:#bbf7d0"><strong>Alignment marker:</strong> ${primaryBias === 'SUPPRESSED' ? 'Primary flow is currently suppressed; Elliott is shown as a secondary scenario.' : 'Elliott is directionally in line with the current decision flow.'}</div>`}
<div style="display:flex;gap:.75rem;flex-wrap:wrap;margin-bottom:.5rem">
  <div style="padding:.5rem .8rem;border-radius:8px;background:linear-gradient(135deg,rgba(99,102,241,.12),rgba(139,92,246,.08));border:1px solid rgba(99,102,241,.3);flex:1;min-width:120px"><div style="font-size:.72rem;color:var(--text-dim);text-transform:uppercase;letter-spacing:.04em">Developing Wave</div><div style="font-size:1.1rem;font-weight:800;color:var(--accent)">${wave}</div></div>
  <div style="padding:.5rem .8rem;border-radius:8px;background:rgba(255,255,255,.03);border:1px solid var(--border);flex:1;min-width:120px"><div style="font-size:.72rem;color:var(--text-dim);text-transform:uppercase;letter-spacing:.04em">Trend</div><div style="font-size:1rem;font-weight:700;color:${trendCol}">${trendDir}</div></div>
  ${confPct != null ? `<div style="padding:.5rem .8rem;border-radius:8px;background:rgba(255,255,255,.03);border:1px solid var(--border);flex:1;min-width:120px"><div style="font-size:.72rem;color:var(--text-dim);text-transform:uppercase;letter-spacing:.04em">Confidence</div><div style="font-size:1rem;font-weight:700">${confPct}%</div>${confBar}</div>` : ''}
  ${fibScore != null ? `<div style="padding:.5rem .8rem;border-radius:8px;background:rgba(255,255,255,.03);border:1px solid var(--border);flex:1;min-width:120px"><div style="font-size:.72rem;color:var(--text-dim);text-transform:uppercase;letter-spacing:.04em">Fib Conformance</div><div style="font-size:1rem;font-weight:700">${fibScore}%</div></div>` : ''}
</div>
<div style="padding:.5rem .6rem;border-radius:6px;background:rgba(255,255,255,.02);border-left:3px solid var(--accent);font-size:.78rem;color:var(--text-dim)">\ud83d\udca1 ${explanation}</div>
${(fibSupport.length || fibResist.length) ? `<div style="margin-top:.5rem;display:flex;gap:.75rem;flex-wrap:wrap">${fibSupport.length ? `<div style="font-size:.75rem;color:var(--text-dim)">Support: ${fibSupport.map(v => `<strong style="color:var(--green)">$${v.toFixed(2)}</strong>`).join(', ')}</div>` : ''}${fibResist.length ? `<div style="font-size:.75rem;color:var(--text-dim)">Resistance: ${fibResist.map(v => `<strong style="color:var(--red)">$${v.toFixed(2)}</strong>`).join(', ')}</div>` : ''}</div>` : ''}
${completedHtml}</div>`;
}

function _v4StateValue(contract, key) {
  const row = contract?.[key];
  if (!row || typeof row !== 'object') return null;
  return row.value ?? null;
}

function _fmtStateStatus(contract, key) {
  const row = contract?.[key];
  if (!row || typeof row !== 'object') return 'N/A';
  const status = String(row.status || 'unavailable').toUpperCase();
  const reason = row.reason ? ` · ${row.reason}` : '';
  return `${status}${reason}`;
}

function _boolText(v) {
  return v ? 'YES' : 'NO';
}

function buildV4SlotShell() {
  if (!_useFeaturesV4()) return '';
  return `<div id="rv-v4-slot"><div class="section section-full" style="opacity:.5"><h2>🧭 v4 Governance (Shadow)</h2><div class="placeholder-card">Loading v4 evaluation…</div></div></div>`;
}

function isFeaturesV4Enabled() {
  return _useFeaturesV4();
}

async function buildV4GovernanceInsight(ticker, context = {}) {
  if (!_useFeaturesV4()) return '';
  const insights = await _loadInsights(ticker);
  const hasV4Contract = Boolean(insights?.v4_contract) && _v4ContractValid(insights);
  const contract = hasV4Contract ? insights.v4_contract : (context?.evaluation_v4?.v4_contract || null);
  const usingFallbackContract = !hasV4Contract;
  if (!contract) {
    return `<div class="section section-full"><h2>🧭 v4 Governance (Shadow)</h2>
      <div class="placeholder-card">v4 contract unavailable — running canonical v1/v2 path.</div>
    </div>`;
  }

  const confluence = _v4StateValue(contract, 'timeframe_confluence');
  const fallback = _v4StateValue(contract, 'fallback_state');
  const drift = _v4StateValue(contract, 'drift_state');
  const eligibility = _v4StateValue(contract, 'scientific_eligibility');
  const raw = _v4StateValue(contract, 'raw_validation');
  const trace = _v4StateValue(contract, 'decision_trace');
  const outcomes = _v4StateValue(contract, 'outcome_labels');
  const maeMfe = _v4StateValue(contract, 'mae_mfe_summary');
  const quality = (typeof window !== 'undefined' && window._rvQualitySignals) || {};

  const confluenceStatus = confluence?.status || 'N/A';
  const fallbackVerdict = fallback?.verdict || 'WAIT';
  const fallbackConfidence = fallback?.confidence || 'LOW';
  const driftTier = drift?.tier || 'UNKNOWN';
  const metricMismatch = Boolean(quality.metricMismatch);
  const rrBlockedHorizons = Number(quality.rrBlockedHorizons || 0);
  const horizonVerdicts = Array.isArray(quality.horizonVerdicts) ? quality.horizonVerdicts.filter(Boolean) : [];
  const uniqueVerdicts = new Set(horizonVerdicts).size;
  let effectiveConfluence = 'MIXED';
  if (metricMismatch || rrBlockedHorizons > 0) effectiveConfluence = 'LOW_ALIGNMENT';
  else if (horizonVerdicts.length >= 3 && uniqueVerdicts <= 1) effectiveConfluence = 'HIGH_ALIGNMENT';
  else if (horizonVerdicts.length >= 2 && uniqueVerdicts <= 2) effectiveConfluence = 'MODERATE_ALIGNMENT';
  else effectiveConfluence = confluenceStatus;

  let integrity = raw?.valid ? 'CLEAN' : 'SUPPRESSED';
  if (metricMismatch) integrity = 'MISMATCH';
  if (!raw?.valid) integrity = 'SUPPRESSED';
  const forecastValidated = quality.forecastValidated !== false;
  const forecastIndependent = quality.forecastIndependent !== false;
  const decisionSuppressed = Boolean(quality.finalSuppressed);

  const rows = [
    { label: 'Confluence', value: effectiveConfluence, sub: `${confluence?.short || 'N/A'} / ${confluence?.mid || 'N/A'} / ${confluence?.long || 'N/A'}` },
    { label: 'Fallback', value: fallback?.active ? `${fallbackVerdict} (${fallbackConfidence})` : 'OFF', sub: _fmtStateStatus(contract, 'fallback_state') },
    { label: 'Drift Tier', value: driftTier, sub: _fmtStateStatus(contract, 'drift_state') },
    { label: 'Integrity', value: String(integrity).toUpperCase(), sub: metricMismatch ? 'canonical metric mismatch detected' : _fmtStateStatus(contract, 'raw_validation') },
    { label: 'Forecast Validation', value: forecastValidated ? 'COMPLETE' : 'INCOMPLETE', sub: forecastIndependent ? 'horizons independent' : 'horizon duplication suppressed' },
    { label: 'Decision Gate', value: decisionSuppressed ? 'SUPPRESSED' : (quality.overallAction || 'ACTIVE'), sub: rrBlockedHorizons > 0 ? `R:R blocked horizons: ${rrBlockedHorizons}` : 'R:R gate clear' },
    { label: 'Scientific Eligibility', value: eligibility?.trigger?.state || 'N/A', sub: _fmtStateStatus(contract, 'scientific_eligibility') },
    { label: 'MAE/MFE Samples', value: maeMfe?.sample_count ?? 'N/A', sub: _fmtStateStatus(contract, 'mae_mfe_summary') },
  ];

  const outcomeHtml = ['1d', '5d', '20d'].map((h) => {
    const row = outcomes?.[h];
    if (!row) return `<span style="color:var(--text-dim)">${h}: N/A</span>`;
    const label = row.label || 'N/A';
    const ret = row.gross_return != null ? `${row.gross_return >= 0 ? '+' : ''}${(row.gross_return * 100).toFixed(2)}%` : 'N/A';
    const col = label === 'BULLISH' ? 'var(--green)' : label === 'BEARISH' ? 'var(--red)' : 'var(--yellow)';
    return `<span><strong style="color:${col}">${h.toUpperCase()} ${label}</strong> <span style="color:var(--text-dim)">(${ret})</span></span>`;
  }).join(' · ');

  const reasonChain = Array.isArray(trace?.reason_chain) ? trace.reason_chain.slice(0, 8) : [];
  const gates = new Set(Array.isArray(trace?.gates_fired) ? trace.gates_fired : []);
  if (metricMismatch) gates.add('CANONICAL_METRIC_MISMATCH');
  if (rrBlockedHorizons > 0) gates.add('RR_GATE_BLOCK');
  if (!forecastValidated) gates.add('FORECAST_VALIDATION_INCOMPLETE');
  if (!forecastIndependent) gates.add('FORECAST_NON_INDEPENDENT');
  if (decisionSuppressed) gates.add('FINAL_VERDICT_SUPPRESSED');
  const gateList = Array.from(gates);

  return `<div class="section section-full"><h2>🧭 v4 Governance (Shadow)</h2>
    ${usingFallbackContract ? `<div style="margin-bottom:.45rem;padding:.4rem .55rem;border-radius:8px;background:rgba(251,191,36,.08);border:1px solid rgba(251,191,36,.35);font-size:.74rem;color:#fde68a">Using stock endpoint fallback contract (insights-v4 contract not available in this render cycle).</div>` : ''}
    <div style="display:flex;gap:.5rem;flex-wrap:wrap;margin-bottom:.6rem">
      <span class="prov-chip"><span class="dot ${fallback?.active ? 'cached' : 'ok'}"></span>Fallback active: ${_boolText(Boolean(fallback?.active))}</span>
      <span class="prov-chip"><span class="dot ${driftTier === 'RED' ? 'na' : driftTier === 'ORANGE' ? 'cached' : 'ok'}"></span>Drift: ${driftTier}</span>
      <span class="prov-chip"><span class="dot ${integrity === 'CLEAN' ? 'ok' : integrity === 'MISMATCH' ? 'cached' : 'na'}"></span>Integrity: ${integrity}</span>
      <span class="prov-chip">As-of: ${contract?.decision_trace?.as_of || contract?.scientific?.as_of || '—'}</span>
    </div>
    <div class="m-grid">
      ${rows.map((row) => `<div class="m-item"><div class="m-label">${row.label}</div><div class="m-val">${row.value}</div><div class="m-sub">${row.sub || ''}</div></div>`).join('')}
    </div>
    <div style="margin-top:.6rem;font-size:.78rem;color:var(--text-dim)">${outcomeHtml}</div>
    ${gateList.length ? `<div style="margin-top:.5rem;font-size:.74rem;color:var(--yellow)">Gates: ${gateList.join(', ')}</div>` : ''}
    ${reasonChain.length ? `<div style="margin-top:.3rem;font-size:.72rem;color:var(--text-muted)">Trace: ${reasonChain.join(' → ')}</div>` : ''}
  </div>`;
}
