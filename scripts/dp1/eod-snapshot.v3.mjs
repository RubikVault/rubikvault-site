#!/usr/bin/env node
import path from "node:path";
import { createRunContext, loadCalendar, resolveTradingDateFromCalendar } from "../lib/v3/run-context.mjs";
import { loadV3Policies } from "../lib/v3/policy-loader.mjs";
import { createProviderClients } from "../lib/v3/providers.mjs";
import { estimatePlannedCalls, initBudgetLedger, assertBudgetBeforeCalls, loadBudgetLedger } from "../lib/v3/budget-guard.mjs";
import { classifyError } from "../lib/v3/error-taxonomy.mjs";
import {
  writeGzipJsonArtifact,
  writeGzipNdjsonArtifact,
  createManifest,
  writeManifest,
  enforceBuildLimits
} from "../lib/v3/artifact-writer.mjs";
import { loadUniverseAndMapping, readLocalBars, pickBarForTradingDate, toEodRecord } from "../lib/v3/data-sources.mjs";
import { updateHealth, buildDpHealthEntry } from "../lib/health-writer.v3.mjs";

function parseArgs() {
  const args = process.argv.slice(2);
  const out = { exchange: "US", tradingDate: null };
  for (let i = 0; i < args.length; i += 1) {
    if (args[i] === "--exchange") out.exchange = args[++i];
    if (args[i] === "--trading-date") out.tradingDate = args[++i];
  }
  return out;
}

function normalizeEodFromProvider(providerRows, fallbackMeta) {
  if (!Array.isArray(providerRows) || providerRows.length === 0) return null;
  const row = providerRows[providerRows.length - 1];
  return {
    date: row.date || row.formatted_date || fallbackMeta.tradingDate,
    open: Number(row.open ?? 0),
    high: Number(row.high ?? 0),
    low: Number(row.low ?? 0),
    close: Number(row.close ?? 0),
    adjClose: Number(row.adjusted_close ?? row.adjClose ?? row.close ?? 0),
    volume: Number(row.volume ?? 0),
    dividend: Number(row.dividend ?? 0),
    split: Number(row.split ?? 1)
  };
}

async function fetchWithFallback(clients, mapping, tradingDate) {
  const eodhdId = mapping.provider_ids?.eodhd;
  if (!eodhdId) return null;

  try {
    const eodRows = await clients.eodhd.eod({
      symbol: eodhdId,
      from: tradingDate,
      to: tradingDate,
      dpName: "dp1_eod"
    });
    const normalized = normalizeEodFromProvider(eodRows, { tradingDate });
    if (normalized) {
      return { bar: normalized, provider: "eodhd" };
    }
  } catch (error) {
    if (!process.env.TIINGO_API_KEY) {
      throw error;
    }
  }

  const tiingoId = mapping.provider_ids?.tiingo || mapping.ticker;
  const tiingoRows = await clients.tiingo.dailyFallback({
    ticker: tiingoId,
    startDate: tradingDate,
    endDate: tradingDate,
    dpName: "dp1_eod"
  });
  const normalized = normalizeEodFromProvider(tiingoRows, { tradingDate });
  if (!normalized) return null;
  return { bar: normalized, provider: "tiingo" };
}

async function main() {
  const args = parseArgs();
  const runContext = createRunContext();
  const rootDir = runContext.rootDir;

  const policies = await loadV3Policies(rootDir);
  const providersPolicy = policies["providers_providers"];
  const budgetPolicy = policies["budgets_budget-allocation_v3"];
  const errorsPolicy = policies["errors_v3"];
  const buildPolicy = policies["build_v3"];
  const retentionPolicy = policies["retention_v3"];

  const { mapping } = await loadUniverseAndMapping(rootDir);
  const calendar = await loadCalendar(args.exchange, new Date().getUTCFullYear());
  const tradingDate = args.tradingDate || resolveTradingDateFromCalendar(new Date(), calendar);

  await initBudgetLedger(rootDir, budgetPolicy, runContext);

  const mappings = Object.entries(mapping.mappings || {})
    .map(([canonicalId, item]) => ({ canonicalId, ...item }))
    .filter((item) => item.exchange === args.exchange)
    .sort((a, b) => a.canonicalId.localeCompare(b.canonicalId));

  const clients = createProviderClients({
    rootDir,
    runContext,
    providersPolicy,
    budgetPolicy
  });

  const plannedCalls = process.env.EODHD_API_KEY ? mappings.length : 0;
  const planned = estimatePlannedCalls("dp1_eod", plannedCalls, budgetPolicy);
  const { ledger } = await loadBudgetLedger(rootDir);
  assertBudgetBeforeCalls(ledger, planned);

  const rows = [];
  const raw = [];
  let providerFallbackCount = 0;
  let fetchFailures = 0;

  for (const item of mappings) {
    const localBars = await readLocalBars(rootDir, item.ticker);
    let selectedBar = pickBarForTradingDate(localBars, tradingDate);
    let provider = "local";

    if (!selectedBar && (process.env.EODHD_API_KEY || process.env.TIINGO_API_KEY)) {
      try {
        const fetched = await fetchWithFallback(clients, item, tradingDate);
        if (fetched) {
          selectedBar = fetched.bar;
          provider = fetched.provider;
          if (provider === "tiingo") providerFallbackCount += 1;
        }
      } catch (error) {
        fetchFailures += 1;
        const classified = classifyError(error, errorsPolicy);
        raw.push({
          canonical_id: item.canonicalId,
          ticker: item.ticker,
          exchange: item.exchange,
          provider: "error",
          error: String(error.message || error),
          classification: classified
        });
      }
    }

    const record = toEodRecord({
      canonicalId: item.canonicalId,
      ticker: item.ticker,
      exchange: item.exchange,
      currency: item.currency,
      provider,
      bar: selectedBar
    });

    if (record) {
      rows.push(record);
      raw.push(record);
    }
  }

  rows.sort((a, b) => a.canonical_id.localeCompare(b.canonical_id));

  const expected = mappings.length;
  const observed = rows.length;
  const coverage = expected > 0 ? observed / expected : 0;
  const partial = coverage < 1;
  const stale = rows.every((row) => row.trading_date !== tradingDate);

  if (observed === 0) {
    throw new Error("DP1_EMPTY_RESULT");
  }

  const artifacts = [];
  const exchange = args.exchange;

  artifacts.push(
    await writeGzipJsonArtifact(
      rootDir,
      `mirrors/eodhd/eod/${exchange}/${tradingDate}.raw.json.gz`,
      {
        meta: {
          schema: "rv.eod.raw.v1",
          generated_at: runContext.generatedAt,
          run_id: runContext.runId,
          commit: runContext.commit,
          trading_date: tradingDate
        },
        rows: raw
      }
    )
  );

  artifacts.push(
    await writeGzipNdjsonArtifact(
      rootDir,
      `mirrors/eodhd/eod/${exchange}/${tradingDate}.canonical.ndjson.gz`,
      rows
    )
  );

  artifacts.push(
    await writeGzipNdjsonArtifact(
      rootDir,
      `public/data/v3/eod/${exchange}/${tradingDate}.ndjson.gz`,
      rows
    )
  );

  artifacts.push(
    await writeGzipNdjsonArtifact(
      rootDir,
      `public/data/v3/eod/${exchange}/latest.ndjson.gz`,
      rows
    )
  );

  const manifest = createManifest({
    schema: "rv.manifest.v3",
    runContext,
    quality: {
      exchange,
      trading_date: tradingDate,
      expected_symbols: expected,
      observed_symbols: observed,
      coverage,
      stale,
      partial,
      provider_fallback_count: providerFallbackCount,
      fetch_failures: fetchFailures
    },
    artifacts
  });

  artifacts.push(
    await writeManifest(rootDir, `public/data/v3/eod/${exchange}/manifest.json`, manifest)
  );

  await enforceBuildLimits(rootDir, `public/data/v3/eod/${exchange}`, buildPolicy);

  await updateHealth(rootDir, runContext, {
    system: {
      status: partial ? "degraded" : "ok",
      budget: {
        hard_cap: Number(ledger.hard_cap || 0),
        reserve: Number(ledger.reserve || 0),
        used_calls: Number(ledger.used_calls || 0)
      },
      retention: {
        strategy: retentionPolicy.active_strategy,
        hot_window_days: retentionPolicy.hot_window_days || null
      }
    },
    dp: {
      dp1_eod: buildDpHealthEntry({
        status: partial ? "degraded" : "ok",
        coverage: {
          expected,
          observed,
          ratio: coverage
        },
        stale,
        partial,
        tradingDate,
        manifest: `public/data/v3/eod/${exchange}/manifest.json`
      })
    }
  });

  console.log(`DP1 done exchange=${exchange} tradingDate=${tradingDate} observed=${observed}/${expected}`);
}

main().catch((error) => {
  console.error(`DP1_FAILED:${error.message}`);
  process.exitCode = 1;
});
