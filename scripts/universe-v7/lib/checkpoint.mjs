import path from 'node:path';
import { nowIso, stableContentHash, writeJsonAtomic, readJson, pathExists } from './common.mjs';

export function checkpointHash(payload) {
  const material = {
    schema: payload?.schema,
    run_id: payload?.run_id,
    symbols_done: payload?.symbols_done,
    symbols_pending: payload?.symbols_pending,
    queue_hash: payload?.queue_hash
  };
  return stableContentHash(material);
}

export async function writeCheckpoint({ checkpointPath, payload }) {
  const doc = {
    ...payload,
    updated_at: nowIso(),
    checkpoint_hash: checkpointHash(payload)
  };
  await writeJsonAtomic(checkpointPath, doc);
  return doc;
}

export async function readCheckpoint(checkpointPath, { requireHash = true } = {}) {
  if (!(await pathExists(checkpointPath))) return null;
  const doc = await readJson(checkpointPath).catch(() => null);
  if (!doc) return null;
  if (requireHash) {
    const expected = checkpointHash(doc);
    if (String(doc.checkpoint_hash || '') !== expected) {
      return { invalid: true, reason: 'CHECKPOINT_HASH_MISMATCH', doc };
    }
  }
  return { invalid: false, doc };
}

export function checkpointPathForRun(rootDir, runId) {
  return path.join(rootDir, 'tmp', 'v7-build', runId, 'backfill_checkpoint.json');
}
