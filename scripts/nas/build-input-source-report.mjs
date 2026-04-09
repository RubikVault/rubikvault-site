#!/usr/bin/env node

import fs from 'node:fs/promises';
import path from 'node:path';

const ROOT = path.resolve(new URL('.', import.meta.url).pathname, '../..');
const INPUT_DIR = path.join(ROOT, 'scripts/nas/inputs');
const MIRROR_ROOT = path.join(ROOT, 'tmp/nas-dataset-mirrors');
const OUT_JSON = path.join(ROOT, 'tmp/nas-benchmarks/nas-input-sources-latest.json');
const OUT_MD = path.join(ROOT, 'tmp/nas-benchmarks/nas-input-sources-latest.md');

async function readText(filePath) {
  try {
    return await fs.readFile(filePath, 'utf8');
  } catch {
    return '';
  }
}

async function readJson(filePath) {
  try {
    return JSON.parse(await fs.readFile(filePath, 'utf8'));
  } catch {
    return null;
  }
}

async function listInputFiles() {
  try {
    return (await fs.readdir(INPUT_DIR))
      .filter((name) => name.endsWith('.paths'))
      .sort();
  } catch {
    return [];
  }
}

async function latestMirrorReport() {
  try {
    const dirs = (await fs.readdir(MIRROR_ROOT, { withFileTypes: true }))
      .filter((entry) => entry.isDirectory() && entry.name !== 'latest')
      .map((entry) => entry.name)
      .sort()
      .reverse();
    for (const dir of dirs) {
      const report = await readJson(path.join(MIRROR_ROOT, dir, 'mirror-report.json'));
      if (report) return report;
    }
    return null;
  } catch {
    return null;
  }
}

const inputFiles = await listInputFiles();
const stages = [];
let hasAbsolutePath = false;
let hasExternalVolumePath = false;

for (const name of inputFiles) {
  const text = await readText(path.join(INPUT_DIR, name));
  const lines = text.split('\n')
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#'));
  const absolutePaths = lines.filter((line) => line.startsWith('/'));
  const externalVolumePaths = lines.filter((line) => line.includes('/Volumes/'));
  if (absolutePaths.length) hasAbsolutePath = true;
  if (externalVolumePaths.length) hasExternalVolumePath = true;
  stages.push({
    input_manifest: name,
    path_count: lines.length,
    absolute_paths: absolutePaths,
    external_volume_paths: externalVolumePaths,
    repo_relative_only: absolutePaths.length === 0 && externalVolumePaths.length === 0
  });
}

const latestMirror = await latestMirrorReport();
const report = {
  schema_version: 'nas.input.sources.report.v1',
  generated_at: new Date().toISOString(),
  benchmark_shadow_inputs_repo_relative_only: !hasAbsolutePath && !hasExternalVolumePath,
  benchmark_shadow_inputs_external_volume_free: !hasExternalVolumePath,
  external_drives_policy: {
    config_and_samsung_bootstrap_only: true,
    permanent_mount_required: false,
    benchmark_runs_must_use_nas_snapshots_only: true
  },
  latest_external_inventory: latestMirror,
  stages
};

const lines = [
  '# NAS Input Sources',
  '',
  `Generated at: ${report.generated_at}`,
  '',
  `Repo-relative only: ${report.benchmark_shadow_inputs_repo_relative_only ? 'yes' : 'no'}`,
  `External-volume free: ${report.benchmark_shadow_inputs_external_volume_free ? 'yes' : 'no'}`,
  'Policy: CONFIG and SAMSUNG are bootstrap-only sources; overnight benchmarks must use repo data plus NAS snapshots only.',
  '',
  '| Input Manifest | Paths | Repo Relative Only | External Volume Paths |',
  '|---|---:|---|---:|'
];

for (const stage of stages) {
  lines.push(`| ${stage.input_manifest} | ${stage.path_count} | ${stage.repo_relative_only ? 'yes' : 'no'} | ${stage.external_volume_paths.length} |`);
}

await fs.mkdir(path.dirname(OUT_JSON), { recursive: true });
await fs.writeFile(OUT_JSON, JSON.stringify(report, null, 2) + '\n', 'utf8');
await fs.writeFile(OUT_MD, lines.join('\n') + '\n', 'utf8');
process.stdout.write(`${OUT_JSON}\n${OUT_MD}\n`);
