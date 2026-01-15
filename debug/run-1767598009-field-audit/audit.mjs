import fs from "node:fs";
import path from "node:path";

const PROD_URL = process.env.PROD_URL;
const PREVIEW_URL = process.env.PREVIEW_URL;
const OUTDIR = process.env.OUTDIR;

if (!PROD_URL || !PREVIEW_URL || !OUTDIR) {
  console.error("ENV_MISSING: PROD_URL/PREVIEW_URL/OUTDIR required");
  process.exit(1);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function fetchJSON(url, headers = {}, timeoutMs = 20000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { headers, signal: ctrl.signal });
    const text = await res.text();
    let json = null;
    try { json = JSON.parse(text); } catch {}
    return { ok: res.ok, status: res.status, headers: Object.fromEntries(res.headers.entries()), text, json };
  } catch (e) {
    return { ok: false, status: 0, headers: {}, text: "", json: null, error: String(e?.message || e) };
  } finally {
    clearTimeout(t);
  }
}

function isObj(x) { return x && typeof x === "object" && !Array.isArray(x); }

function summarizeJSONShape(json) {
  const summary = {
    hasMeta: false,
    metaStatus: null,
    metaReason: null,
    emptyReason: null,
    dataQuality: null,
    cacheLayer: null,
    ttl: null,
    hasData: false,
    hasItems: false,
    itemsCount: null,
    topLevelKeys: [],
  };

  if (!isObj(json)) return summary;

  summary.topLevelKeys = Object.keys(json).sort();
  if (isObj(json.meta)) {
    summary.hasMeta = true;
    summary.metaStatus = json.meta.status ?? null;
    summary.metaReason = json.meta.reason ?? null;
    summary.emptyReason = json.meta.emptyReason ?? json.emptyReason ?? null;
    summary.dataQuality = json.meta.dataQuality ?? json.dataQuality ?? null;
    summary.cacheLayer = json.meta.cache?.layer ?? json.cache?.layer ?? null;
    summary.ttl = json.meta.cache?.ttl ?? json.cache?.ttl ?? null;
  }

  if (isObj(json.data)) {
    summary.hasData = true;
    if (Array.isArray(json.data.items)) {
      summary.hasItems = true;
      summary.itemsCount = json.data.items.length;
    }
  }

  return summary;
}

function collectNullMissingStats(items, maxItems = 50) {
  const stats = new Map();
  const take = Array.isArray(items) ? items.slice(0, maxItems) : [];
  for (const it of take) {
    if (!isObj(it)) continue;
    for (const [k, v] of Object.entries(it)) {
      if (!stats.has(k)) stats.set(k, { seen: 0, nulls: 0, undefineds: 0, types: new Set() });
      const s = stats.get(k);
      s.seen += 1;
      if (v === null) s.nulls += 1;
      if (v === undefined) s.undefineds += 1;
      s.types.add(v === null ? "null" : Array.isArray(v) ? "array" : typeof v);
    }
  }
  return [...stats.entries()]
    .map(([field, s]) => ({
      field,
      seen: s.seen,
      nulls: s.nulls,
      undefineds: s.undefineds,
      types: [...s.types].sort(),
      nullRate: s.seen ? Math.round((s.nulls / s.seen) * 100) : 0,
    }))
    .sort((a, b) => (b.nulls - a.nulls) || a.field.localeCompare(b.field));
}

function classifyIssue(shape, httpStatus, matrixEntry) {
  const metaStatus = shape.metaStatus ?? matrixEntry?.metaStatus ?? null;
  const metaReason = shape.metaReason ?? matrixEntry?.metaReason ?? null;
  const emptyReason = shape.emptyReason ?? matrixEntry?.emptyReason ?? null;
  const dataQuality = shape.dataQuality ?? matrixEntry?.dataQuality ?? null;

  if (!httpStatus || httpStatus === 0) return { bucket: "NETWORK", why: "request_failed/timeout/dns" };
  if (httpStatus >= 500) return { bucket: "SERVER_5XX", why: "server_error" };

  if (metaStatus === "ERROR") {
    if (metaReason === "UPSTREAM_4XX" || emptyReason === "UPSTREAM_AUTH") return { bucket: "AUTH_UPSTREAM", why: "missing_key/plan/blocked" };
    return { bucket: "META_ERROR", why: metaReason || "meta_status_error" };
  }

  if (emptyReason === "THRESHOLD_TOO_STRICT") return { bucket: "THRESHOLD", why: "gates/thresholds filter everything out" };
  if (emptyReason === "CACHE_EMPTY") return { bucket: "CACHE_EMPTY", why: "cache empty + no live fill" };
  if (emptyReason === "EVENT_NO_EVENTS") return { bucket: "LEGIT_EMPTY", why: "no events right now (valid empty)" };

  if (metaStatus === "STALE") {
    if (metaReason === "MIRROR_FALLBACK") return { bucket: "STALE_MIRROR", why: "mirror fallback used; mirror possibly stale/empty" };
    return { bucket: "STALE", why: "stale data not refreshed" };
  }

  if (dataQuality === "NO_SOURCE") return { bucket: "NO_SOURCE", why: "no provider configured/available" };
  if (dataQuality === "COVERAGE_LIMIT") return { bucket: "COVERAGE_LIMIT", why: "coverage restricted (likely auth/plan/rate-limit)" };

  if (shape.hasItems && (shape.itemsCount ?? 0) === 0) return { bucket: "EMPTY_ITEMS", why: emptyReason || "items empty" };

  return { bucket: "OK_OR_PARTIAL", why: "" };
}

async function getMatrix(baseUrl) {
  const u = new URL("/api/debug-matrix", baseUrl);
  u.searchParams.set("_", String(Date.now()));
  const r = await fetchJSON(u.toString(), {});
  if (!r.json || !r.json.data || !Array.isArray(r.json.data.entries)) {
    return { ok: false, status: r.status, error: "debug-matrix shape invalid", raw: r.text.slice(0, 2000) };
  }
  return { ok: true, status: r.status, entries: r.json.data.entries };
}

async function auditOneEnv(envName, baseUrl, entries) {
  const out = [];
  const endpoints = entries
    .filter(e => e && typeof e.endpoint === "string" && e.endpoint.startsWith("/api/"))
    .map(e => ({ feature: e.feature, endpoint: e.endpoint, matrix: e }))
    .sort((a, b) => a.endpoint.localeCompare(b.endpoint));

  const seen = new Set();
  const uniq = [];
  for (const x of endpoints) {
    const key = `${x.endpoint}::${x.feature}`;
    if (seen.has(key)) continue;
    seen.add(key);
    uniq.push(x);
  }

  const concurrency = 6;
  let idx = 0;

  async function worker() {
    while (idx < uniq.length) {
      const i = idx++;
      const { feature, endpoint, matrix } = uniq[i];
      const u = new URL(endpoint, baseUrl);
      u.searchParams.set("_", String(Date.now()));
      u.searchParams.set("debug", "1");

      const res = await fetchJSON(u.toString(), {});
      const shape = res.json ? summarizeJSONShape(res.json) : summarizeJSONShape(null);

      let itemFieldStats = [];
      if (res.json && res.json.data && Array.isArray(res.json.data.items)) {
        itemFieldStats = collectNullMissingStats(res.json.data.items, 50);
      }

      const cls = classifyIssue(shape, res.status, matrix);

      const record = {
        env: envName,
        feature: feature || matrix?.feature || null,
        endpoint,
        httpStatus: res.status,
        httpOk: !!res.ok,
        contentType: res.headers?.["content-type"] || null,
        matrixMetaStatus: matrix?.metaStatus ?? null,
        matrixMetaReason: matrix?.metaReason ?? null,
        matrixEmptyReason: matrix?.emptyReason ?? null,
        matrixDataQuality: matrix?.dataQuality ?? null,
        shape,
        classification: cls,
        itemFieldStatsTop: itemFieldStats.filter(s => s.nulls > 0 || s.undefineds > 0).slice(0, 30),
        sample: (() => {
          if (!res.json) return null;
          const s = { meta: res.json.meta ?? null, data: null };
          if (res.json.data && Array.isArray(res.json.data.items)) {
            s.data = { items: res.json.data.items.slice(0, 3) };
          } else {
            s.data = res.json.data ?? null;
          }
          return s;
        })(),
        error: res.error || null,
      };

      out.push(record);

      await sleep(50);
    }
  }

  const workers = Array.from({ length: concurrency }, () => worker());
  await Promise.all(workers);

  return out.sort((a, b) => a.endpoint.localeCompare(b.endpoint));
}

function mdTable(rows, cols) {
  const head = `| ${cols.join(" | ")} |`;
  const sep = `| ${cols.map(() => "---").join(" | ")} |`;
  const body = rows.map(r => `| ${cols.map(c => (r[c] ?? "")).join(" | ")} |`);
  return [head, sep, ...body].join("\n");
}

function toKeyIssues(records) {
  const problems = records
    .filter(r => r.classification.bucket !== "OK_OR_PARTIAL")
    .map(r => ({
      env: r.env,
      feature: r.feature,
      endpoint: r.endpoint,
      bucket: r.classification.bucket,
      why: r.classification.why,
      http: r.httpStatus,
      metaStatus: r.shape.metaStatus ?? "",
      metaReason: r.shape.metaReason ?? "",
      emptyReason: r.shape.emptyReason ?? "",
      cacheLayer: r.shape.cacheLayer ?? "",
      ttl: r.shape.ttl ?? "",
      items: r.shape.itemsCount ?? "",
    }));
  return problems;
}

function groupCounts(records, keyFn) {
  const m = new Map();
  for (const r of records) {
    const k = keyFn(r);
    m.set(k, (m.get(k) || 0) + 1);
  }
  return [...m.entries()].sort((a, b) => b[1] - a[1]).map(([k, v]) => ({ key: k, count: v }));
}

async function main() {
  const prodM = await getMatrix(PROD_URL);
  const prevM = await getMatrix(PREVIEW_URL);

  const report = {
    generatedAt: new Date().toISOString(),
    prod: { matrixOk: prodM.ok, matrixStatus: prodM.status, matrixError: prodM.error || null, records: [] },
    preview: { matrixOk: prevM.ok, matrixStatus: prevM.status, matrixError: prevM.error || null, records: [] },
  };

  if (!prodM.ok) {
    report.prod.matrixRaw = prodM.raw || null;
  } else {
    report.prod.records = await auditOneEnv("prod", PROD_URL, prodM.entries);
  }

  if (!prevM.ok) {
    report.preview.matrixRaw = prevM.raw || null;
  } else {
    report.preview.records = await auditOneEnv("preview", PREVIEW_URL, prevM.entries);
  }

  const all = [...(report.prod.records || []), ...(report.preview.records || [])];

  const keyIssues = toKeyIssues(all);
  const byBucket = groupCounts(keyIssues, r => r.bucket);
  const byWhy = groupCounts(keyIssues, r => `${r.bucket}:${r.why}`);

  const md = [];
  md.push(`# RubikVault Field/Block Audit`);
  md.push(`Generated: ${report.generatedAt}`);
  md.push(``);
  md.push(`## Matrix health`);
  md.push(`- PROD matrix ok: ${report.prod.matrixOk} (status ${report.prod.matrixStatus})`);
  md.push(`- PREVIEW matrix ok: ${report.preview.matrixOk} (status ${report.preview.matrixStatus})`);
  md.push(``);
  md.push(`## Problem buckets (prod+preview)`);
  md.push(mdTable(byBucket, ["key", "count"]));
  md.push(``);
  md.push(`## Top reasons`);
  md.push(mdTable(byWhy.slice(0, 20), ["key", "count"]));
  md.push(``);
  md.push(`## Actionable issues (per endpoint)`);
  md.push(mdTable(keyIssues.slice(0, 200), [
    "env","feature","endpoint","bucket","why","http","metaStatus","metaReason","emptyReason","cacheLayer","ttl","items"
  ]));
  md.push(``);
  md.push(`## Field null/missing hot spots (top 25 endpoints with field issues)`);
  const withFieldIssues = all
    .filter(r => Array.isArray(r.itemFieldStatsTop) && r.itemFieldStatsTop.length > 0)
    .map(r => ({
      env: r.env,
      feature: r.feature,
      endpoint: r.endpoint,
      topField: r.itemFieldStatsTop[0]?.field || "",
      nulls: r.itemFieldStatsTop[0]?.nulls ?? "",
      nullRatePct: r.itemFieldStatsTop[0]?.nullRate ?? "",
      types: (r.itemFieldStatsTop[0]?.types || []).join(","),
    }))
    .slice(0, 25);
  md.push(mdTable(withFieldIssues, ["env","feature","endpoint","topField","nulls","nullRatePct","types"]));
  md.push(``);
  md.push(`---`);
  md.push(`Raw JSON report: field-report.json`);

  fs.writeFileSync(path.join(OUTDIR, "field-report.json"), JSON.stringify(report, null, 2));
  fs.writeFileSync(path.join(OUTDIR, "field-report.md"), md.join("\n") + "\n");

  const concise = {
    generatedAt: report.generatedAt,
    prod: {
      matrixOk: report.prod.matrixOk,
      total: report.prod.records?.length || 0,
      buckets: groupCounts(toKeyIssues(report.prod.records || []), r => r.bucket),
    },
    preview: {
      matrixOk: report.preview.matrixOk,
      total: report.preview.records?.length || 0,
      buckets: groupCounts(toKeyIssues(report.preview.records || []), r => r.bucket),
    },
  };
  console.log(JSON.stringify(concise, null, 2));
}

main().catch((e) => {
  console.error("AUDIT_FAILED:", e);
  process.exit(1);
});
