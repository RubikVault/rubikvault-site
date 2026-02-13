#!/usr/bin/env node
import { createRunContext } from "../lib/v3/run-context.mjs";
import { loadUniverseAndMapping, readLocalBars } from "../lib/v3/data-sources.mjs";
import { writeJsonArtifact, createManifest, writeManifest } from "../lib/v3/artifact-writer.mjs";
import { updateHealth, buildDpHealthEntry } from "../lib/health-writer.v3.mjs";

function sma(values, period) {
  if (values.length < period) return null;
  const subset = values.slice(-period);
  return subset.reduce((sum, v) => sum + v, 0) / period;
}

function rsi(values, period = 14) {
  if (values.length <= period) return null;
  let gains = 0;
  let losses = 0;
  for (let i = values.length - period; i < values.length; i += 1) {
    const prev = values[i - 1];
    const curr = values[i];
    const delta = curr - prev;
    if (delta >= 0) gains += delta;
    else losses += Math.abs(delta);
  }
  if (losses === 0) return 100;
  const rs = gains / losses;
  return 100 - 100 / (1 + rs);
}

function safeId(canonicalId) {
  return canonicalId.replace(/[:/]/g, "__");
}

async function main() {
  const runContext = createRunContext();
  const rootDir = runContext.rootDir;
  const { mapping } = await loadUniverseAndMapping(rootDir);

  const entries = Object.entries(mapping.mappings || {})
    .map(([canonicalId, item]) => ({ canonicalId, ...item }))
    .sort((a, b) => a.canonicalId.localeCompare(b.canonicalId));

  const artifacts = [];
  let produced = 0;

  for (const item of entries) {
    const bars = await readLocalBars(rootDir, item.ticker);
    if (!Array.isArray(bars) || bars.length < 20) {
      continue;
    }

    const closes = bars.map((row) => Number(row.adjClose ?? row.close ?? 0)).filter((v) => Number.isFinite(v));
    if (closes.length < 20) continue;

    const doc = {
      meta: {
        schema: "rv.indicators.v1",
        generated_at: runContext.generatedAt,
        run_id: runContext.runId,
        commit: runContext.commit
      },
      canonical_id: item.canonicalId,
      ticker: item.ticker,
      exchange: item.exchange,
      as_of: bars[bars.length - 1]?.date || null,
      indicators: {
        sma20: sma(closes, 20),
        sma50: sma(closes, 50),
        rsi14: rsi(closes, 14)
      }
    };

    artifacts.push(
      await writeJsonArtifact(
        rootDir,
        `public/data/v3/derived/indicators/${safeId(item.canonicalId)}.json`,
        doc
      )
    );
    produced += 1;
  }

  const manifest = createManifest({
    schema: "rv.manifest.v3",
    runContext,
    quality: {
      produced,
      expected: entries.length
    },
    artifacts
  });
  artifacts.push(await writeManifest(rootDir, "public/data/v3/derived/manifest.json", manifest));

  await updateHealth(rootDir, runContext, {
    dp: {
      dp6_indicators: buildDpHealthEntry({
        status: produced > 0 ? "ok" : "error",
        partial: produced < entries.length,
        stale: false,
        coverage: {
          produced,
          expected: entries.length,
          ratio: entries.length > 0 ? produced / entries.length : 0
        },
        manifest: "public/data/v3/derived/manifest.json"
      })
    }
  });

  if (produced === 0) {
    throw new Error("DP6_NO_INDICATORS_PRODUCED");
  }

  console.log(`DP6 done produced=${produced}`);
}

main().catch((error) => {
  console.error(`DP6_FAILED:${error.message}`);
  process.exitCode = 1;
});
