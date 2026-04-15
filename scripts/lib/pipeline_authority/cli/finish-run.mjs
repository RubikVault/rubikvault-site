#!/usr/bin/env node

import { finishRun } from '../state/runs.mjs';

const args = Object.fromEntries(process.argv.slice(2).map((arg) => {
  const [key, value] = String(arg).replace(/^--/, '').split('=');
  return [key, value ?? '1'];
}));

if (!args.run) {
  process.stderr.write('missing --run=<run_id>\n');
  process.exit(2);
}

const result = finishRun(args.run, {
  status: args.status || 'COMPLETED',
  metadata: args.meta ? JSON.parse(args.meta) : {},
});

process.stdout.write(`${JSON.stringify({ ok: true, ...result })}\n`);
