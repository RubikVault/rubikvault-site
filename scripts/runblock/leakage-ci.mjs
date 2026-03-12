import path from 'node:path';

import { assertNoLeakage, assertPurgeEmbargo } from './services/leakage-guard.mjs';
import { buildSampleRunblockInput } from './sample-data.mjs';
import { getRepoRoot, parseArgs, printJsonOrTable, readJson, writeJson } from './utils.mjs';

const rootDir = getRepoRoot();
const args = parseArgs();
const sample = buildSampleRunblockInput();
const input = args.input ? await readJson(path.resolve(rootDir, args.input)) : {
  asofTimestamp: sample.bars[sample.bars.length - 1].timestamp,
  labelStartTimestamp: '2026-03-03T00:00:00.000Z',
  featureTimestamp: sample.bars[sample.bars.length - 1].timestamp,
  publishTime: '2026-03-02T00:00:00.000Z',
  trainEnd: '2026-02-20',
  valStart: '2026-03-06',
};

const leakage = assertNoLeakage(input);
const purgeEmbargo = assertPurgeEmbargo({
  trainEnd: input.trainEnd,
  valStart: input.valStart,
  purgeDays: Number(args.purge_days || 5),
  embargoDays: Number(args.embargo_days || 5),
});

const payload = {
  generated_at: new Date().toISOString(),
  status: leakage.pass && purgeEmbargo.pass ? 'PASS' : 'FAIL',
  leakage,
  purge_embargo: purgeEmbargo,
};

await writeJson(path.join(rootDir, 'public/data/runblock/v3/leakage-ci-latest.json'), payload);
printJsonOrTable(payload, Boolean(args.json));
process.exit(payload.status === 'PASS' ? 0 : 1);
