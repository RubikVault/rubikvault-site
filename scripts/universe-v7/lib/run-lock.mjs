import path from 'node:path';
import { nowIso, pathExists, readJson, writeJsonAtomic } from './common.mjs';
import { EXIT } from './exit-codes.mjs';

function isPidAlive(pid) {
  const n = Number(pid);
  if (!Number.isFinite(n) || n <= 0) return false;
  try {
    process.kill(n, 0);
    return true;
  } catch {
    return false;
  }
}

export async function acquireRunLock(lockPath, runId, ttlSeconds = 21600) {
  const lock = {
    run_id: runId,
    pid: process.pid,
    acquired_at: nowIso(),
    expires_at: new Date(Date.now() + ttlSeconds * 1000).toISOString()
  };

  if (await pathExists(lockPath)) {
    const existing = await readJson(lockPath).catch(() => null);
    const expiresAtMs = Date.parse(existing?.expires_at || '');
    const pidAlive = isPidAlive(existing?.pid);
    if (existing && Number.isFinite(expiresAtMs) && expiresAtMs > Date.now() && pidAlive) {
      return {
        ok: false,
        code: EXIT.HARD_FAIL_PARTIAL_PUBLISH,
        reason: 'RUN_LOCK_HELD',
        details: existing
      };
    }
  }

  await writeJsonAtomic(lockPath, lock);
  return { ok: true, lock };
}

export async function releaseRunLock(lockPath, runId, { force = false } = {}) {
  const fs = await import('node:fs/promises');
  try {
    const existing = await readJson(lockPath);
    if (!force && existing?.run_id && existing.run_id !== runId) return;
    await fs.unlink(lockPath);
  } catch {
    // ignore
  }
}

export function publishMarkers(tmpDir, publishDir, runId) {
  return {
    intent: path.join(tmpDir, 'publish_intent.json'),
    complete: path.join(publishDir, 'publish_complete.json'),
    runId
  };
}
