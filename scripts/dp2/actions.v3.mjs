#!/usr/bin/env node
import { createRunContext } from "../lib/v3/run-context.mjs";
import { loadUniverseAndMapping, readLocalBars } from "../lib/v3/data-sources.mjs";
import { writeGzipNdjsonArtifact, createManifest, writeManifest } from "../lib/v3/artifact-writer.mjs";
import { updateHealth, buildDpHealthEntry } from "../lib/health-writer.v3.mjs";

async function main() {
  const runContext = createRunContext();
  const rootDir = runContext.rootDir;
  const { mapping } = await loadUniverseAndMapping(rootDir);

  const splitRows = [];
  const dividendRows = [];

  const entries = Object.entries(mapping.mappings || {})
    .map(([canonicalId, item]) => ({ canonicalId, ...item }))
    .sort((a, b) => a.canonicalId.localeCompare(b.canonicalId));

  for (const item of entries) {
    const bars = await readLocalBars(rootDir, item.ticker);
    for (const bar of bars) {
      const split = Number(bar?.split ?? 1);
      const dividend = Number(bar?.dividend ?? 0);
      if (split && split !== 1) {
        splitRows.push({
          canonical_id: item.canonicalId,
          ticker: item.ticker,
          exchange: item.exchange,
          type: "split",
          event_date: bar.date,
          value: split,
          provider: "local-eod-bars"
        });
      }
      if (dividend > 0) {
        dividendRows.push({
          canonical_id: item.canonicalId,
          ticker: item.ticker,
          exchange: item.exchange,
          type: "dividend",
          event_date: bar.date,
          value: dividend,
          provider: "local-eod-bars"
        });
      }
    }
  }

  splitRows.sort((a, b) => a.canonical_id.localeCompare(b.canonical_id) || a.event_date.localeCompare(b.event_date));
  dividendRows.sort((a, b) => a.canonical_id.localeCompare(b.canonical_id) || a.event_date.localeCompare(b.event_date));

  const artifacts = [];
  artifacts.push(
    await writeGzipNdjsonArtifact(rootDir, "public/data/v3/actions/splits/latest.ndjson.gz", splitRows)
  );
  artifacts.push(
    await writeGzipNdjsonArtifact(rootDir, "public/data/v3/actions/dividends/latest.ndjson.gz", dividendRows)
  );

  const manifest = createManifest({
    schema: "rv.manifest.v3",
    runContext,
    quality: {
      splits: splitRows.length,
      dividends: dividendRows.length,
      source: "local-eod-bars"
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
          splits: splitRows.length,
          dividends: dividendRows.length
        },
        manifest: "public/data/v3/actions/manifest.json"
      })
    }
  });

  console.log(`DP2 done splits=${splitRows.length} dividends=${dividendRows.length}`);
}

main().catch((error) => {
  console.error(`DP2_FAILED:${error.message}`);
  process.exitCode = 1;
});
