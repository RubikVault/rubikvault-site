import path from "node:path";
import { readJson, writeJsonAtomic } from "./v3/stable-io.mjs";

const HEALTH_REL_PATH = "public/data/v3/system/health.json";

function mergeDeep(base, patch) {
  if (!patch || typeof patch !== "object" || Array.isArray(patch)) {
    return patch;
  }
  const out = { ...(base || {}) };
  for (const [key, value] of Object.entries(patch)) {
    if (value && typeof value === "object" && !Array.isArray(value)) {
      out[key] = mergeDeep(out[key], value);
    } else {
      out[key] = value;
    }
  }
  return out;
}

export async function readHealth(rootDir) {
  const absPath = path.join(rootDir, HEALTH_REL_PATH);
  return readJson(absPath, {
    meta: {
      schema: "rv.health.v3"
    },
    system: {
      status: "unknown",
      budget: {},
      retention: {},
      circuits: {}
    },
    dp: {}
  });
}

export async function updateHealth(rootDir, runContext, patch) {
  const absPath = path.join(rootDir, HEALTH_REL_PATH);
  const current = await readHealth(rootDir);
  const merged = mergeDeep(current, patch);
  merged.meta = {
    ...(merged.meta || {}),
    schema: "rv.health.v3",
    generated_at: runContext.generatedAt,
    run_id: runContext.runId,
    commit: runContext.commit,
    policy_commit: runContext.policyCommit
  };
  await writeJsonAtomic(absPath, merged);
  return merged;
}

export function buildDpHealthEntry({ status, coverage = null, stale = false, partial = false, manifest = null, bytes = null, tradingDate = null, reason = null }) {
  return {
    status,
    stale,
    partial,
    coverage,
    manifest,
    bytes,
    trading_date: tradingDate,
    reason,
    last_run: new Date().toISOString()
  };
}
