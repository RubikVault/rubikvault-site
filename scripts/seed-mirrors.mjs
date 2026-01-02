import path from "node:path";
import { buildBaseMirror } from "./utils/mirror-builders.mjs";
import { loadMirror, saveMirror } from "./utils/mirror-io.mjs";

const BASE_URL = process.env.PROD_URL || "https://rubikvault.com";
const TOKEN = process.env.RV_CRON_TOKEN || "";
const OUT_DIRS = ["public/mirrors", "mirrors"];
const FEATURES = ["top-movers", "yield-curve", "sector-rotation", "market-health"];
const CRITICAL_FEATURES = new Set(["market-health", "top-movers", "yield-curve", "sector-rotation"]);

function logEvent(payload) {
  console.log(JSON.stringify(payload));
}

async function fetchJson(url) {
  const res = await fetch(url, {
    headers: {
      Accept: "application/json",
      "x-rv-cron": "1",
      Authorization: `Bearer ${TOKEN}`
    }
  });
  const text = await res.text();
  const bytes = Buffer.byteLength(text || "", "utf8");
  if (text.trim().startsWith("<")) {
    const error = new Error("HTML response");
    error.httpStatus = res.status;
    error.bytes = bytes;
    throw error;
  }
  if (!res.ok) {
    const error = new Error(`HTTP ${res.status}`);
    error.httpStatus = res.status;
    error.bytes = bytes;
    throw error;
  }
  const json = JSON.parse(text);
  return { json, bytes, httpStatus: res.status };
}

function normalizeMetaStatus(payload) {
  return payload?.meta?.status || payload?.dataQuality?.status || "UNKNOWN";
}

function extractTopMoversItems(payload) {
  const stocks = payload?.data?.stocks || {};
  const items =
    stocks.volumeLeaders?.length
      ? stocks.volumeLeaders
      : stocks.gainers?.length
        ? stocks.gainers
        : stocks.losers?.length
          ? stocks.losers
          : [];
  return { items, context: { universe: stocks.universe || [] } };
}

function extractYieldCurveItems(payload) {
  const yields = payload?.data?.yields || {};
  const items = Object.entries(yields)
    .filter(([, value]) => Number.isFinite(value))
    .map(([tenor, value]) => ({ tenor, value }));
  return { items, context: { spreads: payload?.data?.spreads || {} } };
}

function extractSectorRotationItems(payload) {
  const items = Array.isArray(payload?.data?.sectors) ? payload.data.sectors : [];
  return { items, context: { rotationLabel: payload?.data?.rotationLabel || null, groups: payload?.data?.groups || {} } };
}

function extractMarketHealthItems(payload) {
  const indices = payload?.data?.indices || [];
  const commodities = payload?.data?.commodities || [];
  const crypto = payload?.data?.crypto || [];
  const items = [...indices, ...commodities, ...crypto];
  return {
    items,
    context: {
      fng: payload?.data?.fng || null,
      fngStocks: payload?.data?.fngStocks || null,
      btc: payload?.data?.btc || null,
      source: payload?.data?.source || null
    }
  };
}

function extractItems(featureId, payload) {
  switch (featureId) {
    case "top-movers":
      return extractTopMoversItems(payload);
    case "yield-curve":
      return extractYieldCurveItems(payload);
    case "sector-rotation":
      return extractSectorRotationItems(payload);
    case "market-health":
      return extractMarketHealthItems(payload);
    default:
      return { items: Array.isArray(payload?.data?.items) ? payload.data.items : [], context: {} };
  }
}

function validateFeature(featureId, payload, items) {
  if (!payload || typeof payload !== "object") return { ok: false, reason: "payload_missing" };
  const metaStatus = normalizeMetaStatus(payload);
  if (!metaStatus || metaStatus === "UNKNOWN") return { ok: false, reason: "meta_missing" };
  if (featureId === "yield-curve") {
    return { ok: items.length >= 5, reason: items.length >= 5 ? null : "not_enough_points" };
  }
  if (featureId === "sector-rotation") {
    return { ok: items.length >= 3, reason: items.length >= 3 ? null : "not_enough_rows" };
  }
  if (featureId === "market-health") {
    const hasData =
      (payload?.data?.indices || []).length ||
      (payload?.data?.commodities || []).length ||
      (payload?.data?.crypto || []).length ||
      payload?.data?.fng ||
      payload?.data?.fngStocks;
    return { ok: Boolean(hasData), reason: hasData ? null : "no_market_data" };
  }
  const ok = items.length > 0;
  return { ok, reason: ok ? null : "empty_items" };
}

function buildMirror(featureId, payload, items, context) {
  const metaStatus = normalizeMetaStatus(payload);
  const mode = metaStatus === "LIVE" ? "LIVE" : metaStatus === "STALE" ? "EOD" : "EMPTY";
  const dataQuality = metaStatus === "LIVE" ? "OK" : metaStatus === "STALE" ? "STALE" : "EMPTY";
  const sourceUpstream = payload?.data?.source || "unknown";
  const mirror = buildBaseMirror({
    mirrorId: featureId,
    mode,
    cadence: "best_effort",
    trust: "derived",
    sourceUpstream,
    whyUnique: `Seeded from ${featureId} endpoint`,
    items,
    context,
    errors: payload?.error ? [payload.error] : [],
    notes: payload?.meta?.reason ? [payload.meta.reason] : [],
    dataQuality
  });
  mirror.savedAt = mirror.updatedAt;
  mirror.payload = payload;
  return mirror;
}

async function seed() {
  if (!TOKEN) {
    console.error("[seed-mirrors] missing RV_CRON_TOKEN; aborting");
    process.exit(1);
  }

  const summary = {
    savedAt: new Date().toISOString(),
    schemaVersion: "1.0",
    summary: { ok: 0, bad: 0, total: FEATURES.length },
    blocks: {}
  };

  for (const featureId of FEATURES) {
    const url = `${BASE_URL}/api/${featureId}?debug=1`;
    let payload;
    let httpStatus = null;
    let bytes = 0;
    try {
      const res = await fetchJson(url);
      payload = res.json;
      httpStatus = res.httpStatus;
      bytes = res.bytes;
    } catch (error) {
      httpStatus = error.httpStatus ?? null;
      bytes = error.bytes ?? 0;
      logEvent({
        level: "error",
        op: "seed",
        feature: featureId,
        url,
        http: httpStatus,
        bytes,
        error: error.message
      });
      summary.blocks[featureId] = {
        ok: false,
        http: httpStatus,
        bytes,
        metaStatus: null,
        metaReason: null,
        write: "SKIPPED",
        error: error.message
      };
      summary.summary.bad += 1;
      continue;
    }

    const metaStatus = normalizeMetaStatus(payload);
    const metaReason = payload?.meta?.reason ?? null;
    const { items, context } = extractItems(featureId, payload);
    const validation = validateFeature(featureId, payload, items);
    const dataKeys = payload?.data && typeof payload.data === "object" ? Object.keys(payload.data).length : 0;
    logEvent({
      level: "info",
      op: "seed",
      feature: featureId,
      url,
      http: httpStatus,
      bytes,
      metaStatus,
      metaReason,
      dataKeys,
      valid: validation.ok
    });

    const mirrorPath = path.resolve(process.cwd(), "public/mirrors", `${featureId}.json`);
    const existing = loadMirror(mirrorPath);

    if (!validation.ok) {
      logEvent({
        level: "error",
        op: "skip_write",
        feature: featureId,
        reason: "POISON_GUARD",
        detail: validation.reason
      });
      summary.blocks[featureId] = {
        ok: false,
        http: httpStatus,
        bytes,
        metaStatus,
        metaReason,
        write: "SKIPPED",
        error: `POISON_GUARD:${validation.reason}`
      };
      summary.summary.bad += 1;
      continue;
    }

    const mirror = buildMirror(featureId, payload, items, context);
    for (const dir of OUT_DIRS) {
      const outPath = path.resolve(process.cwd(), dir, `${featureId}.json`);
      saveMirror(outPath, mirror);
    }
    summary.blocks[featureId] = {
      ok: true,
      http: httpStatus,
      bytes,
      metaStatus,
      metaReason,
      write: existing ? "UPDATED" : "CREATED",
      error: null
    };
    summary.summary.ok += 1;
  }

  const healthPath = path.resolve(process.cwd(), "public/mirrors/_health.json");
  saveMirror(healthPath, {
    schemaVersion: "1.0",
    mirrorId: "_health",
    mode: "EOD",
    cadence: "best_effort",
    trust: "derived",
    sourceUpstream: "seed-mirrors",
    whyUnique: "Seeder health report",
    items: [],
    context: summary
  });

  const criticalBad = FEATURES.filter((id) => CRITICAL_FEATURES.has(id) && !summary.blocks[id]?.ok);
  if (criticalBad.length) {
    console.error(`[seed-mirrors] critical failures: ${criticalBad.join(", ")}`);
    process.exit(1);
  }
}

seed().catch((error) => {
  console.error(`[seed-mirrors] fatal: ${error.message}`);
  process.exitCode = 1;
});
