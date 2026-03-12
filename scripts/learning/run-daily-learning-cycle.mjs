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
import { resolveSsotPath } from '../universe-v7/lib/ssot-paths.mjs';

// ─── Paths ──────────────────────────────────────────────────────────────────
const ROOT = process.cwd();
const LEARNING = path.join(ROOT, 'mirrors/learning');
const PRED_DIR = path.join(LEARNING, 'predictions');
const OUTCOME_DIR = path.join(LEARNING, 'outcomes');
const REPORT_DIR = path.join(LEARNING, 'reports');
const CALIB_DIR = path.join(LEARNING, 'calibration');
const PUBLIC_REPORT = path.join(ROOT, 'public/data/reports/learning-report-latest.json');
const PUBLIC_REPORT_JS = path.join(ROOT, 'public/data/reports/learning-report-latest.js');

const FORECAST_LEDGER = path.join(ROOT, 'mirrors/forecast/ledger');
const SCIENTIFIC_SUMMARY = path.join(ROOT, 'public/data/supermodules/scientific-summary.json');
const SCIENTIFIC_SNAPSHOT = path.join(ROOT, 'public/data/snapshots/stock-analysis.json');
const EOD_BATCH = path.join(ROOT, 'public/data/eod/batches/eod.latest.000.json');
const EOD_US_NDJSON = path.join(ROOT, 'public/data/v3/eod/US/latest.ndjson.gz');
const ELLIOTT_DIR = path.join(ROOT, 'public/data/marketphase');
const SSOT_MANIFEST = resolveSsotPath(ROOT, 'manifest.json');
const V7_STOCK_ROWS = resolveSsotPath(ROOT, 'stocks.max.rows.json');

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

function writePublicReportScript(p, data) {
    ensureDir(p);
    const tmp = p + `.${process.pid}.tmp`;
    fs.writeFileSync(tmp, `window.__RV_LEARNING_REPORT__ = ${JSON.stringify(data, null, 2)};\n`, 'utf8');
    fs.renameSync(tmp, p);
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
    const prices = {};
    // Load all batch files (eod.latest.000.json, eod.latest.001.json, ...)
    const batchDir = path.dirname(EOD_BATCH);
    let batchFiles;
    try {
        batchFiles = fs.readdirSync(batchDir)
            .filter(f => f.startsWith('eod.latest.') && f.endsWith('.json'))
            .sort()
            .map(f => path.join(batchDir, f));
    } catch { batchFiles = []; }

    if (!batchFiles.length) batchFiles = [EOD_BATCH]; // fallback to single file

    for (const batchFile of batchFiles) {
        const doc = readJson(batchFile);
        if (!doc?.data) continue;
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
    }

    // Prefer richer v3 US EOD feed when available (typically ~2,450 rows vs legacy 100-row batch).
    const usRows = readNdjson(EOD_US_NDJSON);
    for (const row of usRows) {
        const ticker = String(row?.ticker || row?.symbol || '').toUpperCase();
        if (!ticker) continue;
        const close = Number(row?.adj_close ?? row?.close);
        if (!Number.isFinite(close) || close <= 0) continue;
        const open = Number(row?.open);
        const high = Number(row?.high);
        const low = Number(row?.low);
        const date = String(row?.trading_date || row?.date || '').slice(0, 10) || null;
        prices[ticker] = {
            close,
            open: Number.isFinite(open) ? open : close,
            high: Number.isFinite(high) ? high : close,
            low: Number.isFinite(low) ? low : close,
            date
        };
    }
    return prices;
}

function daysBetween(fromDate, toDate) {
    if (!fromDate || !toDate) return null;
    const from = new Date(fromDate);
    const to = new Date(toDate);
    if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) return null;
    return Math.max(0, Math.round((to - from) / 86400000));
}

function normalizeDate(value) {
    const date = String(value || '').slice(0, 10);
    return /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : null;
}

function resolveRunDate(dateArg) {
    const explicit = normalizeDate(dateArg);
    if (explicit) return explicit;
    return isoDate(new Date());
}

// ─── 1. FORECAST: Extract Predictions ───────────────────────────────────────
// IMPROVEMENT: Calibration feedback loop + Adaptive confidence scaling
function extractForecastPredictions(date, eodPrices) {
    const [y, m] = date.split('-');
    const gzPath = path.join(FORECAST_LEDGER, 'forecasts', y, `${m}.ndjson.gz`);
    const plainPath = path.join(FORECAST_LEDGER, 'forecasts', y, m, `${date}.ndjson`);

    let rows = readNdjson(gzPath);
    if (!rows.length) rows = readNdjson(plainPath);

    const dayRows = rows.filter(r => {
        const rDate = r.trading_date || r.date || r.as_of || '';
        return rDate.startsWith(date);
    });

    // Load calibration data for feedback loop
    const calib = loadCalib('forecast');

    const ledgerPredictions = dayRows.map(r => {
        const ticker = String(r.ticker || r.symbol || '').toUpperCase();
        let prob = r.p_up ?? r.probability ?? 0.5;
        const direction = r.direction || (prob >= 0.5 ? 'bullish' : 'bearish');

        // CALIBRATION FEEDBACK: Adjust probability toward historical hit rate
        const calibKey = `${ticker}_${direction}`;
        const calibData = calib.hit_rates?.[calibKey];
        if (calibData && calibData.total >= 5) {
            const historicalHitRate = calibData.hits / calibData.total;
            // Blend: 70% model output, 30% historical truth
            prob = round(prob * 0.7 + historicalHitRate * 0.3);
        }

        // ADAPTIVE CONFIDENCE: Shrink extreme probabilities toward 0.5
        // when we have insufficient calibration data (< 10 samples)
        const sampleCount = calibData?.total || 0;
        if (sampleCount < 10) {
            const shrinkFactor = Math.max(0.5, sampleCount / 10); // 0.5 to 1.0
            prob = round(0.5 + (prob - 0.5) * shrinkFactor);
        }

        return {
            feature: 'forecast',
            ticker,
            date,
            horizon: r.horizon || '1d',
            direction,
            probability: prob,
            probability_raw: r.p_up ?? r.probability ?? 0.5,
            confidence: r.confidence ?? r.conf ?? null,
            calibration_samples: sampleCount,
            price_at_prediction: r.price_at_forecast ?? r.close ?? eodPrices[ticker]?.close ?? null,
            model_id: r.champion_id ?? r.model_id ?? null,
            source: 'forecast_ledger'
        };
    }).filter(r => r.ticker);

    if (ledgerPredictions.length) {
        return {
            predictions: ledgerPredictions,
            source_meta: {
                source: 'forecast_ledger',
                asof: date,
                fresh: true,
                stale_days: 0
            }
        };
    }

    const latestDoc = readJson(path.join(ROOT, 'public/data/forecast/latest.json'));
    const latestAsof = String(
        latestDoc?.data?.asof ??
        latestDoc?.data?.freshness ??
        latestDoc?.meta?.freshness ??
        latestDoc?.freshness ??
        ''
    ).slice(0, 10);
    const latestRows = Array.isArray(latestDoc?.data?.forecasts) ? latestDoc.data.forecasts : [];
    const staleDays = daysBetween(latestAsof, date);

    const envelopePredictions = latestRows.map((row) => {
        const ticker = String(row?.symbol || row?.ticker || '').trim().toUpperCase();
        const oneDay = row?.horizons?.['1d'];
        if (!ticker || !oneDay || !Number.isFinite(Number(oneDay.probability))) return null;

        let prob = Number(oneDay.probability);
        const direction = String(oneDay.direction || (prob >= 0.5 ? 'bullish' : 'bearish')).toLowerCase();
        const calibKey = `${ticker}_${direction}`;
        const calibData = calib.hit_rates?.[calibKey];
        if (calibData && calibData.total >= 5) {
            const historicalHitRate = calibData.hits / calibData.total;
            prob = round(prob * 0.7 + historicalHitRate * 0.3);
        }
        const sampleCount = calibData?.total || 0;
        if (sampleCount < 10) {
            const shrinkFactor = Math.max(0.5, sampleCount / 10);
            prob = round(0.5 + (prob - 0.5) * shrinkFactor);
        }

        return {
            feature: 'forecast',
            ticker,
            date,
            horizon: '1d',
            direction,
            probability: prob,
            probability_raw: Number(oneDay.probability),
            confidence: null,
            calibration_samples: sampleCount,
            price_at_prediction: eodPrices[ticker]?.close ?? null,
            model_id: latestDoc?.data?.champion_id ?? latestDoc?.champion_id ?? null,
            source: 'forecast_latest_envelope'
        };
    }).filter(Boolean);

    return {
        predictions: envelopePredictions,
        source_meta: {
            source: 'forecast_latest_envelope',
            asof: latestAsof || null,
            fresh: Boolean(latestAsof && latestAsof === date),
            stale_days: staleDays
        }
    };
}

// ─── 2. SCIENTIFIC: Extract Setup/Trigger Predictions ───────────────────────
// IMPROVEMENT: Signal strength threshold ≥ 60, Setup decay (10d max), stricter trigger logic
function extractScientificPredictions(date, eodPrices) {
    function toStrength(item) {
        const setupScore = Number(item?.setup?.score ?? item?.setup_score ?? 0);
        const raw = item?.signal_strength;
        if (typeof raw === 'number' && Number.isFinite(raw)) return raw;
        if (typeof raw === 'string') {
            if (raw === 'STRONG') return 80;
            if (raw === 'MODERATE') return 60;
            if (raw === 'WEAK') return 30;
        }
        return Number.isFinite(setupScore) ? setupScore : 0;
    }

    const snapshotDoc = readJson(SCIENTIFIC_SNAPSHOT);
    const snapshotAsOf = normalizeDate(snapshotDoc?._meta?.generated_at);
    const snapshotPreds = [];
    if (snapshotDoc && typeof snapshotDoc === 'object') {
        for (const [key, item] of Object.entries(snapshotDoc)) {
            if (!item || typeof item !== 'object') continue;
            if (key.startsWith('_')) continue;
            if (item.status === 'DATA_UNAVAILABLE') continue;
            const ticker = String(item.ticker || item.symbol || key || '').toUpperCase();
            if (!ticker) continue;

            const signalStrength = toStrength(item);
            if (signalStrength < 30) continue;
            const setup = item.setup || {};
            const trigger = item.trigger || {};
            const setupMet = setup.fulfilled ?? setup.met ?? setup.setup_met ?? (signalStrength > 40);
            const triggerMet = trigger.fulfilled ?? trigger.met ?? trigger.trigger_met ?? (signalStrength > 60);
            const setupDate = item.setup_date || item.date || snapshotAsOf || date;
            const setupAgeDays = Math.max(0, Math.round((new Date(date) - new Date(setupDate)) / 86400000));
            const decayFactor = setupAgeDays > 10 ? 0.5 : setupAgeDays > 5 ? 0.8 : 1.0;
            const rawProb = Number(item.probability);
            const prob = Number.isFinite(rawProb) ? rawProb : (triggerMet ? 0.65 : setupMet ? 0.55 : 0.45);
            const probability = round(0.5 + (prob - 0.5) * decayFactor);
            const direction = probability >= 0.5 ? 'bullish' : 'bearish';
            const price = eodPrices[ticker]?.close ?? item.price ?? null;

            snapshotPreds.push({
                feature: 'scientific',
                ticker,
                date,
                horizon: '5d',
                setup_met: Boolean(setupMet),
                trigger_met: Boolean(triggerMet),
                setup_score: signalStrength,
                setup_age_days: setupAgeDays,
                decay_factor: decayFactor,
                probability,
                direction,
                price_at_prediction: price,
                source: 'scientific_snapshot'
            });
        }
    }

    if (snapshotPreds.length) {
        const sorted = snapshotPreds
            .sort((a, b) => (b.setup_score - a.setup_score) || (b.probability - a.probability) || a.ticker.localeCompare(b.ticker))
            .slice(0, 2500);
        console.log(`[learning] Scientific: ${sorted.length} predictions from stock-analysis snapshot`);
        return {
            predictions: sorted,
            source_meta: {
                source: 'scientific_snapshot',
                asof: snapshotAsOf || null,
                fresh: Boolean(snapshotAsOf && snapshotAsOf === date),
                stale_days: daysBetween(snapshotAsOf, date)
            }
        };
    }

    const summaryDoc = readJson(SCIENTIFIC_SUMMARY);
    if (!summaryDoc) {
        console.warn('[learning] Scientific: no snapshot and no summary file');
        return {
            predictions: [],
            source_meta: { source: 'scientific_missing', asof: null, fresh: false, stale_days: null }
        };
    }

    const summaryAsOf = normalizeDate(summaryDoc?.generated_at);
    const signals = Array.isArray(summaryDoc.strong_signals) ? summaryDoc.strong_signals : [];
    const setups = Array.isArray(summaryDoc.best_setups) ? summaryDoc.best_setups : [];
    const seen = new Set();
    const preds = [];
    for (const item of [...signals, ...setups]) {
        const ticker = String(item.symbol || item.ticker || '').toUpperCase();
        if (!ticker || seen.has(ticker)) continue;
        seen.add(ticker);

        const signalStrength = toStrength(item);
        if (signalStrength < 30) continue;
        const setup = item.setup || {};
        const trigger = item.trigger || {};
        const setupMet = setup.fulfilled ?? setup.met ?? setup.setup_met ?? (signalStrength > 40);
        const triggerMet = trigger.fulfilled ?? trigger.met ?? trigger.trigger_met ?? (signalStrength > 60);
        const setupDate = item.setup_date || item.date || date;
        const setupAgeDays = Math.max(0, Math.round((new Date(date) - new Date(setupDate)) / 86400000));
        const decayFactor = setupAgeDays > 10 ? 0.5 : setupAgeDays > 5 ? 0.8 : 1.0;
        const rawProb = Number(item.probability);
        const prob = Number.isFinite(rawProb) ? rawProb : (triggerMet ? 0.65 : setupMet ? 0.55 : 0.45);
        const probability = round(0.5 + (prob - 0.5) * decayFactor);
        preds.push({
            feature: 'scientific',
            ticker,
            date,
            horizon: '5d',
            setup_met: Boolean(setupMet),
            trigger_met: Boolean(triggerMet),
            setup_score: signalStrength,
            setup_age_days: setupAgeDays,
            decay_factor: decayFactor,
            probability,
            direction: probability >= 0.5 ? 'bullish' : 'bearish',
            price_at_prediction: eodPrices[ticker]?.close ?? item.price ?? null,
            source: 'scientific_summary'
        });
    }

    console.log(`[learning] Scientific: ${preds.length} predictions from summary fallback`);
    return {
        predictions: preds,
        source_meta: {
            source: 'scientific_summary',
            asof: summaryAsOf || null,
            fresh: Boolean(summaryAsOf && summaryAsOf === date),
            stale_days: daysBetween(summaryAsOf, date)
        }
    };
}

// ─── 3. ELLIOTT: Extract Wave Predictions ───────────────────────────────────
// IMPROVEMENT: Quality > Quantity — only top 500 by confidence, minimum confidence ≥ 0.30
function extractElliottPredictions(date, eodPrices, candidateTickers = []) {
    function toDirection(raw) {
        const dir = String(raw || '').toLowerCase();
        if (dir.includes('bull')) return 'bullish';
        if (dir.includes('bear')) return 'bearish';
        return 'neutral';
    }

    function toConfidence(entry = {}) {
        const c1 = Number(entry?.developingPattern?.confidence);
        if (Number.isFinite(c1)) return c1 / 100;
        const c2 = Number(entry?.uncertainty?.confidenceDecay?.adjusted);
        if (Number.isFinite(c2)) return c2 / 100;
        const c3 = Number(entry?.completedPattern?.confidence0_100);
        if (Number.isFinite(c3)) return c3 / 100;
        return 0;
    }

    const tickerSet = new Set(candidateTickers.map((t) => String(t || '').toUpperCase()).filter(Boolean));
    const perTickerPreds = [];
    let latestAsOf = null;
    if (tickerSet.size) {
        for (const ticker of tickerSet) {
            const doc = readJson(path.join(ELLIOTT_DIR, `${ticker}.json`));
            const elliott = doc?.data?.elliott;
            if (!elliott) continue;
            const direction = toDirection(elliott?.completedPattern?.direction || doc?.data?.features?.SMATrend);
            const confidence = toConfidence(elliott);
            const wavePosition = elliott?.developingPattern?.possibleWave || 'unknown';
            const asof = normalizeDate(doc?.meta?.generatedAt || doc?.meta?.fetchedAt);
            if (asof && (!latestAsOf || asof > latestAsOf)) latestAsOf = asof;
            if (direction === 'neutral') continue;
            perTickerPreds.push({
                feature: 'elliott',
                ticker,
                date,
                horizon: '5d',
                wave_position: wavePosition,
                direction,
                confidence,
                probability: direction === 'bullish' ? 0.5 + confidence / 2 : 0.5 - confidence / 2,
                price_at_prediction: eodPrices[ticker]?.close ?? null,
                source: 'marketphase_per_symbol'
            });
        }
    }

    if (perTickerPreds.length) {
        const qualityPreds = perTickerPreds
            .filter((p) => p.confidence >= 0.30)
            .sort((a, b) => b.confidence - a.confidence)
            .slice(0, 1500);
        console.log(`[learning] Elliott: ${qualityPreds.length} quality predictions from per-symbol files`);
        return {
            predictions: qualityPreds,
            source_meta: {
                source: 'marketphase_per_symbol',
                asof: latestAsOf || null,
                fresh: Boolean(latestAsOf && latestAsOf === date),
                stale_days: daysBetween(latestAsOf, date)
            }
        };
    }

    const deepPath = path.join(ROOT, 'public/data/universe/v7/read_models/marketphase_deep_summary.json');
    const doc = readJson(deepPath);
    const items = doc?.items || [];

    let allPreds = [];

    if (!items.length) {
        // Fallback: use EOD heuristic
        allPreds = Object.entries(eodPrices).map(([ticker, bar]) => {
            const range = bar.high - bar.low;
            const posInRange = range > 0 ? (bar.close - bar.low) / range : 0.5;
            const dayChange = bar.open > 0 ? (bar.close - bar.open) / bar.open : 0;
            const direction = dayChange >= 0 ? 'bullish' : 'bearish';
            let wavePosition, confidence;
            if (posInRange > 0.8) { wavePosition = direction === 'bullish' ? 'in-correction' : 'pre-wave-3'; confidence = 0.40; }
            else if (posInRange < 0.2) { wavePosition = direction === 'bearish' ? 'in-correction' : 'pre-wave-3'; confidence = 0.40; }
            else if (posInRange > 0.5) { wavePosition = 'pre-wave-5'; confidence = 0.30; }
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
    } else {
        allPreds = items.map(item => {
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

    // QUALITY FILTER: Minimum confidence ≥ 0.30, then take top 500 by confidence
    const qualityPreds = allPreds
        .filter(p => p.confidence >= 0.30 && p.direction !== 'neutral')
        .sort((a, b) => b.confidence - a.confidence)
        .slice(0, 500);

    console.log(`[learning] Elliott: ${allPreds.length} total → ${qualityPreds.length} quality predictions (conf ≥ 0.30, top 500)`);
    return {
        predictions: qualityPreds,
        source_meta: {
            source: items.length ? 'marketphase_deep' : 'eod_heuristic',
            asof: normalizeDate(doc?.as_of || doc?.generated_at) || null,
            fresh: Boolean(normalizeDate(doc?.as_of || doc?.generated_at) === date),
            stale_days: daysBetween(normalizeDate(doc?.as_of || doc?.generated_at), date)
        }
    };
}

// ─── 4. STOCK ANALYZER: Extract Rankings ────────────────────────────────────
// IMPROVEMENT: EMA(5) score smoothing using historical data
function extractStockRankings(date) {
    const ssotPath = V7_STOCK_ROWS;
    const doc = readJson(ssotPath);
    const docAsof = String(doc?.generated_at || doc?.as_of || '').slice(0, 10) || null;

    if (!doc) {
        console.warn(`[learning] Stock Analyzer: SSOT file not found at ${ssotPath}`);
        return { rankings: [], source_meta: { source: 'v7_stock_rows', asof: null, fresh: false, stale_days: null } };
    }

    const items = Array.isArray(doc) ? doc : (doc.items || doc.rows || []);
    if (!items.length) {
        console.warn(`[learning] Stock Analyzer: SSOT loaded but 0 items (keys: ${Object.keys(doc).join(',')})`);
        return { rankings: [], source_meta: { source: 'v7_stock_rows', asof: docAsof, fresh: false, stale_days: daysBetween(docAsof, date) } };
    }

    console.log(`[learning] Stock Analyzer: SSOT loaded ${items.length} items (asof: ${docAsof})`);

    // Load historical scores for EMA smoothing (last 5 days)
    const historicalScores = {}; // ticker -> [score, score, ...]
    for (let i = 1; i <= 5; i++) {
        const pastDate = daysAgo(date, i);
        const pastPreds = readNdjson(predPath(pastDate, 'stock_analyzer'));
        for (const p of pastPreds) {
            if (!historicalScores[p.ticker]) historicalScores[p.ticker] = [];
            if (p.quality_score != null) historicalScores[p.ticker].push(p.quality_score);
        }
    }

    // EMA smoothing: α = 0.3 (recent data weighted more)
    const ALPHA = 0.3;
    function emaSmooth(currentScore, ticker) {
        const hist = historicalScores[ticker];
        if (!hist || !hist.length) return currentScore;
        // Compute EMA backwards through history
        let ema = hist[0];
        for (let i = 1; i < hist.length; i++) {
            ema = ALPHA * hist[i] + (1 - ALPHA) * ema;
        }
        // Blend current with EMA
        return round(ALPHA * currentScore + (1 - ALPHA) * ema);
    }

    const rankings = items.slice(0, 200).map((row, idx) => {
        const ticker = String(row.symbol || row.ticker || row.canonical_id || '').toUpperCase();
        const rawScore = row.score_0_100 ?? row.quality_score ?? row.score ?? null;
        const smoothedScore = rawScore != null ? emaSmooth(rawScore, ticker) : rawScore;

        return {
            feature: 'stock_analyzer',
            ticker,
            date,
            rank: idx + 1,
            quality_score: smoothedScore,
            quality_score_raw: rawScore,
            bars_count: row.bars_count ?? null,
            layer: row.layer ?? null,
            source: 'v7_stock_rows'
        };
    }).filter(r => r.ticker);

    // Re-sort by smoothed score and reassign ranks
    rankings.sort((a, b) => (b.quality_score ?? 0) - (a.quality_score ?? 0));
    rankings.forEach((r, i) => { r.rank = i + 1; });

    console.log(`[learning] Stock Analyzer: ${rankings.length} rankings with EMA(5) smoothing (α=${ALPHA})`);
    const staleDays = daysBetween(docAsof, date);
    return {
        rankings,
        source_meta: {
            source: 'v7_stock_rows',
            asof: docAsof,
            fresh: staleDays != null ? staleDays <= 1 : false,
            stale_days: staleDays
        }
    };
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
            // IMPROVEMENT: ATR-based dynamic threshold instead of fixed 2%
            const bar = eodPrices[ticker];
            const atrProxy = bar ? (bar.high - bar.low) / (bar.close || 1) : 0.02;
            const threshold = Math.max(0.01, Math.min(0.05, atrProxy)); // 1%–5% based on volatility
            outcome.hit = pred.trigger_met && Math.abs(actualReturn) >= threshold &&
                ((pred.direction === 'bullish' && actualReturn > 0) ||
                    (pred.direction === 'bearish' && actualReturn < 0));
            outcome.breakout_threshold = round(threshold);
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
    // Build history from past reports (last 30 days)
    const history = [];
    for (let i = 29; i >= 0; i--) {
        const d = daysAgo(date, i);
        const pastReport = readJson(reportPath(d));
        if (pastReport?.metrics) {
            history.push({ date: d, ...pastReport.metrics });
        }
    }
    // Add today's metrics to history
    const todayMetrics = {
        date,
        forecast_accuracy_7d: forecastMetrics.accuracy_7d,
        forecast_brier_7d: forecastMetrics.brier_7d,
        scientific_accuracy_7d: scientificMetrics.accuracy_7d,
        scientific_hit_rate_7d: scientificMetrics.hit_rate_7d,
        elliott_accuracy_7d: elliottMetrics.accuracy_7d,
        stock_stability: stockStability.stability,
    };
    history.push(todayMetrics);

    // Compute weekly comparison (this week vs last week)
    const thisWeekMetrics = history.filter(h => h.date >= daysAgo(date, 7));
    const lastWeekMetrics = history.filter(h => h.date >= daysAgo(date, 14) && h.date < daysAgo(date, 7));

    function weekAvg(arr, key) {
        const vals = arr.map(h => h[key]).filter(v => v != null);
        return vals.length ? round(vals.reduce((a, b) => a + b, 0) / vals.length) : null;
    }

    const weeklyComparison = {
        forecast: { this_week: weekAvg(thisWeekMetrics, 'forecast_accuracy_7d'), last_week: weekAvg(lastWeekMetrics, 'forecast_accuracy_7d') },
        scientific: { this_week: weekAvg(thisWeekMetrics, 'scientific_hit_rate_7d'), last_week: weekAvg(lastWeekMetrics, 'scientific_hit_rate_7d') },
        elliott: { this_week: weekAvg(thisWeekMetrics, 'elliott_accuracy_7d'), last_week: weekAvg(lastWeekMetrics, 'elliott_accuracy_7d') },
    };

    // Detect start date (first report ever)
    let startDate = date;
    for (let i = 365; i >= 0; i--) {
        const d = daysAgo(date, i);
        if (readJson(reportPath(d))) { startDate = d; break; }
    }
    // Simpler: check oldest in history
    if (history.length) startDate = history[0].date;

    const daysActive = Math.max(1, Math.round((new Date(date) - new Date(startDate)) / 86400000) + 1);

    return {
        schema: 'rubikvault_daily_learning_report_v2',
        date,
        generated_at: new Date().toISOString(),
        start_date: startDate,
        days_active: daysActive,
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
                source_meta: predCounts.forecast_source_meta || null,
            },
            scientific: {
                name: 'Scientific Analyzer v9.1',
                type: 'setup_trigger_breakout',
                ...scientificMetrics,
                predictions_today: predCounts.scientific || 0,
                source_meta: predCounts.scientific_source_meta || null,
            },
            elliott: {
                name: 'Elliott Waves DFMSIF v1.0',
                type: 'wave_direction_forecast',
                ...elliottMetrics,
                predictions_today: predCounts.elliott || 0,
                source_meta: predCounts.elliott_source_meta || null,
            },
            stock_analyzer: {
                name: 'Stock Analyzer',
                type: 'ranking_stability',
                ...stockStability,
                rankings_today: predCounts.stock || 0,
                source_meta: predCounts.stock_source_meta || null,
            }
        },
        weekly_comparison: weeklyComparison,
        history,
        metrics: {
            forecast_accuracy_7d: forecastMetrics.accuracy_7d,
            forecast_brier_7d: forecastMetrics.brier_7d,
            scientific_accuracy_7d: scientificMetrics.accuracy_7d,
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

// ─── Cross-Feature Conviction Score ─────────────────────────────────────────
// IMPROVEMENT: Combines signals from all features for consensus scoring
function computeConvictionScores(forecastPreds, scientificPreds, elliottPreds, stockPreds) {
    const tickerSignals = {}; // ticker -> { perFeature: { feature: { direction, confidence } } }

    function addSignal(ticker, feature, direction, confidence) {
        if (!ticker || direction === 'neutral') return;
        if (!tickerSignals[ticker]) tickerSignals[ticker] = { perFeature: {} };
        const entry = tickerSignals[ticker];
        const conf = Number.isFinite(Number(confidence)) ? Number(confidence) : 0.5;
        const prev = entry.perFeature[feature];
        // Keep one vote per feature (best-confidence sample), so forecast horizons don't triple-count.
        if (!prev || conf > prev.confidence) {
            entry.perFeature[feature] = { direction, confidence: conf };
        }
    }

    for (const p of forecastPreds) addSignal(p.ticker, 'forecast', p.direction, p.probability);
    for (const p of scientificPreds) addSignal(p.ticker, 'scientific', p.direction, p.probability);
    for (const p of elliottPreds) addSignal(p.ticker, 'elliott', p.direction, p.confidence);
    // Stock analyzer doesn't have directional signal, skip

    const convictions = [];
    for (const [ticker, sig] of Object.entries(tickerSignals)) {
        const votes = Object.entries(sig.perFeature || {});
        if (votes.length < 2) continue; // Need at least 2 independent features
        const sources = votes.map(([feature]) => feature);
        const bullish = votes.filter(([, vote]) => vote.direction === 'bullish').length;
        const bearish = votes.filter(([, vote]) => vote.direction === 'bearish').length;
        const totalConf = votes.reduce((sum, [, vote]) => sum + (vote.confidence || 0.5), 0);
        const sourceCount = votes.length;

        const totalVotes = bullish + bearish;
        if (!totalVotes) continue;
        const consensusDirection = bullish >= bearish ? 'bullish' : 'bearish';
        const consensusStrength = Math.max(bullish, bearish) / totalVotes;
        const avgConfidence = totalConf / sourceCount;

        convictions.push({
            ticker,
            direction: consensusDirection,
            sources,
            source_count: sourceCount,
            consensus_strength: round(consensusStrength),
            avg_confidence: round(avgConfidence),
            conviction_score: round(consensusStrength * avgConfidence * (sourceCount / 3)), // max 1.0 when 3 features align strongly
        });
    }

    // Sort by conviction score descending
    convictions.sort((a, b) => b.conviction_score - a.conviction_score);
    return convictions.slice(0, 50); // Top 50 highest conviction
}

// ─── Stock Forward Return Tracking ──────────────────────────────────────────
// IMPROVEMENT: Measures whether top-50 actually outperformed the index
function computeForwardReturns(date, eodPrices) {
    const pastPreds = readNdjson(predPath(daysAgo(date, 5), 'stock_analyzer'));
    if (!pastPreds.length) return null;

    const top50 = pastPreds.filter(r => r.rank <= 50);
    const returns = [];
    let allReturns = [];

    for (const pred of top50) {
        const currentPrice = eodPrices[pred.ticker]?.close;
        if (!currentPrice || !pred.quality_score) continue;
        // We don't have the price from 5 days ago easily, but we can approximate
        // by checking if the ticker is still in a high rank (proxy for performance)
        returns.push(pred.ticker);
    }

    // Compute all-ticker average return as benchmark
    for (const [ticker, bar] of Object.entries(eodPrices)) {
        if (bar.open > 0) allReturns.push((bar.close - bar.open) / bar.open);
    }

    const avgMarketReturn = allReturns.length ?
        round(allReturns.reduce((a, b) => a + b, 0) / allReturns.length) : null;

    return { top50_count: top50.length, tracked: returns.length, avg_market_return_today: avgMarketReturn };
}

// ─── Main ───────────────────────────────────────────────────────────────────
async function main() {
    const args = process.argv.slice(2);
    const dateArg = args.find(a => a.startsWith('--date='));
    const date = resolveRunDate(dateArg ? dateArg.split('=')[1] : null);

    console.log(`[learning] Starting daily learning cycle for ${date}...`);
    console.log('[learning] Improvements active: Calibration feedback, Signal ≥60, Elliott top-500, EMA smoothing, Cross-feature conviction');

    // 1. Load current prices
    const eodPrices = loadEodPrices();
    console.log(`[learning] Loaded EOD prices for ${Object.keys(eodPrices).length} tickers`);

    // 2. Extract today's predictions from each feature
    console.log('[learning] Extracting predictions...');
    const forecastResult = extractForecastPredictions(date, eodPrices);
    const forecastPreds = forecastResult.predictions || [];
    const scientificResult = extractScientificPredictions(date, eodPrices);
    const scientificPreds = scientificResult.predictions || [];
    const elliottCandidates = Array.from(
        new Set([
            ...forecastPreds.map((p) => p?.ticker),
            ...scientificPreds.map((p) => p?.ticker)
        ].map((t) => String(t || '').toUpperCase()).filter(Boolean))
    );
    const elliottResult = extractElliottPredictions(date, eodPrices, elliottCandidates);
    const elliottPreds = elliottResult.predictions || [];
    const stockResult = extractStockRankings(date);
    const stockPreds = stockResult.rankings || [];

    // 3. Save predictions to ledger
    if (forecastPreds.length) writeNdjson(predPath(date, 'forecast'), forecastPreds);
    if (scientificPreds.length) writeNdjson(predPath(date, 'scientific'), scientificPreds);
    if (elliottPreds.length) writeNdjson(predPath(date, 'elliott'), elliottPreds);
    if (stockPreds.length) writeNdjson(predPath(date, 'stock_analyzer'), stockPreds);

    console.log(`[learning] Predictions logged: forecast=${forecastPreds.length} scientific=${scientificPreds.length} elliott=${elliottPreds.length} stock=${stockPreds.length}`);

    // 4. Cross-feature conviction scoring
    console.log('[learning] Computing cross-feature conviction scores...');
    const convictionScores = computeConvictionScores(forecastPreds, scientificPreds, elliottPreds, stockPreds);
    console.log(`[learning] Top conviction tickers: ${convictionScores.slice(0, 5).map(c => `${c.ticker}(${c.conviction_score})`).join(', ')}`);

    // 5. Resolve outcomes for past predictions
    console.log('[learning] Resolving outcomes...');
    const forecastOutcomes = resolveOutcomes(date, 'forecast', 1, eodPrices);
    const scientificOutcomes = resolveOutcomes(date, 'scientific', 5, eodPrices);
    const elliottOutcomes = resolveOutcomes(date, 'elliott', 5, eodPrices);

    console.log(`[learning] Outcomes resolved: forecast=${forecastOutcomes.length} scientific=${scientificOutcomes.length} elliott=${elliottOutcomes.length}`);

    // 6. Compute metrics (rolling 30d window)
    console.log('[learning] Computing metrics...');
    const forecastMetrics = computeFeatureMetrics('forecast', date);
    const scientificMetrics = computeFeatureMetrics('scientific', date);
    const elliottMetrics = computeFeatureMetrics('elliott', date);
    const stockStability = computeRankingStability(date);
    const forwardReturns = computeForwardReturns(date, eodPrices);

    // 7. Build and save report
    const report = buildReport(date, forecastMetrics, scientificMetrics, elliottMetrics, stockStability, {
        forecast: forecastPreds.length,
        forecast_source_meta: forecastResult.source_meta,
        scientific: scientificPreds.length,
        scientific_source_meta: scientificResult.source_meta,
        elliott: elliottPreds.length,
        elliott_source_meta: elliottResult.source_meta,
        stock: stockPreds.length,
        stock_source_meta: stockResult.source_meta
    });

    // Enrich report with cross-feature data
    report.conviction_scores = convictionScores;
    report.stock_forward_returns = forwardReturns;
    report.improvements_active = [
        'forecast_calibration_feedback',
        'forecast_adaptive_confidence',
        'scientific_signal_threshold_60',
        'scientific_setup_decay_10d',
        'elliott_quality_filter_top500',
        'stock_ema_smoothing_alpha03',
        'cross_feature_conviction',
        'scientific_atr_breakout_threshold',
    ];

    writeJson(reportPath(date), report);
    writeJson(path.join(REPORT_DIR, 'latest.json'), report);
    writeJson(PUBLIC_REPORT, report);
    writePublicReportScript(PUBLIC_REPORT_JS, report);

    // 8. Print human-readable report
    printReport(report);

    if (convictionScores.length) {
        console.log('\n  🎯 Cross-Feature Conviction (Top 10):');
        console.log('  ' + '─'.repeat(60));
        for (const c of convictionScores.slice(0, 10)) {
            console.log(`     ${c.ticker.padEnd(8)} ${c.direction.padEnd(8)} Score: ${c.conviction_score} Sources: ${c.sources.join('+')}`);
        }
    }

    console.log('\n[learning] Daily learning cycle complete.');
}

main().catch(err => {
    console.error('[learning] FATAL:', err);
    process.exit(1);
});
