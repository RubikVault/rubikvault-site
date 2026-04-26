#!/usr/bin/env node
/**
 * build-signal-performance-report.mjs
 *
 * Reads outcome NDJSON files (last 30 days + 30-day horizon buffer) from:
 *   mirrors/learning/outcomes/{forecast,scientific,stock_analyzer,elliott}/YYYY/MM/YYYY-MM-DD.ndjson
 *
 * Outputs: public/data/reports/signal-performance-latest.json
 */

import fs from 'fs';
import path from 'path';
import { createInterface } from 'readline';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = process.env.RUBIKVAULT_ROOT || path.resolve(__dirname, '../..');

const OUTCOMES_ROOT = path.join(REPO_ROOT, 'mirrors/learning/outcomes');
const OUTPUT_PATH = path.join(REPO_ROOT, 'public/data/reports/signal-performance-latest.json');
const FEATURES = ['forecast', 'scientific', 'stock_analyzer', 'elliott'];

// 30-day signal window + 30-day horizon buffer = read files from 60 days ago onward
const WINDOW_DAYS = 30;
const HORIZON_BUFFER_DAYS = 30;
const LOOKBACK_DAYS = WINDOW_DAYS + HORIZON_BUFFER_DAYS;

function isBuySignal(row) {
  if (row.feature === 'stock_analyzer') {
    return row.buy_eligible === true || row.verdict === 'BUY';
  }
  // forecast, scientific, elliott: direction=bullish is the buy proxy
  return String(row.direction || '').toLowerCase() === 'bullish';
}

function dateStr(daysAgo) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - daysAgo);
  return d.toISOString().slice(0, 10);
}

function collectFilePaths(feature, cutoffDate) {
  const featureDir = path.join(OUTCOMES_ROOT, feature);
  const files = [];
  if (!fs.existsSync(featureDir)) return files;
  for (const year of fs.readdirSync(featureDir).sort()) {
    const yearDir = path.join(featureDir, year);
    if (!fs.statSync(yearDir).isDirectory()) continue;
    for (const month of fs.readdirSync(yearDir).sort()) {
      const monthDir = path.join(yearDir, month);
      if (!fs.statSync(monthDir).isDirectory()) continue;
      for (const file of fs.readdirSync(monthDir).sort()) {
        if (!file.endsWith('.ndjson')) continue;
        const fileDate = file.replace('.ndjson', '');
        if (fileDate >= cutoffDate) files.push(path.join(monthDir, file));
      }
    }
  }
  return files;
}

async function readNdjsonFile(filePath) {
  const rows = [];
  const rl = createInterface({ input: fs.createReadStream(filePath), crlfDelay: Infinity });
  for await (const line of rl) {
    if (!line.trim()) continue;
    try { rows.push(JSON.parse(line)); } catch { /* skip malformed */ }
  }
  return rows;
}

function computeAccuracy(rows) {
  // { feature -> { horizon -> { total, correct } } }
  const acc = {};
  for (const row of rows) {
    if (!isBuySignal(row)) continue;
    if (row.predicted_direction_correct == null) continue;
    const f = row.feature || 'unknown';
    const h = row.horizon || 'unknown';
    if (!acc[f]) acc[f] = {};
    if (!acc[f][h]) acc[f][h] = { total: 0, correct: 0 };
    acc[f][h].total += 1;
    if (row.predicted_direction_correct === true) acc[f][h].correct += 1;
  }
  // Convert to accuracy rates
  const result = {};
  for (const [f, horizons] of Object.entries(acc)) {
    result[f] = {};
    for (const [h, counts] of Object.entries(horizons)) {
      result[f][h] = {
        total: counts.total,
        total_buy_signals: counts.total,
        correct: counts.correct,
        accuracy: counts.total > 0 ? Math.round((counts.correct / counts.total) * 1000) / 1000 : null,
      };
    }
  }
  return result;
}

function collectFalsePositives(rows, limit = 20) {
  return rows
    .filter(r => isBuySignal(r) && r.predicted_direction_correct === false)
    .sort((a, b) => (b.date || '').localeCompare(a.date || ''))
    .slice(0, limit)
    .map(r => ({
      ticker: r.ticker,
      feature: r.feature,
      horizon: r.horizon,
      date: r.date,
      direction: r.direction,
      probability: r.probability ?? r.raw_probability ?? null,
      outcome_date: r.outcome_date,
      actual_return: r.actual_return ?? null,
    }));
}

function buildImprovementNotes(accuracy) {
  const notes = [];
  for (const [feature, horizons] of Object.entries(accuracy)) {
    for (const [horizon, stats] of Object.entries(horizons)) {
      if (stats.total_buy_signals < 5) continue;
      if (stats.accuracy != null && stats.accuracy < 0.5) {
        notes.push(`${feature}/${horizon}: accuracy ${(stats.accuracy * 100).toFixed(1)}% on ${stats.total_buy_signals} BUY signals — below 50% baseline, review signal threshold.`);
      } else if (stats.accuracy != null && stats.accuracy >= 0.65) {
        notes.push(`${feature}/${horizon}: strong accuracy ${(stats.accuracy * 100).toFixed(1)}% on ${stats.total_buy_signals} BUY signals.`);
      }
    }
  }
  return notes;
}

async function main() {
  const cutoffDate = dateStr(LOOKBACK_DAYS);
  const signalCutoffDate = dateStr(WINDOW_DAYS);
  console.log(`[signal-performance] Reading outcomes from ${cutoffDate} onward (signal window: ${signalCutoffDate})`);

  const allRows = [];
  for (const feature of FEATURES) {
    const files = collectFilePaths(feature, cutoffDate);
    console.log(`[signal-performance] ${feature}: ${files.length} files`);
    for (const f of files) {
      const rows = await readNdjsonFile(f);
      // Only include rows where the signal date is within the 30-day signal window
      for (const row of rows) {
        if ((row.date || '') >= signalCutoffDate) allRows.push(row);
      }
    }
  }

  console.log(`[signal-performance] Total rows in window: ${allRows.length}`);

  const accuracy = computeAccuracy(allRows);
  const falseBuys = collectFalsePositives(allRows);
  const improvementNotes = buildImprovementNotes(accuracy);

  const totalBuySignals = allRows.filter(isBuySignal).length;
  const correctBuys = allRows.filter(r => isBuySignal(r) && r.predicted_direction_correct === true).length;

  const report = {
    generated_at: new Date().toISOString(),
    data_source: 'mirrors/learning/outcomes',
    period: {
      signal_window_days: WINDOW_DAYS,
      signal_cutoff_date: signalCutoffDate,
      outcome_lookback_cutoff: cutoffDate,
    },
    summary: {
      total_buy_signals: totalBuySignals,
      correct_buy_signals: correctBuys,
      overall_accuracy: totalBuySignals > 0 ? Math.round((correctBuys / totalBuySignals) * 1000) / 1000 : null,
    },
    buy_accuracy: accuracy,
    accuracy_by_feature_horizon: accuracy,
    false_buys_recent: falseBuys,
    false_positives_recent: falseBuys,
    improvement_notes: improvementNotes,
  };

  const outDir = path.dirname(OUTPUT_PATH);
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(report, null, 2));
  console.log(`[signal-performance] Written: ${OUTPUT_PATH}`);
}

main().catch(err => { console.error(err); process.exit(1); });
