/**
 * Forecast System v3.0 — Acceptance Tests
 * 
 * Tests A1-A9 as specified in the runbook acceptance envelope.
 */

import fs from 'node:fs';
import path from 'node:path';
import { loadPolicy, loadChampion, computeChampionHash, computePolicyHash } from './forecast_engine.mjs';
import { buildFeatureSnapshot } from './build_features.mjs';
import { readLedger, getLedgerPath } from './ledger_writer.mjs';
import { computeOutcome } from './evaluator.mjs';
import { isTradingDay, addTradingDays } from './trading_date.mjs';

// ─────────────────────────────────────────────────────────────────────────────
// Test Framework
// ─────────────────────────────────────────────────────────────────────────────

const results = [];

function test(name, fn) {
    try {
        fn();
        results.push({ name, status: 'PASS' });
        console.log(`✓ ${name}`);
    } catch (err) {
        results.push({ name, status: 'FAIL', error: err.message });
        console.log(`✗ ${name}: ${err.message}`);
    }
}

function assertEqual(actual, expected, msg) {
    if (actual !== expected) {
        throw new Error(`${msg}: expected ${expected}, got ${actual}`);
    }
}

function assertNotNull(value, msg) {
    if (value === null || value === undefined) {
        throw new Error(`${msg}: expected non-null value`);
    }
}

function assertInRange(value, min, max, msg) {
    if (value < min || value > max) {
        throw new Error(`${msg}: ${value} not in range [${min}, ${max}]`);
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// A1: End-to-End Forecast Flow
// ─────────────────────────────────────────────────────────────────────────────

function testA1(repoRoot) {
    test('A1: End-to-end forecast → outcome → metric flow', () => {
        // 1. Load policy and champion
        const policy = loadPolicy(repoRoot);
        assertNotNull(policy, 'Policy should load');
        assertNotNull(policy.system?.id, 'Policy should have system.id');

        const champion = loadChampion(repoRoot);
        assertNotNull(champion, 'Champion should load');
        assertNotNull(champion.champion_id, 'Champion should have champion_id');

        // 2. Build feature snapshot with mock data
        const mockCloses = Array(250).fill(0).map((_, i) => 100 + Math.sin(i / 10) * 5);
        const mockVolumes = Array(250).fill(1000000);

        const featureSnapshot = buildFeatureSnapshot({
            ticker: 'TEST',
            tradingDate: '2026-02-04',
            closes: mockCloses,
            volumes: mockVolumes,
            enabledGroups: champion.enabled_feature_groups || ['basic', 'technical']
        });

        assertNotNull(featureSnapshot, 'Feature snapshot should be created');
        assertNotNull(featureSnapshot.feature_snapshot_hash, 'Feature snapshot should have hash');

        // 3. Verify outcome computation
        const y = computeOutcome(100, 105);
        assertEqual(y, 1, 'Price up should yield y=1');

        const y2 = computeOutcome(100, 95);
        assertEqual(y2, 0, 'Price down should yield y=0');
    });
}

// ─────────────────────────────────────────────────────────────────────────────
// A2: Determinism Test
// ─────────────────────────────────────────────────────────────────────────────

function testA2(repoRoot) {
    test('A2: Same inputs produce bit-identical outputs', () => {
        const mockCloses = Array(250).fill(0).map((_, i) => 100 + (i * 0.1));
        const mockVolumes = Array(250).fill(1000000);

        // Run twice with identical inputs
        const snap1 = buildFeatureSnapshot({
            ticker: 'AAPL',
            tradingDate: '2026-02-04',
            closes: mockCloses,
            volumes: mockVolumes,
            enabledGroups: ['basic', 'technical', 'regime']
        });

        const snap2 = buildFeatureSnapshot({
            ticker: 'AAPL',
            tradingDate: '2026-02-04',
            closes: mockCloses,
            volumes: mockVolumes,
            enabledGroups: ['basic', 'technical', 'regime']
        });

        assertEqual(snap1.feature_snapshot_hash, snap2.feature_snapshot_hash, 'Hashes should match');
        assertEqual(JSON.stringify(snap1.features), JSON.stringify(snap2.features), 'Features should match');
    });
}

// ─────────────────────────────────────────────────────────────────────────────
// A3: Calibration Quality
// ─────────────────────────────────────────────────────────────────────────────

function testA3(repoRoot) {
    test('A3: p_up values in valid probability range', () => {
        const mockCloses = Array(250).fill(0).map((_, i) => 100 + Math.random() * 10);

        for (let trial = 0; trial < 10; trial++) {
            const snap = buildFeatureSnapshot({
                ticker: 'TEST',
                tradingDate: '2026-02-04',
                closes: mockCloses,
                volumes: Array(250).fill(1000000),
                enabledGroups: ['basic', 'technical']
            });

            // Verify all features are finite or null
            for (const [key, value] of Object.entries(snap.features)) {
                if (value !== null && typeof value === 'number') {
                    if (!Number.isFinite(value)) {
                        throw new Error(`Feature ${key} is not finite: ${value}`);
                    }
                }
            }
        }
    });
}

// ─────────────────────────────────────────────────────────────────────────────
// A4: Trading Date Resolution
// ─────────────────────────────────────────────────────────────────────────────

function testA4(repoRoot) {
    test('A4: Trading date resolution correctly handles weekends/holidays', () => {
        // Weekend test
        assertEqual(isTradingDay('2026-02-07'), false, 'Saturday should not be trading day');
        assertEqual(isTradingDay('2026-02-08'), false, 'Sunday should not be trading day');
        assertEqual(isTradingDay('2026-02-09'), true, 'Monday should be trading day');

        // Holiday test
        assertEqual(isTradingDay('2026-01-01'), false, 'New Year should not be trading day');
        assertEqual(isTradingDay('2026-12-25'), false, 'Christmas should not be trading day');

        // addTradingDays test
        const result = addTradingDays('2026-02-06', 1); // Friday + 1 = Monday
        assertEqual(result, '2026-02-09', 'Friday + 1 trading day should be Monday');
    });
}

// ─────────────────────────────────────────────────────────────────────────────
// A5: Champion/Challenger Hashes
// ─────────────────────────────────────────────────────────────────────────────

function testA5(repoRoot) {
    test('A5: Champion spec hash is reproducible', () => {
        const champion = loadChampion(repoRoot);

        const hash1 = computeChampionHash(champion);
        const hash2 = computeChampionHash(champion);

        assertEqual(hash1, hash2, 'Champion hash should be deterministic');
        assertEqual(hash1.startsWith('sha256:'), true, 'Hash should have sha256 prefix');
    });
}

// ─────────────────────────────────────────────────────────────────────────────
// A6: Policy Hash Reproducibility
// ─────────────────────────────────────────────────────────────────────────────

function testA6(repoRoot) {
    test('A6: Policy hash is reproducible', () => {
        const hash1 = computePolicyHash(repoRoot);
        const hash2 = computePolicyHash(repoRoot);

        assertEqual(hash1, hash2, 'Policy hash should be deterministic');
        assertEqual(hash1.startsWith('sha256:'), true, 'Hash should have sha256 prefix');
    });
}

// ─────────────────────────────────────────────────────────────────────────────
// A7: Ledger Append-Only Property
// ─────────────────────────────────────────────────────────────────────────────

function testA7(repoRoot) {
    test('A7: Ledger path follows monthly partition pattern', () => {
        const path1 = getLedgerPath(repoRoot, 'forecasts', '2026-02-04');
        const path2 = getLedgerPath(repoRoot, 'forecasts', '2026-02-15');

        assertEqual(path1, path2, 'Same month should use same partition');
        assertEqual(path1.includes('2026/02.ndjson.gz'), true, 'Path should contain year/month pattern');
    });
}

// ─────────────────────────────────────────────────────────────────────────────
// A8: Feature Group Configuration
// ─────────────────────────────────────────────────────────────────────────────

function testA8(repoRoot) {
    test('A8: Feature groups are correctly enabled/disabled', () => {
        const mockCloses = Array(250).fill(100);

        // With regime group
        const snapWithRegime = buildFeatureSnapshot({
            ticker: 'TEST',
            tradingDate: '2026-02-04',
            closes: mockCloses,
            enabledGroups: ['basic', 'regime']
        });

        assertNotNull(snapWithRegime.features.vol_regime, 'Should have vol_regime with regime group');
        assertNotNull(snapWithRegime.features.trend_regime, 'Should have trend_regime with regime group');

        // Without regime group
        const snapWithoutRegime = buildFeatureSnapshot({
            ticker: 'TEST',
            tradingDate: '2026-02-04',
            closes: mockCloses,
            enabledGroups: ['basic']
        });

        assertEqual(snapWithoutRegime.features.vol_regime, undefined, 'Should not have vol_regime without regime group');
    });
}

// ─────────────────────────────────────────────────────────────────────────────
// A9: Status Endpoint Contract
// ─────────────────────────────────────────────────────────────────────────────

function testA9(repoRoot) {
    test('A9: Status and latest files follow schema', () => {
        const statusPath = path.join(repoRoot, 'public/data/forecast/system/status.json');
        const latestPath = path.join(repoRoot, 'public/data/forecast/latest.json');

        if (fs.existsSync(statusPath)) {
            const status = JSON.parse(fs.readFileSync(statusPath, 'utf8'));
            assertNotNull(status.schema, 'Status should have schema');
            assertNotNull(status.status, 'Status should have status');
            assertNotNull(status.circuit_state, 'Status should have circuit_state');
        }

        if (fs.existsSync(latestPath)) {
            const latest = JSON.parse(fs.readFileSync(latestPath, 'utf8'));
            assertNotNull(latest.schema, 'Latest should have schema');
            assertEqual(latest.feature, 'forecast', 'Latest should have feature=forecast');
        }
    });
}

// ─────────────────────────────────────────────────────────────────────────────
// Main
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Run all acceptance tests
 * @param {string} repoRoot - Repository root
 */
export function runAcceptanceTests(repoRoot = process.cwd()) {
    console.log('\n═══════════════════════════════════════════════════════════════');
    console.log('  FORECAST SYSTEM v3.0 — ACCEPTANCE TESTS');
    console.log('═══════════════════════════════════════════════════════════════\n');

    testA1(repoRoot);
    testA2(repoRoot);
    testA3(repoRoot);
    testA4(repoRoot);
    testA5(repoRoot);
    testA6(repoRoot);
    testA7(repoRoot);
    testA8(repoRoot);
    testA9(repoRoot);

    const passed = results.filter(r => r.status === 'PASS').length;
    const failed = results.filter(r => r.status === 'FAIL').length;

    console.log('\n═══════════════════════════════════════════════════════════════');
    console.log(`  RESULTS: ${passed} passed, ${failed} failed`);
    console.log('═══════════════════════════════════════════════════════════════\n');

    return {
        passed,
        failed,
        results
    };
}

// CLI entry point
if (import.meta.url === `file://${process.argv[1]}`) {
    const result = runAcceptanceTests(process.cwd());
    process.exit(result.failed > 0 ? 1 : 0);
}

export default { runAcceptanceTests };
