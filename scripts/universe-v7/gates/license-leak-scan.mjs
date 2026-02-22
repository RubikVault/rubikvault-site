#!/usr/bin/env node

import path from 'node:path';
import fs from 'node:fs/promises';
import zlib from 'node:zlib';
import { REPO_ROOT, parseArgs, nowIso, walkFiles, writeJsonAtomic, readJson } from '../lib/common.mjs';
import { loadV7Config, resolvePathMaybe } from '../lib/config.mjs';
import { EXIT } from '../lib/exit-codes.mjs';

const RAW_FIELD_REGEX = /"(open|high|low|close|volume|adjClose|adjusted_close|adj_close)"\s*:/g;

function evaluateRiskClass(relPath, whitelist) {
  const rules = Array.isArray(whitelist?.rules) ? whitelist.rules : [];
  for (const rule of rules) {
    const prefix = String(rule?.prefix || '').trim();
    if (!prefix) continue;
    if (relPath.startsWith(prefix)) return String(rule?.risk_class || 'BORDERLINE');
  }
  return String(whitelist?.default_risk_class || 'BORDERLINE');
}

function findLargeArrays(payload, maxLen, pathPrefix = '$') {
  const issues = [];
  if (Array.isArray(payload)) {
    if (payload.length > maxLen) {
      issues.push({ path: pathPrefix, length: payload.length, max_len: maxLen });
    }
    for (let i = 0; i < payload.length; i += 1) {
      issues.push(...findLargeArrays(payload[i], maxLen, `${pathPrefix}[${i}]`));
    }
    return issues;
  }
  if (payload && typeof payload === 'object') {
    for (const [key, val] of Object.entries(payload)) {
      issues.push(...findLargeArrays(val, maxLen, `${pathPrefix}.${key}`));
    }
  }
  return issues;
}

async function readTextMaybeGz(fullPath) {
  if (fullPath.endsWith('.gz')) {
    const raw = await fs.readFile(fullPath);
    return zlib.gunzipSync(raw).toString('utf8');
  }
  return fs.readFile(fullPath, 'utf8');
}

async function run() {
  const args = parseArgs(process.argv.slice(2));
  const runId = String(args['run-id'] || 'adhoc');
  const { cfg } = await loadV7Config(args.config ? path.resolve(args.config) : undefined);

  const publishDir = args['scan-dir']
    ? path.resolve(String(args['scan-dir']))
    : (resolvePathMaybe(cfg?.run?.publish_dir) || path.join(REPO_ROOT, 'public/data/universe/v7'));
  const whitelistPath = resolvePathMaybe(cfg?.license?.whitelist_path);
  const whitelist = await readJson(whitelistPath).catch(() => ({ default_risk_class: 'BORDERLINE', rules: [] }));
  const allowedRisk = new Set(Array.isArray(cfg?.license?.risk_classes_allowed_public) ? cfg.license.risk_classes_allowed_public : ['SAFE_DERIVED']);
  const rawAllowed = Boolean(cfg?.license?.public_raw_ohlc_allowed);

  const files = (await walkFiles(publishDir, { ignore: new Set(['.DS_Store']) }).catch(() => []))
    .filter((entry) => /\.(json|json\.gz)$/i.test(entry.rel));

  const violations = [];

  for (const file of files) {
    const relFromPublish = path.relative(publishDir, file.full).replace(/\\/g, '/');
    const riskClass = evaluateRiskClass(relFromPublish, whitelist);

    if (!allowedRisk.has(riskClass)) {
      violations.push({ file: relFromPublish, code: 'RISK_CLASS_NOT_ALLOWED', risk_class: riskClass });
      continue;
    }

    const text = await readTextMaybeGz(file.full);

    const isConfigFile = relFromPublish.startsWith('config/');

    if (!rawAllowed && !isConfigFile) {
      RAW_FIELD_REGEX.lastIndex = 0;
      if (RAW_FIELD_REGEX.test(text)) {
        violations.push({ file: relFromPublish, code: 'RAW_OHLC_FIELD_DETECTED' });
      }
      if (!relFromPublish.startsWith('registry/') && text.includes('history/')) {
        violations.push({ file: relFromPublish, code: 'HISTORY_PATH_LEAK' });
      }
    }

    if (relFromPublish.startsWith('read_models/')) {
      try {
        const payload = JSON.parse(text);
        const maxLen = Number(cfg?.ui?.max_rows_initial_render || 200) * 5;
        const largeArrays = findLargeArrays(payload, maxLen);
        if (largeArrays.length > 0) {
          violations.push({
            file: relFromPublish,
            code: 'READ_MODEL_ARRAY_TOO_LARGE',
            sample: largeArrays.slice(0, 3)
          });
        }
      } catch {
        violations.push({ file: relFromPublish, code: 'INVALID_JSON_READ_MODEL' });
      }
    }
  }

  const reportPath = path.join(REPO_ROOT, 'public/data/universe/v7/reports/license_leak_scan_report.json');
  await writeJsonAtomic(reportPath, {
    schema: 'rv_v7_license_leak_scan_report_v1',
    generated_at: nowIso(),
    run_id: runId,
    scanned_files: files.length,
    violations,
    status: violations.length ? 'FAIL' : 'PASS'
  });

  if (violations.length) {
    process.stderr.write(JSON.stringify({ status: 'FAIL', code: EXIT.HARD_FAIL_LEAK_SCAN, violations }) + '\n');
    process.exit(EXIT.HARD_FAIL_LEAK_SCAN);
  }

  process.stdout.write(JSON.stringify({ status: 'OK', code: EXIT.SUCCESS, scanned_files: files.length }) + '\n');
}

run().catch((err) => {
  process.stderr.write(JSON.stringify({ status: 'FAIL', code: EXIT.HARD_FAIL_LEAK_SCAN, reason: err?.message || 'license_leak_scan_failed' }) + '\n');
  process.exit(EXIT.HARD_FAIL_LEAK_SCAN);
});
