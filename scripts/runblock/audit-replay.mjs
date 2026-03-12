import path from 'node:path';

import { findLatestFile, getRepoRoot, parseArgs, printJsonOrTable, readJson, writeJson } from './utils.mjs';

const rootDir = getRepoRoot();
const args = parseArgs();
const logPath = args.log
  ? path.resolve(rootDir, args.log)
  : await findLatestFile(path.join(rootDir, 'public/data/v3/audit/decisions'), (filePath) => filePath.endsWith('.json'));

if (!logPath) {
  const payload = {
    generated_at: new Date().toISOString(),
    status: 'FAIL',
    reason: 'NO_AUDIT_LOG_FOUND',
  };
  await writeJson(path.join(rootDir, 'public/data/runblock/v3/audit-replay-latest.json'), payload);
  printJsonOrTable(payload, Boolean(args.json));
  process.exit(1);
}

const logEntry = await readJson(logPath);
const snapshotPath = await findLatestFile(
  path.join(rootDir, 'public/data/v3/snapshots'),
  (filePath) => filePath.endsWith(`${logEntry.snapshot_id}.json`)
);
const snapshot = snapshotPath ? await readJson(snapshotPath) : null;

const payload = {
  generated_at: new Date().toISOString(),
  status: snapshot ? 'PASS' : 'WARN',
  log_path: logPath,
  snapshot_path: snapshotPath,
  replay: {
    ticker: logEntry.ticker,
    feature_name: logEntry.feature_name,
    snapshot_id: logEntry.snapshot_id,
    feature_hash: logEntry.feature_hash,
    regime_tag: logEntry.regime_tag,
    global_system_state: logEntry.global_system_state,
    dependency_trace: logEntry.dependency_trace,
    prediction_payload: logEntry.prediction_payload,
    snapshot_features: snapshot?.features || null,
  },
};

await writeJson(path.join(rootDir, 'public/data/runblock/v3/audit-replay-latest.json'), payload);
printJsonOrTable(payload, Boolean(args.json));
process.exit(payload.status === 'PASS' ? 0 : 0);
