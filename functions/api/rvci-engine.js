import { makeOk, makeNoData, makeError } from "./_shared/feature-contract.js";

const FEATURE_ID = "rvci-engine";
const VERSION = 1;

// Try the resilience-style keys first (most likely), then legacy fallbacks.
const LASTGOOD_KEYS = [
  `rv:lastgood:${FEATURE_ID}:${VERSION}`,
  `rv:lastgood:${FEATURE_ID}:v${VERSION}`,
  `lastgood:${FEATURE_ID}`,
  `lastgood:${FEATURE_ID}:${VERSION}`,
];

async function kvGet(env, key) {
  if (!env?.RV_KV?.get) return null;
  try { return await env.RV_KV.get(key); } catch { return null; }
}

function isEnvelope(x) {
  return !!x && typeof x === "object" && x.ok === true && typeof x.feature === "string" && x.meta && x.error;
}

export async function onRequestGet({ request, env }) {
  try {
    const url = new URL(request.url);
    const debug = url.searchParams.get("debug") === "1";

    if (!env?.RV_KV) {
      return makeNoData(FEATURE_ID, "BINDING_MISSING", {
        message: "RV_KV binding missing (cannot read last-good).",
        keysTried: LASTGOOD_KEYS,
      });
    }

    let raw = null;
    let usedKey = null;
    for (const k of LASTGOOD_KEYS) {
      raw = await kvGet(env, k);
      if (raw) { usedKey = k; break; }
    }

    if (!raw) {
      return makeNoData(FEATURE_ID, "MISSING_LAST_GOOD", {
        message: "No last-good snapshot found in KV.",
        keysTried: LASTGOOD_KEYS,
      });
    }

    let parsed;
    try { parsed = JSON.parse(raw); }
    catch {
      return makeError(FEATURE_ID, "VALIDATION_FAIL", {
        message: "Last-good value is not valid JSON.",
        usedKey,
      });
    }

    // If KV already stores a full envelope, return it directly (best case).
    if (isEnvelope(parsed)) {
      // ensure feature id is correct (defensive)
      if (parsed.feature !== FEATURE_ID) parsed.feature = FEATURE_ID;
      return new Response(JSON.stringify(parsed), {
        status: 200,
        headers: { "content-type": "application/json; charset=utf-8" },
      });
    }

    // Otherwise, map common shapes into data.rows (what the UI expects).
    const rows =
      Array.isArray(parsed?.rows) ? parsed.rows :
      Array.isArray(parsed?.data?.rows) ? parsed.data.rows :
      [];

    if (!rows.length) {
      return makeNoData(FEATURE_ID, "NO_ITEMS", {
        message: "Last-good JSON had no rows[] in expected locations.",
        usedKey,
        parsedKeys: parsed && typeof parsed === "object" ? Object.keys(parsed) : null,
      });
    }

    return makeOk(FEATURE_ID, { rows }, { debug, usedKey, source: "kv:lastgood" });
  } catch (e) {
    return makeError(FEATURE_ID, "EXCEPTION", { message: String(e?.message || e) });
  }
}
