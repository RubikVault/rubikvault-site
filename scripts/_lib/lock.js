import fs from "node:fs";
import path from "node:path";
import { atomicWriteJson } from "../utils/mirror-io.mjs";

function nowIso() {
  return new Date().toISOString();
}

function sanitize(value) {
  return String(value || "unknown").replace(/[^a-zA-Z0-9_.-]/g, "-");
}

export function acquireLock({ providerId, datasetId, ttlSeconds = 600, lockDir = path.join("mirrors", ".locks") } = {}) {
  const provider = sanitize(providerId || "internal");
  const dataset = sanitize(datasetId || "unknown");
  const dayBucket = new Date().toISOString().slice(0, 10);
  const filename = `${provider}__${dataset}__${dayBucket}.json`;
  const lockPath = path.join(lockDir, filename);
  const now = Date.now();

  if (fs.existsSync(lockPath)) {
    try {
      const raw = fs.readFileSync(lockPath, "utf8");
      const existing = JSON.parse(raw);
      const expiresAt = existing?.expiresAt ? Date.parse(existing.expiresAt) : 0;
      if (Number.isFinite(expiresAt) && expiresAt > now) {
        return { ok: false, reason: "LOCK_HELD", path: lockPath, details: existing };
      }
    } catch {
      // stale or invalid lock; proceed to overwrite
    }
  }

  const expiresAt = new Date(now + ttlSeconds * 1000).toISOString();
  const payload = {
    provider,
    dataset,
    lockedAt: nowIso(),
    expiresAt,
    ttlSeconds
  };
  atomicWriteJson(lockPath, payload);
  return { ok: true, path: lockPath, details: payload };
}

export function releaseLock(lockPath) {
  if (!lockPath) return;
  try {
    if (fs.existsSync(lockPath)) fs.unlinkSync(lockPath);
  } catch {
    // ignore
  }
}
