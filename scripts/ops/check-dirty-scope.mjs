#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const args = new Set(process.argv.slice(2));
const outputArg = process.argv.find((arg) => arg.startsWith('--output='));
const outputPath = outputArg ? outputArg.slice('--output='.length) : process.env.RV_DIRTY_SCOPE_REPORT_PATH;
const allowMarket = args.has('--allow-market') || process.env.RV_ALLOW_MARKET_DIRTY_SCOPE === '1';
const allowGenerated = args.has('--allow-generated') || process.env.RV_ALLOW_GENERATED_DIRTY_SCOPE === '1';
const strict = args.has('--strict') || process.env.RV_DIRTY_SCOPE_STRICT === '1';

const MARKET_PATTERNS = [
  /^public\/assets\/css\/market-/,
  /^public\/assets\/js\/market-/,
  /^public\/market\.html$/,
  /^public\/data\/v3\/derived\/market\//,
];

const GENERATED_PATTERNS = [
  /^public\/data\/public-status\.json$/,
  /^public\/data\/ops\/publish-chain-latest\.json$/,
];

function git(argsList) {
  const res = spawnSync('git', argsList, { cwd: ROOT, encoding: 'utf8' });
  if (res.status !== 0) {
    throw new Error((res.stderr || res.stdout || `git ${argsList.join(' ')} failed`).trim());
  }
  return res.stdout;
}

function parsePorcelainLine(line) {
  const xy = line.slice(0, 2);
  const rawPath = line.slice(3).trim();
  const filePath = rawPath.includes(' -> ') ? rawPath.split(' -> ').pop() : rawPath;
  return {
    raw: line,
    x: xy[0],
    y: xy[1],
    path: filePath,
    staged: xy[0] !== ' ' && xy[0] !== '?',
    unstaged: xy[1] !== ' ',
    untracked: xy[0] === '?' && xy[1] === '?',
  };
}

function categoryFor(filePath) {
  if (MARKET_PATTERNS.some((pattern) => pattern.test(filePath))) return 'market';
  if (GENERATED_PATTERNS.some((pattern) => pattern.test(filePath))) return 'generated_runtime';
  return null;
}

const dirty = git(['status', '--porcelain=v1'])
  .split('\n')
  .filter(Boolean)
  .map(parsePorcelainLine)
  .map((entry) => ({ ...entry, category: categoryFor(entry.path) }));

const blocked = dirty.filter((entry) => {
  if (!entry.category) return false;
  if (entry.category === 'market' && allowMarket) return false;
  if (entry.category === 'generated_runtime' && allowGenerated) return false;
  return strict ? true : entry.staged;
});

const report = {
  schema: 'rv.dirty_scope_report.v1',
  generated_at: new Date().toISOString(),
  strict,
  ok: blocked.length === 0,
  dirty_total: dirty.length,
  blocked_total: blocked.length,
  blocked,
  dirty_scoped: dirty.filter((entry) => entry.category),
  policy: {
    default: 'Market and generated runtime files may remain dirty locally, but must not be staged in unrelated commits.',
    strict: 'With --strict, any dirty Market or generated runtime file fails unless explicitly allowed.',
    allow_flags: ['--allow-market', '--allow-generated'],
  },
};

if (outputPath) {
  const resolved = path.resolve(ROOT, outputPath);
  fs.mkdirSync(path.dirname(resolved), { recursive: true });
  fs.writeFileSync(resolved, `${JSON.stringify(report, null, 2)}\n`);
}

process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);

if (!report.ok) {
  process.stderr.write('dirty_scope_failed: staged Market/generated runtime files detected\n');
  process.exit(1);
}
