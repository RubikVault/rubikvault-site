/**
 * V6.0 — Phase 0C: Unified Predictions Registry Builder
 *
 * Reads distributed prediction NDJSON files from mirrors/learning/predictions/
 * and writes a unified registry.ndjson.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

const REPO_ROOT = path.resolve(new URL('.', import.meta.url).pathname, '../..');
const PREDICTIONS_ROOT = path.join(REPO_ROOT, 'mirrors/learning/predictions');
const REGISTRY_DIR = path.join(REPO_ROOT, 'mirrors/predictions');
const REGISTRY_PATH = path.join(REGISTRY_DIR, 'registry.ndjson');

const FEATURES = ['forecast', 'scientific', 'elliott', 'stock_analyzer'];

async function walkNdjsonFiles(dir) {
  const files = [];
  try {
    const entries = await fs.readdir(dir, { withFileTypes: true, recursive: true });
    for (const e of entries) {
      if (e.isFile() && e.name.endsWith('.ndjson')) {
        files.push(path.join(e.parentPath ?? path.join(dir, e.path ?? ''), e.name));
      }
    }
  } catch { /* dir may not exist */ }
  return files;
}

function parseLine(line, feature) {
  try {
    const obj = JSON.parse(line);
    return {
      prediction_id: obj.prediction_id || randomUUID(),
      feature,
      ticker: obj.ticker || obj.symbol || '',
      date: obj.date || obj.prediction_date || '',
      horizon: obj.horizon || obj.horizon_label || '',
      direction: obj.direction || (Number(obj.probability) >= 0.5 ? 'bullish' : 'bearish'),
      probability: obj.probability ?? obj.p_pos ?? null,
      calibrated_probability: obj.calibrated_probability ?? obj.calibrated ?? null,
      model_version: obj.model_version || obj.code_hash || '',
      outcome: obj.outcome ?? obj.realized_outcome ?? null,
      source_env: obj.source_env || 'main',
      asset_class: obj.asset_class || 'stock',
    };
  } catch {
    return null;
  }
}

export async function buildRegistry() {
  const lines = [];

  for (const feature of FEATURES) {
    const featureDir = path.join(PREDICTIONS_ROOT, feature);
    const files = await walkNdjsonFiles(featureDir);

    for (const file of files) {
      const content = await fs.readFile(file, 'utf-8');
      for (const rawLine of content.split('\n')) {
        const trimmed = rawLine.trim();
        if (!trimmed) continue;
        const record = parseLine(trimmed, feature);
        if (record) lines.push(JSON.stringify(record));
      }
    }
  }

  await fs.mkdir(REGISTRY_DIR, { recursive: true });
  await fs.writeFile(REGISTRY_PATH, lines.join('\n') + (lines.length ? '\n' : ''), 'utf-8');

  return { total_records: lines.length, output: REGISTRY_PATH };
}

// CLI entrypoint
if (process.argv[1]?.includes('build-predictions-registry')) {
  buildRegistry()
    .then(r => console.log(`[registry] ${r.total_records} records → ${r.output}`))
    .catch(err => { console.error('[registry]', err); process.exit(1); });
}
