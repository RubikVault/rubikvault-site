#!/usr/bin/env node

import { buildOutcomeBootstrap } from './build-outcome-store-bootstrap.mjs';

const report = buildOutcomeBootstrap();
console.log(JSON.stringify({
  schema: 'rv.decision_core_module_scorecard.v1',
  status: report.status,
  generated_at: report.generated_at,
  sample_n: report.sample_n,
  alpha_proof: false,
  note: 'Bootstrap scorecard only; matured outcome metrics are P1 follow-up.',
}, null, 2));
