// Additive v4 insights endpoint — uses shared decision-input-assembly.
// This endpoint and /api/stock both call the shared decision input assembly.

import { buildStockInsightsV4Evaluation } from "./_shared/stock-insights-v4.js";
import { assembleDecisionInputs, loadRequestCoreInputs } from "./_shared/decision-input-assembly.js";

function summarizeStatus(states) {
  const vals = Object.values(states || {});
  if (!vals.length) return "unavailable";
  if (vals.some((s) => s?.status === "blocked" || s?.status === "suppressed")) return "blocked";
  if (vals.every((s) => s?.status === "ok")) return "ok";
  if (vals.some((s) => s?.status === "stale")) return "stale";
  if (vals.some((s) => s?.status === "unavailable")) return "partial";
  return "partial";
}

export async function onRequestGet(context) {
  const { request } = context;
  const url = new URL(request.url);
  const ticker = (url.searchParams.get("ticker") || "").trim().toUpperCase();
  if (!ticker || !/^[A-Z0-9.\-]{1,15}$/.test(ticker)) {
    return new Response(JSON.stringify({ error: "missing or invalid ticker" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const origin = url.origin;
  const assetFetcher = context.env?.ASSETS;

  async function fetchJson(path) {
    try {
      let res;
      if (assetFetcher && path.startsWith("/data/")) {
        res = await assetFetcher.fetch(new URL(path, origin).toString());
      } else {
        res = await fetch(new URL(path, origin).toString());
      }
      if (!res.ok) return null;
      return await res.json();
    } catch {
      return null;
    }
  }

  const decisionInputs = await assembleDecisionInputs(ticker, {
    fetchJson,
    loadCoreInputs: (resolvedTicker) => loadRequestCoreInputs(resolvedTicker, { request, assetFetcher, fetchJson }),
  });

  const evalDoc = buildStockInsightsV4Evaluation({
    ticker,
    bars: decisionInputs.bars,
    stats: decisionInputs.stats,
    universe: decisionInputs.universe,
    scientificState: decisionInputs.scientificState,
    forecastState: decisionInputs.forecastState,
    quantlabState: decisionInputs.quantlabState,
    forecastMeta: decisionInputs.forecastMeta,
    inputFingerprints: decisionInputs.input_fingerprints,
    runtimeControl: decisionInputs.runtimeControl,
  });

  const result = {
    ...evalDoc,
    source_paths: {
      assembly: "decision-input-assembly (shared full path)",
      core_inputs: "static_asset_loader",
    },
    status: summarizeStatus(evalDoc.v4_contract),
  };

  return new Response(JSON.stringify(result), {
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "public, max-age=120",
    },
  });
}
