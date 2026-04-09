#!/usr/bin/env node
/**
 * Build Pipeline Step Registry
 *
 * Generates public/data/ops/pipeline-step-registry.json from the
 * canonical SSOT step contracts in system-status-ssot.mjs.
 *
 * Run: node scripts/ops/build-pipeline-step-registry.mjs
 * Or:  npm run build:pipeline-registry
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PIPELINE_STEP_REGISTRY } from './system-status-ssot.mjs';

const REPO_ROOT = path.resolve(fileURLToPath(new URL('.', import.meta.url)), '../..');
const OUT_PATH  = path.join(REPO_ROOT, 'public/data/ops/pipeline-step-registry.json');

fs.mkdirSync(path.dirname(OUT_PATH), { recursive: true });
fs.writeFileSync(OUT_PATH, JSON.stringify({
  schema: 'rv_pipeline_step_registry_v1',
  generated_at: new Date().toISOString(),
  steps: PIPELINE_STEP_REGISTRY,
}, null, 2) + '\n', 'utf8');

console.log(`[pipeline-step-registry] Written ${PIPELINE_STEP_REGISTRY.length} steps → ${OUT_PATH}`);
