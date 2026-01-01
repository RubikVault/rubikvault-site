import { jsonResponse } from "./_shared.js";
import { BLOCK_REGISTRY_LIST } from "../../features/blocks-registry.js";

const MAX_PAYLOAD_BYTES = 1.5 * 1024 * 1024;
const DEFAULT_SEG = "fast";
const JITTER_SECONDS = 15;

function nowIso() {
  return new Date().toISOString();
}

function isHtmlLike(text) {
  const trimmed = String(text || "").trim().toLowerCase();
  return trimmed.startsWith("<!doctype") || trimmed.startsWith("<html");
}

function pickMirrorId(entry) {
  if (!entry) return null;
  if (Array.isArray(entry.mirrorFiles) && entry.mirrorFiles.length > 0) {
    return entry.mirrorFiles[0];
  }
  const api = entry.api || "";
  return api ? api : null;
}

function classifySegment(entry) {
  if (!entry) return "slow";
  if (entry.featureId === "rv-market-cockpit") return "fast";
  const cadence = String(entry.cadence || "").toLowerCase();
  if (entry.blockType === "LIVE") return "fast";
  if (cadence === "live" || cadence === "hourly" || cadence === "15m_delayed" || cadence === "best_effort") {
    return "fast";
  }
  return "slow";
}

function mirrorToEnvelope(mirror, featureId) {
  const items = Array.isArray(mirror?.items) ? mirror.items : [];
  const ts = mirror?.updatedAt || mirror?.runId || nowIso();
  return {
    ok: true,
    feature: featureId || mirror?.mirrorId || "mirror",
    ts,
    traceId: mirror?.runId || "mirror",
    schemaVersion: 1,
    cache: { hit: true, ttl: 0, layer: "mirror" },
    upstream: { url: "mirror", status: null, snippet: "" },
    rateLimit: { remaining: "unknown", reset: null, estimated: true },
    dataQuality: {
      status: mirror?.dataQuality || mirror?.mode || "EMPTY",
      reason: mirror?.mode || "MIRROR"
    },
    data: {
      items,
      context: mirror?.context || {},
      mirrorMeta: {
        mirrorId: mirror?.mirrorId || "",
        mode: mirror?.mode || "",
        cadence: mirror?.cadence || "",
        trust: mirror?.trust || "",
        sourceUpstream: mirror?.sourceUpstream || "",
        delayMinutes: mirror?.delayMinutes ?? null,
        asOf: mirror?.asOf || null,
        updatedAt: mirror?.updatedAt || null,
        whyUnique: mirror?.whyUnique || "",
        missingSymbols: mirror?.missingSymbols || [],
        errors: mirror?.errors || [],
        notes: mirror?.notes || []
      }
    }
  };
}

async function fetchMirror(origin, mirrorId) {
  if (!mirrorId) return null;
  const url = `${origin}/mirrors/${mirrorId}.json`;
  const response = await fetch(url, { cf: { cacheTtl: 60 }, headers: { Accept: "application/json" } });
  const text = await response.text();
  if (!response.ok || isHtmlLike(text)) return null;
  try {
    const payload = JSON.parse(text);
    return payload && typeof payload === "object" ? payload : null;
  } catch (error) {
    return null;
  }
}

function measureSize(obj) {
  try {
    const json = JSON.stringify(obj);
    return new TextEncoder().encode(json).length;
  } catch (error) {
    return 0;
  }
}

export async function onRequestGet(context) {
  const { request } = context;
  const url = new URL(request.url);
  const seg = (url.searchParams.get("seg") || DEFAULT_SEG).toLowerCase();
  const origin = url.origin;
  const list = BLOCK_REGISTRY_LIST.filter((entry) => entry?.apiPath);

  const selected = list.filter((entry) => {
    if (seg === "all") return true;
    return classifySegment(entry) === seg;
  });

  const blocks = {};
  const trimmed = [];
  for (const entry of selected) {
    const mirrorId = pickMirrorId(entry);
    const mirror = await fetchMirror(origin, mirrorId);
    if (!mirror) continue;
    blocks[entry.api] = mirrorToEnvelope(mirror, entry.api);
  }

  let payload = {
    ok: true,
    meta: {
      status: "OK",
      ts: nowIso(),
      schemaVersion: 1,
      source: "mirror",
      warnings: []
    },
    data: {
      blocks,
      fastOnly: seg === "fast"
    }
  };

  let size = measureSize(payload);
  if (size > MAX_PAYLOAD_BYTES) {
    const keys = Object.keys(blocks);
    while (keys.length && size > MAX_PAYLOAD_BYTES) {
      const drop = keys.pop();
      if (drop && blocks[drop]) {
        trimmed.push(drop);
        delete blocks[drop];
      }
      payload.data.blocks = blocks;
      size = measureSize(payload);
    }
    payload.meta.warnings.push({ code: "PAYLOAD_TRIMMED", trimmed });
  }

  const jitter = Math.floor(Math.random() * JITTER_SECONDS);
  return jsonResponse(payload, {
    status: 200,
    headers: {
      "Cache-Control": "public, max-age=60",
      "CDN-Cache-Control": `max-age=${120 + jitter}`
    }
  });
}
