/**
 * Forecast System v3.0 — Circuit Breaker
 * 
 * Implements fail-loud-stop circuit breaker logic.
 * Opens circuit on data quality failures and publishes last_good.
 */

import fs from 'node:fs';
import path from 'node:path';
import { loadPolicy } from './forecast_engine.mjs';
import { updateStatus, updateLatest, updateLastGood } from './report_generator.mjs';

const STATUS_PATH = 'public/data/forecast/system/status.json';
const LAST_GOOD_PATH = 'public/data/forecast/system/last_good.json';

// ─────────────────────────────────────────────────────────────────────────────
// Circuit State
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Get current circuit state
 * @param {string} repoRoot - Repository root
 * @returns {'open' | 'closed'}
 */
export function getCircuitState(repoRoot) {
    const statusPath = path.join(repoRoot, STATUS_PATH);

    if (!fs.existsSync(statusPath)) {
        return 'closed'; // Default to closed
    }

    const content = fs.readFileSync(statusPath, 'utf8');
    const status = JSON.parse(content);

    return status.circuit_state ?? 'closed';
}

/**
 * Get last good reference
 * @param {string} repoRoot - Repository root
 * @returns {object|null}
 */
export function getLastGood(repoRoot) {
    const lastGoodPath = path.join(repoRoot, LAST_GOOD_PATH);

    if (!fs.existsSync(lastGoodPath)) {
        return null;
    }

    const content = fs.readFileSync(lastGoodPath, 'utf8');
    return JSON.parse(content);
}

// ─────────────────────────────────────────────────────────────────────────────
// Circuit Breaker Triggers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * @typedef {Object} QualityCheck
 * @property {number} missing_price_pct - Percentage of missing price data
 * @property {boolean} schema_violation - Whether a schema violation occurred
 * @property {boolean} snapshot_missing - Whether required snapshot is missing
 * @property {boolean} hash_mismatch - Whether hash verification failed
 */

/**
 * Check if circuit should open
 * @param {QualityCheck} check - Quality check results
 * @param {object} policy - Forecast policy
 * @returns {{open: boolean, reason: string|null}}
 */
export function shouldOpenCircuit(check, policy) {
    const thresholds = policy?.circuit_breaker ?? {};

    // Trigger 1: Missing price data
    const missingThreshold = thresholds.missing_price_data_pct_trigger ?? 5.0;
    if (check.missing_price_pct > missingThreshold) {
        return {
            open: true,
            reason: `Missing price data ${check.missing_price_pct.toFixed(1)}% exceeds ${missingThreshold}%`
        };
    }

    // Trigger 2: Schema violation
    if (check.schema_violation) {
        return {
            open: true,
            reason: 'Schema violation detected'
        };
    }

    // Trigger 3: Missing snapshot
    if (check.snapshot_missing) {
        return {
            open: true,
            reason: 'Required snapshot missing'
        };
    }

    // Trigger 4: Hash mismatch
    if (check.hash_mismatch) {
        return {
            open: true,
            reason: 'Hash verification failed (data integrity issue)'
        };
    }

    return { open: false, reason: null };
}

// ─────────────────────────────────────────────────────────────────────────────
// Circuit Actions
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Open circuit and publish last_good
 * @param {string} repoRoot - Repository root
 * @param {string} reason - Reason for opening
 */
export function openCircuit(repoRoot, reason) {
    console.log(`[Circuit] OPENING CIRCUIT: ${reason}`);

    // Get current last_good
    const lastGood = getLastGood(repoRoot);

    // Update status to circuit_open
    updateStatus(repoRoot, {
        status: 'circuit_open',
        reason,
        circuit_state: 'open',
        last_run: new Date().toISOString().slice(0, 10),
        last_good: lastGood?.last_good_as_of ?? null
    });

    // Update latest to point to last_good
    updateLatest(repoRoot, {
        ok: false,
        status: 'circuit_open',
        reason,
        last_good_ref: lastGood?.last_good_latest_report_ref ?? null
    });

    console.log('[Circuit] Published last_good reference');
}

/**
 * Close circuit after successful run
 * @param {string} repoRoot - Repository root
 * @param {object} runResult - Successful run result
 */
export function closeCircuit(repoRoot, runResult) {
    console.log('[Circuit] Closing circuit after successful run');

    // Update status
    updateStatus(repoRoot, {
        status: 'ok',
        circuit_state: 'closed',
        last_run: runResult.tradingDate,
        capabilities: runResult.capabilities ?? {}
    });

    // Update last_good
    updateLastGood(repoRoot, {
        champion_id: runResult.championId,
        report_ref: runResult.reportRef,
        as_of: new Date().toISOString()
    });

    // Update latest
    updateLatest(repoRoot, {
        ok: true,
        status: 'ok',
        latest_report_ref: runResult.reportRef,
        scorecards_ref: runResult.scorecardsRef ?? 'public/data/forecast/scorecards/tickers.json.gz',
        maturity_phase: runResult.maturityPhase ?? 'BOOTSTRAP'
    });
}

// ─────────────────────────────────────────────────────────────────────────────
// Quality Gate Runner
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Run all quality gates
 * @param {string} repoRoot - Repository root
 * @param {object} snapshot - Ingested snapshot
 * @param {object} policy - Forecast policy
 * @returns {{pass: boolean, circuit_action: 'open' | 'close' | 'none', reason: string|null}}
 */
export function runQualityGates(repoRoot, snapshot, policy) {
    const check = {
        missing_price_pct: snapshot.missing_price_pct ?? 0,
        schema_violation: snapshot.schema_violation ?? false,
        snapshot_missing: snapshot.snapshot_missing ?? false,
        hash_mismatch: snapshot.hash_mismatch ?? false
    };

    const result = shouldOpenCircuit(check, policy);

    if (result.open) {
        openCircuit(repoRoot, result.reason);
        return {
            pass: false,
            circuit_action: 'open',
            reason: result.reason
        };
    }

    // Check if we're recovering from open state
    const currentState = getCircuitState(repoRoot);
    if (currentState === 'open') {
        console.log('[Circuit] Recovering from open state');
        return {
            pass: true,
            circuit_action: 'close',
            reason: null
        };
    }

    return {
        pass: true,
        circuit_action: 'none',
        reason: null
    };
}

export default {
    getCircuitState,
    getLastGood,
    shouldOpenCircuit,
    openCircuit,
    closeCircuit,
    runQualityGates
};
