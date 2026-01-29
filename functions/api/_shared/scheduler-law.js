import { fetchBarsWithProviderChain } from "./eod-providers.mjs";
import { evaluateQuality } from "./quality.js";
import {
  DEFAULT_TTL_SECONDS,
  createCache,
  getJsonKV,
  nowUtcIso,
  putJsonKV,
  todayUtcDate
} from "./cache-law.js";

const DEFAULT_CHUNK_SIZE = 50;
const DEFAULT_MAX_CONCURRENCY = 3;
const MAX_CHUNK_SIZE = 200;
const MAX_CONCURRENCY = 5;

const HEARTBEAT_TTL_SECONDS = 30 * 24 * 60 * 60;
const STATUS_TTL_SECONDS = 7 * 24 * 60 * 60;
const CURSOR_TTL_SECONDS = 6 * 60 * 60;
const ATTEMPT_TTL_SECONDS = 7 * 24 * 60 * 60;

function safeArray(value) {
  return Array.isArray(value) ? value : [];
}

function chunkList(items, size) {
  const chunkSize = Math.max(1, Math.min(size, MAX_CHUNK_SIZE));
  const chunks = [];
  for (let i = 0; i < items.length; i += chunkSize) {
    chunks.push(items.slice(i, i + chunkSize));
  }
  return chunks;
}

async function runWithConcurrency(items, worker, maxConcurrency) {
  const limit = Math.max(1, Math.min(maxConcurrency, MAX_CONCURRENCY));
  const results = new Array(items.length);
  let cursor = 0;
  const runners = new Array(limit).fill(0).map(async () => {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      try {
        results[index] = await worker(items[index], index);
      } catch (error) {
        results[index] = {
          ok: false,
          reason: "UNHANDLED",
          details: { message: error?.message || String(error || "error") }
        };
      }
    }
  });
  await Promise.all(runners);
  return results;
}

function normalizeTicker(value) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim().toUpperCase();
  if (!trimmed) return null;
  return trimmed;
}

let cachedSymbols = null;

export async function loadSymbols() {
  if (cachedSymbols) return cachedSymbols;
  let payload = null;
  try {
    const mod = await import("../../../config/symbols.json", { assert: { type: "json" } });
    payload = mod?.default ?? mod;
  } catch {
    payload = null;
  }
  if (!payload) {
    try {
      const { createRequire } = await import("node:module");
      const require = createRequire(import.meta.url);
      payload = require("../../../config/symbols.json");
    } catch {
      payload = null;
    }
  }
  const raw = safeArray(payload);
  cachedSymbols = raw.filter((entry) => entry && typeof entry === "object");
  return cachedSymbols;
}

function buildSymbolIndex(symbols) {
  const byAsset = new Map();
  const byTicker = new Map();
  for (const entry of symbols) {
    const assetId = typeof entry.asset_id === "string" ? entry.asset_id : null;
    const ticker = normalizeTicker(entry.ticker);
    if (assetId) byAsset.set(assetId, entry);
    if (ticker) byTicker.set(ticker, entry);
  }
  return { byAsset, byTicker };
}

function resolveAssets(inputAssets, symbols) {
  const list = safeArray(inputAssets);
  if (!list.length) return [];
  const index = buildSymbolIndex(symbols);
  const resolved = [];
  for (const item of list) {
    if (typeof item === "string") {
      const ticker = normalizeTicker(item);
      const entry = ticker ? index.byTicker.get(ticker) : null;
      if (entry) {
        resolved.push(entry);
      } else if (ticker) {
        resolved.push({ asset_id: null, ticker, mic: null });
      }
      continue;
    }
    if (item && typeof item === "object") {
      const assetId = typeof item.asset_id === "string" ? item.asset_id : null;
      const ticker = normalizeTicker(item.ticker);
      const entry = assetId ? index.byAsset.get(assetId) : ticker ? index.byTicker.get(ticker) : null;
      if (entry) {
        resolved.push(entry);
        continue;
      }
      if (assetId || ticker) {
        resolved.push({ asset_id: assetId, ticker: ticker || null, mic: item.mic || null });
      }
    }
  }
  return resolved;
}

function mapUniverseKey(universe) {
  if (!universe) return null;
  const key = String(universe).trim().toLowerCase();
  if (!key) return null;
  if (key === "nasdaq100" || key === "ndx100") return "NDX100";
  if (key === "sp500" || key === "spx") return "SP500";
  if (key === "dow" || key === "dj30") return "DJ30";
  return key.toUpperCase();
}

function filterByUniverse(symbols, universe) {
  const indexKey = mapUniverseKey(universe);
  if (!indexKey) return [];
  return symbols.filter((entry) => {
    const indexes = Array.isArray(entry?.indexes) ? entry.indexes : [];
    return indexes.includes(indexKey);
  });
}

async function recordHeartbeat(env, { lastRun, lastOk, status }) {
  if (lastRun) {
    await putJsonKV(env, "meta:scheduler:last_run", lastRun, HEARTBEAT_TTL_SECONDS);
  }
  if (lastOk) {
    await putJsonKV(env, "meta:scheduler:last_ok", lastOk, HEARTBEAT_TTL_SECONDS);
  }
  if (status) {
    await putJsonKV(env, "meta:scheduler:status", status, STATUS_TTL_SECONDS);
  }
}

async function recordCursor(env, job, runId, chunkIndex, totalChunks) {
  const payload = {
    job,
    run_id: runId,
    chunk_index: chunkIndex,
    total_chunks: totalChunks,
    updated_at: nowUtcIso()
  };
  await putJsonKV(env, `sched:cursor:${job}:${runId}`, payload, CURSOR_TTL_SECONDS);
}

async function recordAttempt(env, job, assetId, dayKey) {
  if (!assetId) return;
  const key = `sched:attempt:${job}:${assetId}:${dayKey}`;
  await putJsonKV(env, key, { attempted_at: nowUtcIso() }, ATTEMPT_TTL_SECONDS);
}

async function runEodStockAsset(env, cache, asset, options) {
  const ticker = normalizeTicker(asset?.ticker);
  if (!ticker) {
    return { ok: false, reason: "MISSING_TICKER" };
  }
  await recordAttempt(env, "eod_stock", asset?.asset_id || ticker, options.dayKey);

  const chainResult = await fetchBarsWithProviderChain(ticker, env, {
    outputsize: "300",
    startDate: options.startDate,
    allowFailover: true
  });
  if (!chainResult.ok) {
    return {
      ok: false,
      reason: chainResult.error?.code || "EOD_FETCH_FAILED",
      details: chainResult.error || null
    };
  }
  const bars = safeArray(chainResult.bars);
  const quality = evaluateQuality({ bars }, env);
  if (quality.reject) {
    return {
      ok: false,
      reason: "QUALITY_REJECT",
      details: quality.reject
    };
  }
  const latest = bars.length ? bars[bars.length - 1] : null;
  const dataDate = latest?.date || todayUtcDate();
  await cache.writeCached(ticker, { bars }, options.ttlSeconds, {
    provider: chainResult.provider || "tiingo",
    data_date: dataDate
  });
  return { ok: true, provider: chainResult.provider || "tiingo", data_date: dataDate };
}

export async function runSchedulerJob({
  env,
  job,
  assets,
  universe,
  mode = "s3",
  chunkSize = DEFAULT_CHUNK_SIZE,
  maxConcurrency = DEFAULT_MAX_CONCURRENCY
} = {}) {
  const startedAt = Date.now();
  const runId = `${job || "job"}:${Date.now().toString(36)}`;
  const todayKey = todayUtcDate().replace(/-/g, "");
  const cache = createCache(env);
  const symbols = await loadSymbols();
  const resolvedAssets = safeArray(assets).length
    ? resolveAssets(assets, symbols)
    : universe
    ? filterByUniverse(symbols, universe)
    : symbols;
  const totalAssets = resolvedAssets.length;

  const statusBase = {
    job: job || "unknown",
    run_id: runId,
    mode,
    started_at: nowUtcIso(),
    total_assets: totalAssets
  };

  if (mode === "s2") {
    const status = {
      ...statusBase,
      finished_at: nowUtcIso(),
      ok_count: 0,
      fail_count: 0,
      notes: ["S2_META_ONLY"]
    };
    await recordHeartbeat(env, { lastRun: status.finished_at, lastOk: status.finished_at, status });
    return {
      ok: true,
      status,
      summary: {
        total: totalAssets,
        ok: 0,
        failed: 0,
        mode
      },
      timing_ms: Date.now() - startedAt
    };
  }

  if (!job || job !== "eod_stock") {
    const status = {
      ...statusBase,
      finished_at: nowUtcIso(),
      ok_count: 0,
      fail_count: totalAssets,
      notes: ["JOB_UNSUPPORTED"]
    };
    await recordHeartbeat(env, { lastRun: status.finished_at, status });
    return {
      ok: false,
      status,
      summary: { total: totalAssets, ok: 0, failed: totalAssets, mode },
      error: { code: "JOB_UNSUPPORTED", message: "Unsupported scheduler job" },
      timing_ms: Date.now() - startedAt
    };
  }

  if (!totalAssets) {
    const status = {
      ...statusBase,
      finished_at: nowUtcIso(),
      ok_count: 0,
      fail_count: 0,
      notes: ["NO_ASSETS"]
    };
    await recordHeartbeat(env, { lastRun: status.finished_at, status });
    return {
      ok: false,
      status,
      summary: { total: 0, ok: 0, failed: 0, mode },
      error: { code: "NO_ASSETS", message: "No assets provided for scheduler run" },
      timing_ms: Date.now() - startedAt
    };
  }

  const startDate = new Date(Date.now() - 365 * 3 * 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);
  const ttlSeconds = Number(env?.EOD_CACHE_TTL_SECONDS) || DEFAULT_TTL_SECONDS;

  const chunks = chunkList(resolvedAssets, chunkSize || DEFAULT_CHUNK_SIZE);
  let okCount = 0;
  let failCount = 0;
  const failures = [];

  for (let i = 0; i < chunks.length; i += 1) {
    const chunk = chunks[i];
    const results = await runWithConcurrency(
      chunk,
      (asset) =>
        runEodStockAsset(env, cache, asset, {
          ttlSeconds,
          startDate,
          dayKey: todayKey
        }),
      maxConcurrency || DEFAULT_MAX_CONCURRENCY
    );
    for (let j = 0; j < results.length; j += 1) {
      const outcome = results[j];
      if (outcome?.ok) {
        okCount += 1;
      } else {
        failCount += 1;
        if (failures.length < 100) {
          failures.push({
            asset_id: chunk[j]?.asset_id || null,
            ticker: chunk[j]?.ticker || null,
            reason: outcome?.reason || "FAILED"
          });
        }
      }
    }
    await recordCursor(env, job, runId, i + 1, chunks.length);
  }

  const finishedAt = nowUtcIso();
  const partial = okCount > 0 && failCount > 0;
  const ok = okCount > 0;
  const status = {
    ...statusBase,
    finished_at: finishedAt,
    ok_count: okCount,
    fail_count: failCount,
    result: partial ? "PARTIAL" : ok ? "OK" : "ERROR"
  };
  await recordHeartbeat(env, { lastRun: finishedAt, lastOk: ok ? finishedAt : null, status });

  return {
    ok,
    partial,
    status,
    summary: {
      total: totalAssets,
      ok: okCount,
      failed: failCount,
      mode,
      failures
    },
    timing_ms: Date.now() - startedAt
  };
}

export async function readSchedulerStatus(env) {
  const status = await getJsonKV(env, "meta:scheduler:status");
  return status?.value || null;
}
