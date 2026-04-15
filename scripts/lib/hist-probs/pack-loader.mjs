import path from 'node:path';
import { readGzipNdjson } from '../io/gzip-ndjson.mjs';

export async function loadHistoryPack(repoRoot, historyPackRel) {
  const absPath = path.join(repoRoot, 'mirrors/universe-v7', String(historyPackRel || '').trim());
  return readGzipNdjson(absPath);
}

export async function loadHistoryPackIndex(repoRoot, historyPackRel) {
  const rows = await loadHistoryPack(repoRoot, historyPackRel);
  const index = new Map();
  for (const row of rows) {
    const canonicalId = String(row?.canonical_id || '').trim().toUpperCase();
    if (!canonicalId) continue;
    index.set(canonicalId, row);
  }
  return index;
}

export default { loadHistoryPack, loadHistoryPackIndex };
