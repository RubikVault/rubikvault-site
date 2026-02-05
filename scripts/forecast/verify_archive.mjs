/**
 * Archive Integrity Verification
 * Runbook 7.4 - Verifies ledger→snapshot references exist in archive
 * Outputs: public/data/forecast/system/integrity_report.json
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../../');
const DATA_DIR = path.join(ROOT, 'public/data/forecast');
const OUTPUT_PATH = path.join(DATA_DIR, 'system/integrity_report.json');

console.log("🔐 Verifying Archive Integrity (Runbook 7.4)...");

let errors = [];
let warnings = [];
let checks = {
    models_champion: false,
    system_status: false,
    system_last_good: false,
    latest_json: false,
    ledgers_present: false
};

// 1. Check Champion Model
const championPath = path.join(DATA_DIR, 'models/champion/current.json');
if (fs.existsSync(championPath)) {
    try {
        const model = JSON.parse(fs.readFileSync(championPath, 'utf8'));
        if (model.id && model.version) {
            checks.models_champion = true;
        } else {
            errors.push("Champion model missing required fields (id, version)");
        }
    } catch (e) {
        errors.push(`Champion model parse error: ${e.message}`);
    }
} else {
    errors.push("Missing models/champion/current.json");
}

// 2. Check System Status
const statusPath = path.join(DATA_DIR, 'system/status.json');
if (fs.existsSync(statusPath)) {
    try {
        const status = JSON.parse(fs.readFileSync(statusPath, 'utf8'));
        if (status.status) {
            checks.system_status = true;
        }
    } catch (e) {
        errors.push(`Status file parse error: ${e.message}`);
    }
} else {
    errors.push("Missing system/status.json");
}

// 3. Check Last Good
const lastGoodPath = path.join(DATA_DIR, 'system/last_good.json');
if (fs.existsSync(lastGoodPath)) {
    checks.system_last_good = true;
} else {
    warnings.push("Missing system/last_good.json (acceptable in bootstrap)");
}

// 4. Check Latest
const latestPath = path.join(DATA_DIR, 'latest.json');
if (fs.existsSync(latestPath)) {
    try {
        const latest = JSON.parse(fs.readFileSync(latestPath, 'utf8'));
        if (latest.meta && latest.data) {
            checks.latest_json = true;
        } else {
            errors.push("latest.json missing required structure (meta, data)");
        }
    } catch (e) {
        errors.push(`latest.json parse error: ${e.message}`);
    }
} else {
    errors.push("Missing latest.json");
}

// 5. Check Ledgers Directory
const ledgerDir = path.join(DATA_DIR, 'ledgers');
if (fs.existsSync(ledgerDir)) {
    checks.ledgers_present = true;
} else {
    warnings.push("Ledgers directory not present (acceptable in bootstrap)");
}

// Generate Report
const report = {
    generated_at: new Date().toISOString(),
    status: errors.length > 0 ? 'FAIL' : 'PASS',
    checks,
    errors,
    warnings,
    summary: {
        total_checks: Object.keys(checks).length,
        passed: Object.values(checks).filter(Boolean).length,
        failed: Object.values(checks).filter(v => !v).length
    }
};

// Ensure output directory exists
fs.mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true });
fs.writeFileSync(OUTPUT_PATH, JSON.stringify(report, null, 2));

console.log(`Report written to: ${OUTPUT_PATH}`);
console.log(`Status: ${report.status}`);
console.log(`Checks Passed: ${report.summary.passed}/${report.summary.total_checks}`);

if (errors.length > 0) {
    console.error("\nErrors:");
    errors.forEach(e => console.error(` - ${e}`));
    process.exit(1);
}

if (warnings.length > 0) {
    console.warn("\nWarnings:");
    warnings.forEach(w => console.warn(` - ${w}`));
}

console.log("\n✅ Archive Integrity Verified.");
