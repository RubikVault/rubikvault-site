#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { getPhaseLogPath } from './status_artifacts.mjs';

const args = process.argv.slice(2);
const dateArg = args.find((arg) => arg.startsWith('--date='));
const date = dateArg ? dateArg.split('=')[1] : null;
const repoRoot = process.cwd();
const logPath = getPhaseLogPath(repoRoot, 'generate', date);
fs.mkdirSync(path.dirname(logPath), { recursive: true });
const fd = fs.openSync(logPath, 'a');
const child = spawnSync(process.execPath, [
  path.join(repoRoot, 'scripts/forecast/run_daily.mjs'),
  '--phase=generate',
  ...(date ? [`--date=${date}`] : []),
], {
  cwd: repoRoot,
  env: {
    ...process.env,
    FORECAST_PHASE_LOG_PATH: logPath,
  },
  stdio: ['ignore', fd, fd],
});
fs.closeSync(fd);

if (child.error) {
  console.error(child.error?.stack || child.error?.message || String(child.error));
  process.exit(1);
}
process.exit(child.status ?? 1);
