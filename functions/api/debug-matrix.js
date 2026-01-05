import { Diag, EMPTY_REASONS, STATUS_CODES } from "./_diag.js";
import { createResponse, parseDebug, safeKvGet, sanitizeAny } from "./_shared.js";

const FEATURE = "debug-matrix";
const MAX_KV_READS = 25;

async function loadRegistry(origin, diag) {
  try {
    const res = await fetch(`${origin}/data/feature-registry.json`);
    if (res.ok) {
      return await res.json();
    }
    diag.issue("REGISTRY_HTTP_ERROR", { status: res.status });
  } catch (error) {
    diag.issue("REGISTRY_LOAD_ERROR", { message: error?.message || "registry fetch failed" });
  }
  try {
    const fallback = await import("../../data/feature-registry.json");
    return fallback.default || fallback;
  } catch (error) {
    diag.issue("REGISTRY_IMPORT_ERROR", { message: error?.message || "registry import failed" });
  }
  return null;
}

function deriveStatusFromMirror(mirror) {
  const metaStatus = mirror?.meta?.status || mirror?.status || null;
  if (metaStatus) return metaStatus;
  if (mirror?.ok === false) return STATUS_CODES.ERROR;
  return STATUS_CODES.OK;
}

function extractEmptyReason(mirror) {
  return mirror?.meta?.emptyReason ?? mirror?.emptyReason ?? null;
}

function extractLastUpdate(mirror) {
  return (
    mirror?.meta?.generatedAt ||
    mirror?.meta?.ts ||
    mirror?.ts ||
    mirror?.data?.ts ||
    mirror?.data?.updatedAt ||
    null
  );
}

function buildEntry(registryEntry, mirror, debugInfo) {
  const base = {
    feature: registryEntry.feature,
    endpoint: registryEntry.endpoint,
    kind: registryEntry.kind || "server",
    endpointStatus: STATUS_CODES.UNKNOWN,
    emptyReason: null,
    lastUpdate: null
  };

  if (mirror) {
    base.endpointStatus = deriveStatusFromMirror(mirror);
    base.emptyReason = extractEmptyReason(mirror);
    base.lastUpdate = extractLastUpdate(mirror);
    if (debugInfo?.deepAllowed) {
      base.mirror = sanitizeAny({
        meta: mirror.meta || null,
        debug: mirror.debug || null
      });
    }
  }

  return base;
}

function toMarkdown(entries, summary) {
  const header = "| feature | endpoint | status | emptyReason | lastUpdate |\n|---|---|---|---|---|";
  const rows = entries
    .map(
      (e) =>
        `| ${e.feature} | ${e.endpoint || "-"} | ${e.endpointStatus} | ${e.emptyReason || "-"} | ${e.lastUpdate || "-"} |`
    )
    .join("\n");
  const summaryLine = `\n\nSummary: ${summary.failed}/${summary.total} failed (${summary.failedPct}%).`;
  return `${header}\n${rows}${summaryLine}`;
}

export async function onRequestGet({ request, env }) {
  const diag = new Diag();
  const debugInfo = parseDebug(request, env);
  request.__debugInfo = debugInfo;
  const url = new URL(request.url);
  const origin = url.origin;

  const registry = await loadRegistry(origin, diag);
  if (!registry) {
    diag.setEmptyReason(EMPTY_REASONS.NO_SOURCE);
    const payload = createResponse({
      feature: FEATURE,
      data: { entries: [] },
      meta: { emptyReason: diag.emptyReason, status: STATUS_CODES.ERROR },
      diag,
      request,
      error: { code: "REGISTRY_MISSING", message: "feature registry unavailable" },
      status: 500
    });
    return payload;
  }

  const entries = [];
  let kvReads = 0;
  for (const entry of registry) {
    const mirrorKey = entry.mirrorKey || `mirror:${entry.feature}:latest`;
    let mirror = null;
    if (entry.kind === "server" && kvReads < MAX_KV_READS) {
      mirror = await safeKvGet(env, mirrorKey, "json", diag);
      kvReads += 1;
    } else if (entry.kind === "server" && kvReads >= MAX_KV_READS) {
      entries.push({
        feature: entry.feature,
        endpoint: entry.endpoint,
        kind: entry.kind || "server",
        endpointStatus: STATUS_CODES.UNKNOWN,
        emptyReason: "BUDGET_CAP",
        lastUpdate: null
      });
      continue;
    }
    const built = buildEntry(entry, mirror, debugInfo);
    if (entry.kind === "server" && kvReads > MAX_KV_READS) {
      built.endpointStatus = STATUS_CODES.UNKNOWN;
      built.emptyReason = "BUDGET_CAP";
    }
    entries.push(built);
  }

  const failed = entries.filter((e) =>
    [STATUS_CODES.ERROR, STATUS_CODES.LOCKED, STATUS_CODES.PARTIAL].includes(e.endpointStatus)
  ).length;
  const summary = {
    total: entries.length,
    failed,
    failedPct: entries.length ? Math.round((failed / entries.length) * 100) : 0
  };

  const meta = {
    generatedAt: new Date().toISOString(),
    summary
  };

  const format = url.searchParams.get("format");
  if (format === "md") {
    const md = toMarkdown(entries, summary);
    const headers = new Headers();
    headers.set("Content-Type", "text/markdown; charset=utf-8");
    headers.set("Cache-Control", debugInfo?.debug ? "no-store" : "public, max-age=60");
    headers.set("Access-Control-Allow-Origin", "*");
    return new Response(md, { status: 200, headers });
  }

  return createResponse({
    feature: FEATURE,
    data: { entries },
    meta,
    diag,
    request
  });
}
