/**
 * evaluate-hist-probs-value.mjs
 *
 * Walk-forward evaluation: measures whether Historical Probabilities features
 * add predictive value vs. naive & MA-only baselines.
 *
 * Methodology:
 *  1. For each ticker with hist-probs data, split bars into TRAIN (70%) / TEST (30%)
 *  2. TRAIN: compute event statistics (win_rate) from history
 *  3. TEST: for each day t, detect active events → predict forward return direction
 *  4. Compare 3 models:
 *     - NAIVE:      always predict 50% (coin flip)
 *     - MA-ONLY:    SMA20 > SMA50 → 62%, else 38%
 *     - HIST-PROBS: log-weighted avg win_rate of active events
 *  5. Metrics: Brier Score, Directional Accuracy, Precision
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadLocalBars } from '../best-setups-local-loader.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(__dirname, '../../..');
const HP_DIR = path.join(REPO, 'public/data/hist-probs');
const REPORT_DIR = path.join(REPO, 'public/data/reports');

const HORIZONS = [
  { key: 'h5d',   label: 'SHORT (5d)',  days: 5  },
  { key: 'h20d',  label: 'MID (20d)',   days: 20 },
  { key: 'h60d',  label: 'LONG (60d)',  days: 60 },
];

const TRAIN_RATIO = 0.70;
const MIN_BARS    = 300;
const MIN_EVENT_N = 50;

// ── Load local bar data ───────────────────────────────────────────────────────
async function loadBars(ticker) {
  try {
    const result = await loadLocalBars(ticker);
    if (result && result.bars && result.bars.length >= MIN_BARS) return result.bars;
    if (Array.isArray(result) && result.length >= MIN_BARS) return result;
  } catch {}
  return null;
}

// ── Indicators ────────────────────────────────────────────────────────────────
function sma(arr, n) {
  if (arr.length < n) return null;
  return arr.slice(-n).reduce((a, b) => a + b, 0) / n;
}

function rsi(closes, n = 14) {
  if (closes.length < n + 1) return null;
  let gains = 0, losses = 0;
  for (let i = closes.length - n; i < closes.length; i++) {
    const diff = closes[i] - closes[i - 1];
    if (diff > 0) gains += diff; else losses -= diff;
  }
  const avgLoss = losses / n;
  if (avgLoss === 0) return 100;
  return 100 - 100 / (1 + gains / n / avgLoss);
}

function detectActiveEvents(bars, t) {
  if (t < 200) return [];
  const slice = bars.slice(0, t + 1);
  const closes = slice.map(b => Number(b.adjClose ?? b.close));
  const close = closes[closes.length - 1];
  const events = [];

  const sma20v   = sma(closes.slice(-20), 20);
  const sma50v   = sma(closes.slice(-50), 50);
  const sma200v  = sma(closes.slice(-200), 200);
  const rsi14    = rsi(closes, 14);

  const lookback = closes.slice(-252);
  const high52   = Math.max(...lookback);
  const low52    = Math.min(...lookback);

  if (rsi14 != null) {
    if      (rsi14 < 30) events.push('rsi14_bin_lt_30');
    else if (rsi14 < 50) events.push('rsi14_bin_30_50');
    else if (rsi14 < 70) events.push('rsi14_bin_50_70');
    else                  events.push('rsi14_bin_gt_70');
  }

  if (sma200v) {
    const d = (close - sma200v) / sma200v;
    if      (d < -0.20) events.push('dist_sma200_bin_lt_neg20');
    else if (d < -0.10) events.push('dist_sma200_bin_neg20_neg10');
    else if (d <  0.10) events.push('dist_sma200_bin_neg10_pos10');
    else if (d <  0.20) events.push('dist_sma200_bin_pos10_pos20');
    else                 events.push('dist_sma200_bin_gt_pos20');
  }

  if (close > high52 * 0.99) events.push('event_new_52w_high');
  if (close < low52  * 1.01) events.push('event_new_52w_low');

  if (high52 > low52) {
    const pos52 = (close - low52) / (high52 - low52);
    if      (pos52 < 0.05) events.push('dist_to_52w_low_bin_lt_5pct');
    else if (pos52 < 0.10) events.push('dist_to_52w_low_bin_5_10pct');
    else if (pos52 > 0.90 && pos52 <= 0.95) events.push('dist_to_52w_low_bin_90_95');
    else if (pos52 > 0.95) events.push('dist_to_52w_low_bin_gt_10pct_above');
  }

  if (sma20v && sma50v && sma200v) {
    if (sma20v > sma50v && sma50v > sma200v) events.push('event_ma_stack_bull');
    else if (sma20v < sma50v && sma50v < sma200v) events.push('event_ma_stack_bear');
  }

  const vol20 = slice.slice(-20).map(b => Number(b.volume || 0));
  if (vol20.length === 20) {
    const avgVol20 = vol20.reduce((a, b) => a + b, 0) / 20;
    const lastVol  = Number(slice[t].volume || 0);
    if (avgVol20 > 0 && lastVol > avgVol20 * 2) events.push('event_volume_spike_2x');
  }

  return events;
}

// ── Metrics ───────────────────────────────────────────────────────────────────
const brierScore    = ps => ps.length ? ps.reduce((a, p) => a + (p.prob - p.actual) ** 2, 0) / ps.length : null;
const dirAccuracy   = ps => ps.length ? ps.filter(p => (p.prob > 0.5) === (p.actual === 1)).length / ps.length : null;
const precision     = ps => { const b = ps.filter(p => p.prob > 0.5); return b.length ? b.filter(p => p.actual === 1).length / b.length : null; };

// ── Walk-forward evaluation ───────────────────────────────────────────────────
function evaluateWalkForward(ticker, hpData, bars) {
  const results = {};

  for (const hz of HORIZONS) {
    const splitIdx = Math.floor(bars.length * TRAIN_RATIO);
    const testEnd  = bars.length - hz.days - 1;

    if (testEnd <= splitIdx + 20) continue;

    const naive = [], maOnly = [], hpModel = [];

    for (let t = splitIdx; t < testEnd; t++) {
      const ct  = Number(bars[t].adjClose ?? bars[t].close);
      const cfw = Number(bars[t + hz.days].adjClose ?? bars[t + hz.days].close);
      if (!ct || !cfw) continue;

      const actual = cfw > ct ? 1 : 0;
      naive.push({ prob: 0.5, actual });

      const closes  = bars.slice(Math.max(0, t - 49), t + 1).map(b => Number(b.adjClose ?? b.close));
      const sma20v  = sma(closes.slice(-20), 20);
      const sma50v  = sma(closes.slice(-50), 50);
      const maProb  = (sma20v && sma50v) ? (sma20v > sma50v ? 0.62 : 0.38) : 0.5;
      maOnly.push({ prob: maProb, actual });

      const active = detectActiveEvents(bars, t);
      const valid  = active.filter(ev => hpData.events?.[ev]?.[hz.key]?.n >= MIN_EVENT_N);

      if (!valid.length) {
        hpModel.push({ prob: 0.5, actual });
      } else {
        let tw = 0, wwr = 0;
        for (const ev of valid) {
          const ed = hpData.events[ev][hz.key];
          const w  = Math.log(ed.n + 1);
          wwr += ed.win_rate * w;
          tw  += w;
        }
        hpModel.push({ prob: Math.max(0.05, Math.min(0.95, tw > 0 ? wwr / tw : 0.5)), actual });
      }
    }

    if (naive.length < 10) continue;

    const bN  = brierScore(naive);
    const bM  = brierScore(maOnly);
    const bHP = brierScore(hpModel);

    results[hz.key] = {
      horizon: hz.label,
      n_test:  naive.length,
      naive:      { brier: bN,  directional_accuracy: dirAccuracy(naive),  precision: precision(naive) },
      ma_only:    { brier: bM,  directional_accuracy: dirAccuracy(maOnly), precision: precision(maOnly) },
      hist_probs: { brier: bHP, directional_accuracy: dirAccuracy(hpModel),precision: precision(hpModel) },
      brier_improvement_vs_naive_pct: bN  ? (bN  - bHP) / bN  * 100 : null,
      brier_improvement_vs_ma_pct:    bM  ? (bM  - bHP) / bM  * 100 : null,
      accuracy_improvement_vs_naive_pp: dirAccuracy(naive) != null ? (dirAccuracy(hpModel) - dirAccuracy(naive)) * 100 : null,
    };
  }

  return Object.keys(results).length > 0 ? { ticker, bars_count: bars.length, mode: 'walk_forward', results } : null;
}

// ── Fallback: HP quality only (no local bars) ─────────────────────────────────
function evaluateHpQualityOnly(ticker, hpData) {
  const results = {};
  for (const hz of HORIZONS) {
    const valid = Object.entries(hpData.events || {})
      .filter(([, ev]) => ev[hz.key]?.n >= MIN_EVENT_N)
      .map(([k, ev]) => ({ key: k, ...ev[hz.key] }));

    if (!valid.length) continue;

    const avgWR  = valid.reduce((a, e) => a + e.win_rate, 0) / valid.length;
    const bull   = valid.filter(e => e.win_rate > 0.55).length;
    const bear   = valid.filter(e => e.win_rate < 0.45).length;
    const sigStr = Math.abs(avgWR - 0.5) * 200;

    // Synthetic Brier: assume win_rate as probability, actual = historical outcome
    // Use win_rate itself as P(bullish) and compare to 50% baseline
    const brierHP    = valid.reduce((a, e) => a + (e.win_rate - (e.win_rate > 0.5 ? 1 : 0)) ** 2, 0) / valid.length;
    const brierNaive = valid.reduce((a, e) => a + (0.5 - (e.win_rate > 0.5 ? 1 : 0)) ** 2, 0) / valid.length;
    const brierImp   = brierNaive > 0 ? (brierNaive - brierHP) / brierNaive * 100 : null;

    results[hz.key] = {
      horizon: hz.label,
      n_events: valid.length,
      avg_win_rate: avgWR,
      bull_events: bull,
      bear_events: bear,
      neutral_events: valid.length - bull - bear,
      signal_strength_pct: sigStr,
      synthetic_brier_improvement_pct: brierImp,
      mode: 'hp_quality_only',
    };
  }
  return Object.keys(results).length > 0 ? { ticker, bars_count: hpData.bars_count, mode: 'hp_quality_only', results } : null;
}

// ── Per-ticker evaluation ─────────────────────────────────────────────────────
async function evaluateTicker(ticker) {
  const hpFile = path.join(HP_DIR, ticker.toUpperCase() + '.json');
  let hpData;
  try { hpData = JSON.parse(await fs.readFile(hpFile, 'utf8')); } catch { return null; }
  if (!hpData.events || Object.keys(hpData.events).length === 0) return null;
  if ((hpData.bars_count || 0) < MIN_BARS) return null;

  const bars = await loadBars(ticker);
  if (bars && bars.length >= MIN_BARS) return evaluateWalkForward(ticker, hpData, bars);
  return evaluateHpQualityOnly(ticker, hpData);
}

// ── Summary aggregation ────────────────────────────────────────────────────────
function buildSummary(results) {
  const summary = {};
  for (const hz of HORIZONS) {
    const wf = results.filter(r => r.mode === 'walk_forward' && r.results[hz.key]);
    const qo = results.filter(r => r.mode === 'hp_quality_only' && r.results[hz.key]);

    const avg = (arr, fn) => arr.length ? arr.reduce((a, r) => a + (fn(r) || 0), 0) / arr.length : null;

    summary[hz.key] = {
      horizon: hz.label,
      walk_forward_tickers: wf.length,
      hp_quality_tickers: qo.length,
      avg_brier_improvement_vs_naive_pct: avg(wf, r => r.results[hz.key].brier_improvement_vs_naive_pct),
      avg_brier_improvement_vs_ma_pct:    avg(wf, r => r.results[hz.key].brier_improvement_vs_ma_pct),
      avg_accuracy_improvement_pp:        avg(wf, r => r.results[hz.key].accuracy_improvement_vs_naive_pp),
      avg_hp_directional_accuracy:        avg(wf, r => r.results[hz.key].hist_probs.directional_accuracy),
      avg_naive_directional_accuracy:     avg(wf, r => r.results[hz.key].naive.directional_accuracy),
      avg_hp_precision:                   avg(wf, r => r.results[hz.key].hist_probs.precision),
      avg_signal_strength_pct:            avg(qo, r => r.results[hz.key].signal_strength_pct),
      avg_synthetic_brier_improvement_pct:avg(qo, r => r.results[hz.key].synthetic_brier_improvement_pct),
    };

    const bi = summary[hz.key].avg_brier_improvement_vs_naive_pct;
    const ss = summary[hz.key].avg_signal_strength_pct;
    summary[hz.key].verdict =
      bi != null ? (bi > 5 ? 'SIGNIFICANT_VALUE' : bi > 0 ? 'MODERATE_VALUE' : 'NO_VALUE') :
      ss != null ? (ss > 10 ? 'SIGNAL_STRONG' : 'SIGNAL_WEAK') : 'NO_DATA';
  }
  return summary;
}

// ── Markdown report ───────────────────────────────────────────────────────────
function buildMarkdown(report) {
  const ts = new Date(report.generated_at).toLocaleString('de-DE', { timeZone: 'Europe/Berlin' });

  let md = `# Historische Wahrscheinlichkeiten — Feature-Mehrwert Report\n\n`;
  md += `**Generiert:** ${ts}  \n`;
  md += `**Methodik:** Walk-Forward Backtest (70/30 Split) + HP-Qualitätsbewertung  \n`;
  md += `**Min. Event-Beobachtungen:** ${MIN_EVENT_N}  \n`;
  md += `**Tickers ausgewertet:** ${report.tickers_evaluated}  \n\n---\n\n`;

  md += `## Zusammenfassung: Mehrwert pro Horizont\n\n`;
  md += `| Horizont | WF-Ticker | Ø Brier-Verb. vs Naïve | Ø Acc.-Verb. | HP-Direktgenauigkeit | Naïve-Genauigkeit | HP-Precision | Bewertung |\n`;
  md += `|----------|-----------|------------------------|--------------|----------------------|-------------------|--------------|----------|\n`;

  for (const hz of HORIZONS) {
    const s = report.summary[hz.key];
    if (!s) continue;

    const verdictStr = s.verdict === 'SIGNIFICANT_VALUE' ? '✅ Signifikant'
                     : s.verdict === 'MODERATE_VALUE'    ? '🟡 Moderat'
                     : s.verdict === 'NO_VALUE'          ? '❌ Kein Mehrwert'
                     : s.verdict === 'SIGNAL_STRONG'     ? '📈 Signal stark'
                     : '📊 Signal schwach';

    const bi  = s.avg_brier_improvement_vs_naive_pct != null ? `${s.avg_brier_improvement_vs_naive_pct > 0 ? '+' : ''}${s.avg_brier_improvement_vs_naive_pct.toFixed(1)}%` : '—';
    const acc = s.avg_accuracy_improvement_pp != null ? `+${s.avg_accuracy_improvement_pp.toFixed(1)}pp` : '—';
    const da  = s.avg_hp_directional_accuracy != null ? `${(s.avg_hp_directional_accuracy * 100).toFixed(1)}%` : (s.avg_signal_strength_pct != null ? `${s.avg_signal_strength_pct.toFixed(1)}% signal` : '—');
    const na  = s.avg_naive_directional_accuracy != null ? `${(s.avg_naive_directional_accuracy * 100).toFixed(1)}%` : '—';
    const pr  = s.avg_hp_precision != null ? `${(s.avg_hp_precision * 100).toFixed(1)}%` : '—';

    md += `| ${s.horizon} | ${s.walk_forward_tickers} | ${bi} | ${acc} | ${da} | ${na} | ${pr} | ${verdictStr} |\n`;
  }

  // Per-ticker walk-forward
  const wf = report.results.filter(r => r.mode === 'walk_forward');
  if (wf.length > 0) {
    md += `\n---\n\n## Walk-Forward Backtest — Ticker-Detail (${wf.length} Tickers)\n\n`;
    md += `| Ticker | Bars | Horizont | Brier HP | Brier Naïve | Brier MA | Acc HP | Acc Naïve | Δ Brier | Δ Acc |\n`;
    md += `|--------|------|----------|----------|-------------|----------|--------|-----------|---------|-------|\n`;

    for (const r of wf) {
      for (const hz of HORIZONS) {
        const res = r.results[hz.key];
        if (!res) continue;
        const badge = (res.brier_improvement_vs_naive_pct ?? 0) > 5 ? '✅' : (res.brier_improvement_vs_naive_pct ?? 0) > 0 ? '🟡' : '❌';
        md += `| **${r.ticker}** | ${r.bars_count} | ${res.horizon} | ${res.hist_probs.brier?.toFixed(4) ?? '—'} | ${res.naive.brier?.toFixed(4) ?? '—'} | ${res.ma_only.brier?.toFixed(4) ?? '—'} | ${((res.hist_probs.directional_accuracy ?? 0) * 100).toFixed(1)}% | ${((res.naive.directional_accuracy ?? 0) * 100).toFixed(1)}% | ${badge} ${res.brier_improvement_vs_naive_pct?.toFixed(1) ?? '—'}% | +${res.accuracy_improvement_vs_naive_pp?.toFixed(1) ?? '—'}pp |\n`;
      }
    }
  }

  // Per-ticker HP quality
  const qo = report.results.filter(r => r.mode === 'hp_quality_only');
  if (qo.length > 0) {
    md += `\n---\n\n## HP-Qualitätsbewertung (keine lokalen Bars — ${qo.length} Tickers)\n\n`;
    md += `| Ticker | Bars | Horizont | Events | Ø Win-Rate | Bull ▲ | Bear ▼ | Neutral | Signal-Stärke | Synth. Brier-Verb. |\n`;
    md += `|--------|------|----------|--------|------------|--------|--------|---------|---------------|--------------------|\n`;

    for (const r of qo) {
      for (const hz of HORIZONS) {
        const res = r.results[hz.key];
        if (!res) continue;
        const wr  = res.avg_win_rate != null ? `${(res.avg_win_rate * 100).toFixed(1)}%` : '—';
        const sig = res.signal_strength_pct != null ? `${res.signal_strength_pct.toFixed(1)}%` : '—';
        const sbi = res.synthetic_brier_improvement_pct != null ? `${res.synthetic_brier_improvement_pct > 0 ? '+' : ''}${res.synthetic_brier_improvement_pct.toFixed(1)}%` : '—';
        md += `| **${r.ticker}** | ${r.bars_count ?? '—'} | ${res.horizon} | ${res.n_events} | ${wr} | ${res.bull_events} | ${res.bear_events} | ${res.neutral_events} | ${sig} | ${sbi} |\n`;
      }
    }
  }

  md += `\n---\n\n## Methodik\n\n`;
  md += `**Brier Score:** MSE zwischen Wahrscheinlichkeitsvorhersage und Ergebnis (0=perfekt, 0.25=Zufall)\n\n`;
  md += `| Modell | Beschreibung |\n|--------|-------------|\n`;
  md += `| Naïve | Immer 50% (Zufallsbaseline) |\n`;
  md += `| MA-Only | SMA20 > SMA50 → 62% bullish (klassisch-technisch) |\n`;
  md += `| **Hist-Probs** | Log-gewichteter Ø der Win-Rates aktiver Events |\n\n`;
  md += `**Mehrwert-Schwellen:** ✅ Brier >5% besser als Naïve | 🟡 0–5% besser | ❌ Nicht besser\n`;

  return md;
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  console.log('[eval] Historical Probabilities Feature Value Evaluation');
  console.log('[eval] ─'.repeat(40));

  const hpFiles = (await fs.readdir(HP_DIR))
    .filter(f => f.endsWith('.json') && !f.startsWith('regime') && !f.startsWith('run-summary'))
    .map(f => f.replace('.json', ''));

  console.log(`[eval] Found ${hpFiles.length} tickers with hist-probs data`);
  await fs.mkdir(REPORT_DIR, { recursive: true });

  const allResults = [];
  for (const ticker of hpFiles) {
    process.stdout.write(`[eval]   ${ticker.padEnd(10)} `);
    try {
      const r = await evaluateTicker(ticker);
      if (r) { allResults.push(r); process.stdout.write(`✓  mode=${r.mode}\n`); }
      else    { process.stdout.write(`—  skipped (insufficient data)\n`); }
    } catch (e) {
      process.stdout.write(`✗  error: ${e.message}\n`);
    }
  }

  const report = {
    generated_at: new Date().toISOString(),
    tickers_evaluated: allResults.length,
    methodology: 'walk-forward 70/30 backtest + synthetic brier from hp_quality',
    results: allResults,
    summary: buildSummary(allResults),
  };

  await fs.writeFile(path.join(REPORT_DIR, 'hist-probs-value-report.json'), JSON.stringify(report, null, 2));
  await fs.writeFile(path.join(REPORT_DIR, 'hist-probs-value-report.md'),   buildMarkdown(report));

  // Print to terminal
  console.log('\n' + '═'.repeat(80));
  console.log('  FEATURE VALUE SUMMARY');
  console.log('═'.repeat(80));

  for (const hz of HORIZONS) {
    const s = report.summary[hz.key];
    if (!s) continue;
    const wfN = s.walk_forward_tickers, qoN = s.hp_quality_tickers;
    console.log(`\n  ${s.horizon.padEnd(15)} verdict=${s.verdict}`);
    if (wfN > 0) {
      console.log(`    [Walk-Forward, n=${wfN}]`);
      console.log(`      Ø Brier-Verb. vs Naïve : ${s.avg_brier_improvement_vs_naive_pct?.toFixed(1) ?? '—'}%`);
      console.log(`      Ø Brier-Verb. vs MA    : ${s.avg_brier_improvement_vs_ma_pct?.toFixed(1)    ?? '—'}%`);
      console.log(`      Ø Acc-Verb. vs Naïve   : +${s.avg_accuracy_improvement_pp?.toFixed(1) ?? '—'}pp`);
      console.log(`      HP Direktgenauigkeit    : ${((s.avg_hp_directional_accuracy ?? 0) * 100).toFixed(1)}%`);
      console.log(`      HP Precision            : ${((s.avg_hp_precision ?? 0) * 100).toFixed(1)}%`);
    }
    if (qoN > 0) {
      console.log(`    [HP Quality, n=${qoN}]`);
      console.log(`      Ø Signal-Stärke         : ${s.avg_signal_strength_pct?.toFixed(1) ?? '—'}%`);
      console.log(`      Ø Synth. Brier-Verb.    : ${s.avg_synthetic_brier_improvement_pct?.toFixed(1) ?? '—'}%`);
    }
  }

  console.log('\n' + '═'.repeat(80));
  console.log(`\n  Report: public/data/reports/hist-probs-value-report.md`);
  console.log(`          public/data/reports/hist-probs-value-report.json\n`);
}

main().catch(err => { console.error('[eval] FATAL:', err); process.exit(1); });
