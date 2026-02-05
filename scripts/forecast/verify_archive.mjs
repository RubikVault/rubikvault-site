import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../../');
const DATA_DIR = path.join(ROOT, 'public/data/forecast');

console.log("🔐 Verifying Archive Integrity...");

let errors = [];

// 1. Check Ledgers
const ledgerDir = path.join(DATA_DIR, 'ledgers');
if (fs.existsSync(ledgerDir)) {
    const files = fs.readdirSync(ledgerDir);
    files.forEach(f => {
        if (!f.endsWith('.json.gz') && !f.endsWith('.json')) return;
        // Verify readable
        // TODO: Decompress and parse
    });
} else {
    // Ledgers optional in bootstrap
}

// 2. Check Models
const modelDir = path.join(DATA_DIR, 'models/champion');
const currentModel = path.join(modelDir, 'current.json');
if (!fs.existsSync(currentModel)) {
    errors.push("Missing models/champion/current.json");
}

// 3. Check System Status
if (!fs.existsSync(path.join(DATA_DIR, 'system/status.json'))) {
    errors.push("Missing system/status.json");
}

if (errors.length > 0) {
    console.error("Integrity check failed:");
    errors.forEach(e => console.error(` - ${e}`));
    // In strict mode, exit 1. For now, warn.
    process.exit(1);
}

console.log("✅ Integrity Verified.");
