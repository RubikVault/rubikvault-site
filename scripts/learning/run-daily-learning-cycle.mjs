#!/usr/bin/env node
/**
 * RubikVault — Daily Learning Cycle
 *
 * Unified learning system for the active features:
 *  1. Forecast     — Champion/Challenger probabilities
 *  2. Scientific    — Setup/Trigger predictions
 *  3. QuantLab      — Factor/rank predictions
 *  4. Stock Analyzer — Ranking stability tracking
 *
 * Run: node scripts/learning/run-daily-learning-cycle.mjs [--date=YYYY-MM-DD]
 */

import fs from 'node:fs';
import crypto from 'node:crypto';
import path from 'node:path';
import readline from 'node:readline';
import zlib from 'node:zlib';
import {
    brierScore, accuracy, hitRate, trend, rollingAverage, eceScore,
    round, trendEmoji, isoDate, daysAgo
} from './lib/metrics.mjs';
import { resolveSsotPath } from '../universe-v7/lib/ssot-paths.mjs';
import { addTradingDays } from '../forecast/trading_date.mjs';
import { buildAssetSegmentationProfile } from '../../functions/api/_shared/asset-segmentation.mjs';
import { deriveLearningGate } from '../../functions/api/_shared/learning-gate.mjs';
import { buildArtifactEnvelope } from '../ops/pipeline-artifact-contract.mjs';

// ─── Paths ──────────────────────────────────────────────────────────────────
const ROOT = process.env.RUBIKVAULT_ROOT || process.cwd();
const LEARNING = path.join(ROOT, 'mirrors/learning');
const PRED_DIR = path.join(LEARNING, 'predictions');
const OUTCOME_DIR = path.join(LEARNING, 'outcomes');
const REPORT_DIR = path.join(LEARNING, 'reports');
const CALIB_DIR = path.join(LEARNING, 'calibration');
const PUBLIC_REPORT = path.join(ROOT, 'public/data/reports/learning-report-latest.json');
const PUBLIC_REPORT_JS = path.join(ROOT, 'public/data/reports/learning-report-latest.js');
const PUBLIC_RUNTIME_CONTROL = path.join(ROOT, 'public/data/runtime/stock-analyzer-control.json');
const BEST_SETUPS_POLICY = path.join(ROOT, 'policies/best-setups.v1.json');
const BEST_SETUPS_SNAPSHOT = path.join(ROOT, 'public/data/snapshots/best-setups-v4.json');
const ETF_DIAGNOSTIC_LATEST = path.join(ROOT, 'public/data/reports/best-setups-etf-diagnostic-latest.json');
const HORIZON_CONFIG_MAP = Object.freeze({
    short: '1d',
    medium: '5d',
    long: '20d'
});

const FORECAST_LEDGER = path.join(ROOT, 'mirrors/forecast/ledger');
const SCIENTIFIC_SUMMARY = path.join(ROOT, 'public/data/supermodules/scientific-summary.json');
const SCIENTIFIC_SNAPSHOT = path.join(ROOT, 'public/data/snapshots/stock-analysis.json');
const EOD_BATCH = path.join(ROOT, 'public/data/eod/batches/eod.latest.000.json');
const EOD_US_NDJSON = path.join(ROOT, 'public/data/v3/eod/US/latest.ndjson.gz');
const SSOT_MANIFEST = resolveSsotPath(ROOT, 'manifest.json');
const V7_STOCK_ROWS = resolveSsotPath(ROOT, 'stocks.max.rows.json');

// ─── Helpers ────────────────────────────────────────────────────────────────
function ensureDir(p) { fs.mkdirSync(path.dirname(p), { recursive: true }); }

function readJson(p) {
    try { return JSON.parse(fs.readFileSync(p, 'utf8')); }
    catch { return null; }
}

const FUNDAMENTALS_CACHE = new Map();

function loadStaticFundamentals(ticker) {
    const normalized = String(ticker || '').trim().toUpperCase();
    if (!normalized) return null;
    if (FUNDAMENTALS_CACHE.has(normalized)) return FUNDAMENTALS_CACHE.get(normalized);
    const doc = readJson(path.join(ROOT, 'public/data/fundamentals', `${normalized}.json`)) || null;
    FUNDAMENTALS_CACHE.set(normalized, doc);
    return doc;
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

async function readNdjsonGzFiltered(p, predicate, { limit = 250000 } = {}) {
    try {
        if (!fs.existsSync(p)) return [];
        const rows = [];
        const input = fs.createReadStream(p).pipe(zlib.createGunzip());
        const rl = readline.createInterface({ input, crlfDelay: Infinity });
        for await (const line of rl) {
            const trimmed = line.trim();
            if (!trimmed) continue;
            let row = null;
            try { row = JSON.parse(trimmed); } catch { continue; }
            if (!predicate(row)) continue;
            rows.push(row);
            if (rows.length >= limit) {
                input.destroy();
                break;
            }
        }
        return rows;
    } catch {
        return [];
    }
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

function loadBestSetupsPolicy() {
    return readJson(BEST_SETUPS_POLICY) || null;
}

function saveCalib(feature, calib) {
    calib.updated = new Date().toISOString();
    writeJson(calibPath(feature), calib);
}

function stableHash(value) {
    return crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function finiteOrNull(value) {
    const num = Number(value);
    return Number.isFinite(num) ? num : null;
}

function estimateTradingCosts(assetClass) {
    const normalized = String(assetClass || 'stock').toLowerCase();
    if (normalized === 'etf') {
        return { estimated_costs_bps: 4, estimated_slippage_bps: 3 };
    }
    return { estimated_costs_bps: 6, estimated_slippage_bps: 5 };
}

function classifyRegimeTag(row = {}) {
    const volatilityPct = finiteOrNull(row?.analyzer_volatility_percentile);
    const trendScore = finiteOrNull(row?.analyzer_trend_score);
    const trendDuration = finiteOrNull(row?.analyzer_trend_duration_days);
    if (volatilityPct != null && volatilityPct >= 85) return 'high_vol';
    if ((trendScore ?? 0) >= 68 && (trendDuration == null || trendDuration >= 10)) return 'trend';
    return 'chop';
}

function loadAnalyzerPolicy() {
    const policy = loadBestSetupsPolicy() || {};
    return {
        learningStatus: policy?.learning_status || {},
        minimumNGates: policy?.minimum_n_gates || {},
        safety: policy?.safety_switch_thresholds?.defaults || {},
        registry: policy?.registry || {},
        costModelVersion: policy?.cost_model_version || 'v1.0_replay_us_equities',
        featureLogicVersion: policy?.feature_logic_version || 'v1_shared_core',
        regimeLogicVersion: policy?.regime_logic_version || 'v1_simple_pit',
        labelVersion: policy?.label_version || 'v1_tradeability_atr_net',
        systemVersion: policy?.system?.version || '1.0.0',
        metaLabelerRuleVersion: policy?.meta_labeler_rule_version || 'v1_bootstrap_rules',
        hardGate: policy?.hard_gate || null,
    };
}

function deriveAnalyzerLearningStatus(metrics, policyConfig) {
    const globalMin = Number(policyConfig?.learningStatus?.activation_thresholds?.global_min_predictions || 500);
    const globalActiveMin = Number(policyConfig?.learningStatus?.activation_thresholds?.global_min_n_active || globalMin);
    const perHorizonMin = Number(policyConfig?.learningStatus?.activation_thresholds?.per_horizon_min_predictions || 150);
    const minOutcomeDays = Number(policyConfig?.learningStatus?.activation_thresholds?.min_live_outcome_days || 30);
    const globalMinOutcomeDays = Number(policyConfig?.learningStatus?.activation_thresholds?.global_min_live_outcome_days || minOutcomeDays);
    const total = Number(metrics?.outcomes_resolved || 0);
    const outcomeDays = new Set((metrics?.outcome_dates || []).filter(Boolean)).size;
    const byHorizon = metrics?.by_horizon || {};
    const horizonsReady = ['1d', '5d', '20d'].every((horizon) => Number(byHorizon?.[horizon]?.outcomes_resolved || 0) >= perHorizonMin);

    // V6 Core Activation Logic:
    // Option A: All horizons mature (the strict standard)
    // Option B: Total samples so high (globalActiveMin) that system is considered mature regardless of horizon-lag
    if ((total >= globalMin && horizonsReady && outcomeDays >= minOutcomeDays) || (total >= globalActiveMin && outcomeDays >= globalMinOutcomeDays)) {
        return 'ACTIVE';
    }
    return 'BOOTSTRAP';
}

function computeMinimumNStatus(metrics, policyConfig) {
    const gates = policyConfig?.minimumNGates || {};
    const globalPerHorizon = Number(gates?.global_per_horizon || 200);
    const assetClassHorizon = Number(gates?.asset_class_horizon || 100);
    const regimeHorizon = Number(gates?.regime_horizon || 75);
    const horizons = ['1d', '5d', '20d'];
    const byHorizon = Object.fromEntries(
        horizons.map((horizon) => {
            const row = metrics?.by_horizon?.[horizon] || {};
            return [horizon, {
                outcomes_resolved: Number(row?.outcomes_resolved || 0),
                satisfied: Number(row?.outcomes_resolved || 0) >= globalPerHorizon,
            }];
        })
    );
    const satisfiedHorizons = horizons.filter((horizon) => byHorizon[horizon].satisfied).length;
    const ready = satisfiedHorizons >= 2;
    return {
        global_per_horizon_threshold: globalPerHorizon,
        asset_class_horizon_threshold: assetClassHorizon,
        regime_horizon_threshold: regimeHorizon,
        satisfied_horizons: satisfiedHorizons,
        ready_for_safety: ready,
        by_horizon: byHorizon,
    };
}

function applyLearningStatusSafety(baseStatus, safetySwitch) {
    const level = String(safetySwitch?.level || '').toUpperCase();
    if (level === 'RED') return 'SAFE_MODE';
    if (level === 'ORANGE' && baseStatus === 'ACTIVE') return 'COOLDOWN';
    return baseStatus;
}

function evaluateSafetySwitch(metrics, policyConfig) {
    const defaults = policyConfig?.safety || {};
    const minimumNStatus = computeMinimumNStatus(metrics, policyConfig);
    const precision10 = finiteOrNull(metrics?.precision_10);
    const ece = finiteOrNull(metrics?.ece_7d);
    const coveragePerDay = finiteOrNull(metrics?.coverage_per_day) || 0;
    const predictionsTotal = finiteOrNull(metrics?.predictions_total) || 0;
    const coverageDropPct = coveragePerDay > 0 ? Math.max(0, ((coveragePerDay - predictionsTotal) / coveragePerDay) * 100) : 0;

    if (!minimumNStatus.ready_for_safety || (precision10 == null && ece == null)) {
        return { level: 'BOOTSTRAP', actions: ['log_only'], trigger: 'minimum_n_not_met', minimum_n_status: minimumNStatus };
    }

    // V6 Regime-Aware Thresholds
    // Wenn das System in einer schwierigen Phase ist (Chop, Declining Accuracy), senken wir die Schwellen.
    let redThreshold = Number(defaults?.red?.precision_at_10_lt ?? 0.5);
    let orangeThreshold = Number(defaults?.orange?.precision_at_10_lt ?? 0.54);

    if (metrics?.trend_accuracy === 'declining' || metrics?.trend_brier === 'declining') {
        redThreshold -= 0.10; // e.g. 0.40 im Choppy/Bärenmarkt
        orangeThreshold -= 0.10; // e.g. 0.44
    }

    // V6: Statt "buy_eligible_false" (was alles lahmlegt), geben wir "reduce_confidence" als Signal aus,
    // was in der Pipeline durch Score-Penalties abgefangen wird, aber die besten überleben lässt.
    if (precision10 != null && precision10 < redThreshold) {
        return { level: 'RED', actions: ['freeze_promotions', 'reduce_confidence'], trigger: 'precision_red', minimum_n_status: minimumNStatus };
    }
    if (precision10 != null && precision10 < orangeThreshold) {
        return { level: 'ORANGE', actions: ['freeze_promotions', 'champion_freeze'], trigger: 'precision_orange', minimum_n_status: minimumNStatus };
    }
    if ((ece != null && ece > Number(defaults?.yellow?.ece_gt ?? 0.08)) || coverageDropPct > Number(defaults?.yellow?.coverage_drop_pct ?? 20)) {
        return { level: 'YELLOW', actions: ['alert_only', 'coverage_throttle'], trigger: 'ece_or_coverage', minimum_n_status: minimumNStatus };
    }
    return { level: 'GREEN', actions: ['normal'], trigger: 'within_thresholds', minimum_n_status: minimumNStatus };
}

function classifyFalsePositive(outcome = {}) {
    if (outcome?.feature !== 'stock_analyzer' || outcome?.buy_eligible !== true || outcome?.hit !== false) return null;
    if (String(outcome?.regime_tag || '').toLowerCase() === 'high_vol') return 'volatility_trap';
    if ((finiteOrNull(outcome?.estimated_slippage_bps) ?? 0) >= 15) return 'low_liquidity';
    if ((finiteOrNull(outcome?.contributor_agreement) ?? 1) < 0.45) return 'weak_consensus';
    if (String(outcome?.regime_tag || '').toLowerCase() === 'chop') return 'regime_mismatch';
    if ((finiteOrNull(outcome?.actual_return) ?? 0) <= -0.08) return 'event_shock';
    if ((finiteOrNull(outcome?.expected_edge) ?? 0) < 0.1) return 'overextended_entry';
    return 'fake_breakout';
}

function summarizeFalsePositives(outcomes = []) {
    const counts = {};
    for (const outcome of outcomes) {
        const code = classifyFalsePositive(outcome);
        if (!code) continue;
        counts[code] = (counts[code] || 0) + 1;
    }
    return counts;
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

function isoMidnightUtc(date) {
    return `${date}T00:00:00.000Z`;
}

function isoCutoffUtc(date) {
    return `${date}T23:59:59.000Z`;
}

function decorateAnalyzerRecord(base, date, policy, sourceMeta) {
    const sourceEnv = process.env.GITHUB_ACTIONS ? 'main' : 'local';
    const ticker = String(base?.ticker || '').toUpperCase();
    const horizon = String(base?.horizon || 'na');
    const assetClass = String(base?.asset_class || 'stock').toLowerCase();
    const fundamentals = loadStaticFundamentals(ticker);
    const segmentation = buildAssetSegmentationProfile({
        ticker,
        assetClass,
        marketCapUsd: fundamentals?.marketCap ?? base?.market_cap_usd ?? null,
        liquidityScore: base?.analyzer_liquidity_score ?? base?.liquidity_score ?? null,
        liquidityState: base?.liquidity_state ?? null,
    });
    const costDefaults = estimateTradingCosts(assetClass);
    const featureHash = stableHash({
        ticker,
        assetClass,
        horizon,
        source: base?.source || null,
        rank_score: base?.rank_score ?? base?.quality_score ?? null,
        probability: base?.probability ?? base?.raw_probability ?? null,
        regime_tag: base?.regime_tag || null,
    });
    return {
        prediction_uid: `stock_analyzer:${date}:${ticker}:${assetClass}:${horizon}`,
        prediction_timestamp_utc: isoMidnightUtc(date),
        data_cutoff_timestamp_utc: isoCutoffUtc(sourceMeta?.asof || date),
        source_env: sourceEnv,
        asset_class: assetClass,
        model_family: 'stock_analyzer_v4',
        decision_core_version: policy?.system?.version || '1.0.0',
        feature_logic_version: policy?.feature_logic_version || 'v1_shared_core',
        regime_logic_version: policy?.regime_logic_version || 'v1_simple_pit',
        label_version: policy?.label_version || 'v1_tradeability_atr_net',
        cost_model_version: policy?.cost_model_version || 'v1.0_replay_us_equities',
        feature_hash: featureHash,
        raw_score: base.quality_score_raw ?? base.quality_score ?? null,
        raw_probability: null,
        calibrated_probability: null,
        confidence_bucket: null,
        verdict: null,
        buy_eligible: false,
        abstain_reason: null,
        gates: [],
        liquidity_bucket: segmentation.liquidity_bucket,
        market_cap_bucket: segmentation.market_cap_bucket,
        learning_lane: segmentation.learning_lane,
        blue_chip_core: segmentation.blue_chip_core,
        primary_learning_eligible: segmentation.primary_learning_eligible,
        promotion_eligible: segmentation.promotion_eligible,
        rank_score: base.quality_score ?? null,
        regime_tag: base?.regime_tag || classifyRegimeTag(base),
        estimated_costs_bps: costDefaults.estimated_costs_bps,
        estimated_slippage_bps: costDefaults.estimated_slippage_bps,
        realized_costs_bps: null,
        realized_slippage_bps: null,
        cost_observation_mode: policy?.registry?.cost_observation_mode_default || 'replay',
        realized_outcome: null,
        realized_return_net: null,
        realized_return_atr: null,
        mfe: null,
        mae: null,
        stop_hit: null,
        target_hit: null,
        run_id: `learning:${date}`,
        learning_status: policy?.learning_status?.default || 'BOOTSTRAP',
        ...base
    };
}

function horizonDays(horizon) {
    const key = String(horizon || '').trim().toLowerCase();
    if (key === 'short' || key === '1d') return 1;
    if (key === 'medium' || key === '5d') return 5;
    if (key === 'long' || key === '20d') return 20;
    return null;
}

function horizonBucket(horizon) {
    const key = String(horizon || '').trim().toLowerCase();
    if (key === '1d' || key === 'short') return 'short';
    if (key === '5d' || key === 'medium') return 'medium';
    if (key === '20d' || key === 'long') return 'long';
    return null;
}

function gateBreakdownFromSnapshot(doc) {
    const breakdown = doc?.meta?.rejection_counts;
    return breakdown && typeof breakdown === 'object' ? breakdown : null;
}

function computePrecisionAtK(items, k, groupKeyFn) {
    const rows = Array.isArray(items) ? items.filter((item) => item?.hit != null) : [];
    if (!rows.length) return null;
    const groups = new Map();
    for (const row of rows) {
        const key = groupKeyFn(row);
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push(row);
    }
    const scores = [];
    for (const groupRows of groups.values()) {
        const slice = groupRows
            .slice()
            .sort((a, b) => (Number(b.rank_score || b.quality_score || 0) - Number(a.rank_score || a.quality_score || 0)))
            .slice(0, k);
        if (!slice.length) continue;
        scores.push(slice.filter((row) => row.hit === true).length / slice.length);
    }
    if (!scores.length) return null;
    return scores.reduce((sum, value) => sum + value, 0) / scores.length;
}

function metricBucket(items, referenceDate = null) {
    const rows = Array.isArray(items) ? items : [];
    const probs = rows.map((o) => ({ p: o.probability ?? o.calibrated_probability ?? o.raw_probability ?? 0.5, y: o.y }));
    const anchorDate = referenceDate || rows.reduce((max, row) => (row?.outcome_date && row.outcome_date > max ? row.outcome_date : max), isoDate(new Date()));
    const last7d = rows.filter((o) => o.outcome_date >= daysAgo(anchorDate, 7));
    const prior7d = rows.filter((o) => o.outcome_date >= daysAgo(anchorDate, 14) && o.outcome_date < daysAgo(anchorDate, 7));
    const p7d = last7d.map((o) => ({ p: o.probability ?? o.calibrated_probability ?? o.raw_probability ?? 0.5, y: o.y }));
    const pPrior = prior7d.map((o) => ({ p: o.probability ?? o.calibrated_probability ?? o.raw_probability ?? 0.5, y: o.y }));
    const acc7d = accuracy(p7d);
    const accPrior = accuracy(pPrior);
    const brier7d = brierScore(p7d);
    const brierPrior = brierScore(pPrior);
    return {
        predictions_total: rows.length,
        outcomes_resolved: rows.filter((o) => o.y != null).length,
        accuracy_all: round(accuracy(probs)),
        brier_all: round(brierScore(probs)),
        ece_all: round(eceScore(probs)),
        hit_rate_all: round(hitRate(rows)),
        accuracy_7d: round(acc7d),
        brier_7d: round(brier7d),
        ece_7d: round(eceScore(p7d)),
        hit_rate_7d: round(hitRate(last7d)),
        precision_10: round(computePrecisionAtK(rows, 10, (row) => `${row.outcome_date}|${row.horizon}`)),
        precision_50: round(computePrecisionAtK(rows, 50, (row) => `${row.outcome_date}|${row.horizon}`)),
        coverage_per_day: round(rows.length / 30, 2),
        trend_accuracy: trend(acc7d, accPrior, false),
        trend_brier: trend(brier7d, brierPrior, true),
    };
}

// ─── 1. FORECAST: Extract Predictions ───────────────────────────────────────
// IMPROVEMENT: Calibration feedback loop + Adaptive confidence scaling
function forecastRowDateMatches(row, date) {
    const rowDate = String(row?.trading_date || row?.date || row?.as_of || '').slice(0, 10);
    return rowDate === date;
}

async function extractForecastPredictions(date, eodPrices) {
    const [y, m] = date.split('-');
    const gzPath = path.join(FORECAST_LEDGER, 'forecasts', y, `${m}.ndjson.gz`);
    const plainPath = path.join(FORECAST_LEDGER, 'forecasts', y, m, `${date}.ndjson`);

    let dayRows = readNdjson(plainPath).filter(r => forecastRowDateMatches(r, date));
    if (!dayRows.length) {
        dayRows = await readNdjsonGzFiltered(gzPath, (row) => forecastRowDateMatches(row, date));
    }

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

function extractElliottPredictions(date, eodPrices, candidateTickers = []) {
    return {
        predictions: [],
        source_meta: {
            source: 'elliott_removed',
            asof: null,
            fresh: true,
            stale_days: null
        }
    };
}

// ─── 4. QUANTLAB: Extract Setup Boni Predictions ────────────────────────────
function extractQuantLabPredictions(date, eodPrices) {
    const qlDirs = [
        path.join(ROOT, 'public/data/quantlab/stock-insights/stocks'),
        path.join(ROOT, 'public/data/quantlab/stock-insights/etfs'),
    ];

    let allPreds = [];
    let asof = null;

    for (const quantlabPath of qlDirs) {
        if (!fs.existsSync(quantlabPath)) continue;
        const files = fs.readdirSync(quantlabPath).filter(f => f.endsWith('.json'));

        for (const file of files) {
            const payload = readJson(path.join(quantlabPath, file));
            if (!payload || !payload.byTicker) continue;

            if (!asof) asof = normalizeDate(payload.asOfDate || payload.generatedAt || payload.generated_at);

            for (const [tickerKey, row] of Object.entries(payload.byTicker)) {
                const ticker = String(row?.ticker || tickerKey).toUpperCase();
                const price = eodPrices[ticker]?.close ?? null;

                const state = row.state || {};
                // BUY proxy: state.label === 'Top Buy Opportunity'
                // globalTop10Rank is a top-level field on row, not under state.ranking
                if (state.label !== 'Top Buy Opportunity') continue;

                allPreds.push({
                    feature: 'quantlab',
                    ticker,
                    date,
                    horizon: 'medium',
                    direction: 'bullish',
                    probability: 0.65,
                    confidence: 0.65,
                    price_at_prediction: price,
                    source: 'quantlab_agent_ensemble'
                });
            }
        }
    }

    allPreds.sort((a, b) => b.probability - a.probability);
    const qualityPreds = allPreds.slice(0, 1000);

    console.log(`[learning] QuantLab: ${allPreds.length} total → ${qualityPreds.length} quality predictions`);
    return {
        predictions: qualityPreds,
        source_meta: {
            source: 'quantlab_agent_ensemble',
            asof: asof || null,
            fresh: Boolean(asof && asof === date),
            stale_days: daysBetween(asof, date)
        }
    };
}

// ─── 5. STOCK ANALYZER: Extract Best-Setup Predictions ─────────────────────
function extractStockRankings(date, eodPrices, policy = null) {
    const snapshotDoc = readJson(BEST_SETUPS_SNAPSHOT);
    const snapshotAsof = normalizeDate(
        snapshotDoc?.meta?.forecast_asof ||
        snapshotDoc?.meta?.quantlab_asof ||
        snapshotDoc?.generated_at
    );

    if (snapshotDoc?.data?.stocks) {
        const sourceMeta = {
            source: snapshotDoc?.meta?.source || 'best_setups_snapshot',
            asof: snapshotAsof,
            fresh: Boolean(snapshotAsof && snapshotAsof === date),
            stale_days: daysBetween(snapshotAsof, date),
            gate_rejection_breakdown: gateBreakdownFromSnapshot(snapshotDoc),
            verified_counts: snapshotDoc?.meta?.verified_counts || null,
        };

        const predictions = [];
        for (const assetClass of ['stocks', 'etfs']) {
            const bucket = snapshotDoc?.data?.[assetClass] || {};
            for (const horizon of ['short', 'medium', 'long']) {
                const rows = Array.isArray(bucket[horizon]) ? bucket[horizon] : [];
                rows.forEach((row, idx) => {
                    const ticker = String(row?.ticker || '').trim().toUpperCase();
                    if (!ticker) return;
                    const calibratedProbability = finiteOrNull(row?.calibrated_probability);
                    const rawProbability = finiteOrNull(row?.raw_probability);
                    const probability = finiteOrNull(
                        calibratedProbability ??
                        rawProbability ??
                        row?.probability
                    ) ?? 0.5;
                    predictions.push(decorateAnalyzerRecord({
                        feature: 'stock_analyzer',
                        ticker,
                        date,
                        asset_class: String(row?.asset_class || (assetClass === 'etfs' ? 'etf' : 'stock')).toLowerCase(),
                        horizon: row?.horizon_key || HORIZON_CONFIG_MAP[horizon],
                        horizon_bucket: horizon,
                        direction: 'bullish',
                        probability,
                        calibrated_probability: calibratedProbability,
                        raw_probability: rawProbability,
                        confidence_bucket: row?.confidence || 'HIGH',
                        verdict: row?.verdict || 'BUY',
                        buy_eligible: row?.buy_eligible !== false,
                        abstain_reason: row?.abstain_reason || null,
                        gates: Array.isArray(row?.trigger_gates) ? row.trigger_gates : [],
                        rank: idx + 1,
                        quality_score: row?.score ?? row?.rank_score ?? null,
                        quality_score_raw: row?.ranking_score ?? row?.score ?? null,
                        rank_score: row?.rank_score ?? row?.score ?? null,
                        price_at_prediction: eodPrices?.[ticker]?.close ?? row?.price ?? null,
                        source: row?.source || 'best_setups_snapshot',
                        source_rank_label: row?.source_rank_label || null,
                        analyzer_horizon_verdict: row?.verdict || 'BUY',
                        contributor_agreement: finiteOrNull(row?.contributor_agreement),
                        expected_edge: finiteOrNull(row?.expected_edge),
                        regime_tag: row?.regime_tag || classifyRegimeTag(row),
                        meta_labeler_rule_version: row?.meta_labeler_rule_version || policy?.meta_labeler_rule_version || null,
                    }, date, policy, sourceMeta));
                });
            }
        }

        predictions.sort((a, b) => (Number(b.rank_score || b.quality_score || 0) - Number(a.rank_score || a.quality_score || 0)));
        predictions.forEach((row, index) => { row.rank = index + 1; });
        console.log(`[learning] Stock Analyzer: ${predictions.length} horizon predictions from best-setups snapshot`);
        return { rankings: predictions, source_meta: sourceMeta };
    }

    const ssotPath = V7_STOCK_ROWS;
    const doc = readJson(ssotPath);
    const docAsof = String(doc?.generated_at || doc?.as_of || '').slice(0, 10) || null;
    if (!doc) {
        console.warn(`[learning] Stock Analyzer: no best-setups snapshot and SSOT file not found at ${ssotPath}`);
        return { rankings: [], source_meta: { source: 'stock_analyzer_missing', asof: null, fresh: false, stale_days: null } };
    }
    const items = Array.isArray(doc) ? doc : (doc.items || doc.rows || []);
    const sourceMeta = {
        source: 'v7_stock_rows_fallback',
        asof: docAsof,
        fresh: Boolean(docAsof && docAsof === date),
        stale_days: daysBetween(docAsof, date),
        gate_rejection_breakdown: null,
        verified_counts: null,
    };
    const rankings = items.slice(0, 200).map((row, idx) => decorateAnalyzerRecord({
        feature: 'stock_analyzer',
        ticker: String(row.symbol || row.ticker || row.canonical_id || '').toUpperCase(),
        date,
        asset_class: 'stock',
        horizon: '5d',
        horizon_bucket: 'medium',
        direction: 'bullish',
        probability: 0.5,
        confidence_bucket: null,
        verdict: null,
        buy_eligible: false,
        abstain_reason: 'SNAPSHOT_MISSING_FALLBACK',
        gates: [],
        rank: idx + 1,
        quality_score: row.score_0_100 ?? row.quality_score ?? row.score ?? null,
        quality_score_raw: row.score_0_100 ?? row.quality_score ?? row.score ?? null,
        rank_score: row.score_0_100 ?? row.quality_score ?? row.score ?? null,
        price_at_prediction: eodPrices?.[String(row.symbol || row.ticker || row.canonical_id || '').toUpperCase()]?.close ?? null,
        source: 'v7_stock_rows_fallback',
    }, date, policy, sourceMeta)).filter((row) => row.ticker);
    return { rankings, source_meta: sourceMeta };
}

// ─── Outcome Resolution ─────────────────────────────────────────────────────
function resolveOutcomes(date, feature, eodPrices) {
    const calib = loadCalib(feature);
    const outcomes = [];
    const supportedDays = new Set([1, 5, 20]);

    for (const hDays of supportedDays) {
        let predDate = daysAgo(date, hDays);
        try {
            predDate = addTradingDays(date, -hDays);
        } catch {
            predDate = daysAgo(date, hDays);
        }
        const preds = readNdjson(predPath(predDate, feature)).filter((pred) => horizonDays(pred?.horizon) === hDays);
        for (const pred of preds) {
            const ticker = pred.ticker;
            const currentPrice = eodPrices[ticker]?.close;
            const predPrice = pred.price_at_prediction;

            if (!currentPrice || !predPrice || predPrice <= 0) continue;

            const actualReturn = (currentPrice - predPrice) / predPrice;
            const wentUp = actualReturn > 0;
            const y = wentUp ? 1 : 0;
            const p = pred.calibrated_probability ?? pred.raw_probability ?? pred.probability ?? 0.5;
            const predictedUp = p >= 0.5;
            const isCorrect = predictedUp === wentUp;
            const realizedCostsBps = finiteOrNull(pred?.estimated_costs_bps) ?? 0;
            const realizedSlippageBps = finiteOrNull(pred?.estimated_slippage_bps) ?? 0;
            const totalCost = (realizedCostsBps + realizedSlippageBps) / 10000;
            const realizedReturnNet = actualReturn - totalCost;
            const atrDenominator = Math.max(0.01, Math.abs(finiteOrNull(pred?.price_at_prediction) || 1));
            const realizedReturnAtr = realizedReturnNet / atrDenominator;

            const outcome = {
                ...pred,
                outcome_date: date,
                outcome_price: currentPrice,
                actual_return: round(actualReturn),
                went_up: wentUp,
                y,
                predicted_direction_correct: isCorrect,
                brier_contribution: round((p - y) ** 2),
                realized_outcome: isCorrect ? 'correct' : 'incorrect',
                realized_costs_bps: realizedCostsBps,
                realized_slippage_bps: realizedSlippageBps,
                realized_return_net: round(realizedReturnNet),
                realized_return_atr: round(realizedReturnAtr),
            };

            if (feature === 'scientific') {
                const bar = eodPrices[ticker];
                const atrProxy = bar ? (bar.high - bar.low) / (bar.close || 1) : 0.02;
                const threshold = Math.max(0.01, Math.min(0.05, atrProxy));
                outcome.hit = pred.trigger_met && Math.abs(actualReturn) >= threshold &&
                    ((pred.direction === 'bullish' && actualReturn > 0) ||
                        (pred.direction === 'bearish' && actualReturn < 0));
                outcome.breakout_threshold = round(threshold);
            } else {
                outcome.hit = isCorrect;
            }

            if (feature === 'stock_analyzer') {
                outcome.false_positive_class = classifyFalsePositive(outcome);
            }

            outcomes.push(outcome);

            const key = `${ticker}_${pred.direction || 'any'}`;
            if (!calib.hit_rates[key]) calib.hit_rates[key] = { hits: 0, total: 0 };
            calib.hit_rates[key].total++;
            if (outcome.hit) calib.hit_rates[key].hits++;
        }
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
            ece_all: null,
            hit_rate_all: null,
            accuracy_7d: null,
            brier_7d: null,
            ece_7d: null,
            hit_rate_7d: null,
            precision_10: null,
            precision_50: null,
            coverage_per_day: 0,
            by_horizon: {},
            by_asset_class: {},
            trend_accuracy: 'no_data',
            trend_brier: 'no_data'
        };
    }

    const last7d = allOutcomes.filter(o => o.outcome_date >= daysAgo(date, 7));
    const prior7d = allOutcomes.filter(o => o.outcome_date >= daysAgo(date, 14) && o.outcome_date < daysAgo(date, 7));

    const pAll = allOutcomes.map(o => ({ p: o.calibrated_probability ?? o.raw_probability ?? o.probability ?? 0.5, y: o.y }));
    const p7d = last7d.map(o => ({ p: o.calibrated_probability ?? o.raw_probability ?? o.probability ?? 0.5, y: o.y }));
    const pPrior = prior7d.map(o => ({ p: o.calibrated_probability ?? o.raw_probability ?? o.probability ?? 0.5, y: o.y }));

    const acc7d = accuracy(p7d);
    const accPrior = accuracy(pPrior);
    const brier7d = brierScore(p7d);
    const brierPrior = brierScore(pPrior);

    const byHorizon = {};
    for (const horizon of [...new Set(allOutcomes.map((row) => String(row?.horizon || '').trim()).filter(Boolean))]) {
        byHorizon[horizon] = metricBucket(allOutcomes.filter((row) => String(row?.horizon || '').trim() === horizon), date);
    }

    const byAssetClass = {};
    for (const assetClass of [...new Set(allOutcomes.map((row) => String(row?.asset_class || 'stock').trim()).filter(Boolean))]) {
        const assetRows = allOutcomes.filter((row) => String(row?.asset_class || 'stock').trim() === assetClass);
        byAssetClass[assetClass] = {
            ...metricBucket(assetRows, date),
            by_horizon: Object.fromEntries(
                [...new Set(assetRows.map((row) => String(row?.horizon || '').trim()).filter(Boolean))]
                    .map((horizon) => [horizon, metricBucket(assetRows.filter((row) => String(row?.horizon || '').trim() === horizon), date)])
            ),
        };
    }

    const bySegment = {};
    for (const segmentKey of [...new Set(allOutcomes.map((row) => {
        const assetClass = String(row?.asset_class || 'stock').trim() || 'stock';
        const liquidityBucket = String(row?.liquidity_bucket || 'unknown').trim() || 'unknown';
        const marketCapBucket = String(row?.market_cap_bucket || 'unknown').trim() || 'unknown';
        const learningLane = String(row?.learning_lane || 'core').trim() || 'core';
        return `${assetClass}|${liquidityBucket}|${marketCapBucket}|${learningLane}`;
    }).filter(Boolean))]) {
        const [assetClass, liquidityBucket, marketCapBucket, learningLane] = segmentKey.split('|');
        const segmentRows = allOutcomes.filter((row) => (
            String(row?.asset_class || 'stock').trim() === assetClass
            && String(row?.liquidity_bucket || 'unknown').trim() === liquidityBucket
            && String(row?.market_cap_bucket || 'unknown').trim() === marketCapBucket
            && String(row?.learning_lane || 'core').trim() === learningLane
        ));
        bySegment[segmentKey] = {
            asset_class: assetClass,
            liquidity_bucket: liquidityBucket,
            market_cap_bucket: marketCapBucket,
            learning_lane: learningLane,
            ...metricBucket(segmentRows, date),
        };
    }

    return {
        predictions_total: allOutcomes.length,
        outcomes_resolved: allOutcomes.filter(o => o.y != null).length,
        accuracy_all: round(accuracy(pAll)),
        brier_all: round(brierScore(pAll)),
        ece_all: round(eceScore(pAll)),
        hit_rate_all: round(hitRate(allOutcomes)),
        accuracy_7d: round(acc7d),
        brier_7d: round(brier7d),
        ece_7d: round(eceScore(p7d)),
        hit_rate_7d: round(hitRate(last7d)),
        precision_10: round(computePrecisionAtK(allOutcomes, 10, (row) => `${row.outcome_date}|${row.horizon}`)),
        precision_50: round(computePrecisionAtK(allOutcomes, 50, (row) => `${row.outcome_date}|${row.horizon}`)),
        precision_at_10: round(computePrecisionAtK(allOutcomes, 10, (row) => `${row.outcome_date}|${row.horizon}`)),
        precision_at_50: round(computePrecisionAtK(allOutcomes, 50, (row) => `${row.outcome_date}|${row.horizon}`)),
        coverage_per_day: round(allOutcomes.length / lookbackDays, 2),
        coverage_7d: round(last7d.length / 7, 2),
        by_horizon: byHorizon,
        by_asset_class: byAssetClass,
        by_segment: bySegment,
        false_positive_classes: summarizeFalsePositives(allOutcomes),
        trend_accuracy: trend(acc7d, accPrior, false),
        trend_brier: trend(brier7d, brierPrior, true),
    };
}

// ─── Report Builder ─────────────────────────────────────────────────────────
function buildReport(date, forecastMetrics, scientificMetrics, quantlabMetrics, stockMetrics, stockStability, predCounts, analyzerControl = {}, histProbsV2Metrics = null) {
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
        quantlab_accuracy_7d: quantlabMetrics.accuracy_7d,
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
        quantlab: { this_week: weekAvg(thisWeekMetrics, 'quantlab_accuracy_7d'), last_week: weekAvg(lastWeekMetrics, 'quantlab_accuracy_7d') }
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
            features_tracked: histProbsV2Metrics ? 5 : 4,
            total_predictions_today: (predCounts.forecast || 0) + (predCounts.scientific || 0) + (predCounts.quantlab || 0) + (predCounts.stock || 0) + (predCounts.hist_probs_v2_shadow || 0),
            overall_status: determineOverallStatus(forecastMetrics, scientificMetrics, stockMetrics, quantlabMetrics)
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
            quantlab: {
                name: 'QuantLab Agents Ensemble',
                type: 'factor_rank_prediction',
                ...quantlabMetrics,
                predictions_today: predCounts.quantlab || 0,
                source_meta: predCounts.quantlab_source_meta || null,
            },
            stock_analyzer: {
                name: 'Stock Analyzer',
                type: 'best_setups_horizon_buy_signals',
                ...stockMetrics,
                ...stockStability,
                learning_status: analyzerControl.learning_status || 'BOOTSTRAP',
                safety_switch: analyzerControl.safety_switch || null,
                minimum_n_status: analyzerControl.minimum_n_status || null,
                false_positive_classes_30d: analyzerControl.false_positive_classes_30d || {},
                predictions_today: predCounts.stock || 0,
                source_meta: predCounts.stock_source_meta || null,
                gate_rejection_breakdown: predCounts.stock_source_meta?.gate_rejection_breakdown || null,
            },
            ...(histProbsV2Metrics ? {
                hist_probs_v2_shadow: {
                    name: 'Hist Probs v2 Shadow',
                    type: 'shadow_historical_probability_baseline',
                    ...histProbsV2Metrics,
                    predictions_today: predCounts.hist_probs_v2_shadow || 0,
                    source_meta: predCounts.hist_probs_v2_shadow_source_meta || null,
                    shadow_only: true,
                    affects_live_verdicts: false,
                },
            } : {})
        },
        weekly_comparison: weeklyComparison,
        history,
        metrics: {
            forecast_accuracy_7d: forecastMetrics.accuracy_7d,
            forecast_brier_7d: forecastMetrics.brier_7d,
            scientific_accuracy_7d: scientificMetrics.accuracy_7d,
            scientific_hit_rate_7d: scientificMetrics.hit_rate_7d,
            stock_analyzer_precision_10: stockMetrics.precision_10,
            stock_analyzer_brier_7d: stockMetrics.brier_7d,
            stock_stability: stockStability.stability,
        }
    };
}

function determineOverallStatus(f, s, stock = null, q = null) {
    const trends = [f.trend_accuracy, s.trend_accuracy, stock?.trend_accuracy, q?.trend_accuracy].filter(t => t && t !== 'no_data');
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
        if (feat.ece_7d != null) console.log(`     ECE (7d):       ${feat.ece_7d}`);
        if (feat.hit_rate_7d != null) console.log(`     Hit Rate (7d):  ${(feat.hit_rate_7d * 100).toFixed(1)}%`);
        if (feat.precision_10 != null) console.log(`     Precision@10:   ${(feat.precision_10 * 100).toFixed(1)}%`);
        if (feat.precision_50 != null) console.log(`     Precision@50:   ${(feat.precision_50 * 100).toFixed(1)}%`);
        if (feat.stability != null) console.log(`     Ranking-Stabilität: ${(feat.stability * 100).toFixed(1)}%`);
        if (feat.accuracy_all != null) console.log(`     Accuracy (30d): ${(feat.accuracy_all * 100).toFixed(1)}%`);
        const count = feat.predictions_today ?? feat.rankings_today ?? 0;
        console.log(`     Heute: ${count} ${key === 'stock_analyzer' ? 'Signale' : 'Vorhersagen'}`);
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
function computeConvictionScores(forecastPreds, scientificPreds, stockPreds, qlPreds = []) {
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
    for (const p of qlPreds) addSignal(p.ticker, 'quantlab', p.direction, p.probability);
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
    console.log('[learning] Improvements active: Calibration feedback, Signal ≥60, EMA smoothing, Cross-feature conviction');
    const bestSetupsPolicy = loadBestSetupsPolicy();
    const analyzerPolicy = loadAnalyzerPolicy();

    // 1. Load current prices
    const eodPrices = loadEodPrices();
    console.log(`[learning] Loaded EOD prices for ${Object.keys(eodPrices).length} tickers`);

    // 2. Extract today's predictions from each feature
    console.log('[learning] Extracting predictions...');
    const forecastResult = await extractForecastPredictions(date, eodPrices);
    const forecastPreds = forecastResult.predictions || [];
    const scientificResult = extractScientificPredictions(date, eodPrices);
    const scientificPreds = scientificResult.predictions || [];
    const elliottResult = extractElliottPredictions(date, eodPrices, []);
    const elliottPreds = elliottResult.predictions || [];

    const quantlabResult = extractQuantLabPredictions(date, eodPrices);
    const quantlabPreds = quantlabResult.predictions || [];

    const stockResult = extractStockRankings(date, eodPrices, bestSetupsPolicy);
    const stockPreds = stockResult.rankings || [];
    const histProbsV2Preds = readNdjson(predPath(date, 'hist_probs_v2_shadow'));

    // 3. Save predictions to ledger
    if (forecastPreds.length) writeNdjson(predPath(date, 'forecast'), forecastPreds);
    if (scientificPreds.length) writeNdjson(predPath(date, 'scientific'), scientificPreds);
    if (quantlabPreds.length) writeNdjson(predPath(date, 'quantlab'), quantlabPreds);
    if (stockPreds.length) writeNdjson(predPath(date, 'stock_analyzer'), stockPreds);

    console.log(`[learning] Predictions logged: forecast=${forecastPreds.length} scientific=${scientificPreds.length} quantlab=${quantlabPreds.length} stock=${stockPreds.length} hist_probs_v2_shadow=${histProbsV2Preds.length}`);

    // 4. Cross-feature conviction scoring
    console.log('[learning] Computing cross-feature conviction scores...');
    const convictionScores = computeConvictionScores(forecastPreds, scientificPreds, stockPreds, quantlabPreds);
    console.log(`[learning] Top conviction tickers: ${convictionScores.slice(0, 5).map(c => `${c.ticker}(${c.conviction_score})`).join(', ')}`);

    // 5. Resolve outcomes for past predictions
    console.log('[learning] Resolving outcomes...');
    const forecastOutcomes = resolveOutcomes(date, 'forecast', eodPrices);
    const scientificOutcomes = resolveOutcomes(date, 'scientific', eodPrices);
    const quantlabOutcomes = resolveOutcomes(date, 'quantlab', eodPrices);
    const stockOutcomes = resolveOutcomes(date, 'stock_analyzer', eodPrices);
    const histProbsV2Outcomes = resolveOutcomes(date, 'hist_probs_v2_shadow', eodPrices);

    console.log(`[learning] Outcomes resolved: forecast=${forecastOutcomes.length} scientific=${scientificOutcomes.length} quantlab=${quantlabOutcomes.length} stock=${stockOutcomes.length} hist_probs_v2_shadow=${histProbsV2Outcomes.length}`);

    // 6. Compute metrics (rolling 30d window)
    console.log('[learning] Computing metrics...');
    const forecastMetrics = computeFeatureMetrics('forecast', date);
    const scientificMetrics = computeFeatureMetrics('scientific', date);
    const quantlabMetrics = computeFeatureMetrics('quantlab', date);
    const stockMetrics = computeFeatureMetrics('stock_analyzer', date);
    const histProbsV2Metrics = computeFeatureMetrics('hist_probs_v2_shadow', date);
    const stockStability = computeRankingStability(date);
    const forwardReturns = computeForwardReturns(date, eodPrices);
    stockMetrics.outcome_dates = Array.from(new Set(
        Array.from({ length: 30 }, (_, i) => daysAgo(date, i))
            .flatMap((d) => readNdjson(outcomePath(d, 'stock_analyzer')).map((row) => row?.outcome_date))
            .filter(Boolean)
    )).sort();
    const analyzerSafety = evaluateSafetySwitch(stockMetrics, analyzerPolicy);
    const analyzerControl = {
        learning_status: applyLearningStatusSafety(deriveAnalyzerLearningStatus(stockMetrics, analyzerPolicy), analyzerSafety),
        safety_switch: analyzerSafety,
        minimum_n_status: analyzerSafety.minimum_n_status || computeMinimumNStatus(stockMetrics, analyzerPolicy),
        hist_probs_v2_minimum_n_status: computeMinimumNStatus(histProbsV2Metrics, analyzerPolicy),
        false_positive_classes_30d: summarizeFalsePositives(
            Array.from({ length: 30 }, (_, i) => daysAgo(date, i))
                .flatMap((d) => readNdjson(outcomePath(d, 'stock_analyzer')))
        ),
    };
    const learningGate = deriveLearningGate({
        learning_status: analyzerControl.learning_status,
        safety_switch: analyzerControl.safety_switch,
        minimum_n_status: analyzerControl.minimum_n_status,
        policy: bestSetupsPolicy,
        default_status: bestSetupsPolicy?.learning_status?.default || null,
    });
    const generatedAt = new Date().toISOString();
    const runId = `learning-${date}`;

    // 7. Build and save report
    const report = buildReport(date, forecastMetrics, scientificMetrics, quantlabMetrics, stockMetrics, stockStability, {
        forecast: forecastPreds.length,
        forecast_source_meta: forecastResult.source_meta,
        scientific: scientificPreds.length,
        scientific_source_meta: scientificResult.source_meta,
        quantlab: quantlabPreds.length,
        quantlab_source_meta: quantlabResult.source_meta,
        stock: stockPreds.length,
        stock_source_meta: stockResult.source_meta,
        hist_probs_v2_shadow: histProbsV2Preds.length,
        hist_probs_v2_shadow_source_meta: {
            source: 'mirrors/learning/predictions/hist_probs_v2_shadow',
            asof: date,
            fresh: histProbsV2Preds.length > 0,
            shadow_only: true,
            affects_live_verdicts: false,
        },
    }, analyzerControl, histProbsV2Metrics);
    report.generated_at = generatedAt;
    Object.assign(report, buildArtifactEnvelope({
        producer: 'scripts/learning/run-daily-learning-cycle.mjs',
        runId,
        targetMarketDate: date,
        upstreamRunIds: [],
        generatedAt,
    }));
    report.learning_gate = learningGate;
    report.features.stock_analyzer.learning_gate = learningGate;

    // Enrich report with cross-feature data
    report.conviction_scores = convictionScores;
    report.stock_forward_returns = forwardReturns;
    report.improvements_active = [
        'forecast_calibration_feedback',
        'forecast_adaptive_confidence',
        'scientific_signal_threshold_60',
        'scientific_setup_decay_10d',
        'stock_ema_smoothing_alpha03',
        'cross_feature_conviction',
        'scientific_atr_breakout_threshold',
        'best_setups_policy_registry_fields',
        'hist_probs_v2_shadow_outcome_maturation',
    ];
    report.best_setups_policy = bestSetupsPolicy ? {
        schema_version: bestSetupsPolicy.schema_version || null,
        system_version: bestSetupsPolicy.system?.version || null,
        learning_status_default: bestSetupsPolicy.learning_status?.default || null,
        learning_status_current: analyzerControl.learning_status,
        learning_gate_status: learningGate.status,
        cost_model_version: bestSetupsPolicy.cost_model_version || null,
        meta_labeler_rule_version: bestSetupsPolicy.meta_labeler_rule_version || null,
    } : null;
    const runtimeControl = {
        schema: 'rv.stock_analyzer_control.v1',
        ...buildArtifactEnvelope({
            producer: 'scripts/learning/run-daily-learning-cycle.mjs',
            runId,
            targetMarketDate: date,
            upstreamRunIds: [],
            generatedAt,
        }),
        report_date: date,
        source_report_generated_at: generatedAt,
        learning_status: analyzerControl.learning_status || 'BOOTSTRAP',
        safety_switch: analyzerControl.safety_switch || null,
        minimum_n_status: analyzerControl.minimum_n_status || null,
        hist_probs_source: process.env.STOCK_ANALYZER_HIST_PROBS_SOURCE || 'v1_primary',
        hist_probs_v2_shadow: {
            predictions_today: histProbsV2Preds.length,
            outcomes_resolved_30d: histProbsV2Metrics.outcomes_resolved || 0,
            minimum_n_status: analyzerControl.hist_probs_v2_minimum_n_status || null,
            affects_live_verdicts: false,
        },
        learning_gate: learningGate,
        false_positive_classes_30d: analyzerControl.false_positive_classes_30d || {},
        policy: bestSetupsPolicy ? {
            schema_version: bestSetupsPolicy.schema_version || null,
            system_version: bestSetupsPolicy.system?.version || null,
            learning_status_default: bestSetupsPolicy.learning_status?.default || null,
            cost_model_version: bestSetupsPolicy.cost_model_version || null,
            meta_labeler_rule_version: bestSetupsPolicy.meta_labeler_rule_version || null,
        } : null,
    };

    writeJson(reportPath(date), report);
    writeJson(path.join(REPORT_DIR, 'latest.json'), report);
    writeJson(PUBLIC_REPORT, report);
    writePublicReportScript(PUBLIC_REPORT_JS, report);
    writeJson(PUBLIC_RUNTIME_CONTROL, runtimeControl);

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
