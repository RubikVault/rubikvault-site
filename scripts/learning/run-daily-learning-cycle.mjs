#!/usr/bin/env node
/**
 * RubikVault — Daily Learning Cycle
 *
 * Unified learning system for all 4 features:
 *  1. Forecast     — Champion/Challenger probabilities
 *  2. Scientific    — Setup/Trigger predictions
 *  3. Elliott Waves — Wave direction forecasts
 *  4. Stock Analyzer — Ranking stability tracking
 *
 * Run: node scripts/learning/run-daily-learning-cycle.mjs [--date=YYYY-MM-DD]
 */

import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import {
    brierScore, accuracy, hitRate, trend, rollingAverage,
    round, trendEmoji, isoDate, daysAgo
} from './lib/metrics.mjs';

// ─── Paths ──────────────────────────────────────────────────────────────────
const ROOT = process.cwd();
const LEARNING = path.join(ROOT, 'mirrors/learning');
const PRED_DIR = path.join(LEARNING, 'predictions');
const OUTCOME_DIR = path.join(LEARNING, 'outcomes');
const REPORT_DIR = path.join(LEARNING, 'reports');
const CALIB_DIR = path.join(LEARNING, 'calibration');
const PUBLIC_REPORT = path.join(ROOT, 'public/data/reports/learning-report-latest.json');

const FORECAST_LEDGER = path.join(ROOT, 'mirrors/forecast/ledger');
const SCIENTIFIC_SUMMARY = path.join(ROOT, 'public/data/supermodules/scientific-summary.json');
const EOD_BATCH = path.join(ROOT, 'public/data/eod/batches/eod.latest.000.json');
const V7_STOCK_ROWS = path.join(ROOT, 'public/data/universe/v7/ssot/stocks.max.rows.json');

// ─── Helpers ────────────────────────────────────────────────────────────────
function ensureDir(p) { fs.mkdirSync(path.dirname(p), { recursive: true }); }

function readJson(p) {
    try { return JSON.parse(fs.readFileSync(p, 'utf8')); }
    catch { return null; }
}

function readNdjson(p) {
    try {
        let text;
        if (p.endsWith('.gz')) {
            text = zlib.gunzipSync(fs.readFileSync(p)).toString('utf8');
        } else {
            text = fs.readFileSync(p, 'utf8');
        }
        return text.split('\n')
            .filter(l => l.trim())
            .map(l => { try { return JSON.parse(l); } catch { return null; } })
            .filter(Boolean);
    } catch { return []; }
}

function writeJson(p, data) {
    ensureDir(p);
    const tmp = p + `.${process.pid}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
    fs.renameSync(tmp, p);
}

function writeNdjson(p, rows) {
    ensureDir(p);
    fs.writeFileSync(p, rows.map(r => JSON.stringify(r)).join('\n') + '\n');
}

function predPath(date, feature) {
    const [y, m] = date.split('-');
    return path.join(PRED_DIR, feature, y, m, `${date}.ndjson`);
}

function outcomePath(date, feature) {
    const [y, m] = date.split('-');
    return path.join(OUTCOME_DIR, feature, y, m, `${date}.ndjson`);
}

function reportPath(date) {
    return path.join(REPORT_DIR, `${date}.json`);
}

function calibPath(feature) {
    return path.join(CALIB_DIR, `${feature}.json`);
}

function loadCalib(feature) {
    return readJson(calibPath(feature)) || { weights: {}, hit_rates: {}, updated: null };
}

function saveCalib(feature, calib) {
    calib.updated = new Date().toISOString();
    writeJson(calibPath(feature), calib);
}

// ─── EOD Price Loader ───────────────────────────────────────────────────────
function loadEodPrices() {
    const doc = readJson(EOD_BATCH);
    if (!doc?.data) return {};
    const prices = {};
    for (const [ticker, bar] of Object.entries(doc.data)) {
        if (bar?.close && Number.isFinite(bar.close)) {
            prices[ticker.toUpperCase()] = {
                close: bar.close,
                open: bar.open ?? bar.close,
                high: bar.high ?? bar.close,
                low: bar.low ?? bar.close,
                date: bar.date ?? null
            };
        }
    }
    return prices;
}

// ─── 1. FORECAST: Extract Predictions ───────────────────────────────────────
function extractForecastPredictions(date) {
    // Forecast ledger uses gzipped monthly NDJSON: forecasts/YYYY/MM.ndjson.gz
    const [y, m] = date.split('-');
    const gzPath = path.join(FORECAST_LEDGER, 'forecasts', y, `${m}.ndjson.gz`);
    const plainPath = path.join(FORECAST_LEDGER, 'forecasts', y, m, `${date}.ndjson`);

    let rows = readNdjson(gzPath);
    if (!rows.length) rows = readNdjson(plainPath);

    // Filter to only this date's entries
    const dayRows = rows.filter(r => {
        const rDate = r.trading_date || r.date || r.as_of || '';
        return rDate.startsWith(date);
    });

    return dayRows.map(r => ({
        feature: 'forecast',
        ticker: String(r.ticker || r.symbol || '').toUpperCase(),
        date,
        horizon: r.horizon || '1d',
        direction: r.direction || (r.p_up >= 0.5 ? 'bullish' : 'bearish'),
        probability: r.p_up ?? r.probability ?? 0.5,
        confidence: r.confidence ?? r.conf ?? null,
        price_at_prediction: r.price_at_forecast ?? r.close ?? null,
        model_id: r.champion_id ?? r.model_id ?? null,
        source: 'forecast_ledger'
    })).filter(r => r.ticker);
}

// ─── 2. SCIENTIFIC: Extract Setup/Trigger Predictions ───────────────────────
function extractScientificPredictions(date, eodPrices) {
    const doc = readJson(SCIENTIFIC_SUMMARY);
    if (!doc) return [];

    // Scientific summary has strong_signals and best_setups arrays
    const signals = Array.isArray(doc.strong_signals) ? doc.strong_signals : [];
    const setups = Array.isArray(doc.best_setups) ? doc.best_setups : [];

    // Merge both lists, dedup by ticker (prefer strong_signals)
    const seen = new Set();
    const items = [];
    for (const item of [...signals, ...setups]) {
        const ticker = String(item.symbol || item.ticker || '').toUpperCase();
        if (!ticker || seen.has(ticker)) continue;
        seen.add(ticker);
        items.push(item);
    }

    return items.map(item => {
        const ticker = String(item.symbol || item.ticker || '').toUpperCase();
        const price = eodPrices[ticker]?.close ?? item.price ?? null;
        const setup = item.setup || {};
        const trigger = item.trigger || {};
        const setupMet = setup.met ?? setup.setup_met ?? (item.signal_strength > 50);
        const triggerMet = trigger.met ?? trigger.trigger_met ?? (item.signal_strength > 70);
        const prob = item.probability ?? null;
        const direction = prob != null ? (prob > 0.5 ? 'bullish' : 'bearish') : 'neutral';

        return {
            feature: 'scientific',
            ticker,
            date,
            horizon: '5d',
            setup_met: Boolean(setupMet),
            trigger_met: Boolean(triggerMet),
            setup_score: item.signal_strength ?? null,
            probability: prob ?? (triggerMet ? 0.65 : setupMet ? 0.55 : 0.45),
            direction,
            price_at_prediction: price,
            source: 'scientific_summary'
        };
    }).filter(r => r.ticker);
}

// ─── 3. ELLIOTT: Extract Wave Predictions ───────────────────────────────────
function extractElliottPredictions(date, eodPrices) {
    // Read from marketphase deep summary (same data the Elliott API uses)
    const deepPath = path.join(ROOT, 'public/data/universe/v7/read_models/marketphase_deep_summary.json');
    const doc = readJson(deepPath);
    const items = doc?.items || [];

    if (!items.length) {
        // Fallback: use EOD heuristic (same logic as elliott-scanner.js estimateWaveFromEOD)
        return Object.entries(eodPrices).slice(0, 500).map(([ticker, bar]) => {
            const range = bar.high - bar.low;
            const posInRange = range > 0 ? (bar.close - bar.low) / range : 0.5;
            const dayChange = bar.open > 0 ? (bar.close - bar.open) / bar.open : 0;
            const direction = dayChange >= 0 ? 'bullish' : 'bearish';
            let wavePosition, confidence;
            if (posInRange > 0.8) { wavePosition = direction === 'bullish' ? 'in-correction' : 'pre-wave-3'; confidence = 0.35; }
            else if (posInRange < 0.2) { wavePosition = direction === 'bearish' ? 'in-correction' : 'pre-wave-3'; confidence = 0.35; }
            else if (posInRange > 0.5) { wavePosition = 'pre-wave-5'; confidence = 0.25; }
            else { wavePosition = 'wave-1-start'; confidence = 0.20; }

            return {
                feature: 'elliott',
                ticker,
                date,
                horizon: '5d',
                wave_position: wavePosition,
                direction,
                confidence,
                probability: direction === 'bullish' ? 0.5 + confidence / 2 : 0.5 - confidence / 2,
                price_at_prediction: bar.close,
                source: 'eod_heuristic'
            };
        });
    }

    return items.map(item => {
        const ticker = String(item.symbol || item.ticker || '').toUpperCase();
        const price = eodPrices[ticker]?.close ?? null;
        const direction = item.direction || 'neutral';
        const confidence = (item.confidence ?? 0) / 100;

        return {
            feature: 'elliott',
            ticker,
            date,
            horizon: '5d',
            wave_position: item.wavePosition || 'unknown',
            direction,
            confidence,
            probability: direction === 'bullish' ? 0.5 + confidence / 2 :
                direction === 'bearish' ? 0.5 - confidence / 2 : 0.5,
            price_at_prediction: price,
            source: 'marketphase_deep'
        };
    }).filter(r => r.ticker);
}

// ─── 4. STOCK ANALYZER: Extract Rankings ────────────────────────────────────
function extractStockRankings(date) {
    const doc = readJson(V7_STOCK_ROWS);
    if (!doc) return [];

    // Stock rows are wrapped: {items: [{symbol, score_0_100, bars_count, ...}]}
    const items = Array.isArray(doc) ? doc : (doc.items || []);
    if (!items.length) return [];

    // Take top 200 by score (items are pre-sorted)
    return items.slice(0, 200).map((row, idx) => ({
        feature: 'stock_analyzer',
        ticker: String(row.symbol || row.ticker || '').toUpperCase(),
        date,
        rank: idx + 1,
        quality_score: row.score_0_100 ?? row.quality_score ?? null,
        bars_count: row.bars_count ?? null,
        layer: row.layer ?? null,
        source: 'v7_stock_rows'
    })).filter(r => r.ticker);
}

// ─── Outcome Resolution ─────────────────────────────────────────────────────
function resolveOutcomes(date, feature, horizonDays, eodPrices) {
    const predDate = daysAgo(date, horizonDays);
    const preds = readNdjson(predPath(predDate, feature));
    if (!preds.length) return [];

    const calib = loadCalib(feature);
    const outcomes = [];

    for (const pred of preds) {
        const ticker = pred.ticker;
        const currentPrice = eodPrices[ticker]?.close;
        const predPrice = pred.price_at_prediction;

        if (!currentPrice || !predPrice || predPrice <= 0) continue;

        const actualReturn = (currentPrice - predPrice) / predPrice;
        const wentUp = actualReturn > 0;
        const y = wentUp ? 1 : 0;
        const p = pred.probability ?? 0.5;
        const predictedUp = p >= 0.5;
        const isCorrect = predictedUp === wentUp;

        const outcome = {
            ...pred,
            outcome_date: date,
            outcome_price: currentPrice,
            actual_return: round(actualReturn),
            went_up: wentUp,
            y,
            predicted_direction_correct: isCorrect,
            brier_contribution: round((p - y) ** 2),
        };

        // Feature-specific hit checks
        if (feature === 'scientific') {
            const threshold = 0.02; // 2% move = "breakout"
            outcome.hit = pred.trigger_met && Math.abs(actualReturn) >= threshold &&
                ((pred.direction === 'bullish' && actualReturn > 0) ||
                    (pred.direction === 'bearish' && actualReturn < 0));
        } else if (feature === 'elliott') {
            outcome.hit = isCorrect;
        } else {
            outcome.hit = isCorrect;
        }

        outcomes.push(outcome);

        // Update per-ticker calibration
        const key = `${ticker}_${pred.direction || 'any'}`;
        if (!calib.hit_rates[key]) calib.hit_rates[key] = { hits: 0, total: 0 };
        calib.hit_rates[key].total++;
        if (outcome.hit) calib.hit_rates[key].hits++;
    }

    if (outcomes.length) {
        writeNdjson(outcomePath(date, feature), outcomes);
        saveCalib(feature, calib);
    }

    return outcomes;
}

// ─── Stock Ranking Stability ────────────────────────────────────────────────
function computeRankingStability(date) {
    const today = readNdjson(predPath(date, 'stock_analyzer'));
    const yesterday = readNdjson(predPath(daysAgo(date, 1), 'stock_analyzer'));

    if (!today.length || !yesterday.length) return { stability: null, churn: null };

    const todayTop50 = new Set(today.filter(r => r.rank <= 50).map(r => r.ticker));
    const yesterdayTop50 = new Set(yesterday.filter(r => r.rank <= 50).map(r => r.ticker));

    let overlap = 0;
    for (const t of todayTop50) { if (yesterdayTop50.has(t)) overlap++; }

    const maxSize = Math.max(todayTop50.size, yesterdayTop50.size) || 1;
    return {
        stability: round(overlap / maxSize),
        churn: maxSize - overlap
    };
}

// ─── Load Historical Daily Metrics ──────────────────────────────────────────
function loadHistoricalMetrics(endDate, days) {
    const metrics = [];
    for (let i = 0; i < days; i++) {
        const d = daysAgo(endDate, i);
        const report = readJson(reportPath(d));
        if (report?.metrics) metrics.push({ date: d, ...report.metrics });
    }
    return metrics.reverse(); // oldest first
}

// ─── Compute Feature Metrics from Outcome History ───────────────────────────
function computeFeatureMetrics(feature, date, lookbackDays = 30) {
    const allOutcomes = [];
    for (let i = 0; i < lookbackDays; i++) {
        const d = daysAgo(date, i);
        allOutcomes.push(...readNdjson(outcomePath(d, feature)));
    }

    if (!allOutcomes.length) {
        return {
            predictions_total: 0,
            outcomes_resolved: 0,
            accuracy_all: null,
            brier_all: null,
            hit_rate_all: null,
            accuracy_7d: null,
            brier_7d: null,
            hit_rate_7d: null,
            trend_accuracy: 'no_data',
            trend_brier: 'no_data'
        };
    }

    const last7d = allOutcomes.filter(o => o.outcome_date >= daysAgo(date, 7));
    const prior7d = allOutcomes.filter(o => o.outcome_date >= daysAgo(date, 14) && o.outcome_date < daysAgo(date, 7));

    const pAll = allOutcomes.map(o => ({ p: o.probability ?? 0.5, y: o.y }));
    const p7d = last7d.map(o => ({ p: o.probability ?? 0.5, y: o.y }));
    const pPrior = prior7d.map(o => ({ p: o.probability ?? 0.5, y: o.y }));

    const acc7d = accuracy(p7d);
    const accPrior = accuracy(pPrior);
    const brier7d = brierScore(p7d);
    const brierPrior = brierScore(pPrior);

    return {
        predictions_total: allOutcomes.length,
        outcomes_resolved: allOutcomes.filter(o => o.y != null).length,
        accuracy_all: round(accuracy(pAll)),
        brier_all: round(brierScore(pAll)),
        hit_rate_all: round(hitRate(allOutcomes)),
        accuracy_7d: round(acc7d),
        brier_7d: round(brier7d),
        hit_rate_7d: round(hitRate(last7d)),
        trend_accuracy: trend(acc7d, accPrior, false),
        trend_brier: trend(brier7d, brierPrior, true),
    };
}

// ─── Report Builder ─────────────────────────────────────────────────────────
function buildReport(date, forecastMetrics, scientificMetrics, elliottMetrics, stockStability, predCounts) {
    return {
        schema: 'rubikvault_daily_learning_report_v1',
        date,
        generated_at: new Date().toISOString(),
        summary: {
            features_tracked: 4,
            total_predictions_today: (predCounts.forecast || 0) + (predCounts.scientific || 0) + (predCounts.elliott || 0),
            overall_status: determineOverallStatus(forecastMetrics, scientificMetrics, elliottMetrics)
        },
        features: {
            forecast: {
                name: 'Forecast System v3.0',
                type: 'price_direction_probability',
                ...forecastMetrics,
                predictions_today: predCounts.forecast || 0,
            },
            scientific: {
                name: 'Scientific Analyzer v9.1',
                type: 'setup_trigger_breakout',
                ...scientificMetrics,
                predictions_today: predCounts.scientific || 0,
            },
            elliott: {
                name: 'Elliott Waves DFMSIF v1.0',
                type: 'wave_direction_forecast',
                ...elliottMetrics,
                predictions_today: predCounts.elliott || 0,
            },
            stock_analyzer: {
                name: 'Stock Analyzer',
                type: 'ranking_stability',
                ...stockStability,
                rankings_today: predCounts.stock || 0,
            }
        },
        metrics: {
            forecast_accuracy_7d: forecastMetrics.accuracy_7d,
            forecast_brier_7d: forecastMetrics.brier_7d,
            scientific_hit_rate_7d: scientificMetrics.hit_rate_7d,
            elliott_accuracy_7d: elliottMetrics.accuracy_7d,
            stock_stability: stockStability.stability,
        }
    };
}

function determineOverallStatus(f, s, e) {
    const trends = [f.trend_accuracy, s.trend_accuracy, e.trend_accuracy].filter(t => t && t !== 'no_data');
    if (!trends.length) return 'BOOTSTRAP — Noch keine Outcome-Daten';
    const improving = trends.filter(t => t === 'improving').length;
    const declining = trends.filter(t => t === 'declining').length;
    if (improving > declining) return 'VERBESSERUNG ✅';
    if (declining > improving) return 'VERSCHLECHTERUNG 🔴';
    return 'STABIL ⚠️';
}

// ─── Console Report ─────────────────────────────────────────────────────────
function printReport(report) {
    const r = report;
    const line = '═'.repeat(65);
    console.log(`\n${line}`);
    console.log(`  RUBIKVAULT — DAILY LEARNING REPORT — ${r.date}`);
    console.log(`${line}\n`);
    console.log(`  Status: ${r.summary.overall_status}`);
    console.log(`  Vorhersagen heute: ${r.summary.total_predictions_today}\n`);

    for (const [key, feat] of Object.entries(r.features)) {
        console.log(`  📊 ${feat.name}`);
        if (feat.accuracy_7d != null) console.log(`     Accuracy (7d):  ${(feat.accuracy_7d * 100).toFixed(1)}%  ${trendEmoji(feat.trend_accuracy)}`);
        if (feat.brier_7d != null) console.log(`     Brier (7d):     ${feat.brier_7d}  ${trendEmoji(feat.trend_brier)}`);
        if (feat.hit_rate_7d != null) console.log(`     Hit Rate (7d):  ${(feat.hit_rate_7d * 100).toFixed(1)}%`);
        if (feat.stability != null) console.log(`     Ranking-Stabilität: ${(feat.stability * 100).toFixed(1)}%`);
        if (feat.accuracy_all != null) console.log(`     Accuracy (30d): ${(feat.accuracy_all * 100).toFixed(1)}%`);
        const count = feat.predictions_today ?? feat.rankings_today ?? 0;
        console.log(`     Heute: ${count} ${key === 'stock_analyzer' ? 'Rankings' : 'Vorhersagen'}`);
        if (!feat.accuracy_7d && !feat.stability) console.log(`     Status: — KEINE DATEN (Sammle Predictions...)`);
        console.log('');
    }

    console.log(`${line}`);
    console.log(`  Report: public/data/reports/learning-report-latest.json`);
    console.log(`  Web:    https://rubikvault.com/data/reports/learning-report-latest.json`);
    console.log(`${line}\n`);
}

// ─── Main ───────────────────────────────────────────────────────────────────
async function main() {
    const args = process.argv.slice(2);
    const dateArg = args.find(a => a.startsWith('--date='));
    const date = dateArg ? dateArg.split('=')[1] : isoDate(new Date());

    console.log(`[learning] Starting daily learning cycle for ${date}...`);

    // 1. Load current prices
    const eodPrices = loadEodPrices();
    console.log(`[learning] Loaded EOD prices for ${Object.keys(eodPrices).length} tickers`);

    // 2. Extract today's predictions from each feature
    console.log('[learning] Extracting predictions...');
    const forecastPreds = extractForecastPredictions(date);
    const scientificPreds = extractScientificPredictions(date, eodPrices);
    const elliottPreds = extractElliottPredictions(date, eodPrices);
    const stockPreds = extractStockRankings(date);

    // 3. Save predictions to ledger
    if (forecastPreds.length) writeNdjson(predPath(date, 'forecast'), forecastPreds);
    if (scientificPreds.length) writeNdjson(predPath(date, 'scientific'), scientificPreds);
    if (elliottPreds.length) writeNdjson(predPath(date, 'elliott'), elliottPreds);
    if (stockPreds.length) writeNdjson(predPath(date, 'stock_analyzer'), stockPreds);

    console.log(`[learning] Predictions logged: forecast=${forecastPreds.length} scientific=${scientificPreds.length} elliott=${elliottPreds.length} stock=${stockPreds.length}`);

    // 4. Resolve outcomes for past predictions
    console.log('[learning] Resolving outcomes...');
    const forecastOutcomes = resolveOutcomes(date, 'forecast', 1, eodPrices);
    const scientificOutcomes = resolveOutcomes(date, 'scientific', 5, eodPrices);
    const elliottOutcomes = resolveOutcomes(date, 'elliott', 5, eodPrices);

    console.log(`[learning] Outcomes resolved: forecast=${forecastOutcomes.length} scientific=${scientificOutcomes.length} elliott=${elliottOutcomes.length}`);

    // 5. Compute metrics (rolling 30d window)
    console.log('[learning] Computing metrics...');
    const forecastMetrics = computeFeatureMetrics('forecast', date);
    const scientificMetrics = computeFeatureMetrics('scientific', date);
    const elliottMetrics = computeFeatureMetrics('elliott', date);
    const stockStability = computeRankingStability(date);

    // 6. Build and save report
    const report = buildReport(date, forecastMetrics, scientificMetrics, elliottMetrics, stockStability, {
        forecast: forecastPreds.length,
        scientific: scientificPreds.length,
        elliott: elliottPreds.length,
        stock: stockPreds.length,
    });

    writeJson(reportPath(date), report);
    writeJson(path.join(REPORT_DIR, 'latest.json'), report);
    writeJson(PUBLIC_REPORT, report);

    // 7. Print human-readable report
    printReport(report);

    console.log('[learning] Daily learning cycle complete.');
}

main().catch(err => {
    console.error('[learning] FATAL:', err);
    process.exit(1);
});
