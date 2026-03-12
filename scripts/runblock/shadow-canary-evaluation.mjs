import path from 'node:path';

import { promotionDecision } from './layers/04-validation-governance.mjs';
import { loadRunblockConfig } from './runblock-pipeline.mjs';
import { buildShadowEvaluationInput } from './sample-data.mjs';
import { getRepoRoot, parseArgs, printJsonOrTable, readJson, writeJson } from './utils.mjs';

const rootDir = getRepoRoot();
const args = parseArgs();
const config = await loadRunblockConfig(rootDir);
const input = args.input ? await readJson(path.resolve(rootDir, args.input)) : buildShadowEvaluationInput();
const shadowMinDays = config.promotion_config?.shadow_mode_min_days || 14;

const blockers = [];
if ((input.shadow_days || 0) < shadowMinDays) blockers.push('SHADOW_MODE_MIN_NOT_MET');
if (input.regime_break_active) blockers.push('REGIME_BREAK_COOLDOWN_ACTIVE');
if (input.structural_instability_flag) blockers.push('STRUCTURAL_INSTABILITY');
if (input.challenger_leakage_pass === false) blockers.push('LEAKAGE_FAIL');

const decision = blockers.length === 0
  ? promotionDecision(input.champion || {}, input.challenger || {})
  : { promote: false, reason: blockers.join(',') };

const result = {
  generated_at: new Date().toISOString(),
  shadow_mode_min_days: shadowMinDays,
  blockers,
  decision,
  champion: input.champion || {},
  challenger: input.challenger || {},
};

await writeJson(path.join(rootDir, 'public/data/runblock/v3/shadow-canary-latest.json'), result);
printJsonOrTable(result, Boolean(args.json));
process.exit(result.decision.promote || blockers.length === 0 ? 0 : 0);
