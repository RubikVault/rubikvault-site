#!/usr/bin/env node
/**
 * build-scientific-summary.mjs
 * Reads the 131MB stock-analysis.json and produces a lightweight summary
 * at public/data/supermodules/scientific-summary.json (~500KB)
 * for the Ideas → Scientific Analyzer tab.
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

const SRC = resolve(ROOT, 'public/data/snapshots/stock-analysis.json');
const OUT = resolve(ROOT, 'public/data/supermodules/scientific-summary.json');

if (!existsSync(SRC)) {
    console.error('⚠  stock-analysis.json not found at', SRC);
    // Write empty summary so UI can show "not built" gracefully
    writeFileSync(OUT, JSON.stringify({
        _status: 'NO_SOURCE_DATA',
        generated_at: new Date().toISOString(),
        module: 'scientific_analyzer',
        rows: [],
        universe_stats: { total: 0 }
    }, null, 2));
    console.log('✓ Empty scientific-summary.json written');
    process.exit(0);
}

console.log('Reading stock-analysis.json …');
const raw = JSON.parse(readFileSync(SRC, 'utf8'));
const entries = Object.entries(raw);
console.log(`  ${entries.length} stocks loaded`);

// Filter: skip numeric-only European tickers and index tickers (^)
const isUSLike = (sym) => /^[A-Z]{1,5}(-[A-Z])?$/.test(sym);

const all = entries
    .filter(([sym]) => isUSLike(sym))
    .map(([sym, d]) => ({
        symbol: sym,
        name: d.name || null,
        price: d.price ?? null,
        probability: d.probability ?? null,
        signal_strength: d.signal_strength || 'WEAK',
        v4_decision: {
            verdict: d.v4_decision?.verdict || null,
            confidence_bucket: d.v4_decision?.confidence_bucket || null
        },
        setup: {
            fulfilled: d.setup?.fulfilled ?? false,
            score: d.setup?.score ?? 0,
            conditions_met: d.setup?.conditions_met || '0/5',
            proof_points: (d.setup?.proof_points || []).slice(0, 3)
        },
        trigger: {
            fulfilled: d.trigger?.fulfilled ?? false,
            score: d.trigger?.score ?? 0,
            conditions_met: d.trigger?.conditions_met || '0/4',
            proof_points: (d.trigger?.proof_points || []).slice(0, 3)
        },
        indicators: {
            rsi: d.indicators?.rsi ?? null,
            macd_hist: d.indicators?.macd_hist ?? null,
            volume_ratio: d.indicators?.volume_ratio ?? null
        }
    }));

console.log(`  ${all.length} US-like stocks after filtering`);

// 1. Strong signals: setup AND trigger fulfilled, sorted by combined score
const strong = all
    .filter(s =>
        s.setup.fulfilled &&
        s.trigger.fulfilled &&
        s.v4_decision.verdict === 'BUY' &&
        s.v4_decision.confidence_bucket === 'HIGH'
    )
    .sort((a, b) => (b.setup.score + b.trigger.score) - (a.setup.score + a.trigger.score))
    .slice(0, 30);

// 2. Best setups (fulfilled, not necessarily triggered), sorted by setup score
const bestSetups = all
    .filter(s =>
        s.setup.fulfilled &&
        !s.trigger.fulfilled &&
        s.v4_decision.verdict === 'BUY' &&
        s.v4_decision.confidence_bucket === 'HIGH'
    )
    .sort((a, b) => b.setup.score - a.setup.score)
    .slice(0, 30);

// 3. Universe stats
const totalSetups = all.filter(s => s.setup.fulfilled).length;
const totalTriggers = all.filter(s => s.trigger.fulfilled).length;
const totalStrong = all.filter(s => s.v4_decision.verdict === 'BUY' && s.v4_decision.confidence_bucket === 'HIGH').length;

const summary = {
    module: 'scientific_analyzer',
    schema_version: 'rv.supermodules.v1',
    generated_at: new Date().toISOString(),
    universe_stats: {
        total: all.length,
        setups_fulfilled: totalSetups,
        triggers_fulfilled: totalTriggers,
        strong_signals: totalStrong
    },
    strong_signals: strong,
    best_setups: bestSetups
};

writeFileSync(OUT, JSON.stringify(summary, null, 2));
const sizeKB = (Buffer.byteLength(JSON.stringify(summary)) / 1024).toFixed(1);
console.log(`✓ scientific-summary.json written (${sizeKB} KB)`);
console.log(`  Strong signals: ${strong.length}, Best setups: ${bestSetups.length}`);
