#!/usr/bin/env node

import path from 'node:path';
import fs from 'node:fs/promises';
import { REPO_ROOT, nowIso, parseArgs, writeJsonAtomic, walkFiles } from '../lib/common.mjs';
import { loadV7Config } from '../lib/config.mjs';
import { EXIT } from '../lib/exit-codes.mjs';

const FULL_FETCH_PATTERNS = [
  /\/data\/universe\/all\.json/g,
  /UNIVERSE_URL\s*=\s*['"]\/data\/universe\/all\.json['"]/g
];

function isFrontendCode(rel) {
  return rel.startsWith('public/') && /\.(html|js|mjs)$/i.test(rel);
}

async function run() {
  const args = parseArgs(process.argv.slice(2));
  const runId = String(args['run-id'] || 'adhoc');
  const { cfg } = await loadV7Config(args.config ? path.resolve(args.config) : undefined);

  const mode = String(cfg?.run?.mode || 'shadow').toLowerCase();
  const strict = mode !== 'shadow' || String(cfg?.ui?.enforce_strict_full_fetch_block || 'false') === 'true';

  const files = await walkFiles(path.join(REPO_ROOT, 'public'), { ignore: new Set(['.DS_Store']) });

  const violations = [];
  const warnings = [];
  let searchAdapterRefs = 0;

  for (const file of files) {
    if (!isFrontendCode(file.rel)) continue;
    const text = await fs.readFile(file.full, 'utf8');

    for (const rx of FULL_FETCH_PATTERNS) {
      const matches = [...text.matchAll(rx)];
      if (!matches.length) continue;
      const detail = {
        file: file.rel,
        pattern: rx.source,
        occurrences: matches.length
      };
      if (strict) violations.push(detail);
      else warnings.push({ ...detail, reason: 'SHADOW_MODE_LEGACY_ALLOWED_TEMPORARILY' });
    }

    if (/\/api\/universe/.test(text) || /attachSearchUI\(/.test(text) || /search\(query, filters, cursor, limit\)/.test(text)) {
      searchAdapterRefs += 1;
    }
  }

  if (searchAdapterRefs === 0) {
    violations.push({ code: 'SEARCH_ADAPTER_NOT_FOUND', reason: 'No API-based search reference detected in public/' });
  }

  const reportPath = path.join(REPO_ROOT, 'public/data/universe/v7/reports/ui_safety_report.json');
  const report = {
    schema: 'rv_v7_ui_safety_report_v1',
    generated_at: nowIso(),
    run_id: runId,
    mode,
    strict,
    metrics: {
      max_json_download_mb_on_route: cfg?.ui?.initial_payload_max_mb ?? null,
      max_parse_time_ms_ci: cfg?.ui?.max_parse_time_ms_ci ?? null,
      max_dom_rows_initial: cfg?.ui?.max_rows_initial_render ?? null
    },
    violations,
    warnings,
    search_adapter_refs: searchAdapterRefs,
    status: violations.length ? 'FAIL' : 'PASS'
  };

  await writeJsonAtomic(reportPath, report);

  if (violations.length) {
    process.stderr.write(JSON.stringify({ status: 'FAIL', code: EXIT.HARD_FAIL_UI_PERF, violations }) + '\n');
    process.exit(EXIT.HARD_FAIL_UI_PERF);
  }

  process.stdout.write(JSON.stringify({ status: 'OK', code: EXIT.SUCCESS, warnings: warnings.length }) + '\n');
}

run().catch((err) => {
  process.stderr.write(JSON.stringify({ status: 'FAIL', code: EXIT.HARD_FAIL_UI_PERF, reason: err?.message || 'ui_safety_failed' }) + '\n');
  process.exit(EXIT.HARD_FAIL_UI_PERF);
});
