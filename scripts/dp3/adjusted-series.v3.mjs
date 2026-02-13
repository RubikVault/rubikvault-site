#!/usr/bin/env node
import { createRunContext } from "../lib/v3/run-context.mjs";
import { loadUniverseAndMapping, readLocalBars } from "../lib/v3/data-sources.mjs";
import { writeGzipNdjsonArtifact, createManifest, writeManifest } from "../lib/v3/artifact-writer.mjs";
import { buildLineage, validateLineage } from "../lib/v3/lineage.mjs";
import { updateHealth, buildDpHealthEntry } from "../lib/health-writer.v3.mjs";

function safeId(canonicalId) {
  return canonicalId.replace(/[:/]/g, "__");
}

async function main() {
  const runContext = createRunContext();
  const rootDir = runContext.rootDir;
  const { mapping } = await loadUniverseAndMapping(rootDir);

  const artifacts = [];
  const entries = Object.entries(mapping.mappings || {})
    .map(([canonicalId, item]) => ({ canonicalId, ...item }))
    .sort((a, b) => a.canonicalId.localeCompare(b.canonicalId));

  let failedLineage = 0;

  for (const item of entries) {
    const bars = await readLocalBars(rootDir, item.ticker);
    const history = bars
      .slice(-260)
      .map((bar) => ({
        canonical_id: item.canonicalId,
        ticker: item.ticker,
        exchange: item.exchange,
        trading_date: bar.date,
        close: Number(bar.close ?? 0),
        adjusted_close: Number(bar.adjClose ?? bar.close ?? 0)
      }))
      .sort((a, b) => a.trading_date.localeCompare(b.trading_date));

    const lineage = await buildLineage(rootDir, [
      `public/data/eod/bars/${item.ticker}.json`,
      "public/data/v3/actions/splits/latest.ndjson.gz",
      "public/data/v3/actions/dividends/latest.ndjson.gz",
      "public/data/v3/fx/rates/latest.json"
    ], {
      as_of: runContext.generatedAt.slice(0, 10)
    });

    const validated = await validateLineage(rootDir, lineage);
    if (!validated.ok) {
      failedLineage += 1;
    }

    const payload = history.map((row) => ({
      ...row,
      meta: {
        lineage
      }
    }));

    artifacts.push(
      await writeGzipNdjsonArtifact(
        rootDir,
        `public/data/v3/series/adjusted/${safeId(item.canonicalId)}.ndjson.gz`,
        payload
      )
    );
  }

  const manifest = createManifest({
    schema: "rv.manifest.v3",
    runContext,
    quality: {
      symbols: entries.length,
      failed_lineage: failedLineage
    },
    lineage: {
      source_count: 4
    },
    artifacts
  });

  artifacts.push(await writeManifest(rootDir, "public/data/v3/series/manifest.json", manifest));

  await updateHealth(rootDir, runContext, {
    system: {
      status: failedLineage > 0 ? "degraded" : "ok"
    },
    dp: {
      dp3_adjusted: buildDpHealthEntry({
        status: failedLineage > 0 ? "degraded" : "ok",
        partial: failedLineage > 0,
        stale: false,
        coverage: {
          symbols: entries.length,
          failed_lineage: failedLineage
        },
        manifest: "public/data/v3/series/manifest.json"
      })
    }
  });

  console.log(`DP3 done symbols=${entries.length} failedLineage=${failedLineage}`);
}

main().catch((error) => {
  console.error(`DP3_FAILED:${error.message}`);
  process.exitCode = 1;
});
