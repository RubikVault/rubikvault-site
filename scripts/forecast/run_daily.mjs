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
import { loadPolicy, loadChampion, computePolicyHash, generateForecast } from './forecast_engine.mjs';
import { writeForecastRecords, writeOutcomeRecords, readLedgerRange } from './ledger_writer.mjs';
import { computeOutcome, createOutcomeRecord } from './evaluator.mjs';
import { generateDailyReport, writeReport, generateScorecards, writeScorecards, updateStatus, updateLatest, updateLastGood } from './report_generator.mjs';
import { ingestSnapshots, loadPriceHistory, loadUniverse } from './snapshot_ingest.mjs';
import { resolveTradingDate, getHorizonOutcomeDate } from './trading_date.mjs';

// ─────────────────────────────────────────────────────────────────────────────
// Configuration
// ─────────────────────────────────────────────────────────────────────────────

const HORIZONS = ['1d', '5d', '20d'];
const HORIZON_DAYS = { '1d': 1, '5d': 5, '20d': 20 };

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
    policyHash,
    codeHash,
    snapshotsManifest,
    policy
}) {
    const forecasts = [];
    const runId = `${tradingDate}_${Date.now().toString(36)}`;
    const asOf = new Date().toISOString();
    const enabledGroups = championSpec.enabled_feature_groups || policy?.feature_groups?.enabled_default || [];

    for (const ticker of universe) {
        const closes = priceHistory[ticker]?.closes ?? [];
        const volumes = priceHistory[ticker]?.volumes ?? [];

        if (closes.length < 200) {
            console.log(`[Forecast] Skipping ${ticker}: insufficient history (${closes.length} days)`);
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
            console.log(`[Forecast] Skipping ${ticker}: too many missing features`);
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
                runId
            });

            forecasts.push(forecast);
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
    priceHistory,
    policy
}) {
    const outcomes = [];
    const maxMonths = policy?.ledger_partitioning?.max_months_to_scan_for_metrics ?? 6;

    // Scan recent forecasts for matured horizons
    const today = new Date(tradingDate);
    const startDate = new Date(today);
    startDate.setMonth(startDate.getMonth() - maxMonths);

    const forecasts = readLedgerRange(
        repoRoot,
        'forecasts',
        startDate.toISOString().slice(0, 10),
        tradingDate
    );

    // Filter to live forecasts only
    const liveForecasts = forecasts.filter(f => f.provenance === 'live');

    for (const forecast of liveForecasts) {
        const horizonDays = HORIZON_DAYS[forecast.horizon] ?? 1;
        const outcomeDate = getHorizonOutcomeDate(forecast.trading_date, horizonDays);

        // Check if outcome date has arrived
        if (outcomeDate > tradingDate) continue;

        // Check if we have price data for outcome
        const tickerPrices = priceHistory[forecast.ticker];
        if (!tickerPrices) continue;

        const forecastIdx = tickerPrices.dates?.indexOf(forecast.trading_date);
        const outcomeIdx = tickerPrices.dates?.indexOf(outcomeDate);

        if (forecastIdx === -1 || outcomeIdx === -1) continue;

        const priceAtForecast = tickerPrices.closes[forecastIdx];
        const priceAtOutcome = tickerPrices.closes[outcomeIdx];

        const y = computeOutcome(priceAtForecast, priceAtOutcome);
        if (y === null) continue;

        const outcome = createOutcomeRecord(forecast, y, outcomeDate);
        outcomes.push(outcome);
    }

    return outcomes;
}

// ─────────────────────────────────────────────────────────────────────────────
// Main Pipeline
// ─────────────────────────────────────────────────────────────────────────────

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

    // 1. Load policy and champion
    console.log('[Step 1] Loading policy and champion spec...');
    const policy = loadPolicy(repoRoot);
    const champion = loadChampion(repoRoot);
    const policyHash = computePolicyHash(repoRoot);
    const codeHash = options.codeHash ?? 'local-dev';

    console.log(`  Policy: ${policy.system.id} v${policy.system.version}`);
    console.log(`  Champion: ${champion.champion_id}`);

    // 2. Resolve trading date
    console.log('[Step 2] Resolving trading date...');
    const tradingDate = forceDate ?? resolveTradingDate(new Date(), policy);
    console.log(`  Trading Date: ${tradingDate}`);

    // 3. Ingest snapshots
    console.log('[Step 3] Ingesting snapshots...');
    const snapshot = await ingestSnapshots(repoRoot, tradingDate, policy);
    console.log(`  Universe: ${snapshot.universe?.length ?? 0} tickers`);
    console.log(`  Missing price data: ${(snapshot.missing_price_pct ?? 0).toFixed(1)}%`);

    // 4. Data quality gates
    console.log('[Step 4] Running data quality gates...');
    const qualityResult = runDataQualityGates(snapshot, policy);

    if (!qualityResult.ok) {
        console.log(`  ❌ CIRCUIT OPEN: ${qualityResult.reason}`);

        // Publish last_good and status
        updateStatus(repoRoot, {
            status: 'circuit_open',
            reason: qualityResult.reason,
            circuit_state: 'open',
            last_run: tradingDate
        });

        updateLatest(repoRoot, {
            ok: false,
            status: 'circuit_open',
            reason: qualityResult.reason
        });

        console.log('  Pipeline stopped. Published last_good.');
        return { ok: false, reason: qualityResult.reason };
    }

    console.log('  ✓ Data quality OK');

    // 5. Load price history
    console.log('[Step 5] Loading price history...');
    const priceHistory = await loadPriceHistory(repoRoot, snapshot.universe, tradingDate);
    const spyPrices = priceHistory['SPY'] ?? null;
    console.log(`  Loaded history for ${Object.keys(priceHistory).length} tickers`);

    // 6. Generate forecasts
    console.log('[Step 6] Generating forecasts...');
    const forecasts = await generateAllForecasts({
        tradingDate,
        universe: snapshot.universe,
        priceHistory,
        spyPrices,
        championSpec: champion,
        policyHash,
        codeHash,
        snapshotsManifest: snapshot.manifest,
        policy
    });
    console.log(`  Generated ${forecasts.length} forecasts`);

    // 7. Write forecast records
    console.log('[Step 7] Writing forecast records to ledger...');
    writeForecastRecords(repoRoot, forecasts);

    // 8. Evaluate matured forecasts
    console.log('[Step 8] Evaluating matured forecasts...');
    const outcomes = await evaluateMaturedForecasts({
        tradingDate,
        repoRoot,
        priceHistory,
        policy
    });
    console.log(`  Evaluated ${outcomes.length} outcomes`);

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
            missing_price_pct: snapshot.missing_price_pct ?? 0
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
        status: 'ok',
        circuit_state: 'closed',
        last_run: tradingDate,
        capabilities: {
            has_prices: true,
            has_earnings: false,
            has_macro: false
        }
    });

    updateLatest(repoRoot, {
        ok: true,
        status: 'ok',
        latest_report_ref: `public/data/forecast/reports/daily/${tradingDate}.json`,
        scorecards_ref: 'public/data/forecast/scorecards/tickers.json.gz',
        maturity_phase: report.maturity_phase
    });

    updateLastGood(repoRoot, {
        champion_id: champion.champion_id,
        report_ref: `public/data/forecast/reports/daily/${tradingDate}.json`,
        as_of: new Date().toISOString()
    });

    console.log('\n═══════════════════════════════════════════════════════════════');
    console.log('  PIPELINE COMPLETE');
    console.log(`  Forecasts: ${forecasts.length} | Outcomes: ${outcomes.length}`);
    console.log('═══════════════════════════════════════════════════════════════\n');

    return {
        ok: true,
        tradingDate,
        forecastCount: forecasts.length,
        outcomeCount: outcomes.length
    };
}

// CLI entry point
if (import.meta.url === `file://${process.argv[1]}`) {
    const args = process.argv.slice(2);
    const dateArg = args.find(a => a.startsWith('--date='));
    const date = dateArg ? dateArg.split('=')[1] : null;

    runDailyPipeline({ repoRoot: process.cwd(), date })
        .then(result => {
            if (!result.ok) process.exit(1);
        })
        .catch(err => {
            console.error('Pipeline failed:', err);
            process.exit(1);
        });
}

export default { runDailyPipeline };
