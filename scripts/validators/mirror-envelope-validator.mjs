#!/usr/bin/env node
/**
 * P6 (B): Scoped Mirror Envelope Validator
 * Detects semantic inconsistencies like LIVE_BUT_EMPTY.
 */
import fs from 'node:fs';
import path from 'node:path';

const REPO_ROOT = path.resolve(new URL('.', import.meta.url).pathname, '../..');
const mirrorRoot = path.join(REPO_ROOT, 'mirrors');
const failures = [];
const warnings = [];

function parseArgs(argv) {
    const out = { strict: false, maxCritical: 0 };
    for (let i = 0; i < argv.length; i += 1) {
        const token = String(argv[i] || '');
        if (token === '--strict') {
            out.strict = true;
            continue;
        }
        if (token === '--max-critical') {
            out.maxCritical = Number(argv[i + 1] || 0);
            i += 1;
        }
    }
    return out;
}

function toArray(value) {
    return Array.isArray(value) ? value : [];
}

function countRows(payload) {
    const dataNode = payload?.data && typeof payload.data === 'object' ? payload.data : {};
    const nested = dataNode?.data && typeof dataNode.data === 'object' ? dataNode.data : {};
    const stocksA = dataNode?.stocks && typeof dataNode.stocks === 'object' ? dataNode.stocks : {};
    const stocksB = nested?.stocks && typeof nested.stocks === 'object' ? nested.stocks : {};
    const arrays = [
        ...toArray(dataNode.items),
        ...toArray(nested.items),
        ...toArray(dataNode.signals),
        ...toArray(nested.signals),
        ...toArray(dataNode.trades),
        ...toArray(nested.trades),
        ...toArray(dataNode.quotes),
        ...toArray(nested.quotes),
        ...toArray(dataNode.metrics),
        ...toArray(nested.metrics),
        ...toArray(dataNode.rows),
        ...toArray(nested.rows),
        ...toArray(dataNode.picks),
        ...toArray(dataNode?.picks?.top),
        ...toArray(stocksA.volumeLeaders),
        ...toArray(stocksA.gainers),
        ...toArray(stocksB.volumeLeaders),
        ...toArray(stocksB.gainers)
    ];
    return arrays.length;
}

function getStatus(payload) {
    const dataNode = payload?.data && typeof payload.data === 'object' ? payload.data : {};
    const dq = payload?.dataQuality || dataNode?.dataQuality || {};
    return String(dq?.status || '').trim().toUpperCase() || null;
}

const args = parseArgs(process.argv.slice(2));

const files = fs.readdirSync(mirrorRoot).filter(f => f.endsWith('.json'));

for (const file of files) {
    try {
        const mirror = JSON.parse(fs.readFileSync(path.join(mirrorRoot, file), 'utf8'));
        const payload = mirror.payload || mirror.raw || mirror;
        const status = getStatus(payload);
        const rowCount = countRows(payload);

        if (status === 'LIVE' && rowCount === 0) {
            failures.push({ severity: 'critical', file, problem: 'LIVE_BUT_EMPTY', status, items_count: 0 });
            continue;
        }
        if ((status === 'EMPTY' || status === 'PARTIAL') && rowCount > 0) {
            warnings.push({ severity: 'warning', file, problem: 'NON_LIVE_BUT_HAS_DATA', status, items_count: rowCount });
        }
    } catch (err) {
        failures.push({ severity: 'critical', file, problem: 'PARSE_ERROR', error: err.message });
    }
}

const reportPath = path.join(REPO_ROOT, 'public/data/universe/v7/reports/mirror_envelope_report.json');
fs.mkdirSync(path.dirname(reportPath), { recursive: true });
fs.writeFileSync(reportPath, JSON.stringify({
    schema: 'rv_mirror_envelope_report_v1',
    generated_at: new Date().toISOString(),
    strict: args.strict,
    total_mirrors: files.length,
    failures_count: failures.length,
    warnings_count: warnings.length,
    failures,
    warnings
}, null, 2));

if (failures.length) {
    console.error(`Envelope Validation: ${failures.length} inconsistencies in ${files.length} mirrors`);
    failures.forEach(f => console.error(`  ✗ ${f.file}: ${f.problem}${f.status ? ` (status=${f.status})` : ''}`));
    if (args.strict && failures.length > args.maxCritical) {
        process.exit(1);
    }
} else {
    console.log(`Envelope Validation: OK (${files.length} mirrors checked)`);
}
