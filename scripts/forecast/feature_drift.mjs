/**
 * Feature Drift Detector
 * Runs Kolmogorov-Smirnov test (simplified) on feature distributions.
 * Runbook 7.3
 */
import fs from 'fs';
import path from 'path';

// Simple JS implementation of KS Test D-statistic logic
// Compares two sorted arrays and finds max distance between CDFs.
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

    // Approximate P-value (Not rigorous but good for monitoring)
    const m = Math.sqrt((n1 * n2) / (n1 + n2));
    const p = Math.exp(-2 * m * m * d * d); // Kolmogorov approximation

    return { d, p };
}

// Main
async function run() {
    console.log("🔍 Checking for Feature Drift...");
    // Load baseline (e.g. from reference model training data)
    // For now, using placeholder logic as we don't have stored baselines yet.
    // In real implementation, this would read `public/data/forecast/models/champion/baseline_features.json`

    // Simulate current vs baseline
    const baseline = Array.from({ length: 100 }, () => Math.random());
    const current = Array.from({ length: 100 }, () => Math.random() * 1.05); // Slight drift

    const result = ksTest(baseline.sort((a, b) => a - b), current.sort((a, b) => a - b));

    console.log(`KS Test Result: D=${result.d.toFixed(4)}, P=${result.p.toFixed(4)}`);

    if (result.p < 0.01) {
        console.error("⚠️ Significant Drift Detected! P < 0.01");
        process.exit(1);
    } else {
        console.log("✅ No significant drift.");
    }
}

run();
