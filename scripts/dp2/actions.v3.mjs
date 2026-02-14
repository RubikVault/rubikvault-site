#!/usr/bin/env node
import { createRunContext } from "../lib/v3/run-context.mjs";
import { loadUniverseAndMapping } from "../lib/v3/data-sources.mjs";
import { writeGzipNdjsonArtifact, createManifest, writeManifest } from "../lib/v3/artifact-writer.mjs";
import { updateHealth, buildDpHealthEntry } from "../lib/health-writer.v3.mjs";

const BASE_URL = "https://eodhd.com/api";
const CONCURRENCY = 5;
const MAX_RETRIES = 3;
const TIMEOUT_MS = 20000;
const FROM_DATE = process.env.EODHD_ACTIONS_FROM || "1990-01-01";

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function toNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function parseSplitValue(raw) {
  if (raw == null) return null;
  const asNum = toNumber(raw);
  if (asNum != null) return asNum;
  const text = String(raw).trim();
  const parts = text.split("/");
  if (parts.length !== 2) return null;
  const a = toNumber(parts[0]);
  const b = toNumber(parts[1]);
  if (a == null || b == null || b === 0) return null;
  return a / b;
}

async function fetchJsonWithRetry(url) {
  let lastError = null;
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      const res = await fetch(url, { signal: controller.signal, headers: { accept: "application/json" } });
      if (!res.ok) {
        const body = await res.text();
        if (res.status === 401 || res.status === 403) {
          return { ok: false, fatal: true, status: res.status, error: body || `HTTP_${res.status}` };
        }
        lastError = `${res.status}:${body || "HTTP_ERROR"}`;
        if (res.status === 429 && attempt < MAX_RETRIES) {
          await sleep(600 * attempt);
          continue;
        }
        return { ok: false, status: res.status, error: lastError };
      }
      const payload = await res.json();
      return { ok: true, payload };
    } catch (error) {
      lastError = error?.message || String(error);
      if (attempt < MAX_RETRIES) {
        await sleep(500 * attempt);
        continue;
      }
      return { ok: false, error: lastError };
    } finally {
      clearTimeout(timer);
    }
  }
  return { ok: false, error: lastError || "UNKNOWN_ERROR" };
}

async function mapWithConcurrency(items, limit, worker) {
  const out = [];
  const inFlight = [];
  for (const item of items) {
    const p = Promise.resolve().then(() => worker(item)).finally(() => {
      const idx = inFlight.indexOf(p);
      if (idx >= 0) inFlight.splice(idx, 1);
    });
    out.push(p);
    inFlight.push(p);
    if (inFlight.length >= limit) {
      await Promise.race(inFlight);
    }
  }
  return Promise.all(out);
}

function buildSymbol(item) {
  let symbol = String(item?.provider_ids?.eodhd || `${item.ticker}.${item.exchange || "US"}`).trim().toUpperCase();
  // Normalize class-share dot notation to EODHD dash notation.
  symbol = symbol.replace(/^([A-Z0-9]+)\.([A-Z])\.([A-Z]{2,4})$/, "$1-$2.$3");
  return symbol;
}

async function fetchActionsForSymbol(item, apiKey) {
  const symbol = buildSymbol(item);
  const splitUrl = new URL(`${BASE_URL}/splits/${encodeURIComponent(symbol)}`);
  const divUrl = new URL(`${BASE_URL}/div/${encodeURIComponent(symbol)}`);
  const toDate = new Date().toISOString().slice(0, 10);
  for (const u of [splitUrl, divUrl]) {
    u.searchParams.set("api_token", apiKey);
    u.searchParams.set("fmt", "json");
    u.searchParams.set("from", FROM_DATE);
    u.searchParams.set("to", toDate);
  }

  const [splitRes, divRes] = await Promise.all([
    fetchJsonWithRetry(splitUrl.toString()),
    fetchJsonWithRetry(divUrl.toString())
  ]);

  if (!splitRes.ok && splitRes.fatal) {
    throw new Error(`EODHD_AUTH_FAILED:${splitRes.status || "unknown"}`);
  }
  if (!divRes.ok && divRes.fatal) {
    throw new Error(`EODHD_AUTH_FAILED:${divRes.status || "unknown"}`);
  }

  const splitRows = [];
  if (splitRes.ok && Array.isArray(splitRes.payload)) {
    for (const row of splitRes.payload) {
      const value = parseSplitValue(row?.split);
      const eventDate = String(row?.date || "").slice(0, 10);
      if (!eventDate || !Number.isFinite(value) || value === 1) continue;
      splitRows.push({
        canonical_id: item.canonicalId,
        ticker: item.ticker,
        exchange: item.exchange,
        type: "split",
        event_date: eventDate,
        value,
        provider: "eodhd"
      });
    }
  }

  const dividendRows = [];
  if (divRes.ok && Array.isArray(divRes.payload)) {
    for (const row of divRes.payload) {
      const value = toNumber(row?.value ?? row?.unadjustedValue);
      const eventDate = String(row?.date || "").slice(0, 10);
      if (!eventDate || !Number.isFinite(value) || value <= 0) continue;
      dividendRows.push({
        canonical_id: item.canonicalId,
        ticker: item.ticker,
        exchange: item.exchange,
        type: "dividend",
        event_date: eventDate,
        value,
        provider: "eodhd"
      });
    }
  }

  return {
    splitRows,
    dividendRows,
    errors: [
      !splitRes.ok ? `split:${splitRes.error || splitRes.status || "unknown"}` : null,
      !divRes.ok ? `div:${divRes.error || divRes.status || "unknown"}` : null
    ].filter(Boolean)
  };
}

async function main() {
  const runContext = createRunContext();
  const rootDir = runContext.rootDir;
  const { mapping } = await loadUniverseAndMapping(rootDir);
  const apiKey = String(process.env.EODHD_API_KEY || "").trim();
  if (!apiKey) {
    throw new Error("MISSING_SECRET:EODHD_API_KEY (required for DP2 actions)");
  }

  const splitRows = [];
  const dividendRows = [];
  const failures = [];

  const entries = Object.entries(mapping.mappings || {})
    .map(([canonicalId, item]) => ({ canonicalId, ...item }))
    .sort((a, b) => a.canonicalId.localeCompare(b.canonicalId));

  const results = await mapWithConcurrency(entries, CONCURRENCY, async (item) => {
    try {
      return await fetchActionsForSymbol(item, apiKey);
    } catch (error) {
      return { splitRows: [], dividendRows: [], errors: [error?.message || String(error)] };
    }
  });

  results.forEach((res, idx) => {
    splitRows.push(...res.splitRows);
    dividendRows.push(...res.dividendRows);
    if (Array.isArray(res.errors) && res.errors.length) {
      failures.push({ ticker: entries[idx]?.ticker, errors: res.errors });
    }
  });

  const dedupe = (rows) => {
    const map = new Map();
    for (const row of rows) {
      const key = `${row.canonical_id}|${row.type}|${row.event_date}|${row.value}`;
      map.set(key, row);
    }
    return Array.from(map.values());
  };

  const splitFinal = dedupe(splitRows);
  const dividendFinal = dedupe(dividendRows);

  splitFinal.sort((a, b) => a.canonical_id.localeCompare(b.canonical_id) || a.event_date.localeCompare(b.event_date));
  dividendFinal.sort((a, b) => a.canonical_id.localeCompare(b.canonical_id) || a.event_date.localeCompare(b.event_date));

  const artifacts = [];
  artifacts.push(
    await writeGzipNdjsonArtifact(rootDir, "public/data/v3/actions/splits/latest.ndjson.gz", splitFinal)
  );
  artifacts.push(
    await writeGzipNdjsonArtifact(rootDir, "public/data/v3/actions/dividends/latest.ndjson.gz", dividendFinal)
  );

  const manifest = createManifest({
    schema: "rv.manifest.v3",
    runContext,
    quality: {
      splits: splitFinal.length,
      dividends: dividendFinal.length,
      source: "eodhd-actions",
      fetched_symbols: entries.length,
      failures: failures.length
    },
    artifacts
  });
  artifacts.push(await writeManifest(rootDir, "public/data/v3/actions/manifest.json", manifest));

  await updateHealth(rootDir, runContext, {
    dp: {
      dp2_actions: buildDpHealthEntry({
        status: "ok",
        partial: false,
        stale: false,
        coverage: {
          splits: splitFinal.length,
          dividends: dividendFinal.length
        },
        manifest: "public/data/v3/actions/manifest.json"
      })
    }
  });

  if (failures.length) {
    console.warn(`DP2 warnings: ${failures.length} symbols had action fetch issues`);
  }
  console.log(`DP2 done splits=${splitFinal.length} dividends=${dividendFinal.length}`);
}

main().catch((error) => {
  console.error(`DP2_FAILED:${error.message}`);
  process.exitCode = 1;
});
