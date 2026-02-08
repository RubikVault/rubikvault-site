#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { writeJsonAtomic } from './io.mjs';

function parseArgs(argv) {
  const out = { date: null };
  for (const arg of argv) {
    if (arg.startsWith('--date=')) out.date = arg.split('=')[1];
  }
  return out;
}

function runPipeline(repoRoot, date, fixtureRoot) {
  const script = path.join(repoRoot, 'scripts/forecast/v6/run_daily_v6.mjs');
  const args = [
    script,
    `--date=${date}`,
    '--mode=CI',
    '--dry-run',
    `--input-dir=${fixtureRoot}`
  ];

  const proc = spawnSync('node', args, {
    cwd: repoRoot,
    encoding: 'utf8'
  });

  if (proc.status !== 0) {
    return {
      ok: false,
      error: proc.stderr || proc.stdout || `exit ${proc.status}`,
      status: proc.status
    };
  }

  let parsed = null;
  try {
    parsed = JSON.parse(proc.stdout.trim());
  } catch {
    return {
      ok: false,
      error: `failed to parse JSON output: ${proc.stdout}`,
      status: 1
    };
  }

  return {
    ok: true,
    data: parsed
  };
}

function diffHashes(a, b) {
  const keys = new Set([...Object.keys(a || {}), ...Object.keys(b || {})]);
  const diffs = [];
  for (const key of [...keys].sort()) {
    if ((a || {})[key] !== (b || {})[key]) {
      diffs.push({ key, run1: (a || {})[key] || null, run2: (b || {})[key] || null });
    }
  }
  return diffs;
}

function ensureFixture(repoRoot, date) {
  const fixtureRoot = path.join(repoRoot, 'tests/forecast/v6/determinism/fixtures', date);
  if (fs.existsSync(fixtureRoot)) return fixtureRoot;

  const mk = spawnSync('node', [
    path.join(repoRoot, 'scripts/forecast/v6/lib/make_determinism_fixture.mjs'),
    `--date=${date}`,
    '--symbols=50'
  ], {
    cwd: repoRoot,
    encoding: 'utf8'
  });

  if (mk.status !== 0) {
    throw new Error(`fixture generation failed: ${mk.stderr || mk.stdout}`);
  }

  if (!fs.existsSync(fixtureRoot)) {
    throw new Error(`fixture root missing after generation: ${fixtureRoot}`);
  }

  return fixtureRoot;
}

function writeMarkdownReport(reportPath, payload) {
  const lines = [];
  lines.push(`# Forecast v6 Determinism Report (${payload.date})`);
  lines.push('');
  lines.push(`- fixture: \`${payload.fixture}\``);
  lines.push(`- pass: ${payload.pass ? 'YES' : 'NO'}`);
  lines.push('');

  lines.push('## Hashes Run 1');
  lines.push('');
  lines.push('```json');
  lines.push(JSON.stringify(payload.run1_hashes, null, 2));
  lines.push('```');
  lines.push('');

  lines.push('## Hashes Run 2');
  lines.push('');
  lines.push('```json');
  lines.push(JSON.stringify(payload.run2_hashes, null, 2));
  lines.push('```');
  lines.push('');

  lines.push('## Diffs');
  lines.push('');
  lines.push('```json');
  lines.push(JSON.stringify(payload.diffs, null, 2));
  lines.push('```');
  lines.push('');

  fs.mkdirSync(path.dirname(reportPath), { recursive: true });
  fs.writeFileSync(reportPath, lines.join('\n'));
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.date) {
    console.error('Usage: node scripts/forecast/v6/lib/test_determinism.mjs --date=YYYY-MM-DD');
    process.exit(1);
  }

  const repoRoot = process.cwd();
  const fixtureRoot = ensureFixture(repoRoot, args.date);

  const run1 = runPipeline(repoRoot, args.date, fixtureRoot);
  if (!run1.ok) {
    console.error(`DETERMINISM_RUN1_FAILED: ${run1.error}`);
    process.exit(1);
  }

  const run2 = runPipeline(repoRoot, args.date, fixtureRoot);
  if (!run2.ok) {
    console.error(`DETERMINISM_RUN2_FAILED: ${run2.error}`);
    process.exit(1);
  }

  const hashes1 = run1.data.hashes || {};
  const hashes2 = run2.data.hashes || {};
  const diffs = diffHashes(hashes1, hashes2);
  const pass = diffs.length === 0;

  const reportMd = path.join(repoRoot, 'mirrors/forecast/ledgers/diagnostics/determinism', `${args.date}.md`);
  writeMarkdownReport(reportMd, {
    date: args.date,
    fixture: path.relative(repoRoot, fixtureRoot),
    pass,
    run1_hashes: hashes1,
    run2_hashes: hashes2,
    diffs
  });

  writeJsonAtomic(path.join(repoRoot, 'mirrors/forecast/ledgers/diagnostics/determinism', `${args.date}.json`), {
    schema: 'forecast_determinism_result_v6',
    asof_date: args.date,
    fixture_root: path.relative(repoRoot, fixtureRoot),
    pass,
    diffs,
    run1_hashes: hashes1,
    run2_hashes: hashes2
  });

  if (!pass) {
    console.error(`DETERMINISM_MISMATCH: ${diffs.length} hash differences found`);
    process.exit(1);
  }

  console.log(JSON.stringify({
    ok: true,
    pass: true,
    date: args.date,
    fixture_root: path.relative(repoRoot, fixtureRoot),
    report: path.relative(repoRoot, reportMd)
  }, null, 2));
}

main();
