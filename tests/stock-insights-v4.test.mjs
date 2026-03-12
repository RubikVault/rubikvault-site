#!/usr/bin/env node

import assert from "node:assert/strict";
import { onRequestGet } from "../functions/api/stock-insights-v4.js";

function makeBars() {
  const bars = [];
  const start = new Date("2026-01-02T00:00:00Z");
  let price = 100;
  for (let i = 0; i < 80; i += 1) {
    const d = new Date(start);
    d.setUTCDate(start.getUTCDate() + i);
    const wd = d.getUTCDay();
    if (wd === 0 || wd === 6) continue;
    const open = price;
    price = Number((price * (1 + ((i % 9) - 4) * 0.003)).toFixed(4));
    const close = price;
    bars.push({
      date: d.toISOString().slice(0, 10),
      open,
      high: Math.max(open, close) * 1.01,
      low: Math.min(open, close) * 0.99,
      close,
      adjClose: close,
      volume: 1_000_000 + i * 1000,
    });
  }
  return bars;
}

function stubFetch() {
  const bars = makeBars();
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url) => {
    const u = new URL(url);
    if (u.pathname === "/data/features-v2/stock-insights/index.json") {
      return {
        ok: true,
        status: 200,
        json: async () => ({
          rows: {
            AAPL: {
              scientific: { value: true, as_of: "2026-03-08", source: "stock-analysis.snapshot", status: "ok", reason: null },
              forecast: { value: true, as_of: "2026-03-08", source: "forecast.latest", status: "ok", reason: null },
              elliott: { value: true, as_of: "2026-03-08", source: "marketphase.per_ticker", status: "ok", reason: null },
            },
          },
        }),
      };
    }
    if (u.pathname === "/api/stock-insights-v2") {
      return {
        ok: true,
        status: 200,
        json: async () => ({
          scientific: {
            setup: { score: 72, proof_points: ["Price above SMA50"] },
            trigger: { score: 58, proof_points: ["MACD histogram positive"] },
          },
          forecast: {
            horizons: {
              "1d": { probability: 0.56, direction: "bullish" },
              "5d": { probability: 0.59, direction: "bullish" },
              "20d": { probability: 0.61, direction: "bullish" },
            },
          },
          forecast_meta: {
            accuracy: { directional: 0.57, brier: 0.19 },
          },
          elliott: {
            completedPattern: { direction: "bullish" },
            developingPattern: { possibleWave: "Wave 3", confidence: 64 },
          },
          v2_contract: {
            scientific: { value: true, as_of: "2026-03-08", source: "stock-analysis.snapshot", status: "ok", reason: null },
            forecast: { value: true, as_of: "2026-03-08", source: "forecast.latest", status: "ok", reason: null },
            elliott: { value: true, as_of: "2026-03-08", source: "marketphase.per_ticker", status: "ok", reason: null },
          },
        }),
      };
    }
    if (u.pathname === "/api/stock") {
      return {
        ok: true,
        status: 200,
        json: async () => ({
          data: {
            bars,
            market_stats: {
              stats: {
                sma20: 101.2,
                sma50: 99.4,
                sma200: 95.1,
                rsi14: 54.2,
                macd_hist: 0.3,
                volatility_percentile: 62,
              },
            },
            universe: { sector: "Technology" },
          },
        }),
      };
    }
    return { ok: false, status: 404, json: async () => null };
  };
  return () => {
    globalThis.fetch = originalFetch;
  };
}

async function testInvalidTicker() {
  const request = new Request("https://example.com/api/stock-insights-v4?ticker=@@");
  const response = await onRequestGet({ request, env: {} });
  assert.equal(response.status, 400, "invalid ticker should return 400");
  console.log("✅ stock-insights-v4 invalid ticker handling");
}

async function testV4ContractAndFallbackCap() {
  const restore = stubFetch();
  try {
    const request = new Request("https://example.com/api/stock-insights-v4?ticker=AAPL");
    const response = await onRequestGet({ request, env: {} });
    assert.equal(response.status, 200, "expected 200 for valid ticker");
    const payload = JSON.parse(await response.text());
    assert.equal(payload.schema_version, "rv.stock-insights.v4");
    assert.ok(payload.v4_contract && typeof payload.v4_contract === "object", "missing v4_contract");
    for (const k of ["scientific", "forecast", "elliott", "raw_validation", "outcome_labels", "scientific_eligibility", "fallback_state", "timeframe_confluence", "decision_trace"]) {
      const row = payload.v4_contract[k];
      assert.ok(row, `missing contract row: ${k}`);
      for (const field of ["value", "as_of", "source", "status", "reason"]) {
        assert.ok(field in row, `${k}.${field} missing`);
      }
    }
    const confidence = String(payload.v4_contract.fallback_state?.value?.confidence || "").toUpperCase();
    assert.ok(["LOW", "MEDIUM", ""].includes(confidence), "fallback confidence must be capped to MEDIUM");
    console.log("✅ stock-insights-v4 contract and fallback cap");
  } finally {
    restore();
  }
}

await testInvalidTicker();
await testV4ContractAndFallbackCap();
