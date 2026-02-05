/**
 * Ops Report Generator
 * Generates daily health/viz file for the Ops Dashboard.
 * Runbook 6.1
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../../');
const FORECAST_DIR = path.join(ROOT, 'public/data/forecast');
const OPS_DIR = path.join(ROOT, 'dev/ops/forecast');
const OPS_DAILY_DIR = path.join(OPS_DIR, 'daily');

if (!fs.existsSync(OPS_DAILY_DIR)) fs.mkdirSync(OPS_DAILY_DIR, { recursive: true });

async function generateReport() {
    const today = new Date().toISOString().split('T')[0];

    // 1. Gather Metrics
    // Load existing status
    let status = { status: 'UNKNOWN' };
    try {
        status = JSON.parse(fs.readFileSync(path.join(FORECAST_DIR, 'system/status.json'), 'utf8'));
    } catch { }

    // Load Universe Stats (from manifest if exists)
    let universeStats = { total: 0 };
    try {
        // Assuming EOD manifest tracks universe coverage (from Step 3 - internal store)
        const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'public/data/eod/bars/manifest.json'), 'utf8'));
        universeStats = manifest.stats || { total: 0 };
    } catch { }

    // Mock/Calc uplift (Placeholder logic as we don't have historical run data yet)
    const uplift = {
        improved_pct: 0,
        mean_skill_delta: 0,
        champion_vs_baseline: "N/A"
    };

    // 2. Recommendations
    const recommendations = [];
    if (status.status === 'BOOTSTRAP') {
        recommendations.push({ level: 'P1', message: 'System is in BOOTSTRAP. Ensure daily pipeline runs successfully.' });
    }
    if (universeStats.total === 0) {
        recommendations.push({ level: 'P1', message: 'EOD Bar Store is empty. Run backfill script.' });
    }

    // 3. Assemble Report
    const report = {
        date: today,
        generated_at: new Date().toISOString(),
        status: status.status,
        metrics: {
            universe_coverage: universeStats,
            forecasting_uplift: uplift,
            circuit: status.circuit
        },
        provider_chain: {
            primary: "eodhd",
            // In a real run, we'd parse logs or telemetry to find actual usage stats
            provider_used_pct: 0,
            store_hit_rate: 0
        },
        alerts: [], // To be populated
        recommendations
    };

    // 4. Write
    const reportPath = path.join(OPS_DAILY_DIR, `${today}.json`);
    const latestPath = path.join(OPS_DIR, `latest.json`);

    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
    fs.writeFileSync(latestPath, JSON.stringify(report, null, 2));

    console.log(`✅ Ops Report generated: ${reportPath}`);
}

generateReport().catch(console.error);
