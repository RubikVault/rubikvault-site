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
    if (u.pathname === "/data/features-v4/stock-insights/index.json") {
      return {
        ok: true,
        status: 200,
        json: async () => ({
          generated_at: "2026-03-08T00:00:00Z",
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
    if (u.pathname === "/data/forecast/latest.json") {
      return {
        ok: true,
        status: 200,
        json: async () => ({
          meta: {
            accuracy: { directional: 0.57, brier: 0.19 },
          },
          data: {
            asof: "2026-03-08",
            forecasts: [{
              symbol: "AAPL",
              name: "Apple Inc.",
              horizons: {
                "1d": { probability: 0.56, direction: "bullish" },
                "5d": { probability: 0.59, direction: "bullish" },
                "20d": { probability: 0.61, direction: "bullish" },
              },
            }],
          },
        }),
      };
    }
    if (u.pathname === "/data/eod/history/shards/A.json") {
      return {
        ok: true,
        status: 200,
        json: async () => ({
          AAPL: bars.map((bar) => [
            bar.date,
            bar.open,
            bar.high,
            bar.low,
            bar.close,
            bar.adjClose,
            bar.volume,
          ]),
        }),
      };
    }
    if (u.pathname === "/data/fundamentals/AAPL.json") {
      return {
        ok: true,
        status: 200,
        json: async () => ({
          companyName: "Apple Inc.",
          marketCap: 3_000_000_000_000,
          nextEarningsDate: "2026-05-02",
        }),
      };
    }
    if (u.pathname === "/data/earnings-calendar/latest.json") {
      return {
        ok: true,
        status: 200,
        json: async () => ({
          as_of: "2026-03-08",
          items: [],
        }),
      };
    }
    if (u.pathname === "/data/quantlab/stock-insights/stocks/A.json") {
      return {
        ok: true,
        status: 200,
        json: async () => ({
          asOfDate: "2026-03-08",
          byTicker: {
            AAPL: {
              assetClass: "stock",
              setupScore: 61,
            },
          },
        }),
      };
    }
    if (u.pathname === "/data/quantlab/stock-insights/etfs/A.json") {
      return {
        ok: true,
        status: 200,
        json: async () => ({
          asOfDate: "2026-03-08",
          byTicker: {},
        }),
      };
    }
    if (u.pathname === "/data/runtime/stock-analyzer-control.json") {
      return {
        ok: true,
        status: 200,
        json: async () => ({
          run_id: "run-test",
          target_market_date: "2026-03-08",
        }),
      };
    }
    if (u.pathname === "/data/reports/learning-report-latest.json") {
      return {
        ok: true,
        status: 200,
        json: async () => ({
          features: { stock_analyzer: {} },
        }),
      };
    }
    if (u.pathname === "/policies/best-setups.v1.json") {
      return {
        ok: true,
        status: 200,
        json: async () => ({
          learning_status: { default: "BOOTSTRAP" },
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
