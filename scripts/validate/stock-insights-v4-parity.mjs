#!/usr/bin/env node
/**
 * stock-insights-v4-parity.mjs
 *
 * Report-first checker for:
 * - /api/stock-insights (v1 canonical)
 * - /api/stock-insights-v2 (v2 shadow)
 * - /api/stock-insights-v4 (v4 shadow)
 *
 * Output:
 * - mirrors/features-v4/reports/stock-insights-v4-parity-report.json
 * - public/data/features-v4/reports/stock-insights-v4-parity-report.json
 */

import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "../..");

function parseArgs(argv) {
  const out = {
    baseUrl: process.env.RV_PARITY_BASE || "http://127.0.0.1:8788",
    maxTickers: 120,
    concurrency: 8,
    timeoutMs: 30000,
    retries: 2,
    strict: false,
    tickers: [],
    indexPath: "public/data/features-v4/stock-insights/index.json",
    outSsot: "mirrors/features-v4/reports/stock-insights-v4-parity-report.json",
    outPublish: "public/data/features-v4/reports/stock-insights-v4-parity-report.json",
  };

  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === "--base-url") out.baseUrl = String(argv[++i] || out.baseUrl);
    else if (a === "--max-tickers") out.maxTickers = Math.max(1, Number(argv[++i] || out.maxTickers));
    else if (a === "--concurrency") out.concurrency = Math.max(1, Number(argv[++i] || out.concurrency));
    else if (a === "--timeout-ms") out.timeoutMs = Math.max(1000, Number(argv[++i] || out.timeoutMs));
    else if (a === "--retries") out.retries = Math.max(0, Number(argv[++i] || out.retries));
    else if (a === "--tickers") out.tickers = String(argv[++i] || "").split(",").map((s) => s.trim().toUpperCase()).filter(Boolean);
    else if (a === "--index-path") out.indexPath = String(argv[++i] || out.indexPath);
    else if (a === "--out-ssot") out.outSsot = String(argv[++i] || out.outSsot);
    else if (a === "--out-publish") out.outPublish = String(argv[++i] || out.outPublish);
    else if (a === "--strict") out.strict = true;
  }
  return out;
}

async function readJsonSafe(absPath) {
  try {
    const raw = await fs.readFile(absPath, "utf8");
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

async function ensureDirFor(absPath) {
  await fs.mkdir(path.dirname(absPath), { recursive: true });
}

function hasValue(v) {
  return v !== null && v !== undefined;
}

function toNum(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function numNear(a, b, eps = 1e-9) {
  if (!hasValue(a) && !hasValue(b)) return true;
  const x = toNum(a);
  const y = toNum(b);
  if (!hasValue(x) || !hasValue(y)) return false;
  return Math.abs(x - y) <= eps;
}

async function fetchJson(url, timeoutMs, retries = 0) {
  let last = { ok: false, status: 0, json: null, error: "unknown" };
  for (let i = 0; i <= retries; i += 1) {
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
      last = { ok: res.ok, status: res.status, json, bodyText: txt };
      if (res.ok) return last;
      const retryable = res.status >= 500 || res.status === 429;
      if (!retryable || i >= retries) return last;
    } catch (err) {
      last = { ok: false, status: 0, json: null, error: String(err?.message || err) };
      if (i >= retries) return last;
    } finally {
      clearTimeout(timer);
    }
    await new Promise((r) => setTimeout(r, 300 * (i + 1)));
  }
  return last;
}

function isStateRow(row) {
  if (!row || typeof row !== "object") return false;
  for (const k of ["value", "as_of", "source", "status", "reason"]) {
    if (!(k in row)) return false;
  }
  return true;
}

function v4ContractValid(doc) {
  const c = doc?.v4_contract;
  if (!c || typeof c !== "object") return false;
  const core = ["scientific", "forecast", "elliott"];
  for (const f of core) {
    if (!isStateRow(c[f])) return false;
  }
  for (const f of ["raw_validation", "outcome_labels", "scientific_eligibility", "fallback_state", "timeframe_confluence", "decision_trace"]) {
    if (!isStateRow(c[f])) return false;
  }
  return true;
}

function compareTicker(v1, v2, v4) {
  const issues = [];
  const checks = {
    v4_contract_ok: true,
    core_presence_parity: true,
    core_value_parity: true,
    fallback_confidence_cap_ok: true,
  };

  if (!v4ContractValid(v4)) {
    checks.v4_contract_ok = false;
    checks.core_presence_parity = false;
    checks.core_value_parity = false;
    checks.fallback_confidence_cap_ok = false;
    issues.push("V4_CONTRACT_INVALID");
    return { issues, checks };
  }

  for (const f of ["scientific", "forecast", "elliott"]) {
    let v1Has = hasValue(v1?.[f]);
    if (f === "scientific" && String(v1?.scientific?.status || "").toUpperCase() === "DATA_UNAVAILABLE") {
      v1Has = false;
    }
    const v2Has = Boolean(v2?.v2_contract?.[f]?.value);
    const v4Has = Boolean(v4?.v4_contract?.[f]?.value);
    if (!(v1Has === v2Has && v2Has === v4Has)) {
      checks.core_presence_parity = false;
      issues.push(`PRESENCE_MISMATCH_${f.toUpperCase()}`);
    }
  }

  if (v1?.forecast && v4?.forecast) {
    for (const h of ["1d", "5d", "20d"]) {
      const pa = v1?.forecast?.horizons?.[h]?.probability;
      const pb = v4?.forecast?.horizons?.[h]?.probability;
      const da = String(v1?.forecast?.horizons?.[h]?.direction || "").toLowerCase();
      const db = String(v4?.forecast?.horizons?.[h]?.direction || "").toLowerCase();
      if (!numNear(pa, pb, 1e-9) || da !== db) {
        checks.core_value_parity = false;
        issues.push(`VALUE_MISMATCH_FORECAST_${h.toUpperCase()}`);
      }
    }
  }
  if (v1?.scientific && v4?.scientific) {
    const s1 = toNum(v1?.scientific?.setup?.score);
    const s4 = toNum(v4?.scientific?.setup?.score);
    if (!numNear(s1, s4, 1e-9)) {
      checks.core_value_parity = false;
      issues.push("VALUE_MISMATCH_SCIENTIFIC_SETUP");
    }
  }

  const fallbackConfidence = String(v4?.v4_contract?.fallback_state?.value?.confidence || "").toUpperCase();
  if (fallbackConfidence && !["LOW", "MEDIUM"].includes(fallbackConfidence)) {
    checks.fallback_confidence_cap_ok = false;
    issues.push("FALLBACK_CONFIDENCE_ABOVE_MEDIUM");
  }

  return { issues, checks };
}

function buildTickerList(indexDoc, explicitTickers, maxTickers) {
  if (explicitTickers.length) return explicitTickers.slice(0, maxTickers);
  const seeds = ["AAPL", "MSFT", "NVDA", "AMZN", "GOOGL", "META", "TSLA", "ROKU", "IWM", "SPY"];
  const all = Object.keys(indexDoc?.rows || {}).map((s) => s.toUpperCase()).sort();
  const merged = [];
  const seen = new Set();
  for (const t of [...seeds, ...all]) {
    if (!t || seen.has(t)) continue;
    seen.add(t);
    merged.push(t);
    if (merged.length >= maxTickers) break;
  }
  return merged;
}

async function poolMap(items, limit, fn) {
  const ret = new Array(items.length);
  let cursor = 0;
  async function worker() {
    while (true) {
      const idx = cursor;
      cursor += 1;
      if (idx >= items.length) return;
      ret[idx] = await fn(items[idx], idx);
    }
  }
  const workers = Array.from({ length: Math.min(limit, items.length) }, () => worker());
  await Promise.all(workers);
  return ret;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const baseUrl = String(args.baseUrl || "").replace(/\/+$/, "");
  const idxPath = path.resolve(ROOT, args.indexPath);
  const idxDoc = await readJsonSafe(idxPath);
  const tickers = buildTickerList(idxDoc, args.tickers, args.maxTickers);

  const startedAt = new Date().toISOString();
  const rows = await poolMap(tickers, args.concurrency, async (ticker) => {
    const [v1, v2, v4] = await Promise.all([
      fetchJson(`${baseUrl}/api/stock-insights?ticker=${encodeURIComponent(ticker)}`, args.timeoutMs, args.retries),
      fetchJson(`${baseUrl}/api/stock-insights-v2?ticker=${encodeURIComponent(ticker)}`, args.timeoutMs, args.retries),
      fetchJson(`${baseUrl}/api/stock-insights-v4?ticker=${encodeURIComponent(ticker)}`, args.timeoutMs, args.retries),
    ]);

    const endpointOk = v1.ok && v2.ok && v4.ok;
    let compare = {
      issues: ["ENDPOINT_ERROR"],
      checks: {
        v4_contract_ok: false,
        core_presence_parity: false,
        core_value_parity: false,
        fallback_confidence_cap_ok: false,
      },
    };
    if (endpointOk) compare = compareTicker(v1.json, v2.json, v4.json);

    return {
      ticker,
      endpoint_ok: endpointOk,
      status: endpointOk ? "ok" : "error",
      http: {
        v1: v1.status,
        v2: v2.status,
        v4: v4.status,
      },
      checks: compare.checks,
      issues: compare.issues,
    };
  });

  const summary = {
    total: rows.length,
    endpoints_ok: rows.filter((r) => r.endpoint_ok).length,
    v4_contract_ok: rows.filter((r) => r.checks.v4_contract_ok).length,
    core_presence_parity_ok: rows.filter((r) => r.checks.core_presence_parity).length,
    core_value_parity_ok: rows.filter((r) => r.checks.core_value_parity).length,
    fallback_confidence_cap_ok: rows.filter((r) => r.checks.fallback_confidence_cap_ok).length,
    no_issue: rows.filter((r) => r.issues.length === 0).length,
  };
  summary.activation_ready =
    summary.total > 0 &&
    summary.endpoints_ok === summary.total &&
    summary.v4_contract_ok === summary.total &&
    summary.core_presence_parity_ok === summary.total &&
    summary.core_value_parity_ok === summary.total &&
    summary.fallback_confidence_cap_ok === summary.total;

  const report = {
    schema_version: "rv.features-v4.stock-insights.parity-report.v1",
    generated_at: new Date().toISOString(),
    started_at: startedAt,
    base_url: baseUrl,
    args,
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

  console.log(`[v4-parity] wrote ${outSsot}`);
  console.log(`[v4-parity] wrote ${outPublish}`);
  console.log(`[v4-parity] summary ${JSON.stringify(summary)}`);

  if (args.strict && !summary.activation_ready) {
    process.exit(2);
  }
}

main().catch((err) => {
  console.error("[v4-parity] failed:", err?.stack || err?.message || String(err));
  process.exit(1);
});
