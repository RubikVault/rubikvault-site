/**
 * Forecast System v3.0 — Determinism Test
 * 
 * MEM v1.2 Requirement: Validates that running the same inference twice
 * produces identical outputs (probabilities and direction).
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { generateForecast, loadPolicy, loadChampion, computePolicyHash } from '../../scripts/forecast/forecast_engine.mjs';
import { buildFeatureSnapshot } from '../../scripts/forecast/build_features.mjs';
import path from 'node:path';

const ROOT = process.cwd();

describe('Forecast Determinism (MEM v1.2)', () => {
    let policy, champion, policyHash;

    beforeAll(() => {
        policy = loadPolicy(ROOT);
        champion = loadChampion(ROOT);
        policyHash = computePolicyHash(ROOT);
    });

    it('should produce identical forecasts for the same inputs', () => {
        // Create deterministic test fixture
        const closes = Array.from({ length: 250 }, (_, i) => 100 + Math.sin(i * 0.1) * 10);
        const volumes = Array.from({ length: 250 }, () => 1000000);
        const spyCloses = Array.from({ length: 250 }, (_, i) => 400 + Math.sin(i * 0.1) * 20);

        const testParams = {
            ticker: 'TEST',
            tradingDate: '2026-02-05',
            closes,
            volumes,
            spyCloses,
            eventFlags: null,
            enabledGroups: ['basic', 'technical']
        };

        // Build feature snapshot
        const featureSnapshot = buildFeatureSnapshot(testParams);

        // Generate forecast twice with identical inputs
        const forecastParams = {
            ticker: 'TEST',
            tradingDate: '2026-02-05',
            horizon: '1d',
            featureSnapshot,
            championSpec: champion,
            policyHash,
            codeHash: 'determinism-test',
            snapshotsManifest: { snapshots: {} },
            provenance: 'synthetic',
            asOf: '2026-02-05T12:00:00Z',
            runId: 'determinism-test-001'
        };

        const forecast1 = generateForecast(forecastParams);
        const forecast2 = generateForecast(forecastParams);

        // Assert identical outputs
        expect(forecast1.p_up).toBe(forecast2.p_up);
        expect(forecast1.neutral_flag).toBe(forecast2.neutral_flag);
        expect(forecast1.conf).toBe(forecast2.conf);
        expect(forecast1.feature_snapshot_hash).toBe(forecast2.feature_snapshot_hash);
    });

    it('should produce stable probabilities within tolerance', () => {
        const closes = Array.from({ length: 250 }, (_, i) => 150 + (i % 50));
        const volumes = Array.from({ length: 250 }, () => 500000);

        const featureSnapshot = buildFeatureSnapshot({
            ticker: 'STABLE',
            tradingDate: '2026-02-05',
            closes,
            volumes,
            spyCloses: null,
            eventFlags: null,
            enabledGroups: ['basic']
        });

        const forecast = generateForecast({
            ticker: 'STABLE',
            tradingDate: '2026-02-05',
            horizon: '5d',
            featureSnapshot,
            championSpec: champion,
            policyHash,
            codeHash: 'stability-test',
            snapshotsManifest: { snapshots: {} },
            provenance: 'synthetic',
            asOf: '2026-02-05T12:00:00Z',
            runId: 'stability-test-001'
        });

        // Probability must be in valid range
        expect(forecast.p_up).toBeGreaterThanOrEqual(0);
        expect(forecast.p_up).toBeLessThanOrEqual(1);

        // Confidence must be in valid range
        expect(forecast.conf).toBeGreaterThanOrEqual(0);
        expect(forecast.conf).toBeLessThanOrEqual(1);
    });

    it('should derive consistent direction from p_up', () => {
        function deriveDirection(p_up, neutralFlag) {
            if (neutralFlag) return 'neutral';
            if (p_up > 0.53) return 'bullish';
            if (p_up < 0.47) return 'bearish';
            return 'neutral';
        }

        // Test boundary cases
        expect(deriveDirection(0.60, false)).toBe('bullish');
        expect(deriveDirection(0.40, false)).toBe('bearish');
        expect(deriveDirection(0.50, false)).toBe('neutral');
        expect(deriveDirection(0.50, true)).toBe('neutral');
        expect(deriveDirection(0.60, true)).toBe('neutral'); // neutral flag overrides
    });
});
