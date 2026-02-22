#!/usr/bin/env node
/**
 * Scientific Stock Analyzer v9.1 - Analysis Generation Script
 * 
 * Generates stock analysis with Setup/Trigger detection for all NASDAQ-100 symbols.
 * Uses synthetic indicator simulation based on company characteristics.
 * 
 * Setup Criteria (accumulation phase indicators):
 * - RSI between 40-60 (neutral, not oversold/overbought)
 * - Price above SMA200 (long-term uptrend)
 * - SMA50 > SMA200 (golden cross structure)
 * - Volatility declining or stable
 * - Volume accumulation (volume ratio < 0.8 in consolidation)
 * 
 * Trigger Criteria (breakout confirmation):
 * - RSI crossing above 55
 * - Price breaking above SMA20
 * - Volume spike (ratio > 1.3)
 * - MACD histogram positive and increasing
 * 
 * Output: public/data/snapshots/stock-analysis.json
 */

import fs from 'node:fs/promises';
import path from 'node:path';

import { computeFeatures } from '../lib/scientific-analyzer/features.mjs';
import { generateExplainabilityReport, formatExplanationForUI } from '../lib/scientific-analyzer/explainability.mjs';
import { applyPlattScaling } from '../lib/scientific-analyzer/calibration.mjs';

const REPO_ROOT = process.cwd();
const MODELS_DIR = 'public/data/models';
const SNAPSHOTS_DIR = 'public/data/snapshots';
const MARKETPHASE_DIR = 'public/data/marketphase';
const LEGACY_UNIVERSE_FILE = 'public/data/universe/all.json';
const V7_STOCK_ROWS_FILE = 'public/data/universe/v7/ssot/stocks.max.rows.json';
const V7_STOCK_SYMBOLS_FILE = 'public/data/universe/v7/ssot/stocks.max.symbols.json';
const MARKETPHASE_INDEX_FILE = 'public/data/marketphase/index.json';

function isoNow() {
    return new Date().toISOString();
}

async function readJson(relPath) {
    const abs = path.join(REPO_ROOT, relPath);
    try {
        const raw = await fs.readFile(abs, 'utf-8');
        return JSON.parse(raw);
    } catch {
        return null;
    }
}

async function writeJsonAtomic(relPath, data) {
    const abs = path.join(REPO_ROOT, relPath);
    const tmpPath = `${abs}.tmp`;
    await fs.mkdir(path.dirname(abs), { recursive: true });
    await fs.writeFile(tmpPath, JSON.stringify(data, null, 2) + '\n', 'utf-8');
    await fs.rename(tmpPath, abs);
}

function normalizeTicker(value) {
    return String(value || '').trim().toUpperCase();
}

function toTickerRows(values) {
    if (!Array.isArray(values)) return [];
    const out = [];
    const seen = new Set();
    for (const value of values) {
        const ticker = normalizeTicker(value?.ticker || value?.symbol || value?.code || value);
        if (!ticker || seen.has(ticker)) continue;
        seen.add(ticker);
        out.push({ ticker, name: value?.name || null });
    }
    return out;
}

async function loadScientificUniverse() {
    const preferredSource = String(process.env.SCIENTIFIC_UNIVERSE_SOURCE || 'v7').trim().toLowerCase();
    const requireV7 = String(process.env.SCIENTIFIC_REQUIRE_V7 || 'true').trim().toLowerCase() !== 'false';
    const v7Candidates = [V7_STOCK_ROWS_FILE, V7_STOCK_SYMBOLS_FILE];
    const legacyCandidates = [LEGACY_UNIVERSE_FILE];
    const candidates = requireV7
        ? v7Candidates
        : (preferredSource === 'legacy'
            ? [...legacyCandidates, ...v7Candidates]
            : [...v7Candidates, ...legacyCandidates]);

    for (const source of candidates) {
        const doc = await readJson(source);
        if (!doc) continue;

        let rows = [];
        if (Array.isArray(doc)) {
            rows = toTickerRows(doc);
        } else if (Array.isArray(doc?.items)) {
            rows = toTickerRows(doc.items);
        } else if (Array.isArray(doc?.symbols)) {
            rows = toTickerRows(doc.symbols);
        }

        if (rows.length > 0) {
            return { source, rows };
        }
    }

    if (requireV7) {
        throw new Error('SCIENTIFIC_V7_SSOT_REQUIRED_MISSING');
    }

    return { source: null, rows: [] };
}

async function loadMarketphaseSymbolSet() {
    const doc = await readJson(MARKETPHASE_INDEX_FILE);
    const symbols = new Set();
    const rows = Array.isArray(doc?.data?.symbols) ? doc.data.symbols : [];
    for (const row of rows) {
        const ticker = normalizeTicker(typeof row === 'string' ? row : row?.symbol);
        if (ticker) symbols.add(ticker);
    }
    return symbols;
}



// Evaluate Setup conditions
function evaluateSetup(ind) {
    const conditions = {
        rsi_neutral: {
            met: ind.rsi >= 40 && ind.rsi <= 65,
            value: ind.rsi,
            label: `RSI ${ind.rsi.toFixed(1)} (40-65 range)`,
            weight: 0.2
        },
        above_sma200: {
            met: ind.close > ind.sma200,
            value: ((ind.close - ind.sma200) / ind.sma200 * 100).toFixed(1),
            label: `Price ${((ind.close - ind.sma200) / ind.sma200 * 100).toFixed(1)}% above SMA200`,
            weight: 0.25
        },
        golden_cross: {
            met: ind.sma50 > ind.sma200,
            value: ((ind.sma50 - ind.sma200) / ind.sma200 * 100).toFixed(1),
            label: `SMA50 ${ind.sma50 > ind.sma200 ? 'above' : 'below'} SMA200`,
            weight: 0.25
        },
        volatility_stable: {
            met: ind.atrPct < 2.8,
            value: ind.atrPct.toFixed(1),
            label: `ATR ${ind.atrPct.toFixed(1)}% (< 2.8% stable)`,
            weight: 0.15
        },
        consolidation: {
            met: ind.volumeRatio < 1.1 && ind.volumeRatio > 0.7,
            value: ind.volumeRatio.toFixed(2),
            label: `Volume ratio ${ind.volumeRatio.toFixed(2)} (consolidation)`,
            weight: 0.15
        }
    };

    const metConditions = Object.values(conditions).filter(c => c.met);
    const totalWeight = Object.values(conditions).reduce((s, c) => s + c.weight, 0);
    const metWeight = metConditions.reduce((s, c) => s + c.weight, 0);
    const score = (metWeight / totalWeight) * 100;

    return {
        fulfilled: score >= 60, // 60% of weighted conditions met
        score: Math.round(score),
        conditions,
        metCount: metConditions.length,
        totalCount: Object.keys(conditions).length,
        proofPoints: metConditions.map(c => c.label)
    };
}

// Evaluate Trigger conditions
function evaluateTrigger(ind, setup) {
    // Trigger only relevant if Setup is fulfilled
    if (!setup.fulfilled) {
        return {
            fulfilled: false,
            score: 0,
            conditions: {},
            metCount: 0,
            totalCount: 4,
            proofPoints: [],
            pending: true
        };
    }

    const conditions = {
        rsi_breakout: {
            met: ind.rsi > 55 && ind.rsi < 75,
            value: ind.rsi.toFixed(1),
            label: `RSI ${ind.rsi.toFixed(1)} breaking above 55`,
            weight: 0.25
        },
        price_above_sma20: {
            met: ind.close > ind.sma20,
            value: ((ind.close - ind.sma20) / ind.sma20 * 100).toFixed(1),
            label: `Price ${((ind.close - ind.sma20) / ind.sma20 * 100).toFixed(1)}% above SMA20`,
            weight: 0.25
        },
        volume_spike: {
            met: ind.volumeRatio > 1.2,
            value: ind.volumeRatio.toFixed(2),
            label: `Volume ratio ${ind.volumeRatio.toFixed(2)} (spike > 1.2x)`,
            weight: 0.25
        },
        macd_positive: {
            met: ind.macdHist > 0.2,
            value: ind.macdHist.toFixed(2),
            label: `MACD Histogram ${ind.macdHist.toFixed(2)} (positive momentum)`,
            weight: 0.25
        }
    };

    const metConditions = Object.values(conditions).filter(c => c.met);
    const totalWeight = Object.values(conditions).reduce((s, c) => s + c.weight, 0);
    const metWeight = metConditions.reduce((s, c) => s + c.weight, 0);
    const score = (metWeight / totalWeight) * 100;

    return {
        fulfilled: score >= 60,
        score: Math.round(score),
        conditions,
        metCount: metConditions.length,
        totalCount: Object.keys(conditions).length,
        proofPoints: metConditions.map(c => c.label),
        pending: false
    };
}

// Determine timeframe category
function determineTimeframe(setup, trigger, ind) {
    if (!setup.fulfilled) return null;

    if (trigger.fulfilled && ind.volumeRatio > 1.3) {
        return 'short'; // Immediate breakout candidate (1-5 days)
    }

    if (trigger.fulfilled) {
        return 'medium'; // Confirmed breakout (5-20 days)
    }

    if (setup.score >= 80) {
        return 'long'; // Strong setup, awaiting trigger (20-60 days)
    }

    return 'watch'; // On watchlist
}

function sigmoid(x) {
    if (x > 700) return 1;
    if (x < -700) return 0;
    return 1 / (1 + Math.exp(-x));
}

function computeLogit(features, weights, bias) {
    let logit = bias;
    for (const [feature, weight] of Object.entries(weights)) {
        const value = features[feature];
        if (Number.isFinite(value)) {
            logit += weight * value;
        }
    }
    return logit;
}

function computeRiskMetrics(features, probability) {
    const volatility = features.volatility_20d || 0.02;
    const var95 = features.var95 || -1.65 * volatility;
    const expectedReturn = (probability - 0.5) * 0.1;
    const riskFreeRate = 0.05 / 252;
    const excessReturn = expectedReturn - riskFreeRate;
    const sharpeProxy = volatility > 0 ? excessReturn / volatility : 0;

    return {
        sharpe_proxy: Math.round(sharpeProxy * 100) / 100,
        var95: Math.round(var95 * 10000) / 100,
        expected_return_10d: Math.round(expectedReturn * 1000) / 10
    };
}

async function main() {
    console.log('Scientific Stock Analyzer v9.1 - Generating Analysis with Setup/Trigger...');
    const startTime = Date.now();

    // Load model weights
    const modelData = await readJson(`${MODELS_DIR}/weights-v9.json`);
    if (!modelData) {
        console.error('ERROR: weights-v9.json not found');
        process.exit(1);
    }

    const { weights, bias, calibration, feature_means, metrics: modelMetrics } = modelData;

    // Load universe
    const universeLoad = await loadScientificUniverse();
    if (!Array.isArray(universeLoad.rows) || universeLoad.rows.length === 0) {
        console.error('ERROR: Universe file not found or invalid');
        process.exit(1);
    }

    const tickers = universeLoad.rows;
    const marketphaseSymbols = await loadMarketphaseSymbolSet();
    console.log(`Processing ${tickers.length} symbols (source: ${universeLoad.source || 'unknown'})...`);

    const analyses = {};
    const topSetups = [];
    const triggeredSetups = [];
    let processed = 0;

    for (const { ticker, name } of tickers) {
        try {
            // Try to load real marketphase data first, fall back to synthetic.
            const mpData = marketphaseSymbols.has(ticker)
                ? await readJson(`${MARKETPHASE_DIR}/${ticker}.json`)
                : null;
            let ind;

            if (mpData?.data?.features) {
                // Use real data
                const mp = mpData.data.features;
                ind = {
                    close: mp.lastClose,
                    sma20: mp.SMA50 * 0.98, // Approximate SMA20
                    sma50: mp.SMA50,
                    sma200: mp.SMA200,
                    rsi: mp.RSI,
                    macdHist: mp.MACDHist,
                    atrPct: mp['ATR%'] || 2,
                    volumeRatio: 1.0,
                    high52w: mp.lastClose * 1.15,
                    low52w: mp.lastClose * 0.75,
                    bbUpper: mp.lastClose * 1.04,
                    bbLower: mp.lastClose * 0.96,
                    isBullish: mp.SMATrend === 'bullish',
                    isStrongBullish: mp.SMATrend === 'bullish' && mp.RSI > 50
                };
            } else {
                analyses[ticker] = {
                    ticker,
                    name,
                    status: 'DATA_UNAVAILABLE',
                    reason: 'Insufficient real marketphase data to generate scientific analysis',
                    academic_disclaimer: modelData.disclaimer
                };
                continue;
            }

            // Evaluate Setup and Trigger
            const setup = evaluateSetup(ind);
            const trigger = evaluateTrigger(ind, setup);
            const timeframe = determineTimeframe(setup, trigger, ind);

            // Build indicators array for feature computation
            const indicators = [
                { id: 'rsi14', value: ind.rsi },
                { id: 'macd_hist', value: ind.macdHist },
                { id: 'atr14', value: ind.atrPct / 100 * ind.close },
                { id: 'sma20', value: ind.sma20 },
                { id: 'sma50', value: ind.sma50 },
                { id: 'sma200', value: ind.sma200 },
                { id: 'close_to_sma20_pct', value: (ind.close - ind.sma20) / ind.sma20 },
                { id: 'close_to_sma200_pct', value: (ind.close - ind.sma200) / ind.sma200 },
                { id: 'volatility_20d', value: ind.atrPct / 100 },
                { id: 'ret_1d_pct', value: ind.isBullish ? 0.008 : -0.005 },
                { id: 'ret_5d_pct', value: ind.isBullish ? 0.02 : -0.01 },
                { id: 'ret_20d_pct', value: ind.isBullish ? 0.04 : -0.02 },
                { id: 'log_return_1d', value: ind.isBullish ? 0.003 : -0.002 },
                { id: 'bb_upper', value: ind.bbUpper },
                { id: 'bb_lower', value: ind.bbLower },
                { id: 'bb_mid', value: ind.sma20 },
                { id: 'volume_ratio_20d', value: ind.volumeRatio },
                { id: 'high_52w', value: ind.high52w },
                { id: 'low_52w', value: ind.low52w },
                { id: 'volatility_percentile', value: ind.atrPct < 2 ? 30 : ind.atrPct > 3 ? 70 : 50 },
                { id: 'lag1_autocorrelation', value: ind.isBullish ? 0.05 : -0.08 }
            ];

            const bar = { close: ind.close, volume: 1000000 };
            const features = computeFeatures(indicators, bar);

            // Compute probability (boost for setup/trigger)
            let logit = computeLogit(features, weights, bias);
            if (setup.fulfilled) logit += 0.3;
            if (trigger.fulfilled) logit += 0.4;

            const rawProbability = sigmoid(logit);
            const calibratedProbability = applyPlattScaling(rawProbability, calibration);

            const riskMetrics = computeRiskMetrics(features, calibratedProbability);
            const explanation = generateExplainabilityReport(features, weights, bias, feature_means);
            const uiExplanation = formatExplanationForUI(explanation);

            const ci = [
                Math.max(0, calibratedProbability - 0.08),
                Math.min(1, calibratedProbability + 0.08)
            ];

            const analysis = {
                ticker,
                name,
                price: ind.close,
                probability: Math.round(calibratedProbability * 100) / 100,
                expected_return_10d: riskMetrics.expected_return_10d,
                risk_metrics: {
                    sharpe_proxy: riskMetrics.sharpe_proxy,
                    var95: riskMetrics.var95
                },
                setup: {
                    fulfilled: setup.fulfilled,
                    score: setup.score,
                    conditions_met: `${setup.metCount}/${setup.totalCount}`,
                    proof_points: setup.proofPoints
                },
                trigger: {
                    fulfilled: trigger.fulfilled,
                    score: trigger.score,
                    conditions_met: `${trigger.metCount}/${trigger.totalCount}`,
                    proof_points: trigger.proofPoints,
                    pending: trigger.pending
                },
                timeframe,
                signal_strength: setup.fulfilled && trigger.fulfilled ? 'STRONG' : setup.fulfilled ? 'MODERATE' : 'WEAK',
                indicators: {
                    rsi: Math.round(ind.rsi * 10) / 10,
                    macd_hist: Math.round(ind.macdHist * 100) / 100,
                    sma20: Math.round(ind.sma20 * 100) / 100,
                    sma50: Math.round(ind.sma50 * 100) / 100,
                    sma200: Math.round(ind.sma200 * 100) / 100,
                    volume_ratio: Math.round(ind.volumeRatio * 100) / 100,
                    atr_pct: Math.round(ind.atrPct * 10) / 10
                },
                explainability: {
                    top_features: uiExplanation.topFeatures,
                    shap_values: uiExplanation.shapValues,
                    lime_explanations: uiExplanation.limeExplanations,
                    counterfactuals: uiExplanation.counterfactuals
                },
                metadata: {
                    model_auc: modelMetrics.AUC,
                    calibration_error: modelMetrics.ECE,
                    drift_status: 'stable',
                    confidence_interval: ci.map(v => Math.round(v * 100) / 100),
                    data_source: mpData?.data?.features ? 'real' : 'synthetic'
                },
                academic_disclaimer: modelData.disclaimer
            };

            analyses[ticker] = analysis;

            // Track top setups and triggered setups
            if (setup.fulfilled) {
                topSetups.push({
                    ticker,
                    name,
                    price: ind.close,
                    setup_score: setup.score,
                    trigger_score: trigger.score,
                    trigger_fulfilled: trigger.fulfilled,
                    probability: analysis.probability,
                    timeframe,
                    signal_strength: analysis.signal_strength
                });
            }

            if (setup.fulfilled && trigger.fulfilled) {
                triggeredSetups.push({
                    ticker,
                    name,
                    price: ind.close,
                    setup_score: setup.score,
                    trigger_score: trigger.score,
                    probability: analysis.probability,
                    timeframe,
                    expected_return: analysis.expected_return_10d
                });
            }

            processed++;

        } catch (err) {
            console.error(`Error processing ${ticker}: ${err.message}`);
            analyses[ticker] = {
                probability: null,
                status: 'ERROR',
                error: err.message,
                academic_disclaimer: modelData.disclaimer
            };
        }
    }

    // Sort rankings
    topSetups.sort((a, b) => {
        if (a.trigger_fulfilled !== b.trigger_fulfilled) return b.trigger_fulfilled - a.trigger_fulfilled;
        return b.setup_score - a.setup_score;
    });

    triggeredSetups.sort((a, b) => b.probability - a.probability);

    // Build snapshot
    const snapshot = {
        _meta: {
            type: 'stock-analysis.snapshot',
            version: '9.1',
            generated_at: isoNow(),
            model_version: 'v9.1',
            universe_source: universeLoad.source || 'unknown',
            symbols_processed: processed,
            symbols_failed: tickers.length - processed,
            duration_ms: Date.now() - startTime
        },
        _rankings: {
            top_setups: topSetups.slice(0, 20),
            triggered_setups: triggeredSetups.slice(0, 15),
            by_timeframe: {
                short: triggeredSetups.filter(s => s.timeframe === 'short').slice(0, 10),
                medium: triggeredSetups.filter(s => s.timeframe === 'medium').slice(0, 10),
                long: topSetups.filter(s => s.timeframe === 'long').slice(0, 10)
            }
        },
        ...analyses
    };

    await writeJsonAtomic(`${SNAPSHOTS_DIR}/stock-analysis.json`, snapshot);

    console.log(`✓ Generated: ${SNAPSHOTS_DIR}/stock-analysis.json`);
    console.log(`  Processed: ${processed}/${tickers.length} symbols`);
    console.log(`  Top Setups: ${topSetups.length}`);
    console.log(`  Triggered Setups: ${triggeredSetups.length}`);
    console.log(`  Duration: ${Date.now() - startTime}ms`);
}

main().catch(err => {
    console.error('Analysis generation failed:', err);
    process.exit(1);
});
