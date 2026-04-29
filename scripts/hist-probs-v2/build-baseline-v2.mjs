#!/usr/bin/env node
import { runDailyShadow } from './run-daily-shadow.mjs';

runDailyShadow()
  .then((result) => {
    console.log(`[hist-probs-v2:baseline] status=${result.manifest.status} scores=${result.coverage.scores}`);
    if (result.manifest.status !== 'ok' && process.argv.includes('--fail-on-warning')) process.exit(1);
  })
  .catch((error) => {
    console.error('[hist-probs-v2:baseline] fatal', error);
    process.exit(1);
  });
