import { Diag, EMPTY_REASONS, STATUS_CODES } from "./_diag.js";
import { createResponse, parseDebug, safeKvGet } from "./_shared.js";

const FEATURE = "bundle";
const KV_KEY = "bundle:latest";

async function fetchStaticBundle(origin, diag) {
  try {
    const res = await fetch(`${origin}/data/bundle.json`);
    const contentType = String(res.headers.get("content-type") || "").toLowerCase();
    if (!res.ok) {
      diag.issue("STATIC_BUNDLE_MISS", { status: res.status });
      return null;
    }
    const text = await res.text();
    const trimmed = text.trim();
    if (
      contentType.includes("text/html") ||
      trimmed.toLowerCase().startsWith("<!doctype") ||
      trimmed.toLowerCase().startsWith("<html")
    ) {
      return {
        html: true,
        contentType,
        snippet: trimmed.slice(0, 160)
      };
    }
    try {
      return { data: JSON.parse(text) };
    } catch (error) {
      diag.issue("STATIC_PARSE_ERROR", {
        message: error?.message || "Invalid JSON",
        snippet: trimmed.slice(0, 160)
      });
      return null;
    }
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

  const meta = { warnings: [] };
  let data = null;
  let error = null;

  const staticBundle = await fetchStaticBundle(origin, diag);
  if (staticBundle && staticBundle.data) {
    meta.source = "static_asset";
    data = staticBundle.data;
  } else {
    if (staticBundle && staticBundle.html) {
      const warning = "STATIC_ASSET_REWRITE";
      diag.issue(warning, {
        contentType: staticBundle.contentType,
        snippet: staticBundle.snippet
      });
      if (!meta.warnings.includes(warning)) {
        meta.warnings.push(warning);
      }
    }
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
    error = {
      code: "CACHE_EMPTY",
      message: "No bundle data from static asset or KV",
      details: { source: meta.source }
    };
    data = { blocks: [] };
  }

  return createResponse({
    feature: FEATURE,
    data,
    meta,
    diag,
    request,
    error
  });
}
