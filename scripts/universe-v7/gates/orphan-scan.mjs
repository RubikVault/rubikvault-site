#!/usr/bin/env node
/**
 * P2: Orphan Scan — Detects leftover artifacts from failed runs.
 * Phase 0: Report-only (no moves, no exits).
 * Phase 1: Upgrade to orphan-guard.mjs with quarantine + hard-fail on dangling intents.
 */
import fs from 'node:fs/promises';
import path from 'node:path';

const REPO_ROOT = path.resolve(new URL('.', import.meta.url).pathname, '../../..');
const SCAN_ROOTS = [
    path.join(REPO_ROOT, 'public/data/universe/v7')
];

const TOXIC_PATTERNS = [/__broken_/, /\.__prev$/, /__tmp$/, /\.bak$/];

async function scan() {
    const report = {
        schema: 'rv_orphan_scan_v1',
        generated_at: new Date().toISOString(),
        scan_roots: SCAN_ROOTS.map(r => path.relative(REPO_ROOT, r)),
        orphans: [],
        dangling_intents: []
    };

    for (const root of SCAN_ROOTS) {
        const entries = await fs.readdir(root, { withFileTypes: true }).catch(() => []);
        for (const e of entries) {
            if (!e.isDirectory()) continue;
            if (TOXIC_PATTERNS.some(p => p.test(e.name))) {
                const fullPath = path.join(root, e.name);
                const stat = await fs.stat(fullPath).catch(() => null);
                report.orphans.push({
                    path: path.relative(REPO_ROOT, fullPath),
                    name: e.name,
                    modified: stat?.mtime?.toISOString() || null,
                    size_bytes: stat?.size || null
                });
            }
        }

        // Check dangling publish intents (critical orphan pattern)
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

    const reportPath = path.join(REPO_ROOT, 'public/data/universe/v7/reports/orphan_scan_report.json');
    await fs.mkdir(path.dirname(reportPath), { recursive: true });
    await fs.writeFile(reportPath, JSON.stringify(report, null, 2));

    console.log(`Orphan scan: ${report.orphans.length} orphan(s), ${report.dangling_intents.length} dangling intent(s)`);
    report.orphans.forEach(o => console.log(`  → ${o.name} (modified: ${o.modified || 'unknown'})`));
    report.dangling_intents.forEach(d => console.log(`  ⚠ CRITICAL: ${d.path}`));

    return report;
}

scan().catch(err => { console.error('Orphan scan failed:', err.message); process.exit(1); });
