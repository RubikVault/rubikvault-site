import { fetchJSON, getBindingHint } from "./utils/api.js";
import { getOrFetch } from "./utils/store.js";
import { resolveWithShadow } from "./utils/resilience.js";
import { rvSetText } from "./rv-dom.js";

function formatTime(value) {
  if (!value) return "N/A";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "N/A" : date.toLocaleTimeString();
}

const CATEGORY_ICONS = {
  stocks: "EQ",
  commodities: "CM",
  crypto: "CR",
  etfs: "ETF",
  bonds: "BD"
};

function resolveSource(item) {
  const source = item?.source || {};
  const code = source.code || item?.sourceCode || item?.sourceId || "NEWS";
  const name = source.name || item?.sourceName || item?.source || "news";
  return { code, name };
}

function normalizePayload(raw) {
  if (!raw || typeof raw !== "object") return raw;
  if (typeof raw.ok === "boolean") return raw;
  if (Array.isArray(raw.items)) {
    return {
      ok: true,
      data: {
        items: raw.items,
        updatedAt: raw.updatedAt || raw.generatedAt || raw.asOf || null,
        source: raw.sourceUpstream || raw.source || "rss"
      },
      meta: { status: "OK", reason: "MIRROR" },
      cache: { layer: "static", ttl: 0 },
      upstream: { status: 200, snippet: "" }
    };
  }
  return raw;
}

function normalizeItems(items = []) {
  const mapped = items
    .map((item) => {
      const headline = item?.headline || item?.title || "";
      const publishedAt = item?.publishedAt || item?.published || item?.pubDate || item?.date || "";
      return {
        ...item,
        headline,
        publishedAt
      };
    })
    .filter((item) => item.headline && item.url);

  const seen = new Set();
  const deduped = [];
  mapped.forEach((item) => {
    const key = `${item.headline}::${item.url}`;
    if (seen.has(key)) return;
    seen.add(key);
    deduped.push(item);
  });

  deduped.sort((a, b) => {
    const ta = Date.parse(a.publishedAt || "") || 0;
    const tb = Date.parse(b.publishedAt || "") || 0;
    return tb - ta;
  });

  return deduped;
}

function render(root, payload, logger, featureId) {
  const normalized = normalizePayload(payload);
  const resolved = resolveWithShadow(featureId, normalized, {
    logger,
    isMissing: (value) => !value?.ok || !(value?.data?.items || []).length,
    reason: "STALE_FALLBACK"
  });
  const data = resolved?.data || {};
  const items = normalizeItems(data.items || []);
  const partialNote =
    resolved?.ok && (resolved?.isStale || resolved?.error?.code)
      ? "Partial data — some sources unavailable."
      : "";

  if (!resolved?.ok) {
    const errorMessage = resolved?.error?.message || "API error";
    const errorCode = resolved?.error?.code || "";
    const upstreamStatus = resolved?.upstream?.status;
    const upstreamSnippet = resolved?.upstream?.snippet || "";
    const cacheLayer = resolved?.cache?.layer || "none";
    const detailLine = [
      errorCode,
      upstreamStatus ? `Upstream ${upstreamStatus}` : "",
      `Cache ${cacheLayer}`
    ]
      .filter(Boolean)
      .join(" · ");
    const fixHint = errorCode === "BINDING_MISSING" ? getBindingHint(resolved) : "";
    root.innerHTML = `
      <div class="rv-native-error">
        News konnten nicht geladen werden.<br />
        <span>${errorMessage}</span>
        ${detailLine ? `<div class="rv-native-note">${detailLine}</div>` : ""}
        ${fixHint ? `<div class="rv-native-note">${fixHint}</div>` : ""}
        ${upstreamSnippet ? `<pre class="rv-native-stack">${upstreamSnippet}</pre>` : ""}
      </div>
    `;
    const statusHeadline =
      errorCode === "RATE_LIMITED"
        ? "RATE_LIMITED"
        : errorCode === "SCHEMA_INVALID"
          ? "SCHEMA_INVALID"
          : "API error";
    const statusLevel = errorCode === "RATE_LIMITED" ? "PARTIAL" : "FAIL";
    logger?.setStatus(statusLevel, statusHeadline);
    logger?.setMeta({
      updatedAt: resolved?.ts,
      source: data?.source || "--",
      isStale: resolved?.isStale,
      staleAgeMs: resolved?.staleAgeMs
    });
    logger?.info("response_meta", {
      cache: resolved?.cache || {},
      upstreamStatus: upstreamStatus ?? null
    });
    return;
  }

  if (!items.length) {
    root.innerHTML = `
      <div class="rv-native-empty">
        Keine News verfügbar. Bitte später erneut versuchen.
      </div>
    `;
    logger?.setStatus("PARTIAL", "No data");
    logger?.setMeta({
      updatedAt: data.updatedAt || resolved?.ts,
      source: data.source || "--",
      isStale: resolved?.isStale,
      staleAgeMs: resolved?.staleAgeMs
    });
    return;
  }

  root.innerHTML = `
    ${partialNote ? `<div class="rv-native-note">${partialNote}</div>` : ""}
    <div class="rv-news-list">
      ${items
        .slice(0, 20)
        .map((item) => {
          const category = item.category || item.topic || "stocks";
          const icon = CATEGORY_ICONS[category] || "EQ";
          const source = resolveSource(item);
          return `
            <a class="rv-news-item" href="${item.url}" target="_blank" rel="noopener noreferrer">
              <span class="rv-news-icon" data-rv-cat="${category}">${icon}</span>
              <span class="rv-news-title" data-rv-field="news-title">${item.headline}</span>
              <span class="rv-news-meta">
                <span class="rv-news-source" data-rv-source="${source.code}" data-rv-field="news-source">[${source.code}]</span>
                <span data-rv-field="news-meta">${source.name} · ${formatTime(item.publishedAt)}</span>
              </span>
            </a>
          `;
        })
        .join("")}
    </div>
    <div class="rv-native-note" data-rv-field="news-sources">Sources: ${data.source || "feeds"}</div>
  `;
  root
    .querySelectorAll("[data-rv-field]")
    .forEach((node) => rvSetText(node, node.dataset.rvField, node.textContent));

  const warningCode = resolved?.error?.code || "";
  const hasWarning = resolved?.ok && warningCode;
  const isRateLimited = warningCode === "RATE_LIMITED";
  const headline = resolved?.isStale
    ? isRateLimited
      ? "RATE_LIMITED"
      : "Stale data"
    : isRateLimited
      ? "RATE_LIMITED"
      : hasWarning
        ? "Partial data"
        : "Live";
  logger?.setStatus(resolved?.isStale || hasWarning ? "PARTIAL" : "OK", headline);
  logger?.setMeta({
    updatedAt: data.updatedAt || resolved.ts,
    source: data.source || "news",
    isStale: resolved?.isStale,
    staleAgeMs: resolved?.staleAgeMs
  });
  logger?.info("response_meta", {
    cache: resolved?.cache || {},
    upstreamStatus: resolved?.upstream?.status ?? null
  });
}

async function loadData({ featureId, traceId, logger }) {
  const url = "/data/news.json";
  try {
    const response = await fetch(url, { cache: "no-store" });
    const text = await response.text();
    let raw = null;
    try {
      raw = text ? JSON.parse(text) : null;
    } catch (error) {
      raw = null;
    }
    if (!response.ok || !raw || !Array.isArray(raw.items)) {
      return {
        ok: false,
        feature: featureId,
        ts: new Date().toISOString(),
        traceId: traceId || "news",
        schemaVersion: 1,
        cache: { hit: false, ttl: 0, layer: "none" },
        upstream: { url, status: response.status, snippet: text.slice(0, 300) },
        data: {},
        error: {
          code: "SCHEMA_INVALID",
          message: "Invalid API response schema",
          details: {}
        }
      };
    }
    return {
      ok: true,
      feature: featureId,
      ts: raw.generatedAt || new Date().toISOString(),
      traceId: traceId || "news",
      schemaVersion: 1,
      meta: { status: "OK", reason: "STATIC" },
      cache: { hit: true, ttl: 0, layer: "static" },
      upstream: { url, status: response.status, snippet: "" },
      data: {
        items: raw.items,
        updatedAt: raw.updatedAt || raw.generatedAt || raw.asOf || null,
        source: raw.sourceUpstream || raw.source || "snapshot"
      },
      error: null
    };
  } catch (error) {
    logger?.warn("news_snapshot_fetch_failed", { message: error?.message || "fetch failed" });
    return {
      ok: false,
      feature: featureId,
      ts: new Date().toISOString(),
      traceId: traceId || "news",
      schemaVersion: 1,
      cache: { hit: false, ttl: 0, layer: "none" },
      upstream: { url, status: null, snippet: "" },
      data: {},
      error: {
        code: "FETCH_FAILED",
        message: error?.message || "Request failed",
        details: {}
      }
    };
  }
}

export async function init(root, context = {}) {
  const { featureId = "rv-news-headlines", traceId, logger } = context;
  const data = await getOrFetch("rv-news-headlines", () => loadData({ featureId, traceId, logger }), {
    ttlMs: 300_000,
    featureId,
    logger
  });
  render(root, data, logger, featureId);
}

export async function refresh(root, context = {}) {
  const { featureId = "rv-news-headlines", traceId, logger } = context;
  const data = await loadData({ featureId, traceId, logger });
  render(root, data, logger, featureId);
}
