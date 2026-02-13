#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { createRunContext } from "../lib/v3/run-context.mjs";
import { loadV3Policies } from "../lib/v3/policy-loader.mjs";
import { createProviderClients } from "../lib/v3/providers.mjs";
import { estimatePlannedCalls, loadBudgetLedger, assertBudgetBeforeCalls } from "../lib/v3/budget-guard.mjs";
import { writeJsonArtifact, createManifest, writeManifest } from "../lib/v3/artifact-writer.mjs";
import { updateHealth, buildDpHealthEntry } from "../lib/health-writer.v3.mjs";

function hashHeadline(text) {
  return crypto.createHash("sha256").update(text || "", "utf8").digest("hex");
}

function normalizeNewsRows(rows, ticker) {
  if (!Array.isArray(rows)) return [];
  return rows
    .map((item) => ({
      id: hashHeadline(`${item?.title || item?.headline || ""}|${item?.date || item?.publishedAt || ""}`),
      ticker,
      headline: String(item?.title || item?.headline || "").trim(),
      published_at: item?.date || item?.publishedAt || null,
      url: item?.link || item?.url || null,
      source: item?.source || "eodhd"
    }))
    .filter((item) => item.headline.length > 0);
}

async function main() {
  const runContext = createRunContext();
  const rootDir = runContext.rootDir;
  const policies = await loadV3Policies(rootDir);

  const providersPolicy = policies["providers_providers"];
  const budgetPolicy = policies["budgets_budget-allocation_v3"];
  const dynamicBudgetPolicy = policies["dynamic-budgets_v3"];

  const pulsePath = path.join(rootDir, "public/data/v3/pulse/top-movers/latest.json");
  const pulseHealthPath = path.join(rootDir, "public/data/v3/pulse/market-health/latest.json");
  const pulse = JSON.parse(await fs.readFile(pulsePath, "utf8"));
  const pulseHealth = JSON.parse(await fs.readFile(pulseHealthPath, "utf8"));

  const topTickers = (pulse.top_movers || []).slice(0, 6).map((row) => row.ticker);
  const shouldFetch = topTickers.length > 0;

  const multiplier = pulseHealth?.volatility_state === "high" ? 1.5 : 1;
  const plannedCalls = Math.ceil(topTickers.length * multiplier);
  const planned = estimatePlannedCalls("dp5_news", plannedCalls, budgetPolicy);
  const { ledger } = await loadBudgetLedger(rootDir);

  let signals = [];
  let status = "ok";
  let reason = null;
  const fetchErrors = [];

  if (!shouldFetch) {
    status = "degraded";
    reason = "NO_EVENT_TRIGGER";
  } else if (!process.env.EODHD_API_KEY) {
    status = "degraded";
    reason = "MISSING_SECRET:EODHD_API_KEY";
  } else {
    try {
      assertBudgetBeforeCalls(ledger, planned);
    } catch (error) {
      status = "degraded";
      reason = `BUDGET_GUARD_BLOCKED:${error.message}`;
    }

    if (status === "ok") {
      const clients = createProviderClients({
        rootDir,
        runContext,
        providersPolicy,
        budgetPolicy
      });

      for (const ticker of topTickers) {
        try {
          const newsRows = await clients.eodhd.news({
            symbol: `${ticker}.US`,
            limit: 5,
            dpName: "dp5_news"
          });
          signals.push(...normalizeNewsRows(newsRows, ticker));
        } catch (error) {
          fetchErrors.push({ ticker, error: String(error.message || error) });
        }
      }

      if (fetchErrors.length > 0) {
        status = "degraded";
        reason = `PROVIDER_FETCH_FAILED:${fetchErrors[0].error}`;
      }

      const dedupe = new Map();
      for (const signal of signals) {
        dedupe.set(signal.id, signal);
      }
      signals = Array.from(dedupe.values())
        .sort((a, b) => (b.published_at || "").localeCompare(a.published_at || "") || a.id.localeCompare(b.id))
        .slice(0, 60);
    }
  }

  const newsDoc = {
    meta: {
      schema: "rv.news.v2",
      generated_at: runContext.generatedAt,
      run_id: runContext.runId,
      commit: runContext.commit,
      status,
      reason,
      dynamic_budget_rules: dynamicBudgetPolicy.rules?.map((rule) => rule.name) || []
    },
    errors: fetchErrors,
    signals
  };

  const artifacts = [];
  artifacts.push(await writeJsonArtifact(rootDir, "public/data/v3/news/signals/latest.json", newsDoc));

  const manifest = createManifest({
    schema: "rv.manifest.v3",
    runContext,
    quality: {
      status,
      reason,
      planned_calls: plannedCalls,
      emitted_signals: signals.length
    },
    artifacts
  });
  artifacts.push(await writeManifest(rootDir, "public/data/v3/news/manifest.json", manifest));

  await updateHealth(rootDir, runContext, {
    system: {
      status: status === "ok" ? "ok" : "degraded"
    },
    dp: {
      dp5_news: buildDpHealthEntry({
        status,
        partial: status !== "ok",
        stale: status !== "ok",
        reason,
        coverage: {
          signals: signals.length,
          triggers: topTickers.length
        },
        manifest: "public/data/v3/news/manifest.json"
      })
    }
  });

  console.log(`DP5 done status=${status} signals=${signals.length}`);
}

main().catch((error) => {
  console.error(`DP5_FAILED:${error.message}`);
  process.exitCode = 1;
});
