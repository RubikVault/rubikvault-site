import fs from 'node:fs/promises';
import path from 'node:path';

import { writeJsonAtomic } from '../lib/fs-atomic.mjs';

const REPO_ROOT = process.cwd();
const LOCK_DIR = path.join(REPO_ROOT, 'mirrors', '.locks');
const OUT_PATH = path.join(REPO_ROOT, 'public', 'data', 'ops', 'safety.latest.json');

function isoNow() {
  return new Date().toISOString();
}

async function readJsonSafe(filePath) {
  try {
    const raw = await fs.readFile(filePath, 'utf-8');
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function isActiveLock(lock, nowMs) {
  if (!lock || typeof lock !== 'object') return false;
  const expiresAt = lock.expiresAt ? Date.parse(lock.expiresAt) : null;
  return Number.isFinite(expiresAt) && expiresAt > nowMs;
}

async function main() {
  const generatedAt = isoNow();
  let files = [];
  try {
    files = await fs.readdir(LOCK_DIR);
  } catch {
    files = [];
  }

  const nowMs = Date.now();
  const locks = [];
  for (const file of files) {
    if (!file.endsWith('.json')) continue;
    const full = path.join(LOCK_DIR, file);
    const lock = await readJsonSafe(full);
    if (!lock) continue;
    locks.push({ file, lock });
  }

  const active = locks.filter(({ lock }) => isActiveLock(lock, nowMs));
  const activeLocks = active.length;

  const samples = active
    .slice(0, 5)
    .map(({ file, lock }) => ({
      file,
      provider: lock?.provider || null,
      dataset: lock?.dataset || null,
      expiresAt: lock?.expiresAt || null
    }));

  const note = files.length === 0
    ? 'No lock directory or empty; assuming no active locks'
    : activeLocks === 0
      ? 'No active locks'
      : `Active locks: ${activeLocks}`;

  const payload = {
    schema_version: '1.0',
    generated_at: generatedAt,
    activeLocks,
    totalLocks: locks.length,
    samples,
    kvWritesToday: activeLocks,
    note
  };

  await writeJsonAtomic(OUT_PATH, payload);
  process.stdout.write(`OK: safety snapshot generated (activeLocks=${activeLocks})\n`);
}

main().catch((err) => {
  process.stderr.write(`FAIL: ${err.stack || err.message || String(err)}\n`);
  process.exit(1);
});
