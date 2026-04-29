#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const MAX_SUCCESS_AGE_HOURS = Number(process.env.Q1_MAX_LATEST_SUCCESS_AGE_HOURS || 96);

function exists(filePath) {
  try {
    fs.accessSync(filePath);
    return true;
  } catch {
    return false;
  }
}

function readJson(filePath, fallback = null) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return fallback;
  }
}

function fileMtimeIso(filePath) {
  try {
    return fs.statSync(filePath).mtime.toISOString();
  } catch {
    return null;
  }
}

function ageHours(iso) {
  const ts = Date.parse(String(iso || ''));
  if (!Number.isFinite(ts)) return null;
  return (Date.now() - ts) / 3600000;
}

function pidIsRunning(pid) {
  const n = Number(pid);
  if (!Number.isInteger(n) || n <= 0) return false;
  try {
    process.kill(n, 0);
    return true;
  } catch (error) {
    return error?.code === 'EPERM';
  }
}

function listQ1Locks(quantRoot) {
  const jobsRoot = path.join(quantRoot, 'jobs');
  let names = [];
  try {
    names = fs.readdirSync(jobsRoot);
  } catch {
    return [];
  }
  return names
    .filter((name) => name.startsWith('q1_daily_delta_'))
    .map((name) => {
      const lockPath = path.join(jobsRoot, name, '.lock');
      if (!exists(lockPath)) return null;
      const payload = readJson(lockPath, {});
      const pid = Number(payload?.pid || 0);
      return {
        job: name,
        path: lockPath,
        pid,
        host: payload?.host || null,
        started_at: payload?.started_at || fileMtimeIso(lockPath),
        active: pidIsRunning(pid),
      };
    })
    .filter(Boolean);
}

const quantlabRoots = [
  process.env.QUANT_ROOT,
  process.env.NAS_QUANT_ROOT,
  process.env.RV_QUANT_ROOT,
  path.join(ROOT, 'mirrors', 'quantlab'),
].filter(Boolean);
const quantlabRoot = quantlabRoots.find((candidate) => exists(candidate)) || null;

const latestSuccessPath = quantlabRoot
  ? path.join(quantlabRoot, 'ops', 'q1_daily_delta_ingest', 'latest_success.json')
  : null;
const latestDateCachePath = quantlabRoot
  ? path.join(quantlabRoot, 'ops', 'cache', 'q1_daily_delta_latest_date_index.stock_etf.json')
  : null;
const packStateCachePath = quantlabRoot
  ? path.join(quantlabRoot, 'ops', 'cache', 'q1_daily_delta_v7_pack_state.stock_etf.json')
  : null;

const latestSuccess = latestSuccessPath ? readJson(latestSuccessPath, {}) : {};
const packStateCache = packStateCachePath ? readJson(packStateCachePath, {}) : {};
const latestGeneratedAt =
  latestSuccess?.generated_at ||
  latestSuccess?.completed_at ||
  (latestSuccessPath ? fileMtimeIso(latestSuccessPath) : null);
const latestAgeHours = ageHours(latestGeneratedAt);
const latestStats = latestSuccess?.stats && typeof latestSuccess.stats === 'object'
  ? latestSuccess.stats
  : {};
const packCounts = packStateCache?.counts && typeof packStateCache.counts === 'object'
  ? packStateCache.counts
  : {};
const locks = quantlabRoot ? listQ1Locks(quantlabRoot) : [];

const checks = {
  quantlab_root_present: Boolean(quantlabRoot),
  latest_success_exists: latestSuccessPath ? exists(latestSuccessPath) : false,
  latest_success_fresh: latestAgeHours != null && latestAgeHours <= MAX_SUCCESS_AGE_HOURS,
  latest_success_failed_packs_zero: Number(latestStats.packs_failed || 0) === 0,
  latest_date_cache_exists: latestDateCachePath ? exists(latestDateCachePath) : false,
  pack_state_cache_exists: packStateCachePath ? exists(packStateCachePath) : false,
  pack_state_has_present_packs: Number(packCounts.packs_present || 0) > 0,
};

const doc = {
  schema_version: 'nas.q1.delta.cache_health.v1',
  generated_at: new Date().toISOString(),
  quantlab_root: quantlabRoot,
  max_success_age_hours: MAX_SUCCESS_AGE_HOURS,
  paths: {
    latest_success: latestSuccessPath,
    latest_date_cache: latestDateCachePath,
    pack_state_cache: packStateCachePath,
  },
  latest_success: {
    generated_at: latestGeneratedAt,
    ingest_date: latestSuccess?.ingest_date || latestSuccess?.data_date || null,
    age_hours: latestAgeHours == null ? null : Number(latestAgeHours.toFixed(2)),
    stats: latestStats,
  },
  pack_state_cache: {
    counts: packCounts,
    generated_at: packStateCache?.generated_at || null,
  },
  locks,
  checks,
};

process.stdout.write(JSON.stringify(doc, null, 2) + '\n');

const ok = Object.values(checks).every(Boolean);
process.exit(ok ? 0 : 2);
