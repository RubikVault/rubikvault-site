#!/usr/bin/env node
/**
 * stock-insights-v2-parity.mjs
 *
 * Report-first parity checker for:
 * - /api/stock-insights (v1 canonical)
 * - /api/stock-insights-v2 (v2 shadow)
 *
 * Output:
 * - mirrors/features-v2/reports/stock-insights-v2-parity-report.json
 * - public/data/features-v2/reports/stock-insights-v2-parity-report.json
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
    warmup: true,
    strict: false,
    tickers: [],
    indexPath: "public/data/features-v2/stock-insights/index.json",
    outSsot: "mirrors/features-v2/reports/stock-insights-v2-parity-report.json",
    outPublish: "public/data/features-v2/reports/stock-insights-v2-parity-report.json",
  };

  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === "--base-url") out.baseUrl = String(argv[++i] || out.baseUrl);
    else if (a === "--max-tickers") out.maxTickers = Math.max(1, Number(argv[++i] || out.maxTickers));
    else if (a === "--concurrency") out.concurrency = Math.max(1, Number(argv[++i] || out.concurrency));
    else if (a === "--timeout-ms") out.timeoutMs = Math.max(1000, Number(argv[++i] || out.timeoutMs));
    else if (a === "--retries") out.retries = Math.max(0, Number(argv[++i] || out.retries));
    else if (a === "--no-warmup") out.warmup = false;
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

async function ensureDirFor(absFile) {
  await fs.mkdir(path.dirname(absFile), { recursive: true });
}

function hasValue(v) {
  return v !== null && v !== undefined;
}

function normalizeNum(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function numNear(a, b, eps = 1e-9) {
  if (!hasValue(a) && !hasValue(b)) return true;
  const x = normalizeNum(a);
  const y = normalizeNum(b);
  if (!hasValue(x) || !hasValue(y)) return false;
  return Math.abs(x - y) <= eps;
}

function get(obj, p, fallback = undefined) {
  let cur = obj;
  for (const part of p) {
    if (!cur || typeof cur !== "object" || !(part in cur)) return fallback;
    cur = cur[part];
  }
  return cur;
}

async function fetchJson(url, timeoutMs, retries = 0) {
  let last = { ok: false, status: 0, json: null, error: "unknown" };
  for (let attempt = 0; attempt <= retries; attempt += 1) {
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
      if (!retryable || attempt >= retries) return last;
    } catch (err) {
      last = { ok: false, status: 0, json: null, error: String(err?.message || err) };
      if (attempt >= retries) return last;
    } finally {
      clearTimeout(timer);
    }
    await new Promise((r) => setTimeout(r, 300 * (attempt + 1)));
  }
  return last;
}

function v2ContractValid(doc) {
  const c = doc?.v2_contract;
  if (!c || typeof c !== "object") return false;
  for (const f of ["scientific", "forecast", "elliott"]) {
    const row = c[f];
    if (!row || typeof row !== "object") return false;
    for (const k of ["value", "as_of", "source", "status", "reason"]) {
      if (!(k in row)) return false;
    }
  }
  return true;
}

function compareTicker(v1, v2) {
  const issues = [];
  const metrics = {
    presence: { scientific: true, forecast: true, elliott: true },
    values: { scientific: true, forecast: true, elliott: true },
  };

  if (!v2ContractValid(v2)) {
    issues.push("V2_CONTRACT_INVALID");
    metrics.presence.scientific = false;
    metrics.presence.forecast = false;
    metrics.presence.elliott = false;
    metrics.values.scientific = false;
    metrics.values.forecast = false;
    metrics.values.elliott = false;
    return { issues, metrics };
  }

  const features = ["scientific", "forecast", "elliott"];
  for (const f of features) {
    let v1Has = hasValue(v1?.[f]);
    // Scientific has explicit unavailable payload in v1.
    if (f === "scientific") {
      const sciStatus = String(get(v1, ["scientific", "status"], "")).toUpperCase();
      if (sciStatus === "DATA_UNAVAILABLE") v1Has = false;
    }
    const v2State = v2?.v2_contract?.[f] || {};
    const v2Has = Boolean(v2State.value);
    if (v1Has !== v2Has) {
      metrics.presence[f] = false;
      issues.push(`PRESENCE_MISMATCH_${f.toUpperCase()}`);
    }
  }

  // Scientific value parity
  {
    const a = v1?.scientific;
    const b = v2?.scientific;
    if (a && b) {
      const checks = [
        numNear(get(a, ["probability"]), get(b, ["probability"]), 1e-9),
        String(get(a, ["signal_strength"], "")).toUpperCase() === String(get(b, ["signal_strength"], "")).toUpperCase(),
        numNear(get(a, ["setup", "score"]), get(b, ["setup", "score"]), 1e-9),
        numNear(get(a, ["trigger", "score"]), get(b, ["trigger", "score"]), 1e-9),
      ];
      if (!checks.every(Boolean)) {
        metrics.values.scientific = false;
        issues.push("VALUE_MISMATCH_SCIENTIFIC");
      }
    }
  }

  // Forecast value parity
  {
    const a = v1?.forecast;
    const b = v2?.forecast;
    if (a && b) {
      for (const h of ["1d", "5d", "20d"]) {
        const pa = get(a, ["horizons", h, "probability"]);
        const pb = get(b, ["horizons", h, "probability"]);
        const da = String(get(a, ["horizons", h, "direction"], "")).toLowerCase();
        const db = String(get(b, ["horizons", h, "direction"], "")).toLowerCase();
        const ok = numNear(pa, pb, 1e-9) && da === db;
        if (!ok) {
          metrics.values.forecast = false;
          issues.push(`VALUE_MISMATCH_FORECAST_${h.toUpperCase()}`);
        }
      }
    }
  }

  // Elliott value parity
  {
    const a = v1?.elliott;
    const b = v2?.elliott;
    if (a && b) {
      const checks = [
        String(get(a, ["completedPattern", "direction"], "")).toUpperCase() ===
          String(get(b, ["completedPattern", "direction"], "")).toUpperCase(),
        String(get(a, ["developingPattern", "possibleWave"], "")).toUpperCase() ===
          String(get(b, ["developingPattern", "possibleWave"], "")).toUpperCase(),
      ];
      if (!checks.every(Boolean)) {
        metrics.values.elliott = false;
        issues.push("VALUE_MISMATCH_ELLIOTT");
      }
    }
  }

  return { issues, metrics };
}

function buildTickerList(indexDoc, explicitTickers, maxTickers) {
  if (explicitTickers.length) return explicitTickers.slice(0, maxTickers);
  const seeds = ["AAPL", "MSFT", "NVDA", "AMZN", "GOOGL", "META", "TSLA", "SPY", "QQQ", "ROKU"];
  const rows = indexDoc?.rows || {};
  const all = Object.keys(rows).map((s) => s.toUpperCase()).sort();
  const fullCoverage = all.filter((t) => {
    const r = rows[t];
    return Boolean(r?.scientific?.value) && Boolean(r?.forecast?.value) && Boolean(r?.elliott?.value);
  });
  const mixedCoverage = all.filter((t) => {
    const r = rows[t];
    return Boolean(r?.scientific?.value || r?.forecast?.value || r?.elliott?.value);
  });
  const merged = [];
  const seen = new Set();
  for (const t of [...seeds, ...fullCoverage, ...mixedCoverage, ...all]) {
    if (!t || seen.has(t)) continue;
    seen.add(t);
    merged.push(t);
    if (merged.length >= maxTickers) break;
  }
  return merged;
}

async function poolMap(items, limit, fn) {
  const ret = new Array(items.length);
  let i = 0;
  async function worker() {
    while (true) {
      const idx = i;
      i += 1;
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
  const startedAt = new Date().toISOString();

  const idxAbs = path.resolve(ROOT, args.indexPath);
  const idxDoc = await readJsonSafe(idxAbs);
  const tickers = buildTickerList(idxDoc, args.tickers, args.maxTickers);
  const warmup = {
    enabled: Boolean(args.warmup),
    ticker: tickers[0] || null,
    v1_ok: null,
    v2_ok: null,
    notes: [],
  };

  // Warm up heavy caches once to avoid false fetch-failures on first concurrent batch.
  if (warmup.enabled && warmup.ticker) {
    const warmTimeout = Math.max(args.timeoutMs, 45000);
    const t = encodeURIComponent(warmup.ticker);
    const [wv1, wv2] = await Promise.all([
      fetchJson(`${baseUrl}/api/stock-insights?ticker=${t}`, warmTimeout, args.retries),
      fetchJson(`${baseUrl}/api/stock-insights-v2?ticker=${t}`, warmTimeout, args.retries),
    ]);
    warmup.v1_ok = Boolean(wv1.ok && wv1.json);
    warmup.v2_ok = Boolean(wv2.ok && wv2.json);
    if (!warmup.v1_ok) warmup.notes.push(`warmup_v1_failed:${wv1.status || 0}:${wv1.error || "no-json"}`);
    if (!warmup.v2_ok) warmup.notes.push(`warmup_v2_failed:${wv2.status || 0}:${wv2.error || "no-json"}`);
  }

  const rows = await poolMap(tickers, args.concurrency, async (ticker) => {
    const [v1, v2] = await Promise.all([
      fetchJson(`${baseUrl}/api/stock-insights?ticker=${encodeURIComponent(ticker)}`, args.timeoutMs, args.retries),
      fetchJson(`${baseUrl}/api/stock-insights-v2?ticker=${encodeURIComponent(ticker)}`, args.timeoutMs, args.retries),
    ]);
    const entry = {
      ticker,
      v1_ok: Boolean(v1.ok),
      v1_status: Number(v1.status || 0),
      v2_ok: Boolean(v2.ok),
      v2_status: Number(v2.status || 0),
      issues: [],
      metrics: {
        presence: { scientific: false, forecast: false, elliott: false },
        values: { scientific: false, forecast: false, elliott: false },
      },
    };

    if (!v1.ok) entry.issues.push("V1_FETCH_FAILED");
    if (!v2.ok) entry.issues.push("V2_FETCH_FAILED");
    if (!v1.ok && v1.error) entry.v1_error = v1.error;
    if (!v2.ok && v2.error) entry.v2_error = v2.error;
    if (!v1.ok || !v2.ok || !v1.json || !v2.json) {
      return entry;
    }

    const compared = compareTicker(v1.json, v2.json);
    entry.issues.push(...compared.issues);
    entry.metrics = compared.metrics;
    return entry;
  });

  const total = rows.length;
  const endpointsOkTotal = rows.filter((r) => r.v1_ok && r.v2_ok).length;
  const contractOkTotal = rows.filter((r) => !r.issues.includes("V2_CONTRACT_INVALID")).length;
  const noIssueTotal = rows.filter((r) => r.issues.length === 0).length;

  const presenceOk = {
    scientific: rows.filter((r) => r.metrics.presence.scientific).length,
    forecast: rows.filter((r) => r.metrics.presence.forecast).length,
    elliott: rows.filter((r) => r.metrics.presence.elliott).length,
  };
  const valueOk = {
    scientific: rows.filter((r) => r.metrics.values.scientific).length,
    forecast: rows.filter((r) => r.metrics.values.forecast).length,
    elliott: rows.filter((r) => r.metrics.values.elliott).length,
  };

  const issueCounts = {};
  for (const r of rows) {
    for (const i of r.issues) issueCounts[i] = (issueCounts[i] || 0) + 1;
  }
  const topIssues = Object.entries(issueCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 20)
    .map(([code, count]) => ({ code, count }));

  const pct = (n) => (total > 0 ? Number(((n / total) * 100).toFixed(2)) : 0);
  const activationReady =
    total > 0 &&
    endpointsOkTotal === total &&
    contractOkTotal === total &&
    presenceOk.scientific === total &&
    presenceOk.forecast === total &&
    presenceOk.elliott === total &&
    valueOk.scientific === total &&
    valueOk.forecast === total &&
    valueOk.elliott === total;

  const report = {
    schema_version: "rv.stock-insights.v2.parity-report.v1",
    generated_at: new Date().toISOString(),
    started_at: startedAt,
    base_url: baseUrl,
    config: {
      max_tickers: args.maxTickers,
      concurrency: args.concurrency,
      timeout_ms: args.timeoutMs,
      warmup_enabled: Boolean(args.warmup),
      strict: Boolean(args.strict),
      index_path: path.relative(ROOT, idxAbs),
    },
    warmup,
    summary: {
      total_tickers: total,
      endpoints_ok_total: endpointsOkTotal,
      endpoints_ok_ratio_pct: pct(endpointsOkTotal),
      v2_contract_ok_total: contractOkTotal,
      v2_contract_ok_ratio_pct: pct(contractOkTotal),
      no_issue_total: noIssueTotal,
      no_issue_ratio_pct: pct(noIssueTotal),
      presence_ok_total: presenceOk,
      presence_ok_ratio_pct: {
        scientific: pct(presenceOk.scientific),
        forecast: pct(presenceOk.forecast),
        elliott: pct(presenceOk.elliott),
      },
      value_ok_total: valueOk,
      value_ok_ratio_pct: {
        scientific: pct(valueOk.scientific),
        forecast: pct(valueOk.forecast),
        elliott: pct(valueOk.elliott),
      },
      activation_ready: activationReady,
    },
    top_issues: topIssues,
    rows,
  };

  const outSsotAbs = path.resolve(ROOT, args.outSsot);
  const outPubAbs = path.resolve(ROOT, args.outPublish);
  await ensureDirFor(outSsotAbs);
  await ensureDirFor(outPubAbs);
  const json = JSON.stringify(report, null, 2);
  await fs.writeFile(outSsotAbs, json, "utf8");
  await fs.writeFile(outPubAbs, json, "utf8");

  console.log(`[parity] wrote ${outSsotAbs}`);
  console.log(`[parity] wrote ${outPubAbs}`);
  console.log(
    `[parity] total=${total} endpoints_ok=${endpointsOkTotal} contract_ok=${contractOkTotal} no_issue=${noIssueTotal} activation_ready=${activationReady}`
  );
  if (topIssues.length) {
    console.log(
      `[parity] top_issues: ${topIssues.map((x) => `${x.code}:${x.count}`).join(", ")}`
    );
  }

  if (args.strict && !activationReady) {
    process.exit(2);
  }
}

main().catch((err) => {
  console.error(`[parity] failed: ${err?.stack || err?.message || String(err)}`);
  process.exit(1);
});
