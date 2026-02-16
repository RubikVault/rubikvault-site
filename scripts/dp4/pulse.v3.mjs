#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";
import zlib from "node:zlib";
import { createRunContext } from "../lib/v3/run-context.mjs";
import { writeJsonArtifact, createManifest, writeManifest } from "../lib/v3/artifact-writer.mjs";
import { updateHealth, buildDpHealthEntry } from "../lib/health-writer.v3.mjs";

function parseNdjsonGz(buffer) {
  const text = zlib.gunzipSync(buffer).toString("utf8");
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

function cmpMovers(a, b) {
  const absA = Math.abs(a.change_pct);
  const absB = Math.abs(b.change_pct);
  if (absA !== absB) return absB - absA;
  return a.canonical_id.localeCompare(b.canonical_id);
}

function normalizeTicker(raw) {
  return String(raw || "").trim().toUpperCase();
}

async function main() {
  const runContext = createRunContext();
  const rootDir = runContext.rootDir;

  const eodPath = path.join(rootDir, "public/data/v3/eod/US/latest.ndjson.gz");
  const fxPath = path.join(rootDir, "public/data/v3/fx/rates/latest.json");
  const universePath = path.join(rootDir, "public/data/universe/all.json");
  const sectorPath = path.join(rootDir, "public/data/v3/universe/sector-mapping/latest.json");

  const [eodBuf, fxRaw, universeRaw, sectorRaw] = await Promise.all([
    fs.readFile(eodPath),
    fs.readFile(fxPath, "utf8"),
    fs.readFile(universePath, "utf8").catch(() => "[]"),
    fs.readFile(sectorPath, "utf8").catch(() => "{}")
  ]);
  const eodRows = parseNdjsonGz(eodBuf);
  const fxDoc = JSON.parse(fxRaw);
  const universeRows = JSON.parse(universeRaw);
  const sectorDoc = JSON.parse(sectorRaw);
  const rates = fxDoc.rates || { USD: 1 };

  const universeByTicker = new Map();
  const universeSet = new Set();
  for (const row of Array.isArray(universeRows) ? universeRows : []) {
    const ticker = normalizeTicker(typeof row === "string" ? row : row?.ticker || row?.symbol);
    if (!ticker) continue;
    universeSet.add(ticker);
    if (!universeByTicker.has(ticker)) {
      universeByTicker.set(ticker, String(typeof row === "string" ? "" : row?.name || "").trim() || null);
    }
  }
  const sectorByTicker = new Map(
    (Array.isArray(sectorDoc?.sectors) ? sectorDoc.sectors : [])
      .map((row) => [normalizeTicker(row?.ticker), String(row?.sector || "").trim() || null])
      .filter(([ticker]) => ticker)
  );

  const movers = eodRows
    .map((row) => {
      const open = Number(row.open || 0);
      const close = Number(row.close || 0);
      const currency = row.currency || "USD";
      const fx = Number(rates[currency] || 1);
      const changePct = open > 0 ? ((close - open) / open) * 100 : 0;
      const ticker = normalizeTicker(row.ticker);
      const asOf = String(row.trading_date || row.date || runContext.generatedAt.slice(0, 10)).slice(0, 10);
      return {
        canonical_id: row.canonical_id,
        ticker,
        exchange: row.exchange,
        currency,
        fx_rate: fx,
        open,
        close,
        normalized_close_usd: close / fx,
        change_pct: Number(changePct.toFixed(6)),
        volume: Number(row.volume || 0),
        name: universeByTicker.get(ticker) || null,
        sector: sectorByTicker.get(ticker) || null,
        in_universe: universeSet.has(ticker),
        as_of: asOf,
        lineage: {
          price_source: "public/data/v3/eod/US/latest.ndjson.gz",
          universe_source: "public/data/universe/all.json",
          sector_source: "public/data/v3/universe/sector-mapping/latest.json",
          fx_source: "public/data/v3/fx/rates/latest.json"
        }
      };
    })
    .sort(cmpMovers);

  const topMovers = movers.slice(0, 25);
  const upCount = movers.filter((row) => row.change_pct > 0).length;
  const downCount = movers.filter((row) => row.change_pct < 0).length;
  const unchangedCount = movers.length - upCount - downCount;
  const avgChange = movers.length > 0
    ? movers.reduce((sum, row) => sum + row.change_pct, 0) / movers.length
    : 0;

  const marketHealth = {
    meta: {
      schema: "rv.pulse.v3",
      generated_at: runContext.generatedAt,
      run_id: runContext.runId,
      commit: runContext.commit,
      freshness: runContext.generatedAt,
      source_chain: [
        "/data/v3/eod/US/latest.ndjson.gz",
        "/data/v3/fx/rates/latest.json",
        "/data/universe/all.json",
        "/data/v3/universe/sector-mapping/latest.json"
      ]
    },
    as_of: runContext.generatedAt.slice(0, 10),
    coverage: {
      symbols: movers.length
    },
    breadth: {
      up: upCount,
      down: downCount,
      unchanged: unchangedCount
    },
    average_change_pct: Number(avgChange.toFixed(6)),
    volatility_state: Math.abs(avgChange) > 1.2 ? "high" : "normal"
  };

  const moversDoc = {
    meta: {
      schema: "rv.pulse.v3",
      generated_at: runContext.generatedAt,
      run_id: runContext.runId,
      commit: runContext.commit,
      freshness: runContext.generatedAt,
      source_chain: [
        "/data/v3/eod/US/latest.ndjson.gz",
        "/data/v3/fx/rates/latest.json",
        "/data/universe/all.json",
        "/data/v3/universe/sector-mapping/latest.json"
      ]
    },
    as_of: runContext.generatedAt.slice(0, 10),
    coverage: {
      symbols: movers.length
    },
    top_movers: topMovers
  };

  const artifacts = [];
  artifacts.push(await writeJsonArtifact(rootDir, "public/data/v3/pulse/top-movers/latest.json", moversDoc));
  artifacts.push(await writeJsonArtifact(rootDir, "public/data/v3/pulse/market-health/latest.json", marketHealth));

  const manifest = createManifest({
    schema: "rv.manifest.v3",
    runContext,
    quality: {
      symbols: movers.length,
      fx_applied: Object.keys(rates)
    },
    artifacts
  });
  artifacts.push(await writeManifest(rootDir, "public/data/v3/pulse/manifest.json", manifest));

  await updateHealth(rootDir, runContext, {
    dp: {
      dp4_pulse: buildDpHealthEntry({
        status: "ok",
        coverage: {
          symbols: movers.length
        },
        stale: false,
        partial: false,
        manifest: "public/data/v3/pulse/manifest.json"
      })
    }
  });

  console.log(`DP4 done symbols=${movers.length}`);
}

main().catch((error) => {
  console.error(`DP4_FAILED:${error.message}`);
  process.exitCode = 1;
});
