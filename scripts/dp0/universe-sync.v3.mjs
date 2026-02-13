#!/usr/bin/env node
import path from "node:path";
import fs from "node:fs/promises";
import { createRunContext } from "../lib/v3/run-context.mjs";
import { loadV3Policies } from "../lib/v3/policy-loader.mjs";
import { writeJsonArtifact, createManifest, writeManifest } from "../lib/v3/artifact-writer.mjs";
import { updateHealth, buildDpHealthEntry } from "../lib/health-writer.v3.mjs";

async function main() {
  const runContext = createRunContext();
  const rootDir = runContext.rootDir;
  const policies = await loadV3Policies(rootDir);

  const universeDoc = policies["universe_universe_v3"];
  const mappingDoc = policies["universe_symbol-mapping_v3"];
  const exchangesPolicy = policies["exchanges_v3"];
  const retentionPolicy = policies["retention_v3"];
  const budgetPolicy = policies["budgets_budget-allocation_v3"];

  const sourceUniverse = JSON.parse(
    await fs.readFile(path.join(rootDir, "public/data/universe/all.json"), "utf8")
  );

  const sourceTickers = new Set(
    sourceUniverse
      .map((item) => (typeof item === "string" ? item : item?.ticker))
      .filter(Boolean)
  );
  const policyTickers = new Set((universeDoc.symbols || []).map((item) => item.ticker));

  const missingInPolicy = [...sourceTickers].filter((ticker) => !policyTickers.has(ticker)).sort();
  const extraInPolicy = [...policyTickers].filter((ticker) => !sourceTickers.has(ticker)).sort();

  const date = new Date().toISOString().slice(0, 10);
  const driftDoc = {
    meta: {
      schema: "rv.universe.drift.v1",
      generated_at: runContext.generatedAt,
      run_id: runContext.runId,
      commit: runContext.commit
    },
    counts: {
      source: sourceTickers.size,
      policy: policyTickers.size
    },
    missing_in_policy: missingInPolicy,
    extra_in_policy: extraInPolicy
  };

  const artifacts = [];
  artifacts.push(await writeJsonArtifact(rootDir, "public/data/v3/universe/universe.json", universeDoc));
  artifacts.push(await writeJsonArtifact(rootDir, "public/data/v3/universe/symbol-mapping.json", mappingDoc));
  artifacts.push(
    await writeJsonArtifact(rootDir, "public/data/v3/universe/exchanges.json", {
      schema_version: "v3",
      generated_at: runContext.generatedAt,
      allowed_codes: exchangesPolicy.allowed_codes,
      alias_map: exchangesPolicy.alias_map,
      expected: exchangesPolicy.expected
    })
  );
  artifacts.push(
    await writeJsonArtifact(
      rootDir,
      `public/data/v3/system/drift/universe-drift-${date}.json`,
      driftDoc
    )
  );

  const manifest = createManifest({
    schema: "rv.manifest.v3",
    runContext,
    quality: {
      missing_in_policy: missingInPolicy.length,
      extra_in_policy: extraInPolicy.length,
      mapping_coverage_percent: mappingDoc.coverage?.percent ?? null
    },
    artifacts
  });
  artifacts.push(await writeManifest(rootDir, "public/data/v3/universe/manifest.json", manifest));

  await updateHealth(rootDir, runContext, {
    system: {
      status: missingInPolicy.length === 0 ? "ok" : "degraded",
      budget: {
        hard_cap: Number(budgetPolicy.hard_cap || 0),
        reserve: Number(budgetPolicy.reserve || 0)
      },
      retention: {
        strategy: retentionPolicy.active_strategy,
        hot_window_days: retentionPolicy.hot_window_days || null
      },
      manifests: {
        universe: "public/data/v3/universe/manifest.json"
      },
      drift_latest: {
        universe: `public/data/v3/system/drift/universe-drift-${date}.json`
      }
    },
    dp: {
      dp0_universe: buildDpHealthEntry({
        status: missingInPolicy.length === 0 ? "ok" : "degraded",
        coverage: {
          source: sourceTickers.size,
          policy: policyTickers.size
        },
        partial: missingInPolicy.length > 0,
        manifest: "public/data/v3/universe/manifest.json"
      })
    }
  });

  console.log(`DP0 done; source=${sourceTickers.size} policy=${policyTickers.size}`);
  if (missingInPolicy.length > 0) {
    console.log(`DP0 drift: missing_in_policy=${missingInPolicy.length}`);
  }
}

main().catch((error) => {
  console.error(`DP0_FAILED:${error.message}`);
  process.exitCode = 1;
});
