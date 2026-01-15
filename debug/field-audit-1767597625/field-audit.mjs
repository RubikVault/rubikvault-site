import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const REPO = process.cwd();
const OUTDIR = process.env.OUTDIR;
const PROD_URL = process.env.PROD_URL;
const PREVIEW_URL = process.env.PREVIEW_URL;
const TS = process.env.TS;

const DEBUG_TOKEN = process.env.RV_DEBUG_TOKEN || process.env.DEBUG_TOKEN || "";

function nowISO() { return new Date().toISOString(); }

function safeJsonParse(txt) {
  try { return { ok: true, value: JSON.parse(txt) }; }
  catch (e) { return { ok: false, error: String(e), raw: txt?.slice?.(0, 4000) ?? "" }; }
}

function isObj(x) { return x && typeof x === "object" && !Array.isArray(x); }

function collectPaths(x, prefix = "", out = new Map()) {
  const add = (p, t) => {
    const cur = out.get(p);
    if (!cur) out.set(p, new Set([t]));
    else cur.add(t);
  };

  if (x === null) { add(prefix || "$", "null"); return out; }
  if (Array.isArray(x)) {
    add(prefix || "$", "array");
    const sample = x.slice(0, 10);
    for (let i = 0; i < sample.length; i++) collectPaths(sample[i], `${prefix}[${i}]`, out);
    return out;
  }
  const t = typeof x;
  if (t !== "object") { add(prefix || "$", t); return out; }

  add(prefix || "$", "object");
  for (const [k, v] of Object.entries(x)) {
    const p = prefix ? `${prefix}.${k}` : k;
    collectPaths(v, p, out);
  }
  return out;
}

function flattenTypes(map) {
  const obj = {};
  for (const [k, set] of map.entries()) obj[k] = Array.from(set.values()).sort();
  return obj;
}

function get(obj, p) {
  if (!obj) return undefined;
  const parts = p.split(".");
  let cur = obj;
  for (const part of parts) {
    if (!isObj(cur)) return undefined;
    cur = cur[part];
  }
  return cur;
}

function countNullsInArrayItems(items, maxItems = 50) {
  const nulls = new Map();
  const n = Math.min(items.length, maxItems);
  for (let i = 0; i < n; i++) {
    const it = items[i];
    if (!isObj(it)) continue;
    for (const [k, v] of Object.entries(it)) {
      if (v === null || v === undefined) {
        nulls.set(k, (nulls.get(k) || 0) + 1);
      }
    }
  }
  return Object.fromEntries([...nulls.entries()].sort((a,b)=>b[1]-a[1]));
}

async function fetchJson(base, endpoint) {
  const url = new URL(base + endpoint);
  url.searchParams.set("_", TS);
  url.searchParams.set("debug", "1");

  const headers = {};
  if (DEBUG_TOKEN) headers["x-rv-debug-token"] = DEBUG_TOKEN;

  const t0 = Date.now();
  const res = await fetch(url, { headers });
  const ms = Date.now() - t0;

  const text = await res.text();
  const parsed = safeJsonParse(text);

  return {
    url: url.toString(),
    httpStatus: res.status,
    elapsedMs: ms,
    headersSent: Object.keys(headers),
    parsedOk: parsed.ok,
    json: parsed.ok ? parsed.value : null,
    parseError: parsed.ok ? null : parsed.error,
  };
}

async function loadRegistry() {
  // Try a set of known-ish candidates. We pick the first module that yields a plausible array of blocks.
  const candidates = [
    "features/blocks-registry.js",
    "features/blocks-registry-live.js",
    "features/blocks-registry-continuous.js",
    "rv-config.js",
  ];

  for (const rel of candidates) {
    const abs = path.join(REPO, rel);
    if (!fs.existsSync(abs)) continue;

    try {
      const mod = await import(pathToFileURL(abs).href);
      const arrays = [];

      if (Array.isArray(mod.default)) arrays.push(mod.default);
      for (const v of Object.values(mod)) if (Array.isArray(v)) arrays.push(v);

      // Pick first plausible array of objects that mention api/endpoint/module/feature/id
      for (const arr of arrays) {
        if (!arr?.length) continue;
        const o = arr[0];
        if (!isObj(o)) continue;
        const keys = Object.keys(o);
        const plausible = keys.some(k => ["api","endpoint","path","url","feature","id","module","ui"].includes(k));
        if (!plausible) continue;

        const norm = arr
          .filter(isObj)
          .map((b) => {
            const feature = String(b.feature ?? b.id ?? b.key ?? b.name ?? "");
            const endpoint = String(b.endpoint ?? b.api ?? b.path ?? b.url ?? "");
            const module = String(b.module ?? b.ui ?? b.component ?? "");
            return { feature, endpoint, module, raw: b };
          })
          .filter(x => x.endpoint.startsWith("/api/") && x.feature);

        if (norm.length) {
          return { source: rel, blocks: norm };
        }
      }
    } catch (e) {
      // ignore and try next
    }
  }

  throw new Error("REGISTRY_LOAD_FAILED: no candidate module produced a usable /api/ registry");
}

function classify(entry) {
  // Conservative: anything not clearly OK becomes actionable.
  const j = entry?.json;
  const metaStatus = j?.meta?.status ?? null;
  const metaReason = j?.meta?.reason ?? j?.meta?.metaReason ?? null;

  const httpStatus = entry.httpStatus;
  const ok = Boolean(j?.ok ?? (httpStatus >= 200 && httpStatus < 300));
  const dataQuality = j?.dataQuality ?? j?.meta?.dataQuality ?? null;
  const emptyReason = j?.emptyReason ?? j?.meta?.emptyReason ?? null;

  const upstreamStatus = j?.upstream?.status ?? j?.upstreamStatus ?? null;

  const data = j?.data ?? null;
  let itemsCount = null;
  if (Array.isArray(data)) itemsCount = data.length;
  else if (isObj(data) && Array.isArray(data.items)) itemsCount = data.items.length;

  // Bucket
  let bucket = "OK";
  if (httpStatus === 401 || httpStatus === 403 || upstreamStatus === 401 || upstreamStatus === 403) bucket = "AUTH";
  else if (metaStatus === "ERROR" || !ok || httpStatus >= 500) bucket = "ERROR";
  else if (metaStatus === "STALE" || metaReason === "STALE") bucket = "STALE";
  else if (metaReason === "MIRROR_FALLBACK") bucket = "MIRROR_FALLBACK";
  else if (emptyReason === "THRESHOLD_TOO_STRICT") bucket = "THRESHOLD_TOO_STRICT";
  else if (emptyReason === "CACHE_EMPTY") bucket = "CACHE_EMPTY";
  else if (dataQuality === "NO_DATA" || dataQuality === "PARTIAL" || dataQuality === "NO_SOURCE" || dataQuality === "COVERAGE_LIMIT") bucket = String(dataQuality);

  return { metaStatus, metaReason, ok, dataQuality, emptyReason, upstreamStatus, itemsCount, bucket };
}

function diffTypeMaps(a, b) {
  const diffs = [];
  const keys = new Set([...Object.keys(a || {}), ...Object.keys(b || {})]);
  for (const k of Array.from(keys).sort()) {
    const ta = a?.[k] ? a[k].join("|") : null;
    const tb = b?.[k] ? b[k].join("|") : null;
    if (ta !== tb) diffs.push({ path: k, prod: ta, preview: tb });
  }
  return diffs;
}

function summarizeFixHints(bucket, cls) {
  switch (bucket) {
    case "AUTH":
      return "UPSTREAM_AUTH: Provider verlangt Key/Plan oder Secret fehlt/ist falsch. Fix: Secret prüfen, Provider-Fallback aktivieren, oder Block als COVERAGE_LIMIT kennzeichnen.";
    case "THRESHOLD_TOO_STRICT":
      return "EMPTY_DATA durch zu harte Gates: Thresholds lockern oder Fallback-Universe/Proxy nutzen; zusätzlich Mirror/Snapshot verwenden damit UI nie leer ist.";
    case "CACHE_EMPTY":
      return "CACHE_EMPTY: Erstbefüllung fehlt oder Cache-Layer 'none' weil Binding/WriteMode/Key falsch. Fix: KV-Key-Pfade prüfen, Seeder/Mirror laufen lassen.";
    case "MIRROR_FALLBACK":
      return "MIRROR_FALLBACK: Live-Provider limitiert/leer → Mirror wird genutzt. Fix: Mirror-Workflow stabilisieren + Stale-Markierung korrekt halten.";
    case "STALE":
      return "STALE: Daten sind alt. Fix: TTL/Cadence der Mirrors erhöhen, Stale-Schwellen definieren, Seed/Refresh Cron reparieren.";
    case "ERROR":
      return "ERROR: meta.status=ERROR oder http>=500. Fix: Envelope/meta robust machen, Exceptions in endpoint abfangen, Debug-Bundle prüfen.";
    case "NO_SOURCE":
      return "NO_SOURCE: Kein Upstream erreicht. Fix: Provider-Route prüfen, DNS/CORS, Fallback-Provider hinzufügen.";
    case "COVERAGE_LIMIT":
      return "COVERAGE_LIMIT: Free-Tier / Region / Plan-Limit. Fix: anderen kostenlosen Provider / Proxy / reduzierte Coverage.";
    case "NO_DATA":
      return "NO_DATA: legit leer (keine Events) ODER Query zu eng. Fix: Wenn legit → als OK/NO_DATA markieren; sonst Query/Window erweitern.";
    case "PARTIAL":
      return "PARTIAL: Teilabdeckung. Fix: MissingSymbols reduzieren, zweite Quelle ergänzen, oder UI als PARTIAL akzeptieren statt BAD.";
    default:
      return "OK oder keine klare Action nötig.";
  }
}

async function main() {
  const meta = {
    generatedAt: nowISO(),
    repo: REPO,
    prod: PROD_URL,
    preview: PREVIEW_URL,
    debugTokenProvided: Boolean(DEBUG_TOKEN),
  };

  const reg = await loadRegistry();
  const blocks = reg.blocks;

  const results = [];
  for (const b of blocks) {
    const [prod, preview] = await Promise.all([
      fetchJson(PROD_URL, b.endpoint),
      fetchJson(PREVIEW_URL, b.endpoint),
    ]);

    const prodCls = classify(prod);
    const previewCls = classify(preview);

    const prodTypes = prod.json ? flattenTypes(collectPaths({ meta: prod.json.meta ?? null, data: prod.json.data ?? null })) : {};
    const previewTypes = preview.json ? flattenTypes(collectPaths({ meta: preview.json.meta ?? null, data: preview.json.data ?? null })) : {};
    const typeDiffs = diffTypeMaps(prodTypes, previewTypes).slice(0, 120);

    const prodItems = (prod.json?.data?.items && Array.isArray(prod.json.data.items)) ? prod.json.data.items : (Array.isArray(prod.json?.data) ? prod.json.data : []);
    const previewItems = (preview.json?.data?.items && Array.isArray(preview.json.data.items)) ? preview.json.data.items : (Array.isArray(preview.json?.data) ? preview.json.data : []);

    const prodNulls = Array.isArray(prodItems) && prodItems.length ? countNullsInArrayItems(prodItems) : {};
    const previewNulls = Array.isArray(previewItems) && previewItems.length ? countNullsInArrayItems(previewItems) : {};

    results.push({
      feature: b.feature,
      endpoint: b.endpoint,
      module: b.module,
      registrySource: reg.source,
      prod: { ...prodCls, httpStatus: prod.httpStatus, elapsedMs: prod.elapsedMs, parsedOk: prod.parsedOk, parseError: prod.parseError },
      preview: { ...previewCls, httpStatus: preview.httpStatus, elapsedMs: preview.elapsedMs, parsedOk: preview.parsedOk, parseError: preview.parseError },
      fieldDiffs: typeDiffs,
      prodNullsTop: prodNulls,
      previewNullsTop: previewNulls,
      fixHint: summarizeFixHints(prodCls.bucket === "OK" ? previewCls.bucket : prodCls.bucket, prodCls.bucket === "OK" ? previewCls : prodCls),
      rawUrls: { prod: prod.url, preview: preview.url },
    });
  }

  // Bucket counts (prod + preview)
  function bucketCounts(envKey) {
    const m = new Map();
    for (const r of results) {
      const b = r[envKey]?.bucket ?? "UNKNOWN";
      m.set(b, (m.get(b) || 0) + 1);
    }
    return Object.fromEntries([...m.entries()].sort((a,b)=>b[1]-a[1]));
  }

  const summary = {
    registrySource: reg.source,
    blocks: results.length,
    prodBuckets: bucketCounts("prod"),
    previewBuckets: bucketCounts("preview"),
  };

  const outJson = { meta, summary, results };
  const jsonPath = path.join(OUTDIR, "field-report.json");
  fs.writeFileSync(jsonPath, JSON.stringify(outJson, null, 2), "utf8");

  // Markdown report
  const md = [];
  md.push(`# RubikVault Field Audit`);
  md.push(`- Generated: ${meta.generatedAt}`);
  md.push(`- Registry: ${reg.source}`);
  md.push(`- PROD: ${PROD_URL}`);
  md.push(`- PREVIEW: ${PREVIEW_URL}`);
  md.push(`- Debug token provided: ${meta.debugTokenProvided}`);
  md.push(``);
  md.push(`## Bucket counts (PROD)`);
  md.push("```json");
  md.push(JSON.stringify(summary.prodBuckets, null, 2));
  md.push("```");
  md.push(`## Bucket counts (PREVIEW)`);
  md.push("```json");
  md.push(JSON.stringify(summary.previewBuckets, null, 2));
  md.push("```");

  md.push(`## Per endpoint (most actionable first)`);
  const orderScore = (r) => {
    const bad = ["ERROR","AUTH","MIRROR_FALLBACK","STALE","THRESHOLD_TOO_STRICT","CACHE_EMPTY","NO_SOURCE","COVERAGE_LIMIT","PARTIAL","NO_DATA"];
    const p = bad.indexOf(r.prod.bucket);
    const q = bad.indexOf(r.preview.bucket);
    const pp = p === -1 ? 999 : p;
    const qq = q === -1 ? 999 : q;
    return Math.min(pp, qq);
  };

  const sorted = results.slice().sort((a,b)=>orderScore(a)-orderScore(b));

  for (const r of sorted) {
    md.push(`### ${r.feature}`);
    md.push(`- endpoint: \`${r.endpoint}\``);
    md.push(`- module: \`${r.module || "?"}\``);
    md.push(`- PROD: http=${r.prod.httpStatus} bucket=${r.prod.bucket} metaStatus=${r.prod.metaStatus ?? "—"} metaReason=${r.prod.metaReason ?? "—"} emptyReason=${r.prod.emptyReason ?? "—"} items=${r.prod.itemsCount ?? "—"}`);
    md.push(`- PREVIEW: http=${r.preview.httpStatus} bucket=${r.preview.bucket} metaStatus=${r.preview.metaStatus ?? "—"} metaReason=${r.preview.metaReason ?? "—"} emptyReason=${r.preview.emptyReason ?? "—"} items=${r.preview.itemsCount ?? "—"}`);
    md.push(`- fix hint: ${r.fixHint}`);
    if (r.fieldDiffs?.length) {
      md.push(`- field/type diffs (prod vs preview, sample):`);
      md.push("```json");
      md.push(JSON.stringify(r.fieldDiffs.slice(0, 40), null, 2));
      md.push("```");
    } else {
      md.push(`- field/type diffs: none detected (meta+data shapes align)`);
    }
    const pn = Object.keys(r.prodNullsTop || {}).slice(0, 10);
    const qn = Object.keys(r.previewNullsTop || {}).slice(0, 10);
    if (pn.length) {
      md.push(`- PROD null/undefined hotspots (top):`);
      md.push("```json");
      md.push(JSON.stringify(Object.fromEntries(pn.map(k => [k, r.prodNullsTop[k]])), null, 2));
      md.push("```");
    }
    if (qn.length) {
      md.push(`- PREVIEW null/undefined hotspots (top):`);
      md.push("```json");
      md.push(JSON.stringify(Object.fromEntries(qn.map(k => [k, r.previewNullsTop[k]])), null, 2));
      md.push("```");
    }
    md.push(`- raw: prod=${r.rawUrls.prod}`);
    md.push(`- raw: preview=${r.rawUrls.preview}`);
    md.push(``);
  }

  const mdPath = path.join(OUTDIR, "field-report.md");
  fs.writeFileSync(mdPath, md.join("\n"), "utf8");

  // Console summary
  console.log("=== FIELD AUDIT DONE ===");
  console.log(`OUTDIR=${OUTDIR}`);
  console.log(`JSON=${jsonPath}`);
  console.log(`MD=${mdPath}`);
  console.log("");
  console.log("PROD bucket counts:", summary.prodBuckets);
  console.log("PREVIEW bucket counts:", summary.previewBuckets);
}

main().catch((e) => {
  console.error("FIELD_AUDIT_FAILED:", e?.stack || String(e));
  process.exit(1);
});
