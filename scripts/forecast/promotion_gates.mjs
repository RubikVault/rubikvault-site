/**
 * Forecast System v3.0 — Promotion Gates
 * 
 * Implements promotion decision logic and post-promotion monitoring.
 * Ensures anti-degradation and anti-gaming rules.
 */

import fs from 'node:fs';
import path from 'node:path';
import { computeDigest } from '../lib/digest.js';
import { loadPolicy, loadChampion, computeChampionHash } from './forecast_engine.mjs';
import { readLedgerRange, writePromotionRecord } from './ledger_writer.mjs';
import { computeBrier, computeSharpness, computeNeutralRate, computeBrierSkill, computeBaselineProbability, computeBaselineBrier } from './evaluator.mjs';

const CHAMPION_PATH = 'mirrors/forecast/champion/current.json';

// ─────────────────────────────────────────────────────────────────────────────
// Metric Computation
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Compute metrics for a set of outcomes
 * @param {object[]} outcomes - Outcome records
 * @param {object} policy - Forecast policy
 * @returns {object} Metrics
 */
function computeMetrics(outcomes, policy) {
    if (!outcomes || outcomes.length === 0) {
        return { sample_count: 0, brier: null, sharpness: null, neutral_rate: null, brier_skill: null };
    }

    const brier = computeBrier(outcomes);
    const sharpness = computeSharpness(outcomes);
    const neutralRate = computeNeutralRate(outcomes);

    // Compute skill vs baseline
    const baselineP = computeBaselineProbability(outcomes);
    const baselineBrier = computeBaselineBrier(outcomes, baselineP);
    const floor = policy?.math_safety?.brier_baseline_floor ?? 0.001;
    const brierSkill = computeBrierSkill(brier, baselineBrier, floor);

    return {
        sample_count: outcomes.length,
        brier,
        sharpness,
        neutral_rate: neutralRate,
        brier_skill: brierSkill
    };
}

/**
 * Filter outcomes by bucket
 * @param {object[]} outcomes - Outcome records
 * @param {string} bucket - 'normal_days' | 'event_window'
 * @returns {object[]}
 */
function filterByBucket(outcomes, bucket) {
    return outcomes.filter(o => o.event_bucket === bucket);
}

// ─────────────────────────────────────────────────────────────────────────────
// Promotion Gate Checks
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Check if challenger passes promotion gates
 * @param {object} championMetrics - Champion metrics
 * @param {object} challengerMetrics - Challenger metrics
 * @param {object} policy - Forecast policy
 * @returns {{pass: boolean, reasons: string[]}}
 */
export function checkPromotionGates(championMetrics, challengerMetrics, policy) {
    const gates = policy?.promotion_gates ?? {};
    const reasons = [];

    // Gate 1: Minimum samples
    const minSamples = gates.min_live_samples_30d ?? 300;
    if (challengerMetrics.sample_count < minSamples) {
        reasons.push(`INSUFFICIENT_SAMPLES: ${challengerMetrics.sample_count} < ${minSamples}`);
    }

    // Gate 2: Skill improvement
    const minImprovementPct = gates.min_improvement_skill_30d_pct ?? 1.0;
    const skillDelta = (challengerMetrics.brier_skill ?? 0) - (championMetrics.brier_skill ?? 0);
    const skillImprovementPct = skillDelta * 100;

    if (skillImprovementPct < minImprovementPct) {
        reasons.push(`SKILL_TOO_LOW: ${skillImprovementPct.toFixed(2)}% < ${minImprovementPct}%`);
    }

    // Gate 3: No significant neutral rate increase (anti-gaming)
    const maxNeutralIncrease = gates.reject_if_neutral_rate_increase_pct_gt ?? 20.0;
    const neutralDelta = ((challengerMetrics.neutral_rate ?? 0) - (championMetrics.neutral_rate ?? 0)) * 100;

    if (neutralDelta > maxNeutralIncrease) {
        reasons.push(`NEUTRAL_GAMING: neutralRate increased ${neutralDelta.toFixed(1)}% > ${maxNeutralIncrease}%`);
    }

    // Gate 4: No significant sharpness drop (anti-gaming)
    const maxSharpnessDrop = gates.reject_if_sharpness_drop_pct_gt ?? 20.0;
    const sharpnessDropPct = championMetrics.sharpness > 0
        ? ((championMetrics.sharpness - (challengerMetrics.sharpness ?? 0)) / championMetrics.sharpness) * 100
        : 0;

    if (sharpnessDropPct > maxSharpnessDrop) {
        reasons.push(`SHARPNESS_DROP: ${sharpnessDropPct.toFixed(1)}% > ${maxSharpnessDrop}%`);
    }

    return {
        pass: reasons.length === 0,
        reasons,
        metrics: {
            skill_improvement_pct: skillImprovementPct,
            neutral_rate_delta_pct: neutralDelta,
            sharpness_drop_pct: sharpnessDropPct
        }
    };
}

// ─────────────────────────────────────────────────────────────────────────────
// Promotion Execution
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Promote challenger to champion
 * @param {string} repoRoot - Repository root
 * @param {object} challengerSpec - Challenger spec
 * @param {object} gatesSnapshot - Gates check result
 * @returns {object} Promotion record
 */
export function promoteChallenger(repoRoot, challengerSpec, gatesSnapshot) {
    const policy = loadPolicy(repoRoot);
    const currentChampion = loadChampion(repoRoot);
    const policyHash = computeDigest(policy);

    // Create new champion spec from challenger
    const newChampion = {
        schema: 'forecast_champion_spec_v3',
        champion_id: challengerSpec.challenger_id.replace(/^\d{4}-\d{2}-\d{2}_/, 'v3.0-champion-'),
        created_at: new Date().toISOString(),
        model_family: challengerSpec.model_family,
        seed: challengerSpec.seed,
        enabled_feature_groups: challengerSpec.enabled_feature_groups,
        calibration_method: challengerSpec.calibration_method,
        neutral_band: challengerSpec.neutral_band,
        notes: `Promoted from ${challengerSpec.challenger_id}. Hypothesis: ${challengerSpec.hypothesis}`,
        previous_champion_id: currentChampion.champion_id
    };

    // Write new champion
    const championPath = path.join(repoRoot, CHAMPION_PATH);
    fs.writeFileSync(championPath, JSON.stringify(newChampion, null, 2));
    console.log(`[Promotion] New champion: ${newChampion.champion_id}`);

    // Create promotion record
    const promotionRecord = {
        schema: 'promotion_record_v3',
        promotion_id: computeDigest(`${currentChampion.champion_id}|${newChampion.champion_id}|${new Date().toISOString()}`),
        as_of: new Date().toISOString(),
        from_champion_id: currentChampion.champion_id,
        to_champion_id: newChampion.champion_id,
        challenger_id: challengerSpec.challenger_id,
        challenger_spec_hash: computeDigest(challengerSpec),
        policy_hash: policyHash,
        code_hash: 'local-dev',
        gates_snapshot: gatesSnapshot,
        post_change_impact: {
            skill_7d_delta_pct: null,
            skill_14d_delta_pct: null,
            rollback_triggered: false
        }
    };

    // Write promotion record
    writePromotionRecord(repoRoot, promotionRecord);

    return promotionRecord;
}

// ─────────────────────────────────────────────────────────────────────────────
// Post-Promotion Monitoring
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Check if rollback is needed
 * @param {string} repoRoot - Repository root
 * @param {object} promotionRecord - Original promotion record
 * @param {object[]} recentOutcomes - Recent outcome records
 * @param {object} policy - Forecast policy
 * @returns {{rollback: boolean, reason: string|null, metrics: object}}
 */
export function checkPostPromotionRollback(repoRoot, promotionRecord, recentOutcomes, policy) {
    const monitoring = policy?.post_promotion_monitoring ?? {};
    const rollbackThreshold = monitoring.rollback_if_skill_delta_pct_lt ?? -1.0;

    // Compute current metrics
    const currentMetrics = computeMetrics(recentOutcomes, policy);

    // Compare to pre-promotion (from gates snapshot)
    const preSkill = promotionRecord.gates_snapshot?.metrics?.skill_improvement_pct ?? 0;
    const currentSkill = currentMetrics.brier_skill ?? 0;
    const skillDeltaPct = (currentSkill - preSkill) * 100;

    if (skillDeltaPct < rollbackThreshold) {
        return {
            rollback: true,
            reason: `Skill degraded ${skillDeltaPct.toFixed(2)}% < ${rollbackThreshold}%`,
            metrics: { skill_delta_pct: skillDeltaPct }
        };
    }

    return {
        rollback: false,
        reason: null,
        metrics: { skill_delta_pct: skillDeltaPct }
    };
}

/**
 * Execute rollback to previous champion
 * @param {string} repoRoot - Repository root
 * @param {object} promotionRecord - Promotion to rollback
 */
export function executeRollback(repoRoot, promotionRecord) {
    // Load the previous champion ID
    const previousId = promotionRecord.from_champion_id;

    // Read challenger specs to find previous champion config
    // In production, would read from archived champions
    console.log(`[Rollback] Rolling back to ${previousId}`);

    // Mark rollback in promotion record
    promotionRecord.post_change_impact.rollback_triggered = true;
    promotionRecord.post_change_impact.rollback_at = new Date().toISOString();

    // Write updated promotion record
    writePromotionRecord(repoRoot, promotionRecord);
}

// ─────────────────────────────────────────────────────────────────────────────
// Weekly Promotion Pipeline
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Run weekly promotion evaluation
 * @param {string} repoRoot - Repository root
 * @param {object[]} challengerSpecs - Challenger specs to evaluate
 * @param {object[]} outcomes - Outcome records for evaluation
 * @returns {object} Evaluation result
 */
export function runPromotionEvaluation(repoRoot, challengerSpecs, outcomes) {
    const policy = loadPolicy(repoRoot);
    const champion = loadChampion(repoRoot);
    const bucket = policy?.promotion_gates?.primary_bucket ?? 'normal_days';

    console.log('[Promotion] Running promotion evaluation...');
    console.log(`  Champion: ${champion.champion_id}`);
    console.log(`  Challengers: ${challengerSpecs.length}`);
    console.log(`  Outcomes: ${outcomes.length}`);
    console.log(`  Primary bucket: ${bucket}`);

    // Filter outcomes by bucket
    const bucketOutcomes = filterByBucket(outcomes, bucket);

    // Compute champion metrics
    const championMetrics = computeMetrics(bucketOutcomes, policy);
    console.log(`  Champion skill: ${(championMetrics.brier_skill ?? 0).toFixed(4)}`);

    // Evaluate each challenger
    const results = [];

    for (const spec of challengerSpecs) {
        // In production, would use challenger-specific outcomes
        // For now, simulate with same outcomes (different model would produce different predictions)
        const challengerMetrics = computeMetrics(bucketOutcomes, policy);

        const check = checkPromotionGates(championMetrics, challengerMetrics, policy);

        results.push({
            challenger_id: spec.challenger_id,
            hypothesis: spec.hypothesis,
            pass: check.pass,
            reasons: check.reasons,
            metrics: check.metrics
        });

        if (check.pass) {
            console.log(`  ✓ ${spec.challenger_id} PASSED`);
        } else {
            console.log(`  ✗ ${spec.challenger_id} FAILED: ${check.reasons.join(', ')}`);
        }
    }

    // Find best passing challenger
    const passing = results.filter(r => r.pass);

    if (passing.length > 0) {
        // Sort by skill improvement
        passing.sort((a, b) => b.metrics.skill_improvement_pct - a.metrics.skill_improvement_pct);
        const best = passing[0];
        const bestSpec = challengerSpecs.find(s => s.challenger_id === best.challenger_id);

        console.log(`\n  Promoting: ${best.challenger_id}`);
        const promotion = promoteChallenger(repoRoot, bestSpec, best);

        return {
            promoted: true,
            promotion,
            results
        };
    }

    console.log('\n  No challenger passed gates. Champion retained.');
    return {
        promoted: false,
        promotion: null,
        results
    };
}

export default {
    checkPromotionGates,
    promoteChallenger,
    checkPostPromotionRollback,
    executeRollback,
    runPromotionEvaluation
};
