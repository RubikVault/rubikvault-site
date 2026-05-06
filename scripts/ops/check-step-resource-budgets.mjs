#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = path.resolve(fileURLToPath(new URL('.', import.meta.url)), '../..');
const CONFIG_PATH = path.join(REPO_ROOT, 'config/nas-step-resource-budgets.json');
const DEFAULT_RUNS_ROOT = process.env.RV_NIGHT_PIPELINE_RUNS_ROOT
  || path.join(REPO_ROOT, 'runtime/night-pipeline/runs');
const DEFAULT_OUTPUT = process.env.RV_STEP_RESOURCE_BUDGET_OUTPUT
  || path.join(REPO_ROOT, 'var/private/ops/step-resource-budget-report.json');

function argValue(name, fallback = null) {
  const idx = process.argv.indexOf(name);
  if (idx >= 0 && process.argv[idx + 1]) return process.argv[idx + 1];
  const prefix = `${name}=`;
  const found = process.argv.find((arg) => arg.startsWith(prefix));
  return found ? found.slice(prefix.length) : fallback;
}

function readJson(filePath, fallback = null) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return fallback;
  }
}

function writeJsonAtomic(filePath, payload) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const tmp = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(payload, null, 2) + '\n');
  fs.renameSync(tmp, filePath);
}

function latestRunDir(runsRoot) {
  if (!fs.existsSync(runsRoot)) return null;
  const dirs = fs.readdirSync(runsRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => path.join(runsRoot, entry.name))
    .sort((a, b) => a.localeCompare(b));
  return dirs.at(-1) || null;
}

function stepResultFiles(runDir) {
  if (!runDir || !fs.existsSync(runDir)) return [];
  return fs.readdirSync(runDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => path.join(runDir, entry.name, 'result.json'))
    .filter((filePath) => fs.existsSync(filePath));
}

function budgetFor(step, config) {
  return {
    ...(config.defaults || {}),
    ...(config.steps?.[step] || {}),
  };
}

function numberOrNull(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

const runsRoot = path.resolve(REPO_ROOT, argValue('--runs-root', DEFAULT_RUNS_ROOT));
const campaign = argValue('--campaign', null);
const runDir = path.resolve(runsRoot, campaign || path.basename(latestRunDir(runsRoot) || ''))
const outputPath = path.resolve(REPO_ROOT, argValue('--output', DEFAULT_OUTPUT));
const hardGate = process.argv.includes('--hard-gate') || process.env.RV_STEP_RESOURCE_BUDGET_HARD_GATE === '1';
const config = readJson(CONFIG_PATH, {});

const rows = [];
const warnings = [];
const failures = [];
for (const resultPath of stepResultFiles(runDir)) {
  const result = readJson(resultPath, {});
  const step = result.step_id || result.step || path.basename(path.dirname(resultPath));
  const budget = budgetFor(step, config);
  const duration = numberOrNull(result.duration_sec);
  const peakRss = numberOrNull(result.peak_rss_mb);
  const row = {
    step,
    status: result.status || null,
    duration_sec: duration,
    peak_rss_mb: peakRss,
    avg_rss_mb: numberOrNull(result.avg_rss_mb),
    budget,
    warnings: [],
    failures: [],
  };
  if (duration != null && budget.duration_sec_warn != null && duration > Number(budget.duration_sec_warn)) {
    row.warnings.push('duration_sec_warn_exceeded');
  }
  if (peakRss != null && budget.peak_rss_mb_warn != null && peakRss > Number(budget.peak_rss_mb_warn)) {
    row.warnings.push('peak_rss_mb_warn_exceeded');
  }
  if (peakRss != null && budget.peak_rss_mb_fail != null && peakRss > Number(budget.peak_rss_mb_fail)) {
    row.failures.push('peak_rss_mb_fail_exceeded');
  }
  warnings.push(...row.warnings.map((reason) => ({ step, reason })));
  failures.push(...row.failures.map((reason) => ({ step, reason })));
  rows.push(row);
}

const report = {
  schema: 'rv.step_resource_budget_report.v1',
  generated_at: new Date().toISOString(),
  run_dir: fs.existsSync(runDir) ? runDir : null,
  hard_gate: hardGate,
  checked_steps: rows.length,
  warning_count: warnings.length,
  failure_count: failures.length,
  ok: failures.length === 0,
  warnings,
  failures,
  rows,
};

writeJsonAtomic(outputPath, report);
console.log(JSON.stringify({
  ok: report.ok,
  output: path.relative(REPO_ROOT, outputPath),
  checked_steps: report.checked_steps,
  warnings: report.warning_count,
  failures: report.failure_count,
}, null, 2));

process.exit(hardGate && !report.ok ? 1 : 0);
