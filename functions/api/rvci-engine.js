function jsonResponse(obj, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      ...extraHeaders,
    },
  });
}


// --- RVCI: normalize envelope so UI never renders empty ---
function rvciDefaultPaths() {
  return {
    short: "mirrors/rvci/rvci_top_short.json",
    mid: "mirrors/rvci/rvci_top_mid.json",
    long: "mirrors/rvci/rvci_top_long.json",
    triggers: "mirrors/rvci/rvci_triggers.json",
    health: "data/rvci/health.json",
    universe: "data/rvci/universe_meta.json"
  };
}

function rvciNormalizeEnvelope(envelope) {
  const e = (envelope && typeof envelope === "object") ? { ...envelope } : {};
  const meta = (e.meta && typeof e.meta === "object") ? { ...e.meta } : {};
  let data = (e.data && typeof e.data === "object") ? { ...e.data } : {};

  const status = String(meta.status || meta.reason || data.status || "");
  const isSkipped = status === "SKIPPED_MARKET_CLOSED" || status === "MARKET_NOT_CLOSED";

  // Ensure data.paths always exists (UI relies on it for tabs).
  const paths = (data.paths && typeof data.paths === "object") ? data.paths : rvciDefaultPaths();
  data.paths = paths;

  // SKIPPED is a state, not a failure: mark ok:true so UI renders block.
  if (isSkipped) {
    e.ok = true;
    if (meta.status === "SKIPPED_MARKET_CLOSED" || meta.status === "MARKET_NOT_CLOSED") meta.status = "STALE";
    if (!meta.reason) meta.reason = status;
  }

  // Always keep meta/data objects present.
  e.meta = meta;
  e.data = data;

  // Ensure feature is present (defensive)
  if (!e.feature) e.feature = "rvci-engine";

  return e;
}

function makeEnvelope({ traceId, status, reason, data, error }) {
  return {
    ok: !error?.code,
    feature: "rvci-engine",
    meta: {
      status: status || "NO_DATA",
      reason: reason || "",
      ts: new Date().toISOString(),
      schemaVersion: 1,
      traceId,
      writeMode: "NONE",
      circuitOpen: false,
      warnings: [],
      savedAt: null,
      ageMinutes: null,
      source: null,
      emptyReason: null,
    },
    data: data ?? null,
    error: error || { code: "", message: "", details: {} },
  };
}

export async function onRequestGet({ env, request }) {
  const url = new URL(request.url);
  const traceId = Math.random().toString(36).slice(2, 10);

  const kv = env?.RV_KV;
  const keys = [
    "rv:lastgood:rvci-engine:1",
    "rv:lastgood:rvci-engine",
    "lastgood:rvci-engine:1",
    "lastgood:rvci-engine",
  ];

  // 1) Try KV last-good
  if (kv?.get) {
    for (const k of keys) {
      try {
        const raw = await kv.get(k);
        if (!raw) continue;

        // Expect raw to be a full envelope JSON
        const parsed = JSON.parse(raw);

        // normalize a bit (keep whatever schema you stored)
        parsed.feature = "rvci-engine";
        parsed.ok = parsed.ok ?? true;
        parsed.meta = parsed.meta || {};
        parsed.meta.traceId = traceId;
        parsed.meta.ts = parsed.meta.ts || new Date().toISOString();
        parsed.meta.schemaVersion = parsed.meta.schemaVersion || 1;
        parsed.meta.source = parsed.meta.source || "kv";
        parsed.meta.reason = parsed.meta.reason || "";
        parsed.meta.writeMode = parsed.meta.writeMode || "NONE";
        parsed.meta.circuitOpen = parsed.meta.circuitOpen || false;

        return jsonResponse(rvciNormalizeEnvelope(parsed), 200, { "x-rv-lastgood-key": k });
      } catch (e) {
        // continue to next key / fallback
      }
    }
  }
  // 2) Fallback: serve the built snapshot so the UI never shows empty
  try {
    const fallbackUrl = new URL("/data/rvci_latest.json", url.origin).toString();
    const res = await fetch(fallbackUrl, { cf: { cacheTtl: 0 } });
    if (res.ok) {
      const txt = await res.text();
      try {
        const parsed = JSON.parse(txt);
        return jsonResponse(rvciNormalizeEnvelope(parsed), 200, {
          "content-type": "application/json; charset=utf-8",
          "cache-control": "no-store",
          "x-rv-fallback": "public:data/rvci_latest.json",
          "x-rv-fallback-parsed": "1",
        });
      } catch (e) {
        // If fallback JSON is corrupt, keep serving raw text to aid debugging.
        return new Response(txt, {
          status: 200,
          headers: {
            "content-type": "application/json; charset=utf-8",
            "cache-control": "no-store",
            "x-rv-fallback": "public:data/rvci_latest.json",
          },
        });
      }
    }
  } catch (e) {
    // ignore
  }

  // 3) Final fallback: explicit NO_DATA
  // 3) Final fallback: explicit NO_DATA
  return jsonResponse(
    makeEnvelope({
      traceId,
      status: "NO_DATA",
      reason: kv?.get ? "MISSING_LAST_GOOD" : "BINDING_MISSING",
      data: null,
      error: kv?.get
        ? { code: "MISSING_LAST_GOOD", message: "No last-good found in KV", details: {} }
        : { code: "BINDING_MISSING", message: "RV_KV binding missing", details: {} },
    }),
    200
  );
}
