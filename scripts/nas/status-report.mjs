#!/usr/bin/env node

import fs from 'node:fs/promises';
import path from 'node:path';

const ROOT = process.cwd();
const manifestPath = path.join(ROOT, 'scripts', 'nas', 'stage-manifest.json');
const tmpShadowRoot = path.join(ROOT, 'tmp', 'nas-shadow-runs');

async function readJson(filePath) {
  return JSON.parse(await fs.readFile(filePath, 'utf8'));
}

async function listDirs(dirPath) {
  try {
    const entries = await fs.readdir(dirPath, { withFileTypes: true });
    return entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort();
  } catch {
    return [];
  }
}

const manifest = await readJson(manifestPath);
const summary = [];

for (const stage of manifest.stages || []) {
  const localRuns = await listDirs(path.join(tmpShadowRoot, stage.id));
  summary.push({
    id: stage.id,
    status: stage.status || null,
    successful_shadow_runs: stage.successful_shadow_runs ?? 0,
    successful_shadow_runs_required: stage.successful_shadow_runs_required ?? null,
    local_shadow_runs: localRuns.length,
    latest_successful_shadow_run: stage.latest_successful_shadow_run?.stamp || null
  });
}

process.stdout.write(JSON.stringify({
  schema_version: 'nas.migration.status.v1',
  generated_at: new Date().toISOString(),
  summary
}, null, 2) + '\n');
