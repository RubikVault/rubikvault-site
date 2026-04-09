#!/usr/bin/env node

import fs from 'node:fs/promises';
import path from 'node:path';

const args = process.argv.slice(2);

function getArg(name, fallback = null) {
  const idx = args.indexOf(name);
  if (idx === -1) return fallback;
  return args[idx + 1] ?? fallback;
}

function toNumber(value) {
  if (value == null || value === '' || value === 'null') return null;
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

function toBool(value) {
  return value === 'true' || value === true;
}

const stage = getArg('--stage');
const stamp = getArg('--stamp');
const runDir = getArg('--run-dir');
const status = Number(getArg('--status', '1'));
const gate = getArg('--gate', 'completed');
const beforeCheckpoint = getArg('--before-checkpoint');
const afterCheckpoint = getArg('--after-checkpoint');
const totalDurationSec = toNumber(getArg('--total-duration-sec'));
const localReferenceDurationSec = toNumber(getArg('--local-reference-duration-sec'));
const nasDurationSec = toNumber(getArg('--nas-duration-sec'));
const manifestDurationSec = toNumber(getArg('--manifest-duration-sec'));

if (!stage || !stamp || !runDir) {
  process.stderr.write('Usage: node scripts/nas/build-run-metrics.mjs --stage <stage> --stamp <stamp> --run-dir <dir> --status <code>\n');
  process.exit(2);
}

const runDirAbs = path.resolve(runDir);
const compareDir = path.join(runDirAbs, 'compare');
const validateBeforePath = path.join(runDirAbs, 'validate-before.txt');
const validateAfterPath = path.join(runDirAbs, 'validate-after.txt');
const localReferenceStderrPath = path.join(runDirAbs, 'local-reference.stderr.log');
const metricsPath = path.join(runDirAbs, 'metrics.json');

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

function parseToolVersions(text) {
  const tools = {};
  for (const key of ['node', 'npm', 'python', 'uv']) {
    const match = text.match(new RegExp(`^${key}=(.+)$`, 'm'));
    tools[key] = match ? match[1].trim() : null;
  }
  return tools;
}

function parseLoad1m(text) {
  const section = text.match(/--- loadavg\s+([^\n]+)/m);
  if (!section) return null;
  const value = Number(section[1].trim().split(/\s+/)[0]);
  return Number.isFinite(value) ? value : null;
}

function parseMemAvailableMb(text) {
  const match = text.match(/^MemAvailable:\s+(\d+)\s+kB$/m);
  if (!match) return null;
  return Math.round((Number(match[1]) / 1024) * 10) / 10;
}

function parseSwapUsedMb(text) {
  const total = text.match(/^SwapTotal:\s+(\d+)\s+kB$/m);
  const free = text.match(/^SwapFree:\s+(\d+)\s+kB$/m);
  if (!total || !free) return null;
  return Math.round(((Number(total[1]) - Number(free[1])) / 1024) * 10) / 10;
}

function parseRequiredServices(text) {
  const checks = {
    synorelayd: /synorelayd/.test(text),
    synofoto: /synofoto/.test(text),
    nginx: /nginx: master/.test(text),
    smbd: /smbd -F --no-process-group/.test(text)
  };
  return {
    ...checks,
    all_required_ok: Object.values(checks).every(Boolean)
  };
}

function parseLocalMaxRssMb(text) {
  const match = text.match(/^\s*(\d+)\s+maximum resident set size$/m);
  if (!match) return null;
  return Math.round((Number(match[1]) / 1024 / 1024) * 100) / 100;
}

function parseLocalPeakFootprintMb(text) {
  const match = text.match(/^\s*(\d+)\s+peak memory footprint$/m);
  if (!match) return null;
  return Math.round((Number(match[1]) / 1024 / 1024) * 100) / 100;
}

async function collectCompareReports(dirPath) {
  let entries = [];
  try {
    entries = (await fs.readdir(dirPath))
      .filter((name) => name.endsWith('.json'))
      .sort();
  } catch {
    entries = [];
  }

  const reports = [];
  for (const name of entries) {
    const report = await readJson(path.join(dirPath, name));
    if (!report) continue;
    reports.push({
      id: name.replace(/\.compare\.json$/, '').replace(/\.json$/, ''),
      file: name,
      equal: toBool(report.equal),
      diff_count: Number(report.diff_count || 0)
    });
  }
  return reports;
}

const [validateBefore, validateAfter, localReferenceStderr, compareReports] = await Promise.all([
  readText(validateBeforePath),
  readText(validateAfterPath),
  readText(localReferenceStderrPath),
  collectCompareReports(compareDir)
]);

const beforeMemAvailableMb = parseMemAvailableMb(validateBefore);
const afterMemAvailableMb = parseMemAvailableMb(validateAfter);
const beforeSwapUsedMb = parseSwapUsedMb(validateBefore);
const afterSwapUsedMb = parseSwapUsedMb(validateAfter);
const beforeLoad1m = parseLoad1m(validateBefore);
const afterLoad1m = parseLoad1m(validateAfter);

const metrics = {
  schema_version: 'nas.shadow.metrics.v1',
  generated_at: new Date().toISOString(),
  stage,
  stamp,
  status,
  success: status === 0,
  gate,
  durations: {
    total_sec: totalDurationSec,
    local_reference_sec: localReferenceDurationSec,
    nas_sec: nasDurationSec,
    manifest_verification_sec: manifestDurationSec,
    factor_nas_vs_local_reference: localReferenceDurationSec && nasDurationSec
      ? Math.round((nasDurationSec / localReferenceDurationSec) * 100) / 100
      : null
  },
  tool_versions: parseToolVersions(validateAfter || validateBefore),
  services: parseRequiredServices(validateAfter || validateBefore),
  local_reference_memory: {
    max_rss_mb: parseLocalMaxRssMb(localReferenceStderr),
    peak_memory_footprint_mb: parseLocalPeakFootprintMb(localReferenceStderr)
  },
  nas_memory: {
    before_available_mb: beforeMemAvailableMb,
    after_available_mb: afterMemAvailableMb,
    available_delta_mb: beforeMemAvailableMb != null && afterMemAvailableMb != null
      ? Math.round((afterMemAvailableMb - beforeMemAvailableMb) * 10) / 10
      : null
  },
  nas_swap: {
    before_used_mb: beforeSwapUsedMb,
    after_used_mb: afterSwapUsedMb,
    used_delta_mb: beforeSwapUsedMb != null && afterSwapUsedMb != null
      ? Math.round((afterSwapUsedMb - beforeSwapUsedMb) * 10) / 10
      : null
  },
  nas_loadavg: {
    before_1m: beforeLoad1m,
    after_1m: afterLoad1m,
    delta_1m: beforeLoad1m != null && afterLoad1m != null
      ? Math.round((afterLoad1m - beforeLoad1m) * 100) / 100
      : null
  },
  compares: {
    reports: compareReports,
    all_ok: compareReports.length > 0 && compareReports.every((report) => report.equal)
  },
  paths: {
    run_dir: runDirAbs,
    before_checkpoint: beforeCheckpoint ? path.resolve(beforeCheckpoint) : null,
    after_checkpoint: afterCheckpoint ? path.resolve(afterCheckpoint) : null,
    validate_before: validateBefore ? validateBeforePath : null,
    validate_after: validateAfter ? validateAfterPath : null,
    local_reference_stderr: localReferenceStderr ? localReferenceStderrPath : null
  }
};

await fs.mkdir(path.dirname(metricsPath), { recursive: true });
await fs.writeFile(metricsPath, JSON.stringify(metrics, null, 2) + '\n', 'utf8');
process.stdout.write(`${metricsPath}\n`);
