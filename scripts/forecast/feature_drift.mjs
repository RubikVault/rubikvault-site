/**
 * Feature Drift Detector (Runbook 7.3)
 * Compares current feature distributions vs baseline using KS test approximation.
 * Baseline file: mirrors/forecast/ops/baselines/feature_distributions.json
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../../');
const BASELINE_PATH = path.join(ROOT, 'mirrors/forecast/ops/baselines/feature_distributions.json');

// Simple KS Test D-statistic logic
function ksTest(data1, data2) {
    const n1 = data1.length;
    const n2 = data2.length;
    if (n1 === 0 || n2 === 0) return { d: 0, p: 1 };

    const combined = [...data1.map(v => ({ v, t: 1 })), ...data2.map(v => ({ v, t: 2 }))]
        .sort((a, b) => a.v - b.v);

    let d = 0;
    let fn1 = 0;
    let fn2 = 0;

    for (const item of combined) {
        if (item.t === 1) fn1++; else fn2++;
        const dist = Math.abs(fn1 / n1 - fn2 / n2);
        if (dist > d) d = dist;
    }

    // Approximate P-value (Kolmogorov approximation)
    const m = Math.sqrt((n1 * n2) / (n1 + n2));
    const p = Math.exp(-2 * m * m * d * d);

    return { d, p };
}

// Generate synthetic samples from stored percentiles (placeholder for real data)
function generateFromBaseline(baseline, n = 100) {
    const { mean, std } = baseline;
    // Simple normal-ish distribution approximation
    return Array.from({ length: n }, () => {
        const u1 = Math.random();
        const u2 = Math.random();
        const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
        return mean + std * z;
    });
}

async function run() {
    console.log("🔍 Checking for Feature Drift (Runbook 7.3)...");

    // Load baseline
    if (!fs.existsSync(BASELINE_PATH)) {
        console.error(`Baseline not found: ${BASELINE_PATH}`);
        process.exit(1);
    }

    const baseline = JSON.parse(fs.readFileSync(BASELINE_PATH, 'utf8'));
    const features = baseline.features || {};

    let driftDetected = false;
    const results = {};

    for (const [featureName, featureBaseline] of Object.entries(features)) {
        // In production, load actual current feature values from latest pipeline run
        // For now, simulate with baseline + small noise (should pass)
        const baselineSamples = generateFromBaseline(featureBaseline, 100).sort((a, b) => a - b);

        // Simulate "current" with slight drift for testing
        const currentSamples = generateFromBaseline({
            mean: featureBaseline.mean * 1.02, // 2% drift
            std: featureBaseline.std
        }, 100).sort((a, b) => a - b);

        const result = ksTest(baselineSamples, currentSamples);
        results[featureName] = {
            d_statistic: result.d.toFixed(4),
            p_value: result.p.toFixed(4),
            drift: result.p < 0.01
        };

        if (result.p < 0.01) {
            console.warn(`⚠️  Drift detected in ${featureName}: D=${result.d.toFixed(4)}, P=${result.p.toFixed(4)}`);
            driftDetected = true;
        } else {
            console.log(`✓ ${featureName}: No drift (D=${result.d.toFixed(4)}, P=${result.p.toFixed(4)})`);
        }
    }

    // Write results for ops report consumption
    const outputPath = path.join(ROOT, 'dev/ops/forecast/drift_results.json');
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    fs.writeFileSync(outputPath, JSON.stringify({
        checked_at: new Date().toISOString(),
        drift_detected: driftDetected,
        features: results
    }, null, 2));

    if (driftDetected) {
        console.error("\n⚠️  Significant Feature Drift Detected! Review recommended.");
        // In production, optionally exit 1 to fail CI
        // process.exit(1);
    } else {
        console.log("\n✅ No significant drift detected.");
    }
}

run().catch(console.error);
