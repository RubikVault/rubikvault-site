/**
 * Forecast System v3.0 — Daily Pipeline Runner
 * 
 * Orchestrates the complete daily forecast pipeline:
 * 1. Ingest snapshots from existing data sources
 * 2. Data quality gates (circuit breaker)
 * 3. Build features for each ticker
 * 4. Generate forecasts (live)
 * 5. Evaluate matured forecasts → outcomes
 * 6. Generate daily report
 * 7. Update status and latest pointers
 */

import fs from 'node:fs';
import path from 'node:path';
import { buildFeatureSnapshot } from './build_features.mjs';
import { loadPolicy, loadChampion, computePolicyHash, generateForecast, loadCalibrationArtifact, FORECAST_SCHEMA_VERSION, FORECAST_FEATURE_VERSION } from './forecast_engine.mjs';
import { writeForecastRecords, writeOutcomeRecords, iterateLedgerRangeAsync } from './ledger_writer.mjs';
import { computeOutcome, createOutcomeRecord } from './evaluator.mjs';
import { generateDailyReport, writeReport, generateScorecards, writeScorecards, updateStatus, updateLatest, updateLastGood, publishLatestFromLastGood } from './report_generator.mjs';
import { ingestSnapshots, loadPriceHistory, loadUniverse } from './snapshot_ingest.mjs';
import { resolveTradingDate, getHorizonOutcomeDate } from './trading_date.mjs';
import { writeForecastPhaseStatus } from './status_artifacts.mjs';
import { lookupMaturityHistory } from './maturity-lookup.mjs';
import { canEvaluateOutcomeDate } from './finality.mjs';

// ─────────────────────────────────────────────────────────────────────────────
// Configuration
// ─────────────────────────────────────────────────────────────────────────────

const HORIZONS = ['1d', '5d', '20d'];
const HORIZON_DAYS = { '1d': 1, '5d': 5, '20d': 20 };
const SKIP_MATURED_EVAL = process.env.FORECAST_SKIP_MATURED_EVAL === '1';
const FORECAST_RSS_BUDGET_MB = Math.max(128, Number(process.env.FORECAST_RSS_BUDGET_MB || 1024));

function elapsedMsSince(startedAt) {
    return Date.now() - startedAt;
}

async function loadExistingLedgerIds(repoRoot, ledgerType, startDate, endDate, idField) {
    const ids = new Set();
    for await (const row of iterateLedgerRangeAsync(repoRoot, ledgerType, startDate, endDate)) {
        const id = String(row?.[idField] || '').trim();
        if (id) ids.add(id);
    }
    return ids;
}

function enforceRssBudget(label, budgetMb = FORECAST_RSS_BUDGET_MB) {
    const rssMb = Math.round(process.memoryUsage().rss / (1024 * 1024));
    if (rssMb > budgetMb) {
        const error = new Error(`rss_budget_exceeded:${label}:${rssMb}MB>${budgetMb}MB`);
        error.code = 'FORECAST_RSS_BUDGET_EXCEEDED';
        error.rss_mb = rssMb;
        error.budget_mb = budgetMb;
        throw error;
    }
    return rssMb;
}

// ─────────────────────────────────────────────────────────────────────────────
// Pipeline Steps
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Run data quality checks
 * @param {object} snapshot - Ingested snapshot
 * @param {object} policy - Forecast policy
 * @returns {{ok: boolean, reason: string|null, circuit: 'open'|'closed'}}
 */
function runDataQualityGates(snapshot, policy) {
    const missingPricePct = snapshot.missing_price_pct ?? 0;
    const threshold = policy?.circuit_breaker?.missing_price_data_pct_trigger ?? 5.0;

    if (missingPricePct > threshold) {
        return {
            ok: false,
            reason: `Missing price data ${missingPricePct.toFixed(1)}% exceeds threshold ${threshold}%`,
            circuit: 'open'
        };
    }

    return { ok: true, reason: null, circuit: 'closed' };
}

/**
 * Generate forecasts for all tickers × horizons
 * @param {object} params
 * @returns {object[]} Forecast records
 */
async function generateAllForecasts({
    tradingDate,
    universe,
    priceHistory,
    spyPrices,
    championSpec,
    calibrationArtifacts,
    policyHash,
    codeHash,
    snapshotsManifest,
    policy
}) {
    const forecasts = [];
    const runId = `${tradingDate}_${Date.now().toString(36)}`;
    const asOf = new Date().toISOString();
    const enabledGroups = championSpec.enabled_feature_groups || policy?.feature_groups?.enabled_default || [];
    const skipStats = {
        insufficient_history: 0,
        missing_features: 0
    };
    const skipSamples = {
        insufficient_history: [],
        missing_features: []
    };

    function pushSkipSample(bucket, value) {
        if (!Array.isArray(skipSamples[bucket])) return;
        if (skipSamples[bucket].length >= 12) return;
        skipSamples[bucket].push(value);
    }

    for (const ticker of universe) {
        const closes = priceHistory[ticker]?.closes ?? [];
        const volumes = priceHistory[ticker]?.volumes ?? [];

        if (closes.length < 200) {
            skipStats.insufficient_history += 1;
            pushSkipSample('insufficient_history', `${ticker}(${closes.length})`);
            continue;
        }

        // Build features
        const featureSnapshot = buildFeatureSnapshot({
            ticker,
            tradingDate,
            closes,
            volumes,
            spyCloses: spyPrices?.closes ?? null,
            eventFlags: null, // TODO: integrate event calendar
            enabledGroups
        });

        // Skip if too many missing features
        if (featureSnapshot.missing_features.length > enabledGroups.length * 0.3) {
            skipStats.missing_features += 1;
            pushSkipSample('missing_features', ticker);
            continue;
        }

        // Generate forecast for each horizon
        for (const horizon of HORIZONS) {
            const forecast = generateForecast({
                ticker,
                tradingDate,
                horizon,
                featureSnapshot,
                championSpec,
                policyHash,
                codeHash,
                snapshotsManifest,
                provenance: 'live',
                asOf,
                runId,
                calibrationData: calibrationArtifacts?.[horizon] || null,
            });

            forecasts.push(forecast);
        }
    }

    if (skipStats.insufficient_history > 0 || skipStats.missing_features > 0) {
        console.log(
            `[Forecast] Skip summary: insufficient_history=${skipStats.insufficient_history}, missing_features=${skipStats.missing_features}`
        );
        if (skipSamples.insufficient_history.length > 0) {
            console.log(`[Forecast] Sample insufficient_history: ${skipSamples.insufficient_history.join(', ')}`);
        }
        if (skipSamples.missing_features.length > 0) {
            console.log(`[Forecast] Sample missing_features: ${skipSamples.missing_features.join(', ')}`);
        }
    }

    return forecasts;
}

/**
 * Evaluate matured forecasts
 * @param {object} params
 * @returns {object[]} Outcome records
 */
async function evaluateMaturedForecasts({
    tradingDate,
    repoRoot,
    policy,
    champion
}) {
    const outcomes = [];
    const envLedgerScanMonths = Number(process.env.FORECAST_LEDGER_SCAN_MONTHS || 0);
    const maxMonths = envLedgerScanMonths > 0
        ? envLedgerScanMonths
        : (policy?.ledger_partitioning?.max_months_to_scan_for_metrics ?? 6);
    const modelVersion = champion?.model_version || champion?.champion_id || null;
    const meta = {
        deprecated_forecasts: 0,
        superseded_forecasts: 0,
        incompatible_samples: [],
    };

    // Scan recent forecasts for matured horizons
    const today = new Date(tradingDate);
    const startDate = new Date(today);
    startDate.setMonth(startDate.getMonth() - maxMonths);
    const existingOutcomeForecastIds = await loadExistingLedgerIds(
        repoRoot,
        'outcomes',
        startDate.toISOString().slice(0, 10),
        tradingDate,
        'forecast_id'
    );
    const seenForecastIds = new Set();

    const candidateByKey = new Map();
    for await (const forecast of iterateLedgerRangeAsync(
        repoRoot,
        'forecasts',
        startDate.toISOString().slice(0, 10),
        tradingDate
    )) {
        const forecastId = String(forecast?.forecast_id || '').trim();
        if (!forecastId || seenForecastIds.has(forecastId) || existingOutcomeForecastIds.has(forecastId)) continue;
        seenForecastIds.add(forecastId);
        if (forecast?.provenance !== 'live') continue;
        if (forecast?.record_status && forecast.record_status !== 'active') continue;
        const schemaVersion = String(forecast?.schema_version || forecast?.schema || '').trim();
        const featureVersion = String(forecast?.feature_version || '').trim();
        const forecastModelVersion = String(forecast?.model_version || '').trim();
        const versionCompatible = (
            schemaVersion === FORECAST_SCHEMA_VERSION &&
            featureVersion === FORECAST_FEATURE_VERSION &&
            (!modelVersion || forecastModelVersion === modelVersion)
        );
        if (!versionCompatible) {
            meta.deprecated_forecasts += 1;
            if (meta.incompatible_samples.length < 25) {
                meta.incompatible_samples.push({
                    forecast_id: forecastId,
                    ticker: forecast?.ticker || null,
                    horizon: forecast?.horizon || null,
                    trading_date: forecast?.trading_date || null,
                    schema_version: schemaVersion || null,
                    feature_version: featureVersion || null,
                    model_version: forecastModelVersion || null,
                });
            }
            continue;
        }
        const horizonDays = HORIZON_DAYS[forecast.horizon] ?? 1;
        const outcomeDate = getHorizonOutcomeDate(forecast.trading_date, horizonDays);

        // Check if outcome date has arrived
        if (outcomeDate > tradingDate) continue;
        const finality = canEvaluateOutcomeDate(repoRoot, outcomeDate, tradingDate);
        if (!finality.ok) continue;
        const logicalKey = `${forecast.ticker}|${forecast.trading_date}|${forecast.horizon}`;
        const previous = candidateByKey.get(logicalKey);
        if (previous) {
            meta.superseded_forecasts += 1;
            const previousAsOf = String(previous.as_of || '');
            const currentAsOf = String(forecast.as_of || '');
            if (currentAsOf > previousAsOf) {
                candidateByKey.set(logicalKey, { ...forecast, outcomeDate });
            }
            continue;
        }
        candidateByKey.set(logicalKey, { ...forecast, outcomeDate });
    }

    const maturedForecasts = [...candidateByKey.values()];
    const maturityHistory = await lookupMaturityHistory(repoRoot, maturedForecasts, tradingDate);

    for (const forecast of maturedForecasts) {
        const tickerPrices = maturityHistory[String(forecast?.ticker || '').trim().toUpperCase()];
        if (!tickerPrices) continue;

        const forecastIdx = tickerPrices.dates?.indexOf(forecast.trading_date);
        const outcomeIdx = tickerPrices.dates?.indexOf(forecast.outcomeDate);

        if (forecastIdx === -1 || outcomeIdx === -1) continue;

        const priceAtForecast = tickerPrices.closes[forecastIdx];
        const priceAtOutcome = tickerPrices.closes[outcomeIdx];

        const y = computeOutcome(priceAtForecast, priceAtOutcome);
        if (y === null) continue;

        const outcome = createOutcomeRecord(forecast, y, forecast.outcomeDate);
        outcomes.push(outcome);
    }

    return { outcomes, meta };
}

function deriveDirection(p_up, neutralFlag) {
    if (neutralFlag) return 'neutral';
    if (p_up > 0.53) return 'bullish';
    if (p_up < 0.47) return 'bearish';
    return 'neutral';
}

function buildForecastsSummary(forecasts) {
    const byTicker = new Map();
    for (const forecast of forecasts || []) {
        if (!byTicker.has(forecast.ticker)) {
            byTicker.set(forecast.ticker, {});
        }
        byTicker.get(forecast.ticker)[forecast.horizon] = forecast;
    }

    const buildHorizon = (fc) => fc ? {
        direction: deriveDirection(fc.p_up, fc.neutral_flag),
        probability: fc.p_up
    } : null;

    return Array.from(byTicker.entries())
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([ticker, horizons]) => ({
            symbol: ticker,
            name: null,
            horizons: {
                '1d': buildHorizon(horizons['1d']),
                '5d': buildHorizon(horizons['5d']),
                '20d': buildHorizon(horizons['20d'])
            }
        }));
}

function buildAccuracySummary(outcomes) {
    if (!outcomes.length) return null;
    return {
        directional: Number(
            (
                outcomes.filter((o) => {
                    const predicted = Number(o?.p_up) >= 0.5 ? 1 : 0;
                    return predicted === Number(o?.y);
                }).length / outcomes.length
            ).toFixed(4)
        ),
        brier: Number(
            (
                outcomes.reduce((sum, o) => sum + Number(o?.metrics?.brier || 0), 0) / outcomes.length
            ).toFixed(6)
        ),
        sample_count: outcomes.length
    };
}

// ─────────────────────────────────────────────────────────────────────────────
// Main Pipeline
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Run the generate phase
 * @param {object} options
 */
export async function runGeneratePhase(options = {}) {
    const repoRoot = options.repoRoot ?? process.cwd();
    const forceDate = options.date ?? null;

    writeForecastPhaseStatus(repoRoot, 'generate', {
        status: 'running',
        trading_date: forceDate,
        counts: {},
        meta: {
            log_path: process.env.FORECAST_PHASE_LOG_PATH || null,
        },
    });
    const phaseStartedAt = Date.now();
    const timings = {};

    // 1. Load policy and champion
    console.log('[Step 1] Loading policy and champion spec...');
    let stepStartedAt = Date.now();
    const policy = loadPolicy(repoRoot);
    const champion = loadChampion(repoRoot);
    const calibrationArtifacts = Object.fromEntries(HORIZONS.map((horizon) => [horizon, loadCalibrationArtifact(repoRoot, horizon)]));
    const policyHash = computePolicyHash(repoRoot);
    const codeHash = options.codeHash ?? 'local-dev';
    timings.load_policy_ms = elapsedMsSince(stepStartedAt);

    console.log(`  Policy: ${policy.system.id} v${policy.system.version}`);
    console.log(`  Champion: ${champion.champion_id}`);

    // 2. Resolve trading date
    console.log('[Step 2] Resolving trading date...');
    const tradingDate = forceDate ?? resolveTradingDate(new Date(), policy);
    console.log(`  Trading Date: ${tradingDate}`);
    const rssAtStart = enforceRssBudget('generate_start');

    // 3. Ingest snapshots
    console.log('[Step 3] Ingesting snapshots...');
    stepStartedAt = Date.now();
    const snapshot = await ingestSnapshots(repoRoot, tradingDate, policy);
    timings.ingest_snapshots_ms = elapsedMsSince(stepStartedAt);
    console.log(`  Universe: ${snapshot.universe?.length ?? 0} tickers`);
    console.log(`  Missing price data: ${(snapshot.missing_price_pct ?? 0).toFixed(1)}%`);
    const rssAfterIngest = enforceRssBudget('generate_after_ingest');

    // 4. Data quality gates
    console.log('[Step 4] Running data quality gates...');
    const qualityResult = runDataQualityGates(snapshot, policy);

    if (!qualityResult.ok) {
        console.log(`  ❌ CIRCUIT OPEN: ${qualityResult.reason}`);
        const fallbackReason = `Using last_good forecasts: ${qualityResult.reason}`;

        const fallbackLatest = publishLatestFromLastGood(repoRoot, {
            reason: fallbackReason,
            status: 'stale'
        });

        // Publish last_good and mark as stale fallback.
        updateStatus(repoRoot, {
            status: 'stale',
            reason: fallbackReason,
            circuit_state: 'closed',
            last_run: tradingDate,
            last_good: fallbackLatest?.meta?.last_good_ref ?? null
        });

        writeForecastPhaseStatus(repoRoot, 'generate', {
            status: 'degraded',
            reason: fallbackReason,
            trading_date: tradingDate,
        counts: {
            universe: snapshot.universe?.length ?? 0,
            forecasts_generated: 0,
            forecasts_written: 0,
            elapsed_seconds: Number(((Date.now() - phaseStartedAt) / 1000).toFixed(1)),
        },
            meta: {
                log_path: process.env.FORECAST_PHASE_LOG_PATH || null,
            },
        });

        console.log('  Pipeline degraded. Published last_good.');
        return { ok: true, degraded: true, reason: fallbackReason, tradingDate, policy, champion, snapshot, forecasts: [] };
    }

    console.log('  ✓ Data quality OK');

    // 5. Load price history
    console.log('[Step 5] Loading price history...');
    stepStartedAt = Date.now();
    const priceHistory = await loadPriceHistory(repoRoot, snapshot.universe, tradingDate);
    timings.load_price_history_ms = elapsedMsSince(stepStartedAt);
    // Multi-exchange benchmark: prefer SPY, fallback to broad equity ETFs
    const BENCHMARK_CANDIDATES = ['SPY', 'VT', 'ACWI', 'IWDA'];
    const spyPrices = BENCHMARK_CANDIDATES.reduce((found, sym) => found || priceHistory[sym] || null, null);
    console.log(`  Loaded history for ${Object.keys(priceHistory).length} tickers (benchmark: ${BENCHMARK_CANDIDATES.find(s => priceHistory[s]) || 'none'})`);
    const rssAfterHistory = enforceRssBudget('generate_after_history');

    // 6. Generate forecasts
    console.log('[Step 6] Generating forecasts...');
    stepStartedAt = Date.now();
    const forecasts = await generateAllForecasts({
        tradingDate,
        universe: snapshot.universe,
        priceHistory,
        spyPrices,
        championSpec: champion,
        calibrationArtifacts,
        policyHash,
        codeHash,
        snapshotsManifest: snapshot.manifest,
        policy
    });
    timings.generate_forecasts_ms = elapsedMsSince(stepStartedAt);
    console.log(`  Generated ${forecasts.length} forecasts`);
    const rssAfterForecasts = enforceRssBudget('generate_after_forecasts');

    if (forecasts.length === 0) {
        const fallbackReason = 'Using last_good forecasts: no fresh forecasts generated';
        const fallbackLatest = publishLatestFromLastGood(repoRoot, {
            reason: fallbackReason,
            status: 'stale'
        });
        updateStatus(repoRoot, {
            status: 'stale',
            reason: fallbackReason,
            circuit_state: 'closed',
            last_run: tradingDate,
            last_good: fallbackLatest?.meta?.last_good_ref ?? null
        });
        writeForecastPhaseStatus(repoRoot, 'generate', {
            status: 'degraded',
            reason: fallbackReason,
            trading_date: tradingDate,
        counts: {
            universe: snapshot.universe?.length ?? 0,
            forecasts_generated: 0,
            forecasts_written: 0,
            elapsed_seconds: Number(((Date.now() - phaseStartedAt) / 1000).toFixed(1)),
        },
            meta: {
                log_path: process.env.FORECAST_PHASE_LOG_PATH || null,
            },
        });
        console.log('  Pipeline degraded. Published last_good.');
        return { ok: true, degraded: true, reason: fallbackReason, tradingDate, policy, champion, snapshot, forecasts: [] };
    }

    // 7. Write forecast records
    console.log('[Step 7] Writing forecast records to ledger...');
    stepStartedAt = Date.now();
    const currentMonthStart = `${tradingDate.slice(0, 7)}-01`;
    const existingForecastIds = await loadExistingLedgerIds(
        repoRoot,
        'forecasts',
        currentMonthStart,
        tradingDate,
        'forecast_id'
    );
    timings.load_existing_forecast_ids_ms = elapsedMsSince(stepStartedAt);
    stepStartedAt = Date.now();
    const newForecasts = forecasts.filter((forecast) => !existingForecastIds.has(String(forecast?.forecast_id || '').trim()));
    writeForecastRecords(repoRoot, newForecasts);
    timings.write_forecast_records_ms = elapsedMsSince(stepStartedAt);

    if (options.writeLatest === true) {
        updateLatest(repoRoot, {
            ok: true,
            status: 'ok',
            reason: null,
            champion_id: champion.champion_id,
            trained_at: champion.created_at ?? null,
            freshness: tradingDate,
            accuracy: null,
            asof: tradingDate,
            forecasts: buildForecastsSummary(forecasts),
            latest_report_ref: `public/data/forecast/reports/daily/${tradingDate}.json`,
            scorecards_ref: 'public/data/forecast/scorecards/tickers.json.gz',
            maturity_phase: 'BOOTSTRAP'
        });
    }

    writeForecastPhaseStatus(repoRoot, 'generate', {
        status: 'ok',
        trading_date: tradingDate,
        counts: {
            universe: snapshot.universe?.length ?? 0,
            forecasts_generated: forecasts.length,
            forecasts_written: newForecasts.length,
            elapsed_seconds: Number(((Date.now() - phaseStartedAt) / 1000).toFixed(1)),
        },
        meta: {
            champion_id: champion.champion_id,
            log_path: process.env.FORECAST_PHASE_LOG_PATH || null,
            rss_budget_mb: FORECAST_RSS_BUDGET_MB,
            rss_usage_mb: rssAfterForecasts,
            rss_start_mb: rssAtStart,
            rss_after_ingest_mb: rssAfterIngest,
            rss_after_history_mb: rssAfterHistory,
            timings_ms: timings,
        },
    });

    return {
        ok: true,
        tradingDate,
        policy,
        champion,
        snapshot,
        forecasts,
    };
}

export async function runEvaluatePhase(options = {}) {
    const repoRoot = options.repoRoot ?? process.cwd();
    const policy = options.policy ?? loadPolicy(repoRoot);
    const tradingDate = options.tradingDate ?? options.date ?? resolveTradingDate(new Date(), policy);
    const champion = options.champion ?? null;
    const snapshot = options.snapshot ?? null;
    const forecasts = options.forecasts ?? [];

    writeForecastPhaseStatus(repoRoot, 'evaluate', {
        status: 'running',
        trading_date: tradingDate,
        counts: {},
        meta: {
            log_path: process.env.FORECAST_PHASE_LOG_PATH || null,
        },
    });
    const phaseStartedAt = Date.now();
    const rssAtStart = enforceRssBudget('evaluate_start');

    // 8. Evaluate matured forecasts
    console.log('[Step 8] Evaluating matured forecasts...');
    let outcomes = [];
    let evaluationWarning = null;
    if (SKIP_MATURED_EVAL) {
        evaluationWarning = 'maturity_eval_skipped:FORECAST_SKIP_MATURED_EVAL';
        console.warn('  ⚠ Skipping maturity evaluation (FORECAST_SKIP_MATURED_EVAL=1). Continuing with fresh forecasts.');
    } else {
        try {
            const evaluation = await evaluateMaturedForecasts({
                tradingDate,
                repoRoot,
                policy,
                champion
            });
            outcomes = evaluation.outcomes;
            const evaluationMeta = evaluation.meta || {};
            options._evaluationMeta = evaluationMeta;
            console.log(`  Evaluated ${outcomes.length} outcomes`);
            enforceRssBudget('evaluate_after_maturity_lookup');
        } catch (err) {
            if (err?.code === 'ERR_STRING_TOO_LONG') {
                evaluationWarning = `maturity_eval_skipped:${err.code}`;
                outcomes = [];
                console.warn(`  ⚠ Skipping maturity evaluation (${err.code}). Continuing with fresh forecasts.`);
            } else {
                throw err;
            }
        }
    }

    // 9. Write outcome records
    if (outcomes.length > 0) {
        console.log('[Step 9] Writing outcome records to ledger...');
        writeOutcomeRecords(repoRoot, outcomes);
    }

    // 10. Generate daily report
    console.log('[Step 10] Generating daily report...');
    const report = generateDailyReport({
        date: tradingDate,
        outcomes,
        policy,
        meta: {
            circuit_state: 'closed',
            has_earnings: false,
            has_macro: false,
            missing_price_pct: snapshot?.missing_price_pct ?? 0,
            evaluation_warning: evaluationWarning
        }
    });
    writeReport(repoRoot, report, 'daily');

    // 11. Generate scorecards
    console.log('[Step 11] Generating scorecards...');
    const scorecards = generateScorecards({ outcomes, policy });
    writeScorecards(repoRoot, scorecards);

    // 12. Update status and latest
    console.log('[Step 12] Updating status and latest pointers...');
    updateStatus(repoRoot, {
        status: evaluationWarning ? 'degraded' : 'ok',
        circuit_state: 'closed',
        last_run: tradingDate,
        reason: evaluationWarning,
        capabilities: {
            has_prices: true,
            has_earnings: false,
            has_macro: false
        }
    });
    let latestDoc = null;
    if (options.writeLatest === true && champion && forecasts.length > 0) {
        latestDoc = updateLatest(repoRoot, {
            ok: true,
            status: evaluationWarning ? 'degraded' : 'ok',
            reason: evaluationWarning,
            champion_id: champion.champion_id,
            trained_at: champion.created_at ?? null,
            freshness: tradingDate,
            accuracy: buildAccuracySummary(outcomes),
            asof: tradingDate,
            forecasts: buildForecastsSummary(forecasts),
            latest_report_ref: `public/data/forecast/reports/daily/${tradingDate}.json`,
            scorecards_ref: 'public/data/forecast/scorecards/tickers.json.gz',
            maturity_phase: report.maturity_phase
        });

        updateLastGood(repoRoot, {
            champion_id: champion.champion_id,
            report_ref: `public/data/forecast/reports/daily/${tradingDate}.json`,
            as_of: new Date().toISOString(),
            latest_envelope: latestDoc
        });
    }

    writeForecastPhaseStatus(repoRoot, 'evaluate', {
        status: evaluationWarning ? 'degraded' : 'ok',
        reason: evaluationWarning,
        trading_date: tradingDate,
        counts: {
            outcomes_written: outcomes.length,
            elapsed_seconds: Number(((Date.now() - phaseStartedAt) / 1000).toFixed(1)),
        },
        meta: {
            maturity_phase: report.maturity_phase,
            log_path: process.env.FORECAST_PHASE_LOG_PATH || null,
            deprecated_forecasts: options?._evaluationMeta?.deprecated_forecasts ?? 0,
            superseded_forecasts: options?._evaluationMeta?.superseded_forecasts ?? 0,
            rss_budget_mb: FORECAST_RSS_BUDGET_MB,
            rss_usage_mb: enforceRssBudget('evaluate_complete'),
            rss_start_mb: rssAtStart,
        },
    });

    return {
        ok: true,
        tradingDate,
        forecastCount: forecasts.length,
        outcomeCount: outcomes.length,
        evaluationWarning,
        latestDoc,
    };
}

/**
 * Run the complete daily pipeline
 * @param {object} options
 */
export async function runDailyPipeline(options = {}) {
    const repoRoot = options.repoRoot ?? process.cwd();
    const forceDate = options.date ?? null;

    console.log('\n═══════════════════════════════════════════════════════════════');
    console.log('  FORECAST SYSTEM v3.0 — DAILY PIPELINE');
    console.log('═══════════════════════════════════════════════════════════════\n');

    const generated = await runGeneratePhase({ ...options, repoRoot, date: forceDate, writeLatest: false });
    if (generated.degraded && (!generated.forecasts || generated.forecasts.length === 0)) {
        return generated;
    }

    const evaluated = await runEvaluatePhase({
        repoRoot,
        tradingDate: generated.tradingDate,
        policy: generated.policy,
        champion: generated.champion,
        snapshot: generated.snapshot,
        forecasts: generated.forecasts,
        writeLatest: true,
    });

    console.log('\n═══════════════════════════════════════════════════════════════');
    console.log('  PIPELINE COMPLETE');
    console.log(`  Forecasts: ${generated.forecasts.length} | Outcomes: ${evaluated.outcomeCount}`);
    console.log('═══════════════════════════════════════════════════════════════\n');

    return {
        ok: true,
        tradingDate: generated.tradingDate,
        forecastCount: generated.forecasts.length,
        outcomeCount: evaluated.outcomeCount,
    };
}

// CLI entry point
if (import.meta.url === `file://${process.argv[1]}`) {
    const args = process.argv.slice(2);
    const dateArg = args.find(a => a.startsWith('--date='));
    const date = dateArg ? dateArg.split('=')[1] : null;
    const phaseArg = args.find(a => a.startsWith('--phase='));
    const phase = phaseArg ? phaseArg.split('=')[1] : 'both';

    const handler = async () => {
        if (phase === 'generate') return runGeneratePhase({ repoRoot: process.cwd(), date, writeLatest: false });
        if (phase === 'evaluate') return runEvaluatePhase({ repoRoot: process.cwd(), date, writeLatest: false });
        return runDailyPipeline({ repoRoot: process.cwd(), date });
    };

    handler()
        .then(result => {
            if (!result.ok) process.exit(1);
        })
        .catch(err => {
            console.error('Pipeline failed:', err);
            process.exit(1);
        });
}

export default { runDailyPipeline, runGeneratePhase, runEvaluatePhase };
