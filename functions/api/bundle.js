import { Diag, EMPTY_REASONS, STATUS_CODES } from "./_diag.js";
import { createResponse, parseDebug, safeKvGet } from "./_shared.js";

const FEATURE = "bundle";
const KV_KEY = "bundle:latest";

async function fetchStaticBundle(origin, diag) {
  try {
    const res = await fetch(`${origin}/data/bundle.json`);
    if (!res.ok) {
      diag.issue("STATIC_BUNDLE_MISS", { status: res.status });
      return null;
    }
    const json = await res.json();
    return json;
  } catch (error) {
    diag.issue("STATIC_BUNDLE_ERROR", { message: error?.message || "static fetch failed" });
    return null;
  }
}

export async function onRequestGet({ request, env }) {
  const diag = new Diag();
  const debugInfo = parseDebug(request, env);
  request.__debugInfo = debugInfo;
  const url = new URL(request.url);
  const origin = url.origin;

  const meta = {};
  let data = null;

  const staticBundle = await fetchStaticBundle(origin, diag);
  if (staticBundle) {
    meta.source = "static_asset";
    data = staticBundle;
  } else {
    const kvValue = await safeKvGet(env, KV_KEY, "json", diag);
    if (kvValue) {
      meta.source = "kv_mirror";
      data = kvValue;
    }
  }

  if (!data) {
    diag.setEmptyReason(EMPTY_REASONS.CACHE_EMPTY);
    meta.source = meta.source || "none";
    meta.emptyReason = diag.emptyReason;
    meta.status = STATUS_CODES.PARTIAL;
    data = { blocks: [] };
  }

  return createResponse({
    feature: FEATURE,
    data,
    meta,
    diag,
    request
  });
}
