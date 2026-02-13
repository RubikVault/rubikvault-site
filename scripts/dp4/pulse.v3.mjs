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

async function main() {
  const runContext = createRunContext();
  const rootDir = runContext.rootDir;

  const eodPath = path.join(rootDir, "public/data/v3/eod/US/latest.ndjson.gz");
  const fxPath = path.join(rootDir, "public/data/v3/fx/rates/latest.json");

  const eodRows = parseNdjsonGz(await fs.readFile(eodPath));
  const fxDoc = JSON.parse(await fs.readFile(fxPath, "utf8"));
  const rates = fxDoc.rates || { USD: 1 };

  const movers = eodRows
    .map((row) => {
      const open = Number(row.open || 0);
      const close = Number(row.close || 0);
      const currency = row.currency || "USD";
      const fx = Number(rates[currency] || 1);
      const changePct = open > 0 ? ((close - open) / open) * 100 : 0;
      return {
        canonical_id: row.canonical_id,
        ticker: row.ticker,
        exchange: row.exchange,
        currency,
        fx_rate: fx,
        open,
        close,
        normalized_close_usd: close / fx,
        change_pct: Number(changePct.toFixed(6)),
        volume: Number(row.volume || 0)
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
      commit: runContext.commit
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
      commit: runContext.commit
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
