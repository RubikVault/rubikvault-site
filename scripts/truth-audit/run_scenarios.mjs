import fs from 'node:fs';
import path from 'node:path';
import { inspect } from './inspect_shapes.mjs';

const ROOT_DIR = process.cwd();
const ARTIFACTS_DIR = path.join(ROOT_DIR, 'artifacts/truth-audit/2026-02-02');
const RUNTIME_DIR = path.join(ARTIFACTS_DIR, 'runtime');
const RAW_DIR = path.join(ARTIFACTS_DIR, 'raw');

if (!fs.existsSync(RUNTIME_DIR)) fs.mkdirSync(RUNTIME_DIR, { recursive: true });

const CONTEXT = JSON.parse(fs.readFileSync(path.join(ARTIFACTS_DIR, 'RUNTIME_CONTEXT.json'), 'utf-8'));
const BASE_URL = CONTEXT.BASE_URL;

const SPECS = {
    api_stock: {
        bar: ["data.latest_bar", "latest_bar", "data.bar", "bar"],
        ok: ["ok", "data.ok"]
    },
    mission_control: {
        truthChains: ["data.truthChains", "truthChains"],
        prices: ["data.truthChains.prices", "truthChains.prices"]
    },
    ui_trace: {
        winning_url: ["network.winning.url"],
        ui_values: ["ui.values"]
    }
};

async function fetchJson(url) {
    try {
        const res = await fetch(url);
        if (!res.ok) return { error: `HTTP ${res.status}` };
        return await res.json();
    } catch (err) {
        return { error: err.message };
    }
}

async function runScenarios() {
    const telemetry = _initTelemetry();
    const matrix = [];

    // S0: Happy Path
    console.log('Running S0: Happy Path...');
    const s0_uber = await fetchJson(`${BASE_URL}/api/stock?ticker=UBER`);
    const s0_summary = await fetchJson(`${BASE_URL}/api/mission-control/summary?debug=1`);
    const s0_trace = await fetchJson(`${BASE_URL}/debug/ui-path/UBER.ui-path.trace.json`);

    _record(telemetry, matrix, 'S0', 'api_stock', s0_uber, SPECS.api_stock);
    _record(telemetry, matrix, 'S0', 'mission_control', s0_summary, SPECS.mission_control);
    _record(telemetry, matrix, 'S0', 'ui_trace', s0_trace, SPECS.ui_trace);

    // S1: Debug Path
    console.log('Running S1: Debug Path...');
    const s1_uber = await fetchJson(`${BASE_URL}/api/stock?ticker=UBER&debug=1`);
    _record(telemetry, matrix, 'S1', 'api_stock_debug', s1_uber, SPECS.api_stock);

    // S2: Trace Integrity
    console.log('Running S2: Trace Integrity...');
    const traceUrl = s0_trace?.network?.winning?.url;
    const traceStatus = traceUrl && traceUrl.startsWith('/api') ? 'PASS' : 'FAIL';
    matrix.push({ scenario: 'S2_TRACE_BASE_INTEGRITY', check: 'winning_url_prefix', result: traceStatus, detail: traceUrl });

    // S3: Contract Consistency (OPS)
    console.log('Running S3: Contract Consistency...');
    const pricesSteps = s0_summary?.data?.truthChains?.prices?.steps || [];
    const p6 = pricesSteps.find(s => s.id === 'P6_API_CONTRACT');
    const p6Status = p6?.status === 'OK' ? 'PASS' : 'FAIL';
    matrix.push({ scenario: 'S3_CONTRACT_CONSISTENCY', check: 'OPS_P6_OK', result: p6Status, detail: p6?.evidence });

    // Output
    fs.writeFileSync(path.join(ARTIFACTS_DIR, 'RUNTIME_TELEMETRY.json'), JSON.stringify(telemetry, null, 2));
    fs.writeFileSync(path.join(ARTIFACTS_DIR, 'SCENARIO_MATRIX.md'), _renderMatrix(matrix));
    console.log('Runtime analysis complete.');
}

function _initTelemetry() {
    return { pathHits: {} };
}

function _record(telemetry, matrix, scenario, type, payload, spec) {
    const report = inspect(payload, spec);

    // Update telemetry checks
    for (const [pathStr, present] of Object.entries(report.presentPaths)) {
        if (!telemetry.pathHits[pathStr]) telemetry.pathHits[pathStr] = 0;
        if (present) telemetry.pathHits[pathStr]++;
    }

    matrix.push({
        scenario,
        type,
        violations: report.violations.length,
        details: report.violations.length ? report.violations.join('; ') : 'OK'
    });

    fs.writeFileSync(path.join(RUNTIME_DIR, `${scenario}_${type}_report.json`), JSON.stringify(report, null, 2));
}

function _renderMatrix(matrix) {
    let md = '# Scenario Matrix\n\n| Scenario | Check/Type | Result | Details |\n|---|---|---|---|\n';
    for (const row of matrix) {
        const res = row.result || (row.violations === 0 ? 'PASS' : 'FAIL');
        md += `| ${row.scenario} | ${row.type || row.check} | ${res} | ${row.details || row.detail} |\n`;
    }
    return md;
}

runScenarios();
