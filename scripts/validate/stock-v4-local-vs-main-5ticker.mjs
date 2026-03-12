#!/usr/bin/env node
/**
 * Deterministic 5-ticker verification:
 * - 3 tickers from S&P 500
 * - 2 tickers from Russell 2000
 *
 * Compares local vs main for /api/stock (v1 baseline),
 * and validates local v4 contract from /api/stock-insights-v4.
 */

import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "../..");

function parseArgs(argv) {
  const out = {
    localBase: process.env.RV_LOCAL_BASE || "http://127.0.0.1:8788",
    mainBase: process.env.RV_MAIN_BASE || "https://rubikvault.com",
    timeoutMs: 25000,
    outSsot: "mirrors/features-v4/reports/stock-v4-local-vs-main-5ticker.json",
    outPublish: "public/data/features-v4/reports/stock-v4-local-vs-main-5ticker.json",
  };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === "--local-base") out.localBase = String(argv[++i] || out.localBase);
    else if (a === "--main-base") out.mainBase = String(argv[++i] || out.mainBase);
    else if (a === "--timeout-ms") out.timeoutMs = Math.max(1000, Number(argv[++i] || out.timeoutMs));
    else if (a === "--out-ssot") out.outSsot = String(argv[++i] || out.outSsot);
    else if (a === "--out-publish") out.outPublish = String(argv[++i] || out.outPublish);
  }
  return out;
}

async function readJson(absPath) {
  const raw = await fs.readFile(absPath, "utf8");
  return JSON.parse(raw);
}

async function ensureDirFor(absPath) {
  await fs.mkdir(path.dirname(absPath), { recursive: true });
}

function pickTickers(sp, ru) {
  const spTickers = sp.map((r) => String(r?.ticker || "").toUpperCase()).filter(Boolean).sort();
  const ruTickers = ru.map((r) => String(r?.ticker || "").toUpperCase()).filter(Boolean).sort();
  return [...spTickers.slice(0, 3), ...ruTickers.slice(0, 2)];
}

async function fetchJson(url, timeoutMs) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      headers: { "cache-control": "no-cache" },
    });
    const txt = await res.text();
    let json = null;
    try {
      json = JSON.parse(txt);
    } catch {
      json = null;
    }
    return { ok: res.ok, status: res.status, json };
  } catch (err) {
    return { ok: false, status: 0, json: null, error: String(err?.message || err) };
  } finally {
    clearTimeout(timer);
  }
}

function v4ContractValid(doc) {
  const c = doc?.v4_contract;
  if (!c || typeof c !== "object") return false;
  const req = [
    "scientific",
    "forecast",
    "elliott",
    "raw_validation",
    "outcome_labels",
    "scientific_eligibility",
    "fallback_state",
    "timeframe_confluence",
    "decision_trace",
  ];
  for (const k of req) {
    const row = c[k];
    if (!row || typeof row !== "object") return false;
    for (const field of ["value", "as_of", "source", "status", "reason"]) {
      if (!(field in row)) return false;
    }
  }
  return true;
}

function hasValue(v) {
  return v !== null && v !== undefined;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const sp = await readJson(path.join(ROOT, "public/data/universe/sp500.json"));
  const ru = await readJson(path.join(ROOT, "public/data/universe/russell2000.json"));
  const tickers = pickTickers(sp, ru);

  const rows = [];
  for (const ticker of tickers) {
    const [localStock, mainStock, localV4] = await Promise.all([
      fetchJson(`${args.localBase.replace(/\/+$/, "")}/api/stock?ticker=${encodeURIComponent(ticker)}&eval_v4=1`, args.timeoutMs),
      fetchJson(`${args.mainBase.replace(/\/+$/, "")}/api/stock?ticker=${encodeURIComponent(ticker)}`, args.timeoutMs),
      fetchJson(`${args.localBase.replace(/\/+$/, "")}/api/stock-insights-v4?ticker=${encodeURIComponent(ticker)}`, args.timeoutMs),
    ]);

    const localClose = localStock?.json?.data?.market_prices?.close ?? null;
    const mainClose = mainStock?.json?.data?.market_prices?.close ?? null;
    const localHasStats = Boolean(localStock?.json?.data?.market_stats?.stats);
    const mainHasStats = Boolean(mainStock?.json?.data?.market_stats?.stats);

    rows.push({
      ticker,
      local: {
        stock_ok: localStock.ok,
        v4_ok: localV4.ok,
        close: localClose,
        as_of: localStock?.json?.meta?.asOf || localStock?.json?.data?.market_prices?.date || null,
        has_stats: localHasStats,
        v4_contract_ok: v4ContractValid(localV4.json),
      },
      main: {
        stock_ok: mainStock.ok,
        close: mainClose,
        as_of: mainStock?.json?.meta?.asOf || mainStock?.json?.data?.market_prices?.date || null,
        has_stats: mainHasStats,
      },
      checks: {
        baseline_presence_parity:
          localStock.ok &&
          mainStock.ok &&
          hasValue(localClose) === hasValue(mainClose) &&
          localHasStats === mainHasStats,
        v4_local_contract_ok: localV4.ok && v4ContractValid(localV4.json),
      },
    });
  }

  const summary = {
    total: rows.length,
    baseline_presence_parity_ok: rows.filter((r) => r.checks.baseline_presence_parity).length,
    v4_local_contract_ok: rows.filter((r) => r.checks.v4_local_contract_ok).length,
  };

  const report = {
    schema_version: "rv.features-v4.local-main-5ticker-report.v1",
    generated_at: new Date().toISOString(),
    local_base: args.localBase,
    main_base: args.mainBase,
    tickers,
    summary,
    rows,
  };

  const outSsot = path.resolve(ROOT, args.outSsot);
  const outPublish = path.resolve(ROOT, args.outPublish);
  await ensureDirFor(outSsot);
  await ensureDirFor(outPublish);
  const serialized = JSON.stringify(report, null, 2);
  await fs.writeFile(outSsot, serialized, "utf8");
  await fs.writeFile(outPublish, serialized, "utf8");
  console.log(`[v4-local-main] wrote ${outSsot}`);
  console.log(`[v4-local-main] wrote ${outPublish}`);
  console.log(`[v4-local-main] summary ${JSON.stringify(summary)}`);
}

main().catch((err) => {
  console.error("[v4-local-main] failed:", err?.stack || err?.message || String(err));
  process.exit(1);
});
