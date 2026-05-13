#!/usr/bin/env node

import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { createGzip } from 'node:zlib';
import { pipeline } from 'node:stream/promises';

const ROOT = path.resolve(new URL('.', import.meta.url).pathname, '../..');
const HIST_DIR = path.join(ROOT, 'public/data/hist-probs');
const LEGACY_LEDGER = path.join(HIST_DIR, 'error-ledger.ndjson');
const CURRENT_LEDGER = path.join(HIST_DIR, 'error-ledger-current.ndjson');
const ARCHIVE_DIR = path.join(HIST_DIR, 'archive');
const MAX_BYTES = Number(process.env.RV_HIST_PROBS_ERROR_LEDGER_MAX_BYTES || 100 * 1024 * 1024);
const RETENTION_DAYS = Number(process.env.RV_HIST_PROBS_ERROR_LEDGER_ARCHIVE_DAYS || 7);

function stamp() {
  return new Date().toISOString().replace(/[:.]/g, '-');
}

async function statMaybe(filePath) {
  try {
    return await fsp.stat(filePath);
  } catch {
    return null;
  }
}

async function archiveIfLarge() {
  await fsp.mkdir(HIST_DIR, { recursive: true });
  const legacyStat = await statMaybe(LEGACY_LEDGER);
  const currentStat = await statMaybe(CURRENT_LEDGER);
  if (!currentStat) {
    await fsp.writeFile(CURRENT_LEDGER, '', 'utf8');
  }
  if (!legacyStat || legacyStat.size <= MAX_BYTES) {
    return { archived: false, legacy_size: legacyStat?.size || 0, current_size: currentStat?.size || 0 };
  }

  await fsp.mkdir(ARCHIVE_DIR, { recursive: true });
  const archivePath = path.join(ARCHIVE_DIR, `error-ledger-${stamp()}.ndjson.gz`);
  await pipeline(
    fs.createReadStream(LEGACY_LEDGER),
    createGzip({ level: 6 }),
    fs.createWriteStream(archivePath, { flags: 'wx' })
  );
  await fsp.writeFile(LEGACY_LEDGER, '', 'utf8');
  const archiveStat = await fsp.stat(archivePath);
  return {
    archived: true,
    legacy_size: legacyStat.size,
    archive_path: path.relative(ROOT, archivePath),
    archive_size: archiveStat.size,
  };
}

async function cleanupArchives() {
  const cutoff = Date.now() - RETENTION_DAYS * 86_400_000;
  let removed = 0;
  let removedBytes = 0;
  let entries = [];
  try {
    entries = await fsp.readdir(ARCHIVE_DIR, { withFileTypes: true });
  } catch {
    return { removed, removed_bytes: removedBytes };
  }
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith('.ndjson.gz')) continue;
    const filePath = path.join(ARCHIVE_DIR, entry.name);
    const st = await statMaybe(filePath);
    if (!st || st.mtimeMs >= cutoff) continue;
    await fsp.unlink(filePath);
    removed += 1;
    removedBytes += st.size;
  }
  return { removed, removed_bytes: removedBytes };
}

const rotation = await archiveIfLarge();
const cleanup = await cleanupArchives();
const payload = {
  ok: true,
  generated_at: new Date().toISOString(),
  max_bytes: MAX_BYTES,
  retention_days: RETENTION_DAYS,
  rotation,
  cleanup,
  current_path: path.relative(ROOT, CURRENT_LEDGER),
  legacy_path: path.relative(ROOT, LEGACY_LEDGER),
};

await fsp.writeFile(
  path.join(HIST_DIR, 'error-ledger-rotation-latest.json'),
  `${JSON.stringify(payload, null, 2)}\n`,
  'utf8'
);
process.stdout.write(`hist_probs_error_ledger_rotate_ok archived=${rotation.archived} legacy_size=${rotation.legacy_size || 0}\n`);
