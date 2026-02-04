/**
 * Forecast System v3.0 — Challenger Generator
 * 
 * Generates challenger specs using bounded action space.
 * Implements rule-based exploration per runbook §11.1.
 */

import fs from 'node:fs';
import path from 'node:path';
import { computeDigest } from '../lib/digest.js';
import { loadChampion, loadPolicy } from './forecast_engine.mjs';

const CHALLENGERS_BASE = 'mirrors/forecast/challengers/specs';

// ─────────────────────────────────────────────────────────────────────────────
// Action Types
// ─────────────────────────────────────────────────────────────────────────────

const ACTION_TYPES = [
    'feature_ablation',
    'calibration_change',
    'neutral_band_adjustment',
    'lookback_adjustment'
];

// ─────────────────────────────────────────────────────────────────────────────
// Rule-Based Generators
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Generate feature ablation challengers
 * Each toggles one feature group off
 * @param {object} champion - Current champion spec
 * @param {object} policy - Forecast policy
 * @returns {object[]} Challenger specs
 */
function generateFeatureAblationChallengers(champion, policy) {
    const challengers = [];
    const enabledGroups = champion.enabled_feature_groups || [];
    const allowedGroups = policy?.feature_groups?.allowed || [];

    // Toggle each group off (except basic)
    for (const group of enabledGroups) {
        if (group === 'basic') continue; // Always keep basic

        const newGroups = enabledGroups.filter(g => g !== group);

        challengers.push({
            action_type: 'feature_ablation',
            enabled_feature_groups: newGroups,
            hypothesis: `Remove ${group} group to test if it adds noise`,
            changes: { removed_group: group }
        });
    }

    // Toggle disabled groups on
    const disabledGroups = allowedGroups.filter(g => !enabledGroups.includes(g));
    for (const group of disabledGroups) {
        const newGroups = [...enabledGroups, group];

        challengers.push({
            action_type: 'feature_ablation',
            enabled_feature_groups: newGroups,
            hypothesis: `Add ${group} group to test if it improves skill`,
            changes: { added_group: group }
        });
    }

    return challengers;
}

/**
 * Generate calibration change challengers
 * @param {object} champion - Current champion spec
 * @param {object} policy - Forecast policy
 * @returns {object[]} Challenger specs
 */
function generateCalibrationChallengers(champion, policy) {
    const challengers = [];
    const currentMethod = champion.calibration_method || 'isotonic';
    const allowedMethods = policy?.calibration?.allowed_methods || ['none', 'platt', 'isotonic'];

    for (const method of allowedMethods) {
        if (method === currentMethod) continue;

        challengers.push({
            action_type: 'calibration_change',
            calibration_method: method,
            hypothesis: `Test ${method} calibration vs ${currentMethod}`,
            changes: { from: currentMethod, to: method }
        });
    }

    return challengers;
}

/**
 * Generate neutral band adjustment challengers
 * @param {object} champion - Current champion spec
 * @param {object} policy - Forecast policy
 * @returns {object[]} Challenger specs
 */
function generateNeutralBandChallengers(champion, policy) {
    const challengers = [];
    const currentBand = champion.neutral_band || 0.03;

    // Test band values: 0.02, 0.04, 0.05, 0.06
    const testBands = [0.02, 0.04, 0.05, 0.06].filter(b => Math.abs(b - currentBand) > 0.005);

    for (const band of testBands) {
        challengers.push({
            action_type: 'neutral_band_adjustment',
            neutral_band: band,
            hypothesis: `Test neutral_band=${band} vs ${currentBand}`,
            changes: { from: currentBand, to: band }
        });
    }

    return challengers;
}

/**
 * Generate model family challengers
 * @param {object} champion - Current champion spec
 * @param {object} policy - Forecast policy
 * @returns {object[]} Challenger specs
 */
function generateModelFamilyChallengers(champion, policy) {
    const challengers = [];
    const currentFamily = champion.model_family || 'logistic';

    // Only allow logistic and gbdt for now
    const allowedFamilies = ['logistic', 'gbdt'].filter(f => f !== currentFamily);

    for (const family of allowedFamilies) {
        challengers.push({
            action_type: 'model_family_change',
            model_family: family,
            hypothesis: `Test ${family} model vs ${currentFamily}`,
            changes: { from: currentFamily, to: family }
        });
    }

    return challengers;
}

// ─────────────────────────────────────────────────────────────────────────────
// Challenger Spec Builder
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Build complete challenger spec from action
 * @param {object} champion - Parent champion spec
 * @param {object} action - Action definition
 * @param {string} date - Creation date
 * @returns {object} Complete challenger spec
 */
function buildChallengerSpec(champion, action, date) {
    const challengerId = `${date}_${action.action_type}_${Date.now().toString(36).slice(-4)}`;

    return {
        schema: 'forecast_challenger_spec_v3',
        challenger_id: challengerId,
        created_at: new Date().toISOString(),
        parent_champion_id: champion.champion_id,
        seed: champion.seed || 42,
        model_family: action.model_family || champion.model_family || 'logistic',
        enabled_feature_groups: action.enabled_feature_groups || champion.enabled_feature_groups,
        calibration_method: action.calibration_method || champion.calibration_method || 'isotonic',
        neutral_band: action.neutral_band ?? champion.neutral_band ?? 0.03,
        action_type: action.action_type,
        hypothesis: action.hypothesis,
        origin: {
            type: 'rule_based',
            prompt_hash: null,
            response_hash: null,
            model_id: null,
            temperature: null
        }
    };
}

// ─────────────────────────────────────────────────────────────────────────────
// Main Generator
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Generate challenger specs for weekly training
 * @param {string} repoRoot - Repository root
 * @param {object} options - Generation options
 * @returns {object[]} Generated challenger specs
 */
export function generateChallengers(repoRoot, options = {}) {
    const policy = loadPolicy(repoRoot);
    const champion = loadChampion(repoRoot);
    const date = options.date || new Date().toISOString().slice(0, 10);
    const maxChallengers = options.maxChallengers ?? policy?.compute_budget?.challenger_training?.max_challengers_per_run ?? 4;

    console.log(`[Challenger] Generating challengers for ${date}`);
    console.log(`  Parent champion: ${champion.champion_id}`);
    console.log(`  Max challengers: ${maxChallengers}`);

    // Generate all possible actions
    const actions = [
        ...generateFeatureAblationChallengers(champion, policy),
        ...generateCalibrationChallengers(champion, policy),
        ...generateNeutralBandChallengers(champion, policy),
        ...generateModelFamilyChallengers(champion, policy)
    ];

    console.log(`  Possible actions: ${actions.length}`);

    // Select subset (prioritize diversity of action types)
    const selected = [];
    const usedActionTypes = new Set();

    // First pass: one of each action type
    for (const action of actions) {
        if (selected.length >= maxChallengers) break;
        if (!usedActionTypes.has(action.action_type)) {
            selected.push(action);
            usedActionTypes.add(action.action_type);
        }
    }

    // Second pass: fill remaining slots
    for (const action of actions) {
        if (selected.length >= maxChallengers) break;
        if (!selected.includes(action)) {
            selected.push(action);
        }
    }

    // Build specs
    const specs = selected.map(action => buildChallengerSpec(champion, action, date));

    console.log(`  Generated ${specs.length} challenger specs`);

    return specs;
}

/**
 * Write challenger specs to mirrors
 * @param {string} repoRoot - Repository root
 * @param {object[]} specs - Challenger specs
 */
export function writeChallengerSpecs(repoRoot, specs) {
    const specsDir = path.join(repoRoot, CHALLENGERS_BASE);

    if (!fs.existsSync(specsDir)) {
        fs.mkdirSync(specsDir, { recursive: true });
    }

    for (const spec of specs) {
        const specPath = path.join(specsDir, `${spec.challenger_id}.json`);
        fs.writeFileSync(specPath, JSON.stringify(spec, null, 2));
        console.log(`[Challenger] Written ${specPath}`);
    }
}

/**
 * List existing challenger specs
 * @param {string} repoRoot - Repository root
 * @returns {object[]} Challenger specs
 */
export function listChallengerSpecs(repoRoot) {
    const specsDir = path.join(repoRoot, CHALLENGERS_BASE);

    if (!fs.existsSync(specsDir)) return [];

    const files = fs.readdirSync(specsDir).filter(f => f.endsWith('.json'));

    return files.map(f => {
        const content = fs.readFileSync(path.join(specsDir, f), 'utf8');
        return JSON.parse(content);
    });
}

export default {
    generateChallengers,
    writeChallengerSpecs,
    listChallengerSpecs,
    buildChallengerSpec
};
