#!/usr/bin/env node
import { createRunContext } from "../lib/v3/run-context.mjs";
import { loadV3Policies } from "../lib/v3/policy-loader.mjs";
import { loadUniverseAndMapping } from "../lib/v3/data-sources.mjs";
import { writeJsonArtifact, createManifest, writeManifest } from "../lib/v3/artifact-writer.mjs";
import { updateHealth, buildDpHealthEntry } from "../lib/health-writer.v3.mjs";

async function main() {
  const runContext = createRunContext();
  const rootDir = runContext.rootDir;
  await loadV3Policies(rootDir);
  const { mapping } = await loadUniverseAndMapping(rootDir);

  const currencies = new Set(Object.values(mapping.mappings || {}).map((item) => item.currency || "USD"));
  const base = "USD";
  const rates = {};
  for (const currency of [...currencies].sort()) {
    rates[currency] = currency === base ? 1 : null;
  }

  const stale = Object.values(rates).some((value) => value === null);
  const doc = {
    meta: {
      schema: "rv.fx.v1",
      generated_at: runContext.generatedAt,
      run_id: runContext.runId,
      commit: runContext.commit,
      source: "static-usd-single-currency",
      stale
    },
    asOf: runContext.generatedAt.slice(0, 10),
    base,
    rates
  };

  const artifacts = [];
  artifacts.push(await writeJsonArtifact(rootDir, "public/data/v3/fx/rates/latest.json", doc));

  const manifest = createManifest({
    schema: "rv.manifest.v3",
    runContext,
    quality: {
      stale,
      currencies: Object.keys(rates)
    },
    artifacts
  });

  artifacts.push(await writeManifest(rootDir, "public/data/v3/fx/rates/manifest.json", manifest));

  await updateHealth(rootDir, runContext, {
    system: {
      status: stale ? "degraded" : "ok"
    },
    dp: {
      dp1_5_fx: buildDpHealthEntry({
        status: stale ? "degraded" : "ok",
        stale,
        partial: stale,
        manifest: "public/data/v3/fx/rates/manifest.json"
      })
    }
  });

  console.log(`DP1.5 done stale=${stale}`);
}

main().catch((error) => {
  console.error(`DP1_5_FAILED:${error.message}`);
  process.exitCode = 1;
});
