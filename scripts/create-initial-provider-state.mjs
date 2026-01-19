#!/usr/bin/env node
/**
 * Create initial provider-state.json for Mission Control Dashboard
 * 
 * Generates a minimal valid provider-state.json if it doesn't exist
 * or is not in v3.0 format.
 */

import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { generateProviderState } from './lib/provider-state.js';

const BASE_DIR = process.cwd();
const PROVIDER_STATE_PATH = join(BASE_DIR, 'public/data/provider-state.json');

async function main() {
  try {
    // Check if file exists and is v3.0
    let existing = null;
    try {
      const content = await readFile(PROVIDER_STATE_PATH, 'utf-8');
      existing = JSON.parse(content);
      if (existing.schema_version === '3.0') {
        console.log('✓ provider-state.json already exists in v3.0 format');
        return;
      }
    } catch (err) {
      if (err.code !== 'ENOENT') throw err;
    }

    // Load registry
    const registryPath = join(BASE_DIR, 'public/data/registry/modules.json');
    let registry;
    try {
      const registryContent = await readFile(registryPath, 'utf-8');
      registry = JSON.parse(registryContent);
    } catch (err) {
      console.error(`ERROR: Failed to load registry: ${err.message}`);
      process.exit(1);
    }

    // Create minimal manifest
    const now = new Date().toISOString();
    const manifest = {
      schema_version: "3.0",
      published_at: now,
      publish_policy: "critical_core_hybrid_v3",
      modules: {},
      summary: {
        modules_total: 0,
        ok: 0,
        warn: 0,
        error: 0,
        stale_ratio: 0,
        critical_ok: true
      }
    };

    // Generate provider state
    const providerState = generateProviderState(manifest, new Map());

    // Write provider state
    const { writeProviderState } = await import('./lib/provider-state.js');
    await writeProviderState(providerState, BASE_DIR);

    console.log('✓ Created initial provider-state.json');
    console.log(`  Location: ${PROVIDER_STATE_PATH}`);
    console.log(`  Modules: ${providerState.modules.length}`);
    
  } catch (err) {
    console.error(`❌ Failed to create provider-state.json: ${err.message}`);
    console.error(err.stack);
    process.exit(1);
  }
}

main();
