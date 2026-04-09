#!/usr/bin/env node

import fs from 'node:fs/promises';
import path from 'node:path';
import { GREEN_GATES, PIPELINE_STEPS } from './pipeline-registry.mjs';

const ROOT = path.resolve(new URL('.', import.meta.url).pathname, '../..');
const CENSUS_PATH = path.join(ROOT, 'tmp/nas-benchmarks/pipeline-census-latest.json');
const OUT_MD = path.join(ROOT, 'tmp/nas-benchmarks/pipeline-proof-matrix-latest.md');

async function readJson(filePath) {
  try {
    return JSON.parse(await fs.readFile(filePath, 'utf8'));
  } catch {
    return null;
  }
}

const census = await readJson(CENSUS_PATH);
const byId = new Map((census?.steps || PIPELINE_STEPS).map((step) => [step.id, step]));

const lines = [
  '# Pipeline Proof Matrix',
  '',
  `Generated at: ${new Date().toISOString()}`,
  '',
  '## Chain Of Custody',
  '',
  '| # | Step | Producer Command | Main Outputs | Consumed By | UI Surfaces | Classification |',
  '|---:|---|---|---|---|---|---|',
];

for (const step of PIPELINE_STEPS) {
  const enriched = byId.get(step.id) || step;
  lines.push(
    `| ${step.order} | ${step.id} | \`${step.command}\` | ${step.outputs.join('<br>')} | ${(step.consumers || []).join('<br>')} | ${(step.ui_surfaces || []).join('<br>')} | ${enriched.current_classification || step.default_classification} |`
  );
}

lines.push('');
lines.push('## Final Green Gates');
lines.push('');
lines.push('| Gate | Source | Requirement |');
lines.push('|---|---|---|');
for (const gate of GREEN_GATES) {
  lines.push(`| ${gate.id} | ${gate.source} | ${gate.requirement} |`);
}

lines.push('');
lines.push('## Proof Notes');
lines.push('');
lines.push('- The final local UI proof depends on `build_stock_analyzer_universe_audit` against `http://127.0.0.1:8788`.');
lines.push('- `dashboard_v7` is not green until `hist_probs`, full-universe audit, `build-system-status-report`, and `generate_meta_dashboard_data` all pass.');
lines.push('- A NAS-only backend can still fail the full proof if the local Pages runtime gate remains Mac-bound.');

await fs.mkdir(path.dirname(OUT_MD), { recursive: true });
await fs.writeFile(OUT_MD, lines.join('\n') + '\n', 'utf8');
process.stdout.write(`${OUT_MD}\n`);
