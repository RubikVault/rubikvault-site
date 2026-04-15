#!/usr/bin/env node

import { spawnSync } from 'node:child_process';

const result = spawnSync('npx', ['knip', '--reporter', 'compact'], {
  encoding: 'utf8',
  stdio: ['ignore', 'pipe', 'pipe'],
});

if (result.stdout) process.stdout.write(result.stdout);
if (result.stderr) process.stderr.write(result.stderr);

if ((result.status ?? 1) !== 0) {
  process.stdout.write('[knip] warning-only mode: findings detected, CI continues.\n');
}

process.exit(0);
