#!/usr/bin/env node

import path from 'node:path';
import {
  REPO_ROOT,
  parseArgs,
  readJson,
  nowIso,
  writeJsonAtomic,
  pathExists
} from '../lib/common.mjs';
import { loadV7Config, resolvePathMaybe } from '../lib/config.mjs';
import { EXIT } from '../lib/exit-codes.mjs';

async function run() {
  const args = parseArgs(process.argv.slice(2));
  const { cfg } = await loadV7Config(args.config ? path.resolve(args.config) : undefined);
  const runId = String(args['run-id'] || '').trim() || 'adhoc';

  const lawRegistryPath = resolvePathMaybe(cfg?.laws?.registry_path);
  const gateRegistryPath = path.join(REPO_ROOT, 'scripts/universe-v7/gates/gate-registry.json');
  const appliedPath = path.join(REPO_ROOT, 'mirrors/universe-v7/runs', runId, 'audit', 'applied_laws.json');
  const reportPath = path.join(REPO_ROOT, 'public/data/universe/v7/reports/law_coverage_report.json');

  const issues = [];

  const lawRegistry = await readJson(lawRegistryPath).catch(() => null);
  const gateRegistry = await readJson(gateRegistryPath).catch(() => null);

  const laws = Array.isArray(lawRegistry?.laws) ? lawRegistry.laws : [];
  const checks = Array.isArray(gateRegistry?.checks) ? gateRegistry.checks : [];
  const knownChecks = new Set(checks.map((row) => row.id));

  if (!laws.length) {
    issues.push({ code: 'LAW_REGISTRY_EMPTY', path: lawRegistryPath });
  }

  for (const law of laws) {
    const lawId = String(law?.law_id || '').trim();
    if (!lawId) {
      issues.push({ code: 'LAW_ID_MISSING', law });
      continue;
    }

    const refs = Array.isArray(law?.enforced_by_checks) ? law.enforced_by_checks : [];
    if (!refs.length) {
      issues.push({ code: 'LAW_UNREFERENCED', law_id: lawId });
      continue;
    }

    for (const ref of refs) {
      if (!knownChecks.has(ref)) {
        issues.push({ code: 'LAW_CHECK_UNKNOWN', law_id: lawId, check_id: ref });
      }
    }
  }

  if (await pathExists(appliedPath)) {
    const applied = await readJson(appliedPath).catch(() => null);
    const appliedIds = new Set(Array.isArray(applied?.applied_laws) ? applied.applied_laws.map((row) => row?.law_id) : []);
    for (const law of laws) {
      const lawId = String(law?.law_id || '').trim();
      if (lawId && !appliedIds.has(lawId)) {
        issues.push({ code: 'LAW_NOT_LOGGED_APPLIED', law_id: lawId, run_id: runId });
      }
    }
  }

  const report = {
    schema: 'rv_v7_law_coverage_report_v1',
    generated_at: nowIso(),
    run_id: runId,
    status: issues.length ? 'FAIL' : 'PASS',
    law_count: laws.length,
    check_count: checks.length,
    issues
  };

  await writeJsonAtomic(reportPath, report);

  if (issues.length) {
    process.stderr.write(JSON.stringify({ status: 'FAIL', code: EXIT.HARD_FAIL_LAW_COVERAGE, issues }) + '\n');
    process.exit(EXIT.HARD_FAIL_LAW_COVERAGE);
  }

  process.stdout.write(JSON.stringify({ status: 'OK', code: EXIT.SUCCESS, report: path.relative(REPO_ROOT, reportPath) }) + '\n');
}

run().catch((err) => {
  process.stderr.write(JSON.stringify({ status: 'FAIL', code: EXIT.HARD_FAIL_LAW_COVERAGE, reason: err?.message || 'law_coverage_failed' }) + '\n');
  process.exit(EXIT.HARD_FAIL_LAW_COVERAGE);
});
