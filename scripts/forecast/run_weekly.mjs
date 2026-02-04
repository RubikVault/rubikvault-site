/**
 * Forecast System v3.0 — Weekly Pipeline Runner
 * 
 * Orchestrates weekly challenger training and promotion evaluation.
 */

import { loadPolicy, loadChampion } from './forecast_engine.mjs';
import { readLedgerRange } from './ledger_writer.mjs';
import { generateChallengers, writeChallengerSpecs } from './challenger_generator.mjs';
import { runPromotionEvaluation } from './promotion_gates.mjs';
import { resolveTradingDate } from './trading_date.mjs';

// ─────────────────────────────────────────────────────────────────────────────
// Weekly Pipeline
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Run the complete weekly pipeline
 * @param {object} options
 */
export async function runWeeklyPipeline(options = {}) {
    const repoRoot = options.repoRoot ?? process.cwd();
    const forceDate = options.date ?? null;

    console.log('\n═══════════════════════════════════════════════════════════════');
    console.log('  FORECAST SYSTEM v3.0 — WEEKLY PIPELINE');
    console.log('═══════════════════════════════════════════════════════════════\n');

    // 1. Load policy and champion
    console.log('[Step 1] Loading policy and champion spec...');
    const policy = loadPolicy(repoRoot);
    const champion = loadChampion(repoRoot);

    console.log(`  Policy: ${policy.system.id} v${policy.system.version}`);
    console.log(`  Champion: ${champion.champion_id}`);

    // 2. Resolve date
    const tradingDate = forceDate ?? resolveTradingDate(new Date(), policy);
    console.log(`  Trading Date: ${tradingDate}`);

    // 3. Generate challengers
    console.log('\n[Step 2] Generating challenger specs...');
    const challengers = generateChallengers(repoRoot, { date: tradingDate });
    writeChallengerSpecs(repoRoot, challengers);

    // 4. Load recent outcomes for evaluation
    console.log('\n[Step 3] Loading recent outcomes...');
    const endDate = tradingDate;
    const startDate = new Date(endDate);
    startDate.setDate(startDate.getDate() - 30);

    const outcomes = readLedgerRange(
        repoRoot,
        'outcomes',
        startDate.toISOString().slice(0, 10),
        endDate
    );

    const liveOutcomes = outcomes.filter(o => o.provenance === 'live');
    console.log(`  Loaded ${liveOutcomes.length} live outcomes (30d)`);

    // 5. Run promotion evaluation
    console.log('\n[Step 4] Running promotion evaluation...');
    const evalResult = runPromotionEvaluation(repoRoot, challengers, liveOutcomes);

    // 6. Summary
    console.log('\n═══════════════════════════════════════════════════════════════');
    console.log('  WEEKLY PIPELINE COMPLETE');
    console.log(`  Challengers tested: ${challengers.length}`);
    console.log(`  Promotion: ${evalResult.promoted ? 'YES' : 'NO'}`);
    if (evalResult.promoted) {
        console.log(`  New champion: ${evalResult.promotion.to_champion_id}`);
    }
    console.log('═══════════════════════════════════════════════════════════════\n');

    return {
        ok: true,
        tradingDate,
        challengerCount: challengers.length,
        promoted: evalResult.promoted,
        promotion: evalResult.promotion
    };
}

// CLI entry point
if (import.meta.url === `file://${process.argv[1]}`) {
    const args = process.argv.slice(2);
    const dateArg = args.find(a => a.startsWith('--date='));
    const date = dateArg ? dateArg.split('=')[1] : null;

    runWeeklyPipeline({ repoRoot: process.cwd(), date })
        .then(result => {
            if (!result.ok) process.exit(1);
        })
        .catch(err => {
            console.error('Pipeline failed:', err);
            process.exit(1);
        });
}

export default { runWeeklyPipeline };
