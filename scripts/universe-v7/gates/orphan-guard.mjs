#!/usr/bin/env node
/**
 * P2: Orphan Guard — Phase 1 upgrade of orphan-scan.mjs.
 * - Quarantines recoverable orphans automatically.
 * - Hard-fails on CRITICAL patterns (dangling publish_intent without complete).
 */
import fs from 'node:fs/promises';
import path from 'node:path';

const REPO_ROOT = path.resolve(new URL('.', import.meta.url).pathname, '../../..');
const SCAN_ROOTS = [
    path.join(REPO_ROOT, 'public/data/universe/v7')
];

const TOXIC_PATTERNS = [/__broken_/, /\.__prev$/, /__tmp$/, /\.bak$/];

async function guard() {
    const report = {
        schema: 'rv_orphan_guard_v1',
        generated_at: new Date().toISOString(),
        scan_roots: SCAN_ROOTS.map(r => path.relative(REPO_ROOT, r)),
        orphans: [],
        quarantined: [],
        dangling_intents: []
    };

    for (const root of SCAN_ROOTS) {
        const entries = await fs.readdir(root, { withFileTypes: true }).catch(() => []);
        for (const e of entries) {
            if (!e.isDirectory()) continue;
            if (!TOXIC_PATTERNS.some(p => p.test(e.name))) continue;

            const fullPath = path.join(root, e.name);
            const stat = await fs.stat(fullPath).catch(() => null);
            const orphan = {
                path: path.relative(REPO_ROOT, fullPath),
                name: e.name,
                modified: stat?.mtime?.toISOString() || null
            };
            report.orphans.push(orphan);

            // Phase 1: Auto-quarantine recoverable orphans
            try {
                const qDir = path.join(root, '.quarantine', new Date().toISOString().slice(0, 10));
                await fs.mkdir(qDir, { recursive: true });
                await fs.rename(fullPath, path.join(qDir, e.name));
                report.quarantined.push(e.name);
                console.log(`  ♻ Quarantined: ${e.name}`);
            } catch (err) {
                console.error(`  ✗ Failed to quarantine ${e.name}: ${err.message}`);
            }
        }

        // Check dangling publish intents (CRITICAL)
        const intentPath = path.join(root, 'publish_intent.json');
        const completePath = path.join(root, 'publish_complete.json');
        const hasIntent = await fs.access(intentPath).then(() => true).catch(() => false);
        const hasComplete = await fs.access(completePath).then(() => true).catch(() => false);
        if (hasIntent && !hasComplete) {
            report.dangling_intents.push({
                path: path.relative(REPO_ROOT, intentPath),
                severity: 'CRITICAL',
                description: 'publish_intent.json exists without publish_complete.json'
            });
        }
    }

    const reportPath = path.join(REPO_ROOT, 'public/data/universe/v7/reports/orphan_guard_report.json');
    await fs.mkdir(path.dirname(reportPath), { recursive: true });
    await fs.writeFile(reportPath, JSON.stringify(report, null, 2));

    console.log(`Orphan guard: ${report.orphans.length} found, ${report.quarantined.length} quarantined, ${report.dangling_intents.length} critical`);

    // Hard-fail on CRITICAL dangling intents
    if (report.dangling_intents.length > 0) {
        report.dangling_intents.forEach(d => console.error(`  ⚠ CRITICAL: ${d.path}`));
        console.error('ABORT: Dangling publish_intent detected. Manual intervention required.');
        process.exit(1);
    }

    return report;
}

guard().catch(err => { console.error('Orphan guard failed:', err.message); process.exit(1); });
