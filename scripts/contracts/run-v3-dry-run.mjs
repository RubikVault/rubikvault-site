#!/usr/bin/env node
import { execSync } from 'node:child_process';

const steps = [
  'node scripts/validators/validate-policies.v3.mjs',
  'node scripts/validators/build-v3-forensics.mjs',
  'node scripts/validators/check-v3-collisions.mjs',
  'node scripts/dp0/universe-sync.v3.mjs',
  'node scripts/dp1/eod-snapshot.v3.mjs --exchange US',
  'node scripts/dp1_5_fx/fx-rates.v3.mjs',
  'node scripts/dp2/actions.v3.mjs',
  'node scripts/dp3/adjusted-series.v3.mjs',
  'node scripts/dp4/pulse.v3.mjs',
  'node scripts/dp5/news-signals.v3.mjs',
  'node scripts/dp6/indicators.v3.mjs',
  'node scripts/dp7/sector-mapping.v3.mjs',
  'node scripts/contracts/validate-v3-artifacts.mjs'
];

for (const step of steps) {
  console.log(`\\n==> ${step}`);
  execSync(step, { stdio: 'inherit' });
}

console.log('V3_DRY_RUN_OK');
