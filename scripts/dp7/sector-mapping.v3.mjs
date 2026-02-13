#!/usr/bin/env node
import path from "node:path";
import { createRunContext } from "../lib/v3/run-context.mjs";
import { loadV3Policies } from "../lib/v3/policy-loader.mjs";
import { createProviderClients } from "../lib/v3/providers.mjs";
import { estimatePlannedCalls, loadBudgetLedger, assertBudgetBeforeCalls } from "../lib/v3/budget-guard.mjs";
import { readJson } from "../lib/v3/stable-io.mjs";
import { loadUniverseAndMapping } from "../lib/v3/data-sources.mjs";
import { writeJsonArtifact, createManifest, writeManifest } from "../lib/v3/artifact-writer.mjs";
import { updateHealth, buildDpHealthEntry } from "../lib/health-writer.v3.mjs";

function extractSector(meta) {
  return (
    meta?.sector ||
    meta?.assetType ||
    meta?.industry ||
    meta?.description?.sector ||
    null
  );
}

async function main() {
  const runContext = createRunContext();
  const rootDir = runContext.rootDir;
  const policies = await loadV3Policies(rootDir);

  const providersPolicy = policies["providers_providers"];
  const budgetPolicy = policies["budgets_budget-allocation_v3"];

  const { mapping } = await loadUniverseAndMapping(rootDir);
  const previous = await readJson(path.join(rootDir, "public/data/v3/universe/sector-mapping/latest.json"), null);
  const prevMap = new Map(((previous?.sectors || [])).map((row) => [row.canonical_id, row]));

  const entries = Object.entries(mapping.mappings || {})
    .map(([canonicalId, item]) => ({ canonicalId, ...item }))
    .sort((a, b) => a.canonicalId.localeCompare(b.canonicalId));

  const refreshCap = Number((budgetPolicy.max_planned_calls || {}).dp7_fundamentals_bridge || 150);
  const planned = estimatePlannedCalls("dp7_fundamentals_bridge", Math.min(entries.length, refreshCap), budgetPolicy);

  const { ledger } = await loadBudgetLedger(rootDir);
  let status = "ok";
  let reason = null;
  let refreshed = 0;

  const clients = createProviderClients({
    rootDir,
    runContext,
    providersPolicy,
    budgetPolicy
  });

  const sectors = [];

  if (!process.env.TIINGO_API_KEY) {
    status = "degraded";
    reason = "MISSING_SECRET:TIINGO_API_KEY";
    for (const item of entries) {
      const prior = prevMap.get(item.canonicalId);
      sectors.push({
        canonical_id: item.canonicalId,
        ticker: item.ticker,
        sector: prior?.sector || "Unknown",
        source: prior ? "previous-cache" : "fallback-unknown"
      });
    }
  } else {
    assertBudgetBeforeCalls(ledger, planned);

    for (const item of entries) {
      const prior = prevMap.get(item.canonicalId);

      if (refreshed >= refreshCap) {
        sectors.push({
          canonical_id: item.canonicalId,
          ticker: item.ticker,
          sector: prior?.sector || "Unknown",
          source: prior ? "previous-cache" : "budget-throttled"
        });
        continue;
      }

      try {
        const meta = await clients.tiingo.fundamentalsMeta({
          ticker: item.provider_ids?.tiingo || item.ticker,
          dpName: "dp7_fundamentals_bridge"
        });
        const sector = extractSector(meta) || prior?.sector || "Unknown";
        sectors.push({
          canonical_id: item.canonicalId,
          ticker: item.ticker,
          sector,
          source: "tiingo"
        });
        refreshed += 1;
      } catch {
        sectors.push({
          canonical_id: item.canonicalId,
          ticker: item.ticker,
          sector: prior?.sector || "Unknown",
          source: prior ? "previous-cache" : "tiingo-error-fallback"
        });
      }
    }

    if (refreshCap < entries.length) {
      status = "degraded";
      reason = "BUDGET_THROTTLED_PARTIAL_REFRESH";
    }
  }

  const doc = {
    meta: {
      schema: "rv.fundamentals.v1",
      generated_at: runContext.generatedAt,
      run_id: runContext.runId,
      commit: runContext.commit,
      status,
      reason,
      refreshed,
      total: entries.length
    },
    sectors
  };

  const artifacts = [];
  artifacts.push(await writeJsonArtifact(rootDir, "public/data/v3/universe/sector-mapping/latest.json", doc));

  const manifest = createManifest({
    schema: "rv.manifest.v3",
    runContext,
    quality: {
      status,
      reason,
      refreshed,
      total: entries.length
    },
    artifacts
  });
  artifacts.push(await writeManifest(rootDir, "public/data/v3/fundamentals/manifest.json", manifest));

  const date = runContext.generatedAt.slice(0, 10);
  const drift = {
    meta: {
      schema: "rv.fundamentals.drift.v1",
      generated_at: runContext.generatedAt,
      run_id: runContext.runId,
      commit: runContext.commit
    },
    unknown_count: sectors.filter((row) => row.sector === "Unknown").length,
    refreshed,
    total: entries.length
  };
  artifacts.push(
    await writeJsonArtifact(rootDir, `public/data/v3/system/drift/sector-drift-${date}.json`, drift)
  );

  await updateHealth(rootDir, runContext, {
    system: {
      status: status === "ok" ? "ok" : "degraded"
    },
    dp: {
      dp7_fundamentals: buildDpHealthEntry({
        status,
        partial: status !== "ok",
        stale: status !== "ok",
        reason,
        coverage: {
          refreshed,
          total: entries.length
        },
        manifest: "public/data/v3/fundamentals/manifest.json"
      })
    }
  });

  console.log(`DP7 done status=${status} refreshed=${refreshed}/${entries.length}`);
}

main().catch((error) => {
  console.error(`DP7_FAILED:${error.message}`);
  process.exitCode = 1;
});
