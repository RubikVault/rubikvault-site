#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import process from 'node:process';

const args = process.argv.slice(2);
const reportOnly = args.includes('--report-only');
const passthrough = args.filter((a) => a !== '--report-only');

const repoRoot = process.cwd();
const dailyStack = path.join(repoRoot, 'scripts/universe-v7/run-daily-stack.mjs');

const cmd = [
  'node',
  dailyStack,
  '--buckets',
  'rest',
  '--max-runs-per-bucket',
  '1',
  '--backfill-max',
  '0',
  '--allow-next-bucket-on-incomplete',
  ...passthrough,
];

if (reportOnly) {
  console.log('[AltAssets-PointerBuild] report-only mode: no pointer/build run executed');
  console.log('[AltAssets-PointerBuild] intended command:', cmd.join(' '));
  process.exit(0);
}

const r = spawnSync(cmd[0], cmd.slice(1), { stdio: 'inherit', cwd: repoRoot, env: process.env });
process.exit(Number(r.status ?? 1));
