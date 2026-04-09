#!/usr/bin/env node

import fs from 'node:fs/promises';
import path from 'node:path';

const args = process.argv.slice(2);

function getArg(name, fallback = null) {
  const idx = args.indexOf(name);
  if (idx === -1) return fallback;
  return args[idx + 1] ?? fallback;
}

const leftPath = getArg('--left');
const rightPath = getArg('--right');
const reportPath = getArg('--report');

if (!leftPath || !rightPath || !reportPath) {
  process.stderr.write('Usage: node scripts/nas/compare-json.mjs --left <path> --right <path> --report <path>\n');
  process.exit(2);
}

const VOLATILE_KEYS = new Set([
  'generatedAt',
  'generated_at',
  'lastRunAt',
  'build_id',
  'build_time_utc',
  'fetched_at',
  'published_at',
  'updated_at',
  'detected_at',
  'reportDate',
  'timestamp',
  'path',
  'age_hours',
  'generated_age_hours',
  'output_stale_days',
  'stale_days',
  // GitHub Actions workflow status: requires API token, time-dependent, environment-specific
  'remote_workflows'
]);
const VOLATILE_PATH_SUFFIXES = [
  '.provider.env_present'
];

function normalize(value, currentPath = '$', ignored = []) {
  if (Array.isArray(value)) {
    return value.map((entry, index) => normalize(entry, `${currentPath}[${index}]`, ignored));
  }
  if (!value || typeof value !== 'object') {
    return value;
  }
  const out = {};
  for (const [key, entry] of Object.entries(value)) {
    const nextPath = `${currentPath}.${key}`;
    if (VOLATILE_KEYS.has(key)) {
      ignored.push({ path: nextPath, rule: 'volatile_key', key });
      continue;
    }
    if (key.endsWith('_age_hours')) {
      ignored.push({ path: nextPath, rule: 'volatile_key_pattern', key_pattern: '*_age_hours' });
      continue;
    }
    out[key] = normalize(entry, nextPath, ignored);
  }
  return out;
}

function compare(a, b, currentPath = '$', diffs = []) {
  if (VOLATILE_PATH_SUFFIXES.some((suffix) => currentPath.endsWith(suffix))) {
    return diffs;
  }
  if (typeof a !== typeof b) {
    diffs.push({ path: currentPath, reason: 'type_mismatch', left: typeof a, right: typeof b });
    return diffs;
  }
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) {
      diffs.push({ path: currentPath, reason: 'array_length', left: a.length, right: b.length });
    }
    const length = Math.max(a.length, b.length);
    for (let i = 0; i < length; i += 1) {
      compare(a[i], b[i], `${currentPath}[${i}]`, diffs);
    }
    return diffs;
  }
  if (a && typeof a === 'object' && b && typeof b === 'object') {
    const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
    for (const key of [...keys].sort()) {
      const nextPath = `${currentPath}.${key}`;
      if (!(key in a)) {
        diffs.push({ path: nextPath, reason: 'missing_left' });
        continue;
      }
      if (!(key in b)) {
        diffs.push({ path: nextPath, reason: 'missing_right' });
        continue;
      }
      compare(a[key], b[key], nextPath, diffs);
    }
    return diffs;
  }
  if (a !== b) {
    diffs.push({ path: currentPath, reason: 'value_mismatch', left: a, right: b });
  }
  return diffs;
}

async function readJson(filePath) {
  return JSON.parse(await fs.readFile(filePath, 'utf8'));
}

const [left, right] = await Promise.all([readJson(leftPath), readJson(rightPath)]);
const ignoredLeft = [];
const ignoredRight = [];
const normalizedLeft = normalize(left, '$', ignoredLeft);
const normalizedRight = normalize(right, '$', ignoredRight);
const diffs = compare(normalizedLeft, normalizedRight).slice(0, 100);

const report = {
  schema_version: 'nas.shadow.compare.v1',
  compared_at: new Date().toISOString(),
  comparison_mode: 'semantic_json',
  ignored_keys: [...VOLATILE_KEYS].sort(),
  ignored_key_patterns: ['*_age_hours', 'remote_workflows'],
  ignored_path_suffixes: VOLATILE_PATH_SUFFIXES,
  ignored_left_count: ignoredLeft.length,
  ignored_right_count: ignoredRight.length,
  ignored_left_sample: ignoredLeft.slice(0, 25),
  ignored_right_sample: ignoredRight.slice(0, 25),
  left: path.resolve(leftPath),
  right: path.resolve(rightPath),
  equal: diffs.length === 0,
  diff_count: diffs.length,
  diffs
};

await fs.mkdir(path.dirname(path.resolve(reportPath)), { recursive: true });
await fs.writeFile(path.resolve(reportPath), JSON.stringify(report, null, 2) + '\n', 'utf8');

if (!report.equal) {
  process.stderr.write(`DIFF: ${report.diff_count} differences written to ${reportPath}\n`);
  process.exit(1);
}

process.stdout.write(`OK: ${reportPath}\n`);
