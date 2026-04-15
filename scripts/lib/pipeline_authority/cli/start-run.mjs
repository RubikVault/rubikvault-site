#!/usr/bin/env node

import { createRun } from '../state/runs.mjs';

const args = Object.fromEntries(process.argv.slice(2).map((arg) => {
  const [key, value] = String(arg).replace(/^--/, '').split('=');
  return [key, value ?? '1'];
}));

const result = createRun({
  resourceScope: args.scope || 'default',
  targetMarketDate: args['target-market-date'] || null,
  metadata: args.meta ? JSON.parse(args.meta) : {},
});

process.stdout.write(`${JSON.stringify({ ok: true, ...result })}\n`);
