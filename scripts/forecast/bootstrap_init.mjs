import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../../');
const FORECAST_DIR = path.join(ROOT, 'public/data/forecast');

// Ensure directories
['system', 'models/champion', 'ledgers'].forEach(d => {
    fs.mkdirSync(path.join(FORECAST_DIR, d), { recursive: true });
});

const now = new Date().toISOString();
const today = now.split('T')[0];

console.log('🚀 Bootstrapping Forecast System Artifacts...');

// 1. System Status
const statusPath = path.join(FORECAST_DIR, 'system/status.json');
const status = {
    "status": "BOOTSTRAP",
    "message": "System initializing - waiting for first pipeline run",
    "updated_at": now,
    "circuit": {
        "state": "CLOSED",
        "failures": 0,
        "last_failure": null
    },
    "pipeline": {
        "last_run": null,
        "next_run": "2026-02-05T21:00:00Z" // Placeholder
    }
};
fs.writeFileSync(statusPath, JSON.stringify(status, null, 2));
console.log('✅ Created system/status.json');

// 2. Latest Pointer (The envelope expected by UI)
const latestPath = path.join(FORECAST_DIR, 'latest.json');
// The UI expects an envelope with `data.forecasts`? Or just status?
// Let's create a "safe" empty envelope.
const latest = {
    "meta": {
        "generated_at": now,
        "status": "BOOTSTRAP",
        "description": "Initial bootstrap reference"
    },
    "data": {
        "date": today,
        "forecasts": []
    }
};
fs.writeFileSync(latestPath, JSON.stringify(latest, null, 2));
console.log('✅ Created latest.json');

// 3. Last Good Reference
const lastGoodPath = path.join(FORECAST_DIR, 'system/last_good.json');
fs.writeFileSync(lastGoodPath, JSON.stringify(latest, null, 2));
console.log('✅ Created system/last_good.json');

// 4. Champion Model Spec
const championPath = path.join(FORECAST_DIR, 'models/champion/current.json');
const champion = {
    "id": "model_bootstrap_v1",
    "version": "1.0.0",
    "type": "logistic_regression",
    "features": ["trend_20d", "rsi_14d"],
    "created_at": now,
    "metrics": {
        "brier_skill": 0.0
    }
};
fs.writeFileSync(championPath, JSON.stringify(champion, null, 2));
console.log('✅ Created models/champion/current.json');

console.log('🎉 Bootstrap Complete. Forecast page should now load without 404s.');
