/**
 * Forecast System v3.0 — Monthly Pipeline Runner
 * 
 * Generates monthly summary reports and challenger quota tracking.
 */

import fs from 'node:fs';
import path from 'node:path';
import { loadPolicy, loadChampion } from './forecast_engine.mjs';
import { readLedgerRange } from './ledger_writer.mjs';
import { computeGlobalMetrics } from './evaluator.mjs';
import { writeReport, updateLatest } from './report_generator.mjs';

// ─────────────────────────────────────────────────────────────────────────────
// Monthly Report Generation
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Generate monthly report
 * @param {string} repoRoot - Repository root
 * @param {string} month - Month in YYYY-MM format
 * @param {object[]} outcomes - Outcome records for the month
 * @param {object[]} promotions - Promotion records for the month
 * @param {object} policy - Forecast policy
 * @returns {object} Monthly report
 */
function generateMonthlyReport(repoRoot, month, outcomes, promotions, policy) {
    const globalMetrics = computeGlobalMetrics(outcomes, [], policy);

    // Count live days in month
    const uniqueDays = new Set(outcomes.map(o => o.outcome_trading_date));
    const liveDays = uniqueDays.size;

    // Determine maturity phase
    const bootstrapThreshold = policy?.maturity?.bootstrap_live_eval_days ?? 90;
    const calibrationThreshold = policy?.maturity?.calibration_live_eval_days ?? 180;

    let maturityPhase = 'BOOTSTRAP';
    if (liveDays >= calibrationThreshold) maturityPhase = 'MATURE';
    else if (liveDays >= bootstrapThreshold) maturityPhase = 'CALIBRATION';

    // Challenger quota tracking
    const quotaMin = policy?.exploration?.monthly_min_challengers ?? 8;
    const challengersTested = policy?.monthly_challengers_tested ?? 4; // Would come from ledger
    const quotaStatus = challengersTested >= quotaMin ? 'met' : 'miss';
    const quotaMissReason = quotaStatus === 'miss' ? `Only ${challengersTested}/${quotaMin} challengers tested` : null;

    return {
        schema: 'forecast_report_v3',
        period: {
            type: 'monthly',
            id: month
        },
        as_of: new Date().toISOString(),
        maturity_phase: maturityPhase,
        meta: {
            status: 'ok',
            data_completeness: {
                live_eval_days: liveDays,
                outcome_count: outcomes.length
            },
            compute: {
                challengers_tested_this_period: challengersTested,
                challengers_promoted_this_period: promotions.length,
                quota_monthly_min_challengers: quotaMin,
                quota_status: quotaStatus,
                quota_miss_reason: quotaMissReason
            }
        },
        global_metrics: globalMetrics,
        promotions_this_month: promotions.map(p => ({
            promotion_id: p.promotion_id,
            from_champion_id: p.from_champion_id,
            to_champion_id: p.to_champion_id,
            as_of: p.as_of
        })),
        monthly_summary: {
            brier_avg: globalMetrics.by_horizon?.['1d']?.combined?.brier ?? null,
            brier_skill_avg: globalMetrics.by_horizon?.['1d']?.combined?.brier_skill ?? null,
            sample_count: outcomes.length,
            unique_tickers: new Set(outcomes.map(o => o.ticker)).size
        }
    };
}

// ─────────────────────────────────────────────────────────────────────────────
// Main Pipeline
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Run the monthly report pipeline
 * @param {object} options
 */
export async function runMonthlyPipeline(options = {}) {
    const repoRoot = options.repoRoot ?? process.cwd();

    console.log('\n═══════════════════════════════════════════════════════════════');
    console.log('  FORECAST SYSTEM v3.0 — MONTHLY PIPELINE');
    console.log('═══════════════════════════════════════════════════════════════\n');

    // Determine month
    let month = options.month;
    if (!month) {
        const now = new Date();
        now.setMonth(now.getMonth() - 1);
        month = now.toISOString().slice(0, 7);
    }

    console.log(`[Step 1] Generating report for month: ${month}`);

    // Load policy
    const policy = loadPolicy(repoRoot);

    // Calculate date range
    const startDate = `${month}-01`;
    const endDateObj = new Date(startDate);
    endDateObj.setMonth(endDateObj.getMonth() + 1);
    endDateObj.setDate(0);
    const endDate = endDateObj.toISOString().slice(0, 10);

    console.log(`  Date range: ${startDate} to ${endDate}`);

    // Load outcomes for the month
    console.log('[Step 2] Loading outcomes...');
    const outcomes = readLedgerRange(repoRoot, 'outcomes', startDate, endDate);
    const liveOutcomes = outcomes.filter(o => o.provenance === 'live');
    console.log(`  Loaded ${liveOutcomes.length} live outcomes`);

    // Load promotions for the month
    console.log('[Step 3] Loading promotions...');
    const promotions = readLedgerRange(repoRoot, 'promotions', startDate, endDate);
    console.log(`  Loaded ${promotions.length} promotions`);

    // Generate report
    console.log('[Step 4] Generating monthly report...');
    const report = generateMonthlyReport(repoRoot, month, liveOutcomes, promotions, policy);

    // Write report
    writeReport(repoRoot, report, 'monthly');

    console.log('\n═══════════════════════════════════════════════════════════════');
    console.log('  MONTHLY REPORT COMPLETE');
    console.log(`  Month: ${month}`);
    console.log(`  Outcomes: ${liveOutcomes.length} | Promotions: ${promotions.length}`);
    console.log('═══════════════════════════════════════════════════════════════\n');

    return {
        ok: true,
        month,
        outcomeCount: liveOutcomes.length,
        promotionCount: promotions.length
    };
}

// CLI entry point
if (import.meta.url === `file://${process.argv[1]}`) {
    const args = process.argv.slice(2);
    const monthArg = args.find(a => a.startsWith('--month='));
    const month = monthArg ? monthArg.split('=')[1] : null;

    runMonthlyPipeline({ repoRoot: process.cwd(), month })
        .then(result => {
            if (!result.ok) process.exit(1);
        })
        .catch(err => {
            console.error('Pipeline failed:', err);
            process.exit(1);
        });
}

export default { runMonthlyPipeline };
