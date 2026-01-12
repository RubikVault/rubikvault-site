import { makeOk, makeNoData, makeError } from "./_shared/feature-contract.js";

const FEATURE_ID = "rvci-engine";

// Option A: hardcoded Last-Good keys (try in order)
const LASTGOOD_KEYS = [
  "lastgood:rvci-engine",
  "lastgood:rvci:engine",
  "lastgood:rvci-engine:daily",
];

async function kvGet(env, key) {
  if (!env?.RV_KV?.get) return null;
  try {
    return await env.RV_KV.get(key);
  } catch {
    return null;
  }
}

export async function onRequestGet({ request, env }) {
  try {
    const url = new URL(request.url);
    const debug = url.searchParams.get("debug") === "1";

    if (!env?.RV_KV) {
      return makeNoData(FEATURE_ID, "BINDING_MISSING", {
        message: "RV_KV binding missing (cannot read last-good).",
        keysTried: LASTGOOD_KEYS,
        debug,
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
        debug,
      });
    }

    let parsed = null;
    try {
      parsed = JSON.parse(raw);
    } catch (e) {
      return makeError(FEATURE_ID, "VALIDATION_FAIL", {
        message: "Last-good value is not valid JSON.",
        usedKey,
        debug,
      });
    }

    // Expecting parsed to already be your engine payload (or at least { data: ... })
    return makeOk(FEATURE_ID, {
      source: "kv:lastgood",
      usedKey,
      payload: parsed,
    }, { debug });

  } catch (e) {
    return makeError(FEATURE_ID, "EXCEPTION", { message: String(e?.message || e) });
  }
}
