#!/usr/bin/env node

import path from 'node:path';
import fs from 'node:fs/promises';
import { REPO_ROOT, parseArgs, nowIso, walkFiles, writeJsonAtomic } from '../lib/common.mjs';
import { loadV7Config, resolvePathMaybe } from '../lib/config.mjs';
import { EXIT } from '../lib/exit-codes.mjs';

const NETWORK_PATTERNS = [
  /\bfetch\s*\(/,
  /\baxios\s*\(/,
  /\baxios\./,
  /\bnode-fetch\b/,
  /\bundici\b/,
  /\brequests\.[a-z]+\s*\(/,
  /\burllib\b/,
  /\bhttpx\b/
];

function isCodeFile(relPath) {
  return /\.(mjs|js|ts|mts|cjs|py)$/i.test(relPath);
}

function normalizePrefix(prefix) {
  return String(prefix || '').replace(/\\/g, '/').replace(/\/$/, '');
}

async function run() {
  const args = parseArgs(process.argv.slice(2));
  const runId = String(args['run-id'] || 'adhoc');
  const { cfg } = await loadV7Config(args.config ? path.resolve(args.config) : undefined);

  const scanRoot = path.join(REPO_ROOT, 'scripts/universe-v7');
  const allowed = Array.isArray(cfg?.network_guard?.authorized_ingestor_paths)
    ? cfg.network_guard.authorized_ingestor_paths
    : [path.join(REPO_ROOT, 'scripts/universe-v7/ingestor')];

  const allowPrefixes = allowed.map((value) => normalizePrefix(path.relative(REPO_ROOT, resolvePathMaybe(value) || value)));

  const files = await walkFiles(scanRoot, {
    ignore: new Set(['node_modules', '.git', '.DS_Store'])
  });

  const violations = [];

  for (const file of files) {
    if (!isCodeFile(file.rel)) continue;
    const rel = file.rel.replace(/\\/g, '/');
    const text = await fs.readFile(file.full, 'utf8');
    const hasNet = NETWORK_PATTERNS.some((rx) => rx.test(text));
    if (!hasNet) continue;

    const allowedPath = allowPrefixes.some((prefix) => rel.startsWith(prefix));
    if (!allowedPath) {
      violations.push({
        file: rel,
        reason: 'NETWORK_CALL_OUTSIDE_AUTHORIZED_INGESTOR_PATHS'
      });
    }
  }

  const reportPath = path.join(REPO_ROOT, 'public/data/universe/v7/reports/single_ingestor_guard_report.json');
  await writeJsonAtomic(reportPath, {
    schema: 'rv_v7_single_ingestor_guard_report_v1',
    generated_at: nowIso(),
    run_id: runId,
    status: violations.length ? 'FAIL' : 'PASS',
    authorized_prefixes: allowPrefixes,
    violations
  });

  if (violations.length) {
    process.stderr.write(JSON.stringify({ status: 'FAIL', code: EXIT.HARD_FAIL_SINGLE_INGESTOR, violations }) + '\n');
    process.exit(EXIT.HARD_FAIL_SINGLE_INGESTOR);
  }

  process.stdout.write(JSON.stringify({ status: 'OK', code: EXIT.SUCCESS, violations: 0 }) + '\n');
}

run().catch((err) => {
  process.stderr.write(JSON.stringify({ status: 'FAIL', code: EXIT.HARD_FAIL_SINGLE_INGESTOR, reason: err?.message || 'single_ingestor_failed' }) + '\n');
  process.exit(EXIT.HARD_FAIL_SINGLE_INGESTOR);
});
