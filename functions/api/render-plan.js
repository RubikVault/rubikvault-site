import { createResponse, parseDebug } from "./_shared.js";

const FEATURE = "render-plan";

async function fetchJsonAsset(url) {
  try {
    const res = await fetch(url, { headers: { Accept: "application/json" } });
    if (!res.ok) {
      return { ok: false, reason: `HTTP_${res.status}` };
    }
    const contentType = res.headers.get("content-type") || "";
    if (!contentType.toLowerCase().includes("json")) {
      return { ok: false, reason: "BAD_CONTENT_TYPE" };
    }
    const data = await res.json();
    return { ok: true, data };
  } catch (error) {
    return { ok: false, reason: "PARSE_ERROR", error };
  }
}

export async function onRequestGet({ request, env }) {
  parseDebug(request, env);
  const origin = new URL(request.url).origin;
  const registryRes = await fetchJsonAsset(`${origin}/data/feature-registry.json`);
  const manifestRes = await fetchJsonAsset(`${origin}/data/seed-manifest.json`);

  const registryFeatures = Array.isArray(registryRes.data?.features)
    ? registryRes.data.features
    : null;
  const manifestBlocks = Array.isArray(manifestRes.data?.blocks)
    ? manifestRes.data.blocks
    : null;

  const registryValid = Boolean(registryRes.ok && registryFeatures);
  const manifestValid = Boolean(manifestRes.ok && manifestBlocks);

  let source = "none";
  if (registryValid) source = "registry";
  else if (manifestValid) source = "manifest";

  const payload = {
    source,
    featuresCount: registryValid ? registryFeatures.length : null,
    manifestBlocksCount: manifestValid ? manifestBlocks.length : null,
    capped: false,
    onlyFilter: null,
    timestamp: new Date().toISOString(),
    registryStatus: registryValid ? "OK" : registryRes.reason || "INVALID",
    manifestStatus: manifestValid ? "OK" : manifestRes.reason || "INVALID"
  };

  const error =
    source === "none"
      ? { code: "RENDER_PLAN_UNAVAILABLE", message: "registry and manifest unavailable" }
      : null;

  return createResponse({
    feature: FEATURE,
    data: payload,
    meta: { status: error ? "ERROR" : "OK", reason: error ? error.code : "" },
    error,
    request
  });
}
