/**
 * Forecast Registry Validator
 * 
 * Validates that the forecast models registry exists, is valid JSON,
 * conforms to the schema, and has at least one active champion model.
 */

import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const REGISTRY_PATH = path.join(ROOT, 'public/data/forecast/models/registry.json');

function fail(reason) {
    console.error(`❌ VALIDATION FAILED: ${reason}`);
    process.exit(1);
}

function pass(message) {
    console.log(`✅ ${message}`);
}

// Check file exists
if (!fs.existsSync(REGISTRY_PATH)) {
    fail(`Registry file not found: ${REGISTRY_PATH}`);
}

// Parse JSON
let registry;
try {
    const content = fs.readFileSync(REGISTRY_PATH, 'utf8');
    registry = JSON.parse(content);
} catch (err) {
    fail(`Invalid JSON in registry: ${err.message}`);
}

// Validate schema version
if (registry.schema_version !== 'registry_v1') {
    fail(`Invalid schema_version: expected 'registry_v1', got '${registry.schema_version}'`);
}
pass('Schema version is registry_v1');

// Validate models array
if (!Array.isArray(registry.models) || registry.models.length === 0) {
    fail('Registry must have at least one model');
}
pass(`Registry has ${registry.models.length} model(s)`);

// Validate at least one champion
const champions = registry.models.filter(m => m.is_champion === true);
if (champions.length === 0) {
    fail('Registry must have at least one champion model');
}
if (champions.length > 1) {
    fail(`Registry has multiple champions (${champions.length}), expected exactly 1`);
}
pass(`Champion model: ${champions[0].id}`);

// Validate champion is ACTIVE
if (champions[0].status !== 'ACTIVE') {
    fail(`Champion model status is '${champions[0].status}', expected 'ACTIVE'`);
}
pass('Champion model is ACTIVE');

// Validate required fields on all models
for (const model of registry.models) {
    const required = ['id', 'type', 'version', 'status'];
    for (const field of required) {
        if (!model[field]) {
            fail(`Model missing required field '${field}': ${JSON.stringify(model)}`);
        }
    }
}
pass('All models have required fields');

console.log('\n✅ FORECAST REGISTRY VALIDATION PASSED\n');
