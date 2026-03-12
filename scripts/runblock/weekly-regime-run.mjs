import path from 'node:path';

import { evaluateWeeklyRegime } from './layers/02-regime-detection.mjs';
import { loadRunblockConfig } from './runblock-pipeline.mjs';
import { buildSampleRunblockInput } from './sample-data.mjs';
import { getRepoRoot, parseArgs, printJsonOrTable, readJson, writeJson } from './utils.mjs';

const rootDir = getRepoRoot();
const args = parseArgs();
const config = await loadRunblockConfig(rootDir);
const input = args.input ? await readJson(path.resolve(rootDir, args.input)) : buildSampleRunblockInput();
const regime = evaluateWeeklyRegime(input.weeklyRegimeFeatures || [], config.regime_config || {});
const result = {
  generated_at: new Date().toISOString(),
  ticker: input.ticker || null,
  weekly_feature_count: (input.weeklyRegimeFeatures || []).length,
  result: regime,
};

await writeJson(path.join(rootDir, 'public/data/runblock/v3/weekly-regime-latest.json'), result);
printJsonOrTable(result, Boolean(args.json));
