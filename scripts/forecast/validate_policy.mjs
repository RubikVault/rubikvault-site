import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// Simple schema validator (since we might not have ajv installed in CI)
// Checks required fields presence.

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../../');

const POLICY_PATH = path.join(ROOT, 'policies/forecast.v3.json');
const SCHEMA_PATH = path.join(ROOT, 'policies/forecast.schema.json');

console.log(`Validating ${POLICY_PATH} against ${SCHEMA_PATH}...`);

try {
    const policy = JSON.parse(fs.readFileSync(POLICY_PATH, 'utf8'));
    const schema = JSON.parse(fs.readFileSync(SCHEMA_PATH, 'utf8'));

    // Basic check: Required fields
    const required = schema.required || [];
    const missing = required.filter(field => !policy[field]);

    if (missing.length > 0) {
        console.error(`❌ Missing required fields: ${missing.join(', ')}`);
        process.exit(1);
    }

    // Check Universe
    if (!policy.universe || !policy.universe.source) {
        console.error('❌ Missing universe.source');
        process.exit(1);
    }

    console.log("✅ Policy Validated (Basic Schema Check)");
} catch (e) {
    console.error("❌ Validation Failed:", e.message);
    process.exit(1);
}
