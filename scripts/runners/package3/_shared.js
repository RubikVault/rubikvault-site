import fs from "node:fs";
import path from "node:path";

const SNAPSHOT_DIR = path.join("public", "data", "snapshots");

export function readSnapshot(blockId) {
  const filePath = path.join(SNAPSHOT_DIR, `${blockId}.json`);
  if (!fs.existsSync(filePath)) return null;
  const raw = fs.readFileSync(filePath, "utf8");
  if (!raw.trim()) return null;
  return JSON.parse(raw);
}

export function isPlaceholderSnapshot(snapshot) {
  if (!snapshot || typeof snapshot !== "object") return true;
  const reason = snapshot?.meta?.reason || "";
  const dataAt = snapshot?.dataAt || "";
  if (reason === "SEED_NOT_RUN") return true;
  if (String(dataAt).startsWith("1970-01-01")) return true;
  return false;
}

export function getSnapshot(cache, blockId) {
  if (cache?.snapshots && cache.snapshots[blockId]) return cache.snapshots[blockId];
  return readSnapshot(blockId);
}

export function maxDate(...dates) {
  return dates.filter(Boolean).sort().slice(-1)[0] || null;
}

export function makeNoDataError(message) {
  const error = new Error(message || "no_data");
  error.reason = "NO_DATA";
  return error;
}

export function clamp(value, min, max) {
  if (!Number.isFinite(value)) return null;
  return Math.max(min, Math.min(max, value));
}
