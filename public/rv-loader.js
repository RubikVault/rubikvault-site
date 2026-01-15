import { RV_CONFIG, FEATURES, DEBUG_PANIC_MODE } from "./rv-config.js";
import { createLogger, createTraceId } from "./debug/rv-debug.js";
import {
  initDebugConsole,
  registerBlock,
  setDebugContext,
  clearDebugContext,
  recordBlockEnd
} from "./rv-debug-console.js";
import { applyOverrides } from "./features/utils/flags.js";
import { resolveApiBase } from "./features/utils/api.js";
import { initFlagsPanel } from "./features/rv-flags-panel.js";
import { BLOCK_REGISTRY, formatBlockTitle } from "./features/blocks-registry.js";

const REGISTRY_URL = "./data/feature-registry.json";
const MANIFEST_URL = "./data/seed-manifest.json";
const RVCI_LATEST_URL = "./data/rvci_latest.json";
const RUN_ID = (() => {
  if (typeof window === "undefined") return "";
  if (window.__RV_RUN_ID) return window.__RV_RUN_ID;
  const id = createTraceId();
  window.__RV_RUN_ID = id;
  return id;
})();

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function setLoading(section, isLoading) {
  section.setAttribute("data-rv-loading", isLoading ? "true" : "false");
}

function isEffectivelyEmpty(contentEl) {
  if (!contentEl) return false;
  const selector =
    "table,canvas,svg,img,.rv-chart,.rv-data,.rv-content,[data-rendered=\"true\"]";
  if (contentEl.querySelector(selector)) return false;
  const text = contentEl.innerText ? contentEl.innerText.trim() : "";
  if (text.length >= 20) return false;
  const children = Array.from(contentEl.children || []);
  if (!children.length) return true;
  return children.every((child) => {
    const className = String(child.className || "");
    if (child.getAttribute("data-rv-loading") === "true") return true;
    if (/loading|placeholder|skeleton/i.test(className)) return true;
    if (child.tagName === "SCRIPT" || child.tagName === "STYLE") return true;
    return false;
  });
}

function renderError(contentEl, error) {
  if (!contentEl) return;
  const stack = error?.stack ? escapeHtml(error.stack) : "";
  contentEl.innerHTML = `
    <div class="rv-native-error">
      <strong>Feature konnte nicht geladen werden.</strong><br />
      <span>${escapeHtml(error?.message || "Unbekannter Fehler")}</span>
      ${stack ? `<pre class="rv-native-stack">${stack}</pre>` : ""}
      <button class="rv-native-retry" type="button" data-rv-action="retry">Retry</button>
    </div>
  `;

  const retryButton = contentEl.querySelector('[data-rv-action="retry"]');
  if (retryButton) {
    retryButton.addEventListener("click", () => {
      const section = contentEl.closest("[data-rv-feature]");
      const refreshButton = section?.querySelector('[data-rv-action="refresh"]');
      refreshButton?.click();
    });
  }
}

function isDebugEnabled() {
  if (typeof window === "undefined") return false;
  if (!RV_CONFIG.DEBUG_ENABLED) return false;
  const params = new URLSearchParams(window.location.search);
  const activated =
    params.get("debug") === "1" || window.localStorage?.getItem("debug") === "true";
  if (!activated) return false;
  if (RV_CONFIG.debugAuthToken) {
    return window.localStorage?.getItem("debugAuth") === RV_CONFIG.debugAuthToken;
  }
  return true;
}

function normalizeId(rawId) {
  const raw = String(rawId || "");
  const match = raw.match(/^(\d+):(.*)$/);
  const normalized = match ? (match[2] || "") : raw;
  return normalized.replace(/^rv-/, "");
}

if (isDebugEnabled()) {
  const testId = normalizeId("42:alpha-radar-lite");
  if (testId !== "alpha-radar-lite") {
    console.warn("[RV] normalizeId failed", { testId });
  }
}

function buildFallbackEnvelope(featureId, reason, error) {
  const ts = new Date().toISOString();
  return {
    ok: false,
    feature: featureId || "unknown",
    meta: {
      status: "NO_DATA",
      reason: reason || "NO_DATA",
      generatedAt: ts,
      stalenessSec: 0
    },
    data: { items: [] },
    warnings: [],
    error: error
      ? { code: reason || "NO_DATA", message: error?.message || "Snapshot load failed" }
      : null
  };
}

function normalizeSnapshotEnvelope(rawSnapshot, rawId) {
  if (
    rawSnapshot &&
    typeof rawSnapshot === "object" &&
    typeof rawSnapshot.ok === "boolean" &&
    rawSnapshot.meta &&
    typeof rawSnapshot.meta.status === "string"
  ) {
    return rawSnapshot;
  }

  if (!rawSnapshot || typeof rawSnapshot !== "object") {
    return buildFallbackEnvelope(rawId, "NO_DATA");
  }

  const meta = rawSnapshot.meta && typeof rawSnapshot.meta === "object" ? rawSnapshot.meta : {};
  const status = typeof meta.status === "string" && meta.status ? meta.status : "NO_DATA";
  const reason = meta.reason !== undefined && meta.reason !== null ? String(meta.reason) : "NO_DATA";
  const generatedAt = meta.generatedAt || rawSnapshot.generatedAt || new Date().toISOString();
  const dataAt = meta.dataAt || rawSnapshot.dataAt || generatedAt;
  const parsedGenerated = Date.parse(generatedAt);
  const parsedDataAt = Date.parse(dataAt);
  const stalenessSec = Number.isFinite(meta.stalenessSec)
    ? meta.stalenessSec
    : Number.isFinite(parsedGenerated) && Number.isFinite(parsedDataAt)
      ? Math.max(0, Math.floor((parsedGenerated - parsedDataAt) / 1000))
      : 0;
  const ok = status !== "ERROR" && status !== "NO_DATA";

  return {
    ok,
    feature: rawSnapshot.feature || rawSnapshot.blockId || rawId || "unknown",
    meta: {
      status,
      reason,
      generatedAt,
      stalenessSec
    },
    data: rawSnapshot.data && typeof rawSnapshot.data === "object" ? rawSnapshot.data : { items: [] },
    warnings: rawSnapshot.warnings || [],
    error: rawSnapshot.error || null
  };
}

const MIRROR_PREFERRED_IDS = new Set(["tech-signals", "alpha-radar", "alpha-radar-lite"]);

function computeStalenessSec(updatedAt, generatedAt) {
  if (!updatedAt) return 0;
  const updatedMs = Date.parse(updatedAt);
  const generatedMs = Date.parse(generatedAt);
  if (!Number.isFinite(updatedMs) || !Number.isFinite(generatedMs)) return 0;
  return Math.max(0, Math.floor((generatedMs - updatedMs) / 1000));
}

function extractMirrorItems(raw) {
  if (Array.isArray(raw?.items)) return raw.items;
  return [];
}

function getMirrorUpdatedAt(raw) {
  return (
    raw?.updatedAt ||
    raw?.asOf ||
    raw?.ts ||
    raw?.meta?.updatedAt ||
    raw?.meta?.ts ||
    null
  );
}

async function loadMirrorSnapshot(featureId, mirrorId) {
  try {
    const res = await fetch(`./mirrors/${mirrorId}.json`, { cache: "no-store" });
    if (!res.ok) return null;
    const raw = await res.json();
    const items = extractMirrorItems(raw);
    const generatedAt = new Date().toISOString();
    const updatedAt = getMirrorUpdatedAt(raw);
    const stalenessSec = computeStalenessSec(updatedAt, generatedAt);
    const reason = items.length ? "OK" : "EMPTY_VALID";
    const data = { items };
    if (mirrorId === "tech-signals") {
      const rawSignals = raw?.data?.signals;
      const rawRows = raw?.data?.rows;
      data.signals = Array.isArray(rawSignals) ? rawSignals : items;
      data.rows = Array.isArray(rawRows) ? rawRows : items;
    }
    if (mirrorId === "alpha-radar") {
      const rawPicks = raw?.data?.picks;
      if (rawPicks && typeof rawPicks === "object") {
        data.picks = rawPicks;
      } else {
        data.picks = items;
        data.lite = true;
      }
    }
    return {
      ok: true,
      feature: featureId,
      meta: {
        status: "LIVE",
        reason,
        generatedAt,
        stalenessSec
      },
      data,
      warnings: [],
      error: null
    };
  } catch (error) {
    return null;
  }
}

async function loadApiFallbackSnapshot(featureId, apiId) {
  const res = await fetch(`./api/${apiId}?debug=1`, {
    cache: "no-store",
    headers: { Accept: "application/json" }
  });
  if (!res.ok) {
    return buildFallbackEnvelope(featureId, "NO_DATA", new Error(`API ${res.status}`));
  }
  const payload = await res.json();
  return normalizeSnapshotEnvelope(payload, featureId);
}

async function loadPreferredSnapshot(rawId) {
  const snapshotId = normalizeId(rawId);
  if (!snapshotId) {
    return buildFallbackEnvelope(rawId, "NO_DATA");
  }
  if (MIRROR_PREFERRED_IDS.has(snapshotId)) {
    if (SNAPSHOT_CACHE.has(snapshotId)) {
      return SNAPSHOT_CACHE.get(snapshotId);
    }
    const mirrorId = snapshotId === "alpha-radar-lite" ? "alpha-radar" : snapshotId;
    const promise = loadMirrorSnapshot(rawId, mirrorId)
      .then((mirrorSnapshot) => {
        if (mirrorSnapshot) return mirrorSnapshot;
        return loadSnapshot(rawId);
      })
      .catch((error) => buildFallbackEnvelope(rawId, "NO_DATA", error));
    SNAPSHOT_CACHE.set(snapshotId, promise);
    return promise;
  }
  return loadSnapshot(rawId);
}

async function loadSnapshot(rawId, { force = false } = {}) {
  const snapshotId = normalizeId(rawId);
  if (!snapshotId) {
    return buildFallbackEnvelope(rawId, "NO_DATA");
  }
  if (!force && SNAPSHOT_CACHE.has(snapshotId)) {
    return SNAPSHOT_CACHE.get(snapshotId);
  }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), SNAPSHOT_TIMEOUT_MS);
  const fetchPromise = fetch(`./data/snapshots/${snapshotId}.json`, {
    cache: "no-store",
    signal: controller.signal
  })
    .then((res) => {
      if (!res.ok) {
        return buildFallbackEnvelope(rawId, "NO_DATA", new Error(`Snapshot ${res.status}`));
      }
      return res
        .json()
        .then((payload) => normalizeSnapshotEnvelope(payload, rawId))
        .catch((error) => buildFallbackEnvelope(rawId, "NO_DATA", error));
    })
    .catch((error) => buildFallbackEnvelope(rawId, "NO_DATA", error))
    .finally(() => {
      clearTimeout(timeout);
    });

  SNAPSHOT_CACHE.set(snapshotId, fetchPromise);
  return fetchPromise;
}

function normalizeRvciPath(rawPath, baseUrl = window.location.origin) {
  if (!rawPath) return null;
  const cleaned = String(rawPath).trim();
  if (!cleaned) return null;
  if (/^https?:\/\//i.test(cleaned)) return cleaned;
  if (cleaned.startsWith("/")) return new URL(cleaned, baseUrl).toString();
  const normalized = cleaned.replace(/^\.\//, "");
  return new URL(`/${normalized}`, baseUrl).toString();
}

function hasCompletePaths(paths) {
  const required = ["short", "mid", "long", "triggers"];
  const missing = required.filter((key) => !paths?.[key] || !String(paths[key]).trim());
  return { ok: missing.length === 0, missing };
}

async function fetchJsonStrict(url, { timeoutMs = SNAPSHOT_TIMEOUT_MS, debug = false } = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      cache: "no-store",
      headers: { Accept: "application/json" },
      signal: controller.signal
    });
    if (!res.ok) {
      const error = new Error(`HTTP ${res.status}`);
      error.code = "HTTP_ERROR";
      error.status = res.status;
      error.url = url;
      throw error;
    }
    const contentType = (res.headers.get("content-type") || "").toLowerCase();
    const text = await res.text();
    const trimmed = text.trim();
    if (!trimmed || (trimmed[0] !== "{" && trimmed[0] !== "[")) {
      const error = new Error("NON_JSON");
      error.code = "NON_JSON";
      error.url = url;
      error.contentType = contentType;
      error.snippet = trimmed.slice(0, 120);
      if (debug) {
        console.warn("[RVCI] non-json response", {
          url,
          contentType,
          snippet: error.snippet
        });
      }
      throw error;
    }
    try {
      return JSON.parse(trimmed);
    } catch (err) {
      const error = new Error("PARSE_ERROR");
      error.code = "PARSE_ERROR";
      error.url = url;
      error.contentType = contentType;
      error.snippet = trimmed.slice(0, 120);
      if (debug) {
        console.warn("[RVCI] parse error", { url, snippet: error.snippet });
      }
      throw error;
    }
  } finally {
    clearTimeout(timeout);
  }
}

async function loadRvciLatest(debug = false) {
  const cacheKey = `latest:${debug ? "debug" : "default"}`;
  if (RVCI_CACHE.has(cacheKey)) return RVCI_CACHE.get(cacheKey);
  const sources = [
    { label: "api", url: `/api/rvci-engine${debug ? "?debug=1" : ""}` },
    { label: "mirror", url: "/mirrors/rvci_latest.json" },
    { label: "data", url: "/data/rvci_latest.json" }
  ];
  const errors = [];
  let fallbackPayload = null;
  let fallbackSource = null;
  let fallbackMissing = [];
  let fallbackPaths = {};

  const promise = (async () => {
    for (const source of sources) {
      try {
        const payload = await fetchJsonStrict(source.url, { debug });
        const normalized = normalizeSnapshotEnvelope(payload, "rvci-engine");
        const normalizedPaths = {};
        const rawPaths = normalized?.data?.paths || {};
        Object.entries(rawPaths || {}).forEach(([key, value]) => {
          const resolved = normalizeRvciPath(value);
          if (resolved) normalizedPaths[key] = resolved;
        });
        const pathCheck = hasCompletePaths(normalizedPaths);
        if (pathCheck.ok) {
          return {
            ok: true,
            payload: normalized,
            source: source.url,
            paths: normalizedPaths,
            missing: [],
            errors
          };
        }
        if (!fallbackPayload) {
          fallbackPayload = normalized;
          fallbackSource = source.url;
          fallbackMissing = pathCheck.missing;
          fallbackPaths = normalizedPaths;
        }
        errors.push({
          source: source.url,
          code: "PATHS_INCOMPLETE",
          missing: pathCheck.missing
        });
      } catch (error) {
        errors.push({
          source: source.url,
          code: error?.code || "FETCH_ERROR",
          status: error?.status || null
        });
      }
    }
    return {
      ok: false,
      payload: fallbackPayload || buildFallbackEnvelope("rvci-engine", "NO_DATA"),
      source: fallbackSource,
      paths: fallbackPaths,
      missing: fallbackMissing,
      errors
    };
  })();

  RVCI_CACHE.set(cacheKey, promise);
  return promise;
}

async function loadRvciFile(rawPath, debug = false) {
  const resolved = normalizeRvciPath(rawPath);
  if (!resolved) {
    return {
      payload: buildFallbackEnvelope("rvci-engine", "NO_DATA"),
      error: { code: "MISSING_PATH" }
    };
  }
  const cacheKey = `file:${resolved}`;
  if (RVCI_CACHE.has(cacheKey)) return RVCI_CACHE.get(cacheKey);
  const promise = (async () => {
    try {
      const payload = await fetchJsonStrict(resolved, { debug });
      return { payload: normalizeSnapshotEnvelope(payload, "rvci-engine"), error: null };
    } catch (error) {
      return {
        payload: buildFallbackEnvelope("rvci-engine", "NO_DATA", error),
        error: {
          code: error?.code || "FETCH_ERROR",
          status: error?.status || null
        }
      };
    }
  })();

  RVCI_CACHE.set(cacheKey, promise);
  return promise;
}

const INLINE_DIAGNOSTICS_ID = "rv-inline-diagnostics";
const apiState = {
  disabled: false,
  resolution: null
};
const statusState = new Map();
const statusSummary = {
  cacheSamples: 0,
  cacheHits: 0,
  lastError: null
};
const DASHBOARD_STATE = {
  fast: { inflight: null, blocks: {}, fetchedAt: null },
  slow: { inflight: null, blocks: {}, fetchedAt: null }
};
const refreshState = new Map();
const STATUS_LABELS = {
  "rv-market-cockpit": "Cockpit",
  "rv-market-health": "MarketHealth",
  "rv-price-snapshot": "Snapshot",
  "rv-top-movers": "Volume",
  "rv-earnings-calendar": "Earnings",
  "rv-news-headlines": "News",
  "rv-watchlist-local": "Watchlist",
  "rv-macro-rates": "Macro",
  "rv-crypto-snapshot": "Crypto",
  "rv-sentiment-barometer": "Sentiment",
  "rv-tech-signals": "Signals",
  "rv-alpha-radar": "Alpha",
  "rv-market-regime": "Regime",
  "rv-arb-risk-regime": "ARB Risk",
  "rv-arb-liquidity-pulse": "ARB Liquidity",
  "rv-arb-breadth-lite": "ARB Breadth",
  "rv-why-moved": "WhyMoved",
  "rv-volume-anomaly": "VolumeAnom",
  "rv-breakout-energy": "Breakout",
  "rv-hype-divergence": "Hype",
  "rvci-engine": "RVCI",
  "rv-congress-trading": "Congress",
  "rv-insider-cluster": "Insiders",
  "rv-analyst-stampede": "Analyst",
  "rv-smart-money": "SmartMoney",
  "rv-alpha-performance": "AlphaPerf",
  "rv-earnings-reality": "EarningsRx"
};
const STATUS_ORDER = [
  "rv-market-cockpit",
  "rv-market-health",
  "rv-earnings-calendar",
  "rv-news-headlines",
  "rv-top-movers",
  "rv-watchlist-local",
  "rv-crypto-snapshot",
  "rv-sentiment-barometer",
  "rv-tech-signals",
  "rv-alpha-radar",
  "rv-market-regime",
  "rv-arb-risk-regime",
  "rv-arb-liquidity-pulse",
  "rv-arb-breadth-lite",
  "rv-why-moved",
  "rv-volume-anomaly",
  "rv-breakout-energy",
  "rv-hype-divergence",
  "rv-congress-trading",
  "rv-insider-cluster",
  "rv-analyst-stampede",
  "rv-smart-money",
  "rv-alpha-performance",
  "rv-earnings-reality"
];
const PUBLIC_FEATURE_ALLOWLIST = new Set([
  "rv-market-cockpit",
  "rv-tech-signals",
  "rv-alpha-radar",
  "rv-sp500-sectors"
]);
const COLLAPSE_KEY_PREFIX = "rv-collapse:";
const DEFAULT_OPEN_COUNT = 3;
const CRYPTO_FEATURES = new Set(["rv-crypto-snapshot"]);
const STALE_OPEN_MS = 20 * 60 * 1000;
const STALE_CRYPTO_MS = 20 * 60 * 1000;
const NY_FORMATTER = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/New_York",
  hour12: false,
  weekday: "short",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit"
});
const NY_WEEKDAY_INDEX = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6
};
const DASHBOARD_MIN_REFRESH_MS = 60_000;
const DASHBOARD_JITTER_PCT = 0.15;
const REFRESH_BACKOFF_MAX_MS = 20 * 60 * 1000;
let FEATURE_REGISTRY_CACHE = null;
let MANIFEST_CACHE = null;
const SNAPSHOT_ONLY = true;
const SNAPSHOT_CACHE = new Map();
const RVCI_CACHE = new Map();
const SNAPSHOT_TIMEOUT_MS = 5000;

function normalizeBlockEntries(list) {
  return (Array.isArray(list) ? list : [])
    .map((entry, index) => {
      if (!entry || typeof entry !== "object") return null;
      const blockId = entry.blockId || entry.id || null;
      if (!blockId) return null;
      const idx = Number.isFinite(entry.idx) ? entry.idx : index + 1;
      const title = entry.title || entry.name || blockId;
      return { ...entry, blockId, idx, title };
    })
    .filter(Boolean);
}

async function loadRegistryBlocks() {
  if (FEATURE_REGISTRY_CACHE) {
    return { ok: true, blocks: FEATURE_REGISTRY_CACHE, reason: "cache" };
  }
  try {
    const res = await fetch(REGISTRY_URL, { cache: "no-store" });
    if (!res.ok) {
      console.warn("[RV] registry fetch failed", res.status);
      return { ok: false, reason: `http_${res.status}` };
    }
    const contentType = (res.headers.get("content-type") || "").toLowerCase();
    if (!contentType.includes("json")) {
      console.warn("[RV] registry content-type not json", contentType);
      return { ok: false, reason: "content_type" };
    }
    const text = await res.text();
    let payload;
    try {
      payload = JSON.parse(text);
    } catch (error) {
      console.warn("[RV] registry parse failed", error);
      return { ok: false, reason: "parse_error" };
    }
    if (!payload || !Array.isArray(payload.features)) {
      console.warn("[RV] registry schema invalid");
      return { ok: false, reason: "schema_invalid" };
    }
    const blocks = normalizeBlockEntries(payload.features);
    if (!blocks.length) {
      return { ok: false, reason: "empty_features" };
    }
    FEATURE_REGISTRY_CACHE = blocks;
    return { ok: true, blocks, reason: "ok" };
  } catch (error) {
    console.warn("[RV] registry fetch error", error);
    return { ok: false, reason: "fetch_error" };
  }
}

async function loadSeedManifest() {
  if (MANIFEST_CACHE) {
    return { ok: true, blocks: MANIFEST_CACHE, reason: "cache" };
  }
  try {
    const res = await fetch(MANIFEST_URL, { cache: "no-store" });
    if (!res.ok) {
      console.warn("[RV] manifest fetch failed", res.status);
      return { ok: false, reason: `http_${res.status}` };
    }
    const text = await res.text();
    let payload;
    try {
      payload = JSON.parse(text);
    } catch (error) {
      console.warn("[RV] manifest parse failed", error);
      return { ok: false, reason: "parse_error" };
    }
    const blocks = normalizeBlockEntries(payload?.blocks);
    if (!blocks.length) {
      return { ok: false, reason: "empty_blocks" };
    }
    MANIFEST_CACHE = blocks;
    return { ok: true, blocks, reason: "ok" };
  } catch (error) {
    console.warn("[RV] manifest fetch error", error);
    return { ok: false, reason: "fetch_error" };
  }
}

function mapBlocksToFeatures(blocks, features) {
  const byId = new Map(features.map((feature) => [feature.id, feature]));
  const byShort = new Map(
    features.map((feature) => [String(feature.id || "").replace(/^rv-/, ""), feature])
  );
  const byApi = new Map(features.filter((feature) => feature.api).map((feature) => [feature.api, feature]));
  const mapped = [];
  const seen = new Set();

  blocks.forEach((block, index) => {
    const blockId = block.blockId;
    if (!blockId) return;
    const candidateIds = [blockId, `rv-${blockId}`];
    let feature = null;
    for (const id of candidateIds) {
      if (byId.has(id)) {
        feature = byId.get(id);
        break;
      }
    }
    if (!feature && byShort.has(blockId)) {
      feature = byShort.get(blockId);
    }
    if (!feature && byApi.has(blockId)) {
      feature = byApi.get(blockId);
    }
    const manifestMeta = {
      blockId,
      idx: Number.isFinite(block.idx) ? block.idx : index + 1,
      title: block.title || blockId
    };
    if (feature) {
      const next = {
        ...feature,
        title: feature.title || manifestMeta.title,
        manifest: manifestMeta
      };
      if (!seen.has(next.id)) {
        mapped.push(next);
        seen.add(next.id);
      }
      return;
    }
    const fallbackId = blockId;
    if (seen.has(fallbackId)) return;
    mapped.push({
      id: fallbackId,
      title: manifestMeta.title,
      module: null,
      api: null,
      enabled: true,
      manifest: manifestMeta
    });
    seen.add(fallbackId);
  });

  return mapped;
}

function ensurePinnedBlocks(blocks, features) {
  if (!Array.isArray(blocks)) return blocks;
  const next = [...blocks];
  const featureById = new Map(features.map((feature) => [feature.id, feature]));
  const pinned = [
    { featureId: "rv-tech-signals", blockId: "tech-signals" },
    { featureId: "rv-alpha-radar", blockId: "alpha-radar", replaceFrom: "alpha-radar-lite" }
  ];

  pinned.forEach((pin) => {
    const feature = featureById.get(pin.featureId);
    if (!feature) return;
    if (next.some((block) => block.blockId === pin.blockId)) return;
    if (pin.replaceFrom) {
      const replaceIndex = next.findIndex((block) => block.blockId === pin.replaceFrom);
      if (replaceIndex !== -1) {
        next[replaceIndex] = {
          ...next[replaceIndex],
          blockId: pin.blockId,
          title: feature.title || pin.blockId
        };
        return;
      }
    }
    next.push({ blockId: pin.blockId, idx: next.length + 1, title: feature.title || pin.blockId });
  });

  return next;
}

function createManifestSection(title) {
  const section = document.createElement("section");
  section.className = "rv-section rv-native-block";
  section.setAttribute("data-rv-loading", "true");
  section.setAttribute("data-rv-collapsible", "true");
  section.innerHTML = `
    <div class="rv-native-header">
      <h2 class="rv-native-title">${title}</h2>
      <button class="rv-native-refresh" type="button" data-rv-action="refresh">Refresh</button>
    </div>
    <div class="rv-native-body rv-card">
      <div class="rv-native-skeleton">
        <div class="rv-native-line"></div>
        <div class="rv-native-line short"></div>
        <div class="rv-native-line"></div>
      </div>
      <div class="rv-native-root" data-rv-root></div>
    </div>
  `;
  return section;
}

function syncBlockGrid(blocks, features) {
  const grid = document.querySelector(".rv-block-grid");
  if (!grid) return;
  const normalized = normalizeBlockEntries(blocks);
  if (!normalized.length) return;
  const featureByBlock = new Map(
    features.map((feature) => [feature?.manifest?.blockId, feature]).filter(([key]) => key)
  );
  const existing = Array.from(grid.querySelectorAll(".rv-section[data-rv-feature]"));

  normalized.forEach((block, index) => {
    const feature = featureByBlock.get(block.blockId);
    const featureId = feature?.id || block.blockId;
    const title = block.title || feature?.title || block.blockId;
    let section = existing[index];
    if (!section) {
      section = createManifestSection(title);
      grid.appendChild(section);
    }
    section.hidden = false;
    section.setAttribute("data-rv-feature", featureId);
    // Clean title: remove "Block XX — " prefix
    const cleanTitle = title ? title.replace(/^Block\s+[0-9X]{1,2}\s*[-–—]\s*/i, "").trim() : title;
    section.setAttribute("data-rv-block-name", cleanTitle || title);
    section.setAttribute("data-rv-manifest-id", block.blockId);
    section.setAttribute("data-rv-loading", "true");
    section.removeAttribute("data-rv-disabled");
    section.removeAttribute("data-rv-deprecated");
    section.dataset.rvBlockIndex = String(index);
    const titleEl = section.querySelector("h2, h3, .block-title, .card-title");
    if (titleEl) titleEl.textContent = cleanTitle || title;
  });

  existing.slice(normalized.length).forEach((section) => {
    section.hidden = true;
    section.removeAttribute("data-rv-feature");
  });
}

function showManifestBanner(count) {
  if (!isDebugEnabled()) return;
  if (document.getElementById("rv-manifest-banner")) return;
  const banner = document.createElement("div");
  banner.id = "rv-manifest-banner";
  banner.textContent = `Registry unavailable -> using manifest (${count})`;
  banner.style.cssText =
    "position:fixed;bottom:16px;right:16px;padding:8px 12px;border:1px solid #f3c6a6;background:#fff4ea;color:#7a3e00;font-size:12px;border-radius:8px;z-index:9999;max-width:280px;";
  document.body.appendChild(banner);
}

function getNyParts(date = new Date()) {
  const parts = NY_FORMATTER.formatToParts(date);
  const map = {};
  parts.forEach((part) => {
    map[part.type] = part.value;
  });
  return {
    weekday: map.weekday,
    hour: Number(map.hour),
    minute: Number(map.minute),
    second: Number(map.second)
  };
}

function isMarketOpenNY(date = new Date()) {
  const parts = getNyParts(date);
  const weekdayIndex = NY_WEEKDAY_INDEX[parts.weekday] ?? 0;
  const secondsNow = parts.hour * 3600 + parts.minute * 60 + parts.second;
  const openTime = 9 * 3600 + 30 * 60;
  const closeTime = 16 * 3600;
  const isWeekday = weekdayIndex >= 1 && weekdayIndex <= 5;
  return isWeekday && secondsNow >= openTime && secondsNow < closeTime;
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

function ensureDashboardState() {
  if (typeof window === "undefined") return null;
  if (!window.__RV_DASHBOARD__) {
    window.__RV_DASHBOARD__ = { blocks: {}, fetchedAt: null };
  }
  return window.__RV_DASHBOARD__;
}

function mergeDashboardBlocks(seg, payload) {
  const state = DASHBOARD_STATE[seg] || DASHBOARD_STATE.fast;
  const blocks = payload?.data?.blocks && typeof payload.data.blocks === "object"
    ? payload.data.blocks
    : {};
  state.blocks = { ...state.blocks, ...blocks };
  state.fetchedAt = payload?.meta?.ts || payload?.ts || new Date().toISOString();
  const dashboard = ensureDashboardState();
  if (dashboard) {
    dashboard.blocks = { ...dashboard.blocks, ...blocks };
    dashboard.fetchedAt = state.fetchedAt;
  }
}

function computeJitter(ms) {
  const delta = ms * DASHBOARD_JITTER_PCT;
  return Math.round(ms + (Math.random() * 2 - 1) * delta);
}

async function fetchDashboardSegment(seg, { force = false } = {}) {
  const state = DASHBOARD_STATE[seg] || DASHBOARD_STATE.fast;
  if (state.inflight && !force) return state.inflight;
  if (SNAPSHOT_ONLY) return null;
  const resolution = resolveApiBase();
  if (!resolution.ok) return null;
  const url = `${resolution.apiPrefix}/dashboard?seg=${seg}`;
  const started = performance.now();
  const inflight = fetch(url, {
    headers: { Accept: "application/json", "x-rv-trace": createTraceId(), "x-rv-run-id": RUN_ID }
  })
    .then((response) => response.json())
    .then((payload) => {
      if (payload && payload.data && payload.data.blocks) {
        mergeDashboardBlocks(seg, payload);
      }
      return payload;
    })
    .catch(() => null)
    .finally(() => {
      state.inflight = null;
      const elapsed = Math.round(performance.now() - started);
      const dashboard = ensureDashboardState();
      if (dashboard) dashboard.lastFetchMs = elapsed;
    });
  state.inflight = inflight;
  return inflight;
}

async function prefetchDashboard(features) {
  if (SNAPSHOT_ONLY) return;
  const entries = Array.isArray(features) ? features : [];
  const needsSlow = entries.some((feature) => {
    const reg = BLOCK_REGISTRY[feature?.id];
    return classifySegment(reg) === "slow";
  });
  fetchDashboardSegment("fast");
  if (needsSlow) {
    window.setTimeout(() => fetchDashboardSegment("slow"), 1500);
  }
}

async function refreshDashboardForFeature(featureId) {
  if (SNAPSHOT_ONLY) return null;
  const reg = BLOCK_REGISTRY[featureId];
  const seg = classifySegment(reg);
  return fetchDashboardSegment(seg, { force: true });
}

function normalizeStatus(featureId, status, headline = "") {
  const entry = statusState.get(featureId) || {};
  const registry = BLOCK_REGISTRY[featureId] || null;
  const updatedAt = entry.updatedAt ? new Date(entry.updatedAt).getTime() : null;
  const now = Date.now();
  const marketOpen = isMarketOpenNY();
  const headlineText = String(headline || "");
  const emptyMatch = /no data|no symbols|empty|placeholder|no live/i.test(headlineText);
  const dataQuality = entry.dataQuality || {};
  const itemsCount = Number.isFinite(entry.itemsCount) ? entry.itemsCount : null;
  const mode = entry.mode ? String(entry.mode).toUpperCase() : "";

  if (status === "FAIL" || /CONFIG_MISSING/i.test(headlineText)) {
    return { status, headline: headlineText };
  }

  const normalizedFeatureId = String(featureId || "").replace(/^rv-/, "");
  if (
    (normalizedFeatureId === "tech-signals" ||
      normalizedFeatureId === "alpha-radar" ||
      normalizedFeatureId === "alpha-radar-lite") &&
    itemsCount === 0 &&
    (entry.metaStatus === "LIVE" || entry.metaStatus === "STALE")
  ) {
    return { status: "OK", headline: "EMPTY_VALID" };
  }

  if (registry) {
    const expected = registry.expectedMinItems ?? 0;
    if (itemsCount !== null && itemsCount < expected) {
      if (registry.blockType === "EVENT") {
        return { status: "OK", headline: "EMPTY" };
      }
      return { status: "PARTIAL", headline: "EMPTY" };
    }
  } else if (emptyMatch) {
    return { status: "OK", headline: "EMPTY" };
  }

  if (dataQuality.status === "COVERAGE_LIMIT") {
    return { status: "PARTIAL", headline: "COVERAGE" };
  }

  if (!updatedAt || Number.isNaN(updatedAt)) {
    return { status, headline: headlineText || mode || "OK" };
  }

  const ageMs = now - updatedAt;
  if (registry?.blockType === "LIVE" || CRYPTO_FEATURES.has(featureId)) {
    const maxMs = (registry?.freshness?.liveMaxMinutes || 20) * 60 * 1000;
    if (ageMs > maxMs) return { status: "PARTIAL", headline: "STALE" };
    return { status: "OK", headline: mode || "LIVE" };
  }

  if (!marketOpen) {
    return { status: "OK", headline: mode || "EOD" };
  }

  const maxOpenMs = (registry?.freshness?.okMaxHoursWeekday || 1) * 60 * 60 * 1000;
  if (ageMs > maxOpenMs) return { status: "PARTIAL", headline: "STALE" };
  return { status: "OK", headline: mode || headlineText || "OK" };
}

function getApiResolution() {
  const resolution = resolveApiBase();
  apiState.resolution = resolution;
  apiState.disabled = !resolution.ok;
  return resolution;
}

function applyApiMeta(logger) {
  if (!logger) return getApiResolution();
  const resolution = getApiResolution();
  logger.setMeta({
    configLoaded: resolution.configLoaded,
    apiBase: resolution.apiBase || "",
    apiPrefix: resolution.apiPrefix || "",
    configErrors: resolution.errors || []
  });
  if (!resolution.ok) {
    logger.warn("config_missing", {
      configLoaded: resolution.configLoaded,
      errors: resolution.errors || []
    });
  }
  return resolution;
}

function normalizeMetaValue(value) {
  return typeof value === "string" ? value.trim().toUpperCase() : "";
}

function statusToSeverity({ ok, metaStatus, reason } = {}) {
  const normalizedStatus = normalizeMetaValue(metaStatus);
  const normalizedReason = normalizeMetaValue(reason);
  let severity = "info";
  if (ok === false || normalizedStatus === "ERROR" || normalizedStatus === "FAIL") {
    severity = "error";
  } else if (
    normalizedStatus === "STALE" ||
    normalizedStatus === "PARTIAL" ||
    normalizedReason === "MIRROR_FALLBACK"
  ) {
    severity = "warning";
  } else if ((normalizedStatus === "LIVE" || normalizedStatus === "OK") && ok === true) {
    severity = "success";
  }
  if (ok === true && severity === "error") {
    console.warn("[RV-Loader] SEVERITY_DOWNGRADE", {
      ok,
      metaStatus: normalizedStatus || metaStatus || "",
      reason: normalizedReason || reason || ""
    });
    severity = "warning";
  }
  return severity;
}

function severityToState(severity) {
  if (severity === "success") return "ok";
  if (severity === "warning") return "partial";
  if (severity === "error") return "fail";
  return "info";
}

function severityIcon(severity) {
  if (severity === "success") return "OK";
  if (severity === "warning") return "WARN";
  if (severity === "error") return "FAIL";
  return "LOAD";
}

function getEntrySeverity(entry) {
  return statusToSeverity({
    ok: entry?.ok,
    metaStatus: entry?.metaStatus || entry?.status,
    reason: entry?.metaReason
  });
}

function resolveStatusLabel(featureId, blockName) {
  // Clean block name (remove "Block XX — " prefix)
  const cleanName = blockName ? blockName.replace(/^Block\s+[0-9X]{1,2}\s*[-–—]\s*/i, "").trim() : null;
  return STATUS_LABELS[featureId] || cleanName || blockName || featureId || "Block";
}

function ensureStatusStrip() {
  if (typeof document === "undefined") return null;
  let strip = document.getElementById("rv-status-strip");
  if (strip) return strip;

  const header = document.querySelector("header.rv-header");
  if (!header) return null;

  strip = document.createElement("div");
  strip.className = "rv-status-strip";
  strip.id = "rv-status-strip";
  strip.setAttribute("aria-live", "polite");
  strip.innerHTML = "<span>System status loading…</span>";

  const anchor = header.querySelector("#rv-data-updated");
  if (anchor && anchor.parentNode === header) {
    header.insertBefore(strip, anchor);
  } else {
    header.appendChild(strip);
  }

  return strip;
}

function updateStatusStrip() {
  if (typeof document === "undefined") return;
  // Only show status strip in debug mode
  if (!isDebugEnabled()) {
    const existing = document.getElementById("rv-status-strip");
    if (existing) existing.remove();
    return;
  }

  const ensured = ensureStatusStrip();
  if (!ensured) return;
  
  // ensure we always write into the ensured element
  // (if an older strip existed it has been removed above)

  const entries = STATUS_ORDER.map((featureId) => {
    const entry = statusState.get(featureId);
    return entry
      ? { ...entry, featureId }
      : {
          featureId,
          label: resolveStatusLabel(featureId),
          status: "PARTIAL",
          headline: "Loading"
        };
  });

  const pills = entries
    .map((entry) => {
      const severity = getEntrySeverity(entry);
      const icon = severityIcon(severity);
      const label = entry.label || resolveStatusLabel(entry.featureId);
      const state = severityToState(severity);
      const detail = entry.headline ? ` · ${entry.headline}` : "";
      return `<span class="rv-status-pill" data-rv-state="${state}">${label}: ${icon}${detail}</span>`;
    })
    .join("");

  const cacheRate =
    statusSummary.cacheSamples > 0
      ? `${Math.round((statusSummary.cacheHits / statusSummary.cacheSamples) * 100)}%`
      : "--";
  const lastError = statusSummary.lastError || "--";

  ensured.innerHTML = `
    ${pills}
    <span class="rv-status-meta">Cache hit ${cacheRate}</span>
    <span class="rv-status-meta">Last error: ${lastError}</span>
  `;
}

function recordStatus(featureId, blockName, status, headline) {
  const existing = statusState.get(featureId) || {};
  const label = resolveStatusLabel(featureId, blockName || existing.label);
  statusState.set(featureId, {
    ...existing,
    label,
    status,
    headline
  });
  const severity = statusToSeverity({
    ok: existing.ok,
    metaStatus: existing.metaStatus || status,
    reason: existing.metaReason
  });
  if ((severity === "error" || severity === "warning") && headline) {
    statusSummary.lastError = headline;
  }
  updateStatusStrip();
}

function recordCache(featureId, cacheLayer) {
  if (!cacheLayer) return;
  const entry = statusState.get(featureId) || {};
  statusState.set(featureId, { ...entry, cacheLayer });
  statusSummary.cacheSamples += 1;
  if (cacheLayer === "kv") {
    statusSummary.cacheHits += 1;
  }
  updateStatusStrip();
}

function readCollapsed(featureId) {
  try {
    const raw = window.localStorage?.getItem(`${COLLAPSE_KEY_PREFIX}${featureId}`);
    if (raw === null) return null;
    return raw === "true";
  } catch (error) {
    return null;
  }
}

function writeCollapsed(featureId, value) {
  try {
    window.localStorage?.setItem(`${COLLAPSE_KEY_PREFIX}${featureId}`, value ? "true" : "false");
  } catch (error) {
    // ignore
  }
}

function setCollapsed(section, collapsed) {
  if (!section) return;
  section.classList.toggle("is-collapsed", collapsed);
  section.setAttribute("data-rv-collapsed", collapsed ? "true" : "false");
}

function ensureToggle(section, featureId) {
  const header = section.querySelector(".rv-native-header");
  if (!header || header.querySelector("[data-rv-action=\"collapse\"]")) return;
  const refreshButton = header.querySelector("[data-rv-action=\"refresh\"]");
  let actions = header.querySelector(".rv-native-actions");
  if (!actions) {
    actions = document.createElement("div");
    actions.className = "rv-native-actions";
    if (refreshButton) {
      header.removeChild(refreshButton);
      actions.appendChild(refreshButton);
    }
    header.appendChild(actions);
  }
  const button = document.createElement("button");
  button.className = "rv-native-toggle";
  button.type = "button";
  button.setAttribute("data-rv-action", "collapse");
  button.textContent = "Collapse";
  actions.appendChild(button);
  button.addEventListener("click", () => {
    const collapsed = section.classList.contains("is-collapsed");
    const next = !collapsed;
    setCollapsed(section, next);
    writeCollapsed(featureId, next);
    button.textContent = next ? "Expand" : "Collapse";
  });
}

function initAccordion(sections) {
  if (typeof window === "undefined") return;
  const isMobile = window.matchMedia("(max-width: 768px)").matches;
  sections.forEach((section, index) => {
    if (section.getAttribute("data-rv-collapsible") !== "true") return;
    const featureId = section.getAttribute("data-rv-feature") || `block-${index}`;
    ensureToggle(section, featureId);
    const saved = readCollapsed(featureId);
    if (saved !== null) {
      setCollapsed(section, saved);
      const button = section.querySelector("[data-rv-action=\"collapse\"]");
      if (button) button.textContent = saved ? "Expand" : "Collapse";
      return;
    }
    const shouldCollapse = isMobile && index >= DEFAULT_OPEN_COUNT;
    setCollapsed(section, shouldCollapse);
    const button = section.querySelector("[data-rv-action=\"collapse\"]");
    if (button) button.textContent = shouldCollapse ? "Expand" : "Collapse";
  });
}

function expandSection(section) {
  if (!section) return;
  if (!section.classList.contains("is-collapsed")) return;
  const featureId = section.getAttribute("data-rv-feature") || "";
  setCollapsed(section, false);
  if (featureId) writeCollapsed(featureId, false);
  const button = section.querySelector("[data-rv-action=\"collapse\"]");
  if (button) button.textContent = "Collapse";
}

function setupSubnav() {
  if (typeof document === "undefined") return;
  const links = Array.from(document.querySelectorAll(".rv-subnav a[href^=\"#\"]"));
  const setActive = (activeLink) => {
    links.forEach((link) => link.classList.remove("is-active"));
    if (activeLink) activeLink.classList.add("is-active");
  };
  if (links.length) {
    const initial = links.find((link) => link.getAttribute("href") === window.location.hash);
    setActive(initial || links[0]);
  }
  links.forEach((link) => {
    link.addEventListener("click", (event) => {
      const targetId = link.getAttribute("href");
      if (!targetId) return;
      const target = document.querySelector(targetId);
      if (!target) return;
      event.preventDefault();
      target.scrollIntoView({ behavior: "smooth", block: "start" });
      expandSection(target.closest("[data-rv-feature]") || target);
      setActive(link);
    });
  });
}

function initVisibilityObserver(sections) {
  if (typeof IntersectionObserver === "undefined") return;
  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        const section = entry.target;
        section.setAttribute("data-rv-visible", entry.isIntersecting ? "true" : "false");
      });
    },
    {
      rootMargin: RV_CONFIG.loader?.rootMargin || "300px 0px 300px 0px",
      threshold: RV_CONFIG.loader?.threshold ?? 0.05
    }
  );
  sections.forEach((section) => observer.observe(section));
}

function isHtmlFallback(contentType, preview) {
  if (contentType && contentType.includes("text/html")) return true;
  const trimmed = String(preview || "").trim().toLowerCase();
  return trimmed.startsWith("<!doctype html") || trimmed.startsWith("<html");
}

function createInlineDiagnosticsPanel() {
  if (typeof document === "undefined") return null;
  const existing = document.getElementById(INLINE_DIAGNOSTICS_ID);
  if (existing) return existing;

  const panel = document.createElement("div");
  panel.id = INLINE_DIAGNOSTICS_ID;
  panel.innerHTML = `
    <div class="rv-inline-header">
      <strong>RubikVault Diagnostics (Fallback)</strong>
      <div class="rv-inline-actions">
        <button type="button" data-action="refresh">Run checks</button>
        <button type="button" data-action="copy">Copy JSON</button>
        <button type="button" data-action="toggle">Hide</button>
      </div>
    </div>
    <div class="rv-inline-meta"></div>
    <pre class="rv-inline-body"></pre>
  `;

  const style = document.createElement("style");
  style.textContent = `
    #${INLINE_DIAGNOSTICS_ID} {
      position: fixed;
      right: 16px;
      bottom: 16px;
      width: min(520px, 94vw);
      max-height: 70vh;
      z-index: 999999;
      background: rgba(2, 6, 23, 0.95);
      color: #e2e8f0;
      font-family: "Inter", system-ui, sans-serif;
      border: 1px solid rgba(148, 163, 184, 0.3);
      border-radius: 12px;
      box-shadow: 0 18px 40px rgba(2, 6, 23, 0.6);
      padding: 12px;
      display: grid;
      gap: 8px;
    }

    #${INLINE_DIAGNOSTICS_ID}.is-collapsed .rv-inline-meta,
    #${INLINE_DIAGNOSTICS_ID}.is-collapsed .rv-inline-body {
      display: none;
    }

    #${INLINE_DIAGNOSTICS_ID} .rv-inline-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
    }

    #${INLINE_DIAGNOSTICS_ID} .rv-inline-actions {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
    }

    #${INLINE_DIAGNOSTICS_ID} button {
      border: 1px solid rgba(148, 163, 184, 0.4);
      background: rgba(15, 23, 42, 0.7);
      color: inherit;
      padding: 4px 8px;
      border-radius: 999px;
      font-size: 11px;
      cursor: pointer;
    }

    #${INLINE_DIAGNOSTICS_ID} .rv-inline-meta {
      font-size: 11px;
      color: #94a3b8;
      display: grid;
      gap: 4px;
    }

    #${INLINE_DIAGNOSTICS_ID} .rv-inline-body {
      margin: 0;
      font-size: 11px;
      white-space: pre-wrap;
      word-break: break-word;
      overflow: auto;
      max-height: 48vh;
    }
  `;

  document.head.appendChild(style);
  document.body.appendChild(panel);

  return panel;
}

function initInlineDiagnostics({ assetPaths, importPaths, apiPaths }) {
  const panel = createInlineDiagnosticsPanel();
  if (!panel) return;

  const meta = panel.querySelector(".rv-inline-meta");
  const body = panel.querySelector(".rv-inline-body");
  const state = {
    lastRun: null,
    errors: []
  };

  const setMeta = () => {
    if (!meta) return;
    meta.innerHTML = `
      <div><strong>URL:</strong> ${escapeHtml(window.location.href)}</div>
      <div><strong>Build:</strong> ${escapeHtml(RV_CONFIG.buildId || "(unknown)")}</div>
      <div><strong>apiBase:</strong> ${escapeHtml(RV_CONFIG.apiBase || "(none)")}</div>
    `;
  };

  const renderBody = (payload) => {
    if (!body) return;
    body.textContent = JSON.stringify(payload, null, 2);
  };

  const recordError = (error) => {
    state.errors.unshift({
      ts: new Date().toISOString(),
      message: error?.message || String(error || "")
    });
  };

  window.addEventListener("error", (event) => {
    recordError(event.error || event.message);
  });
  window.addEventListener("unhandledrejection", (event) => {
    recordError(event.reason || "Unhandled rejection");
  });

  const runChecks = async () => {
    const payload = {
      generatedAt: new Date().toISOString(),
      url: window.location.href,
      userAgent: navigator.userAgent,
      assets: [],
      imports: [],
      apis: [],
      errors: state.errors
    };

    for (const path of assetPaths) {
      const entry = {
        path,
        status: 0,
        contentType: "",
        cfCacheStatus: "",
        preview: "",
        htmlFallback: false
      };
      try {
        const response = await fetch(path, { cache: "no-store" });
        entry.status = response.status;
        entry.contentType = response.headers.get("content-type") || "";
        entry.cfCacheStatus = response.headers.get("cf-cache-status") || "";
        const text = await response.text();
        entry.preview = text.slice(0, 160);
        entry.htmlFallback = isHtmlFallback(entry.contentType, entry.preview);
      } catch (error) {
        entry.preview = error?.message || "Fetch failed";
      }
      payload.assets.push(entry);
    }

    for (const path of importPaths) {
      const started = performance.now();
      try {
        await import(path);
        payload.imports.push({
          path,
          ok: true,
          durationMs: Math.round(performance.now() - started)
        });
      } catch (error) {
        payload.imports.push({
          path,
          ok: false,
          durationMs: Math.round(performance.now() - started),
          error: error?.message || "Import failed"
        });
      }
    }

    for (const path of apiPaths) {
      const started = performance.now();
      const entry = {
        path,
        status: 0,
        contentType: "",
        cfCacheStatus: "",
        preview: "",
        htmlFallback: false,
        durationMs: 0
      };
      try {
        const response = await fetch(path, { headers: { Accept: "application/json" } });
        entry.status = response.status;
        entry.contentType = response.headers.get("content-type") || "";
        entry.cfCacheStatus = response.headers.get("cf-cache-status") || "";
        const text = await response.text();
        entry.preview = text.slice(0, 160);
        entry.htmlFallback = isHtmlFallback(entry.contentType, entry.preview);
      } catch (error) {
        entry.preview = error?.message || "Fetch failed";
      } finally {
        entry.durationMs = Math.round(performance.now() - started);
      }
      payload.apis.push(entry);
    }

    state.lastRun = payload.generatedAt;
    renderBody(payload);
    setMeta();
  };

  panel.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-action]");
    if (!button) return;
    const action = button.dataset.action;
    if (action === "toggle") {
      panel.classList.toggle("is-collapsed");
      button.textContent = panel.classList.contains("is-collapsed") ? "Show" : "Hide";
    }
    if (action === "copy") {
      const text = body?.textContent || "";
      navigator.clipboard.writeText(text);
    }
    if (action === "refresh") {
      runChecks();
    }
  });

  runChecks();
}

function initPanicButton() {
  if (!DEBUG_PANIC_MODE || typeof document === "undefined") return;
  const footer = document.querySelector("footer");
  if (!footer) return;
  if (footer.querySelector("[data-rv-panic-restart]")) return;

  const button = document.createElement("button");
  button.type = "button";
  button.className = "rv-panic-restart";
  button.setAttribute("data-rv-panic-restart", "true");
  button.textContent = "RESTART (panic)";

  button.addEventListener("click", () => {
    try {
      Object.keys(localStorage || {}).forEach((key) => {
        if (key.startsWith("rv_shadow_")) localStorage.removeItem(key);
      });
    } catch (error) {
      // ignore
    }
    const url = new URL(window.location.href);
    url.searchParams.set("rv_panic", "1");
    window.location.href = url.toString();
  });

  footer.appendChild(button);
}

async function loadFeatures() {
  const list = Array.isArray(FEATURES) ? FEATURES : [];
  const overridden = applyOverrides(list);
  if (!isDebugEnabled()) {
    const filtered = overridden.filter((feature) => PUBLIC_FEATURE_ALLOWLIST.has(feature.id));
    return { source: "config", blocks: null, features: filtered, reason: "public_filter" };
  }
  const registry = await loadRegistryBlocks();
  if (registry.ok) {
    const blocks = ensurePinnedBlocks(registry.blocks, overridden);
    return {
      source: "registry",
      blocks,
      features: mapBlocksToFeatures(blocks, overridden),
      reason: registry.reason
    };
  }
  const manifest = await loadSeedManifest();
  if (manifest.ok) {
    const blocks = ensurePinnedBlocks(manifest.blocks, overridden);
    return {
      source: "manifest",
      blocks,
      features: mapBlocksToFeatures(blocks, overridden),
      reason: registry.reason
    };
  }
  return { source: "config", blocks: null, features: overridden, reason: registry.reason };
}

async function loadFeatureModule(feature) {
  if (!feature?.module) throw new Error("Missing feature module");
  return import(feature.module);
}

function getBlockName(section, feature) {
  return (
    section.getAttribute("data-rv-block-name") ||
    feature?.title ||
    section.querySelector("h2")?.textContent ||
    feature?.id ||
    "Unknown Block"
  );
}

function sanitizeBlockTitle(rawTitle = "") {
  return String(rawTitle || "")
    .replace(/^Block\s*\d+\s*[-–—]\s*/i, "")
    .replace(/^Block\s*XX\s*[-–—]\s*/i, "")
    .replace(/^Block\s*[-–—]\s*/i, "")
    .trim();
}

function getFeatureEndpoint(feature) {
  if (!feature?.api) return "";
  const resolution = resolveApiBase();
  if (!resolution.ok) return feature.api;
  const prefix = resolution.apiPrefix || resolution.apiBase || "";
  return prefix ? `${prefix}/${feature.api}` : feature.api;
}

function getManifestBlockId(feature, section) {
  if (feature?.manifest?.blockId) return feature.manifest.blockId;
  if (section) {
    const raw = section.getAttribute("data-rv-manifest-id");
    if (raw) return raw;
  }
  const fallback = feature?.id ? feature.id.replace(/^rv-/, "") : "";
  return fallback || null;
}

function getManifestEndpoint(feature, section) {
  const blockId = getManifestBlockId(feature, section);
  if (blockId === "rvci-engine") return "/api/rvci-engine";
  const snapshotId = normalizeId(blockId);
  return snapshotId ? `./data/snapshots/${snapshotId}.json` : "";
}

function formatNumber(value, options = {}) {
  if (value === null || value === undefined || Number.isNaN(value)) return "N/A";
  return new Intl.NumberFormat("en-US", options).format(value);
}

function renderDebugMeta(container, meta) {
  if (!isDebugEnabled() || !container) return;
  const debugLine = document.createElement("div");
  debugLine.style.cssText = "font-size:11px;color:#888;margin-top:8px;";
  debugLine.textContent = `Debug: ${meta.status || "NO_DATA"} · ${meta.reason || "NO_DATA"} · stalenessSec=${meta.stalenessSec ?? 0} · generatedAt=${meta.generatedAt || "N/A"}`;
  container.appendChild(debugLine);
}

function renderNoData(contentEl, meta) {
  if (!contentEl) return;
  const reason = meta.reason || "NO_DATA";
  // In public view, show minimal message without reason
  const message = isDebugEnabled() 
    ? `No data available. Reason: ${reason}`
    : "Temporarily unavailable";
  contentEl.innerHTML = `
    <div class="rv-native-empty">
      ${message}
    </div>
  `;
  renderDebugMeta(contentEl, meta);
}

function renderSnapshotSummary(contentEl, snapshot) {
  if (!contentEl) return;
  const meta = snapshot.meta || {};
  const itemsCount = Array.isArray(snapshot?.data?.items) ? snapshot.data.items.length : 0;
  const wrapper = document.createElement("div");
  wrapper.className = "rv-content";
  wrapper.setAttribute("data-rendered", "true");

  const metaLine = document.createElement("div");
  metaLine.style.cssText = "font-size:12px;color:#666;margin-bottom:8px;";
  metaLine.textContent = `Status: ${meta.status || "NO_DATA"} - ${meta.reason || "NO_DATA"}`;

  const itemsLine = document.createElement("div");
  itemsLine.style.cssText = "font-size:13px;color:#444;";
  itemsLine.textContent = `Items: ${itemsCount}`;

  wrapper.appendChild(metaLine);
  wrapper.appendChild(itemsLine);
  renderDebugMeta(wrapper, meta);
  contentEl.innerHTML = "";
  contentEl.appendChild(wrapper);
}

function renderTopMoversSnapshot(contentEl, snapshot) {
  const items = Array.isArray(snapshot?.data?.items) ? snapshot.data.items : [];
  if (!items.length) {
    renderNoData(contentEl, snapshot.meta || {});
    return;
  }
  const rows = items.slice(0, 5);
  contentEl.innerHTML = `
    <div class="rv-native-table-wrap">
      <h4>Top Movers</h4>
      <table class="rv-native-table">
        <thead>
          <tr>
            <th>Symbol</th>
            <th>Change %</th>
            <th>Last Price</th>
          </tr>
        </thead>
        <tbody>
          ${rows
            .map((item) => {
              const changePct = item.changePct ?? item.changePercent ?? null;
              const price = item.lastPrice ?? item.lastClose ?? item.price ?? null;
              return `
                <tr>
                  <td>${item.symbol || "N/A"}</td>
                  <td>${formatNumber(changePct, { maximumFractionDigits: 2 })}</td>
                  <td>${formatNumber(price, { maximumFractionDigits: 2 })}</td>
                </tr>
              `;
            })
            .join("")}
        </tbody>
      </table>
    </div>
  `;
  renderDebugMeta(contentEl, snapshot.meta || {});
}

function renderYieldCurveSnapshot(contentEl, snapshot) {
  const items = Array.isArray(snapshot?.data?.items) ? snapshot.data.items : [];
  if (!items.length) {
    renderNoData(contentEl, snapshot.meta || {});
    return;
  }
  const byMaturity = new Map(
    items.map((item) => [String(item.maturity || "").toLowerCase(), item.value])
  );
  const twoY = byMaturity.get("2y");
  const tenY = byMaturity.get("10y");
  if (!Number.isFinite(twoY) || !Number.isFinite(tenY)) {
    renderNoData(contentEl, snapshot.meta || {});
    return;
  }
  const spread = tenY - twoY;
  const label = spread < 0 ? "Inversion" : "Normal";
  contentEl.innerHTML = `
    <div class="rv-native-table-wrap">
      <h4>Yield Curve</h4>
      <table class="rv-native-table">
        <tbody>
          <tr><td>2Y</td><td>${formatNumber(twoY, { maximumFractionDigits: 2 })}%</td></tr>
          <tr><td>10Y</td><td>${formatNumber(tenY, { maximumFractionDigits: 2 })}%</td></tr>
          <tr><td>Spread</td><td>${formatNumber(spread, { maximumFractionDigits: 2 })}%</td></tr>
          <tr><td>Signal</td><td>${label}</td></tr>
        </tbody>
      </table>
    </div>
  `;
  renderDebugMeta(contentEl, snapshot.meta || {});
}

function renderWhyMovedSnapshot(contentEl, snapshot) {
  const items = Array.isArray(snapshot?.data?.items) ? snapshot.data.items : [];
  const reasons = items
    .map((item) => item.title || item.headline || item.reason || item.summary || item.label)
    .filter(Boolean)
    .slice(0, 3);
  if (!reasons.length) {
    renderNoData(contentEl, snapshot.meta || {});
    return;
  }
  contentEl.innerHTML = `
    <div class="rv-native-list">
      <h4>Why Moved</h4>
      <ul>
        ${reasons.map((text) => `<li>${text}</li>`).join("")}
      </ul>
    </div>
  `;
  renderDebugMeta(contentEl, snapshot.meta || {});
}

function renderEmptySignals(contentEl, meta) {
  if (!contentEl) return;
  contentEl.innerHTML = `
    <div class="rv-native-empty">
      No active signals detected at EOD. <a href="?debug=1" style="color:#888;font-size:12px;">debug</a>
    </div>
  `;
  renderDebugMeta(contentEl, meta);
}

function renderSp500SectorsSnapshot(contentEl, snapshot) {
  const items = Array.isArray(snapshot?.data?.sectors)
    ? snapshot.data.sectors
    : Array.isArray(snapshot?.data?.items)
      ? snapshot.data.items
      : [];
  if (!items.length) {
    renderNoData(contentEl, snapshot.meta || {});
    return;
  }
  const rows = items.slice(0, 6);
  contentEl.innerHTML = `
    <div class="rv-native-table-wrap">
      <table class="rv-native-table rv-table-sticky">
        <thead>
          <tr>
            <th>Sector <span class="rv-tooltip-wrapper"><span class="rv-tooltip-icon" aria-label="Information">ⓘ</span><span class="rv-tooltip-content"><strong>Sector</strong><br>Source: Yahoo Finance (Snapshot)<br>Update: EOD (1×/Tag)<br>Context: US market close</span></span></th>
            <th>Change % <span class="rv-tooltip-wrapper"><span class="rv-tooltip-icon" aria-label="Information">ⓘ</span><span class="rv-tooltip-content"><strong>Change %</strong><br>Source: Yahoo Finance (Snapshot)<br>Update: EOD (1×/Tag)<br>Context: Daily percentage change</span></span></th>
          </tr>
        </thead>
        <tbody>
          ${rows
            .map((item) => {
              const sector = item.sector || item.name || item.label || "N/A";
              const changePct =
                item.changePct ??
                item.pct ??
                item.change ??
                item.returnPct ??
                item.performance ??
                null;
              const changeClass = changePct !== null && changePct !== undefined 
                ? (changePct >= 0 ? "rv-native-positive" : "rv-native-negative")
                : "";
              return `
                <tr>
                  <td>${sector}</td>
                  <td class="${changeClass}">${formatNumber(changePct, { maximumFractionDigits: 2 })}</td>
                </tr>
              `;
            })
            .join("")}
        </tbody>
      </table>
    </div>
  `;
  renderDebugMeta(contentEl, snapshot.meta || {});
}

function renderTechSignalsSnapshot(contentEl, snapshot) {
  const TECH_SIGNALS_DEFAULT_LIST = ["AAPL", "NVDA"];
  const TECH_SIGNALS_TOP30 = [
    "AAPL",
    "MSFT",
    "NVDA",
    "AMZN",
    "GOOGL",
    "GOOG",
    "META",
    "TSLA",
    "BRK.B",
    "JPM",
    "V",
    "MA",
    "XOM",
    "UNH",
    "JNJ",
    "WMT",
    "PG",
    "HD",
    "AVGO",
    "COST",
    "PEP",
    "KO",
    "MRK",
    "ABBV",
    "LLY",
    "ORCL",
    "CSCO",
    "CRM",
    "NFLX",
    "AMD"
  ];

  const formatNumberDash = (value, options = {}) => {
    if (value === null || value === undefined || Number.isNaN(value)) return "–";
    return new Intl.NumberFormat("en-US", options).format(value);
  };

  const formatPercentDash = (value, digits = 2) => {
    if (value === null || value === undefined || Number.isNaN(value)) return "–";
    return `${formatNumberDash(value, { maximumFractionDigits: digits })}%`;
  };

  const loadSymbols = () => {
    try {
      const shared = typeof window !== "undefined" ? window.RV_SHARED?.watchlist : null;
      if (Array.isArray(shared) && shared.length) return shared.map((item) => String(item).toUpperCase());
      const raw = window.localStorage?.getItem("rv_watchlist_local");
      const parsed = raw ? JSON.parse(raw) : TECH_SIGNALS_DEFAULT_LIST;
      if (!Array.isArray(parsed)) return TECH_SIGNALS_DEFAULT_LIST;
      return parsed.map((item) => String(item).toUpperCase());
    } catch (error) {
      return TECH_SIGNALS_DEFAULT_LIST;
    }
  };

  const normalizeTechSignals = (payload) => {
    const meta = payload?.meta || {};
    const data = payload?.data || {};
    const warnings = Array.isArray(payload?.warnings)
      ? payload.warnings
      : Array.isArray(meta?.warnings)
        ? meta.warnings
        : [];
    const signals = Array.isArray(data.signals)
      ? data.signals
      : Array.isArray(data.items)
        ? data.items
        : [];
    const rows = Array.isArray(data.rows)
      ? data.rows
      : Array.isArray(data.items)
        ? data.items
        : [];
    const timeframes = {};
    if (data.timeframes && typeof data.timeframes === "object") {
      Object.entries(data.timeframes).forEach(([key, tfData]) => {
        if (!tfData || typeof tfData !== "object") return;
        const tfSignals = Array.isArray(tfData.signals)
          ? tfData.signals
          : Array.isArray(tfData.items)
            ? tfData.items
            : [];
        const tfRows = Array.isArray(tfData.rows)
          ? tfData.rows
          : Array.isArray(tfData.items)
            ? tfData.items
            : [];
        timeframes[key] = { signals: tfSignals, rows: tfRows };
      });
    }
    const missingKeys = [];
    if (!Array.isArray(data.signals) && !Array.isArray(data.items)) missingKeys.push("signals missing");
    if (!Array.isArray(data.rows) && !Array.isArray(data.items)) missingKeys.push("rows missing");
    return {
      watchlist: signals,
      top30: rows,
      timeframes,
      timeframe: typeof data.timeframe === "string" ? data.timeframe : "daily",
      meta,
      warnings,
      missingKeys
    };
  };

  const renderWatchlist = (signals, symbols) => {
    if (!signals.length) {
      return `<div class="rv-native-empty">NO_DATA — signals missing</div>`;
    }
    const rows = symbols.map((symbol) => ({
      symbol,
      data: signals.find((item) => item.symbol === symbol) || null
    }));
    return `
      <div class="rv-native-table-wrap">
        <table class="rv-native-table">
          <thead>
            <tr>
              <th>Symbol</th>
              <th>RSI</th>
              <th>Weekly RSI</th>
              <th>MA20</th>
              <th>MA50</th>
              <th>Regime</th>
            </tr>
          </thead>
          <tbody>
            ${rows
              .map((row) => {
                const item = row.data;
                if (!item) {
                  return `
                    <tr>
                      <td>${row.symbol}</td>
                      <td>–</td>
                      <td>–</td>
                      <td>–</td>
                      <td>–</td>
                      <td>–</td>
                    </tr>
                  `;
                }
                const rsiValue = item.rsi ?? null;
                const rsiWeeklyValue = item.rsiWeekly ?? null;
                const rsiClass =
                  item.rsiLabel === "Oversold" || rsiValue <= 30
                    ? "rv-native-negative"
                    : item.rsiLabel === "Overbought" || rsiValue >= 70
                      ? "rv-native-positive"
                      : "rv-native-warning";
                const rsiWeeklyClass =
                  item.rsiWeeklyLabel === "Oversold" || rsiWeeklyValue <= 30
                    ? "rv-native-negative"
                    : item.rsiWeeklyLabel === "Overbought" || rsiWeeklyValue >= 70
                      ? "rv-native-positive"
                      : "rv-native-warning";
                return `
                <tr>
                  <td>${item.symbol || row.symbol}</td>
                  <td class="${rsiClass}">${formatNumberDash(rsiValue, { maximumFractionDigits: 1 })}</td>
                  <td class="${rsiWeeklyClass}">${formatNumberDash(rsiWeeklyValue, { maximumFractionDigits: 1 })}</td>
                  <td>${formatNumberDash(item.ma20, { maximumFractionDigits: 2 })}</td>
                  <td>${formatNumberDash(item.ma50, { maximumFractionDigits: 2 })}</td>
                  <td>${item.maRegime || "—"}</td>
                </tr>
              `;
              })
              .join("")}
          </tbody>
        </table>
      </div>
    `;
  };

  const renderTop30Table = (signals, state) => {
    if (!signals.length) {
      return `<div class="rv-native-empty">NO_DATA — rows missing</div>`;
    }
    const sortKey = state.sortKey;
    const dir = state.sortDir === "desc" ? -1 : 1;
    const sorted = signals.slice().sort((a, b) => {
      const av = a[sortKey];
      const bv = b[sortKey];
      if (av === null || av === undefined) return 1;
      if (bv === null || bv === undefined) return -1;
      if (typeof av === "number" && typeof bv === "number") return (av - bv) * dir;
      return String(av).localeCompare(String(bv)) * dir;
    });
    const sortLabel = (label, key) => {
      if (sortKey !== key) return label;
      return `${label} ${state.sortDir === "asc" ? "^" : "v"}`;
    };
    const perfClass = (value) =>
      value === null || value === undefined ? "" : value >= 0 ? "rv-native-positive" : "rv-native-negative";
    return `
      <div class="rv-native-table-wrap">
        <table class="rv-native-table rv-table-sticky">
          <thead>
            <tr>
              <th data-rv-sort="symbol">${sortLabel("Symbol", "symbol")} <span class="rv-tooltip-wrapper"><span class="rv-tooltip-icon" aria-label="Information">ⓘ</span><span class="rv-tooltip-content"><strong>Symbol</strong><br>Source: Snapshot (stooq)<br>Update: EOD (1×/Tag)</span></span></th>
              <th data-rv-sort="rsi">${sortLabel("RSI", "rsi")} <span class="rv-tooltip-wrapper"><span class="rv-tooltip-icon" aria-label="Information">ⓘ</span><span class="rv-tooltip-content"><strong>RSI (Relative Strength Index)</strong><br>Source: Calculated from OHLC (stooq)<br>Update: EOD (1×/Tag)<br>Context: 14-period RSI, oversold &lt;30, overbought &gt;70</span></span></th>
              <th data-rv-sort="macd">${sortLabel("MACD", "macd")} <span class="rv-tooltip-wrapper"><span class="rv-tooltip-icon" aria-label="Information">ⓘ</span><span class="rv-tooltip-content"><strong>MACD</strong><br>Source: Calculated from OHLC (stooq)<br>Update: EOD (1×/Tag)<br>Context: Moving Average Convergence Divergence</span></span></th>
              <th data-rv-sort="macdHist">${sortLabel("MACD Hist", "macdHist")} <span class="rv-tooltip-wrapper"><span class="rv-tooltip-icon" aria-label="Information">ⓘ</span><span class="rv-tooltip-content"><strong>MACD Histogram</strong><br>Source: Calculated from OHLC (stooq)<br>Update: EOD (1×/Tag)<br>Context: MACD line minus signal line</span></span></th>
              <th data-rv-sort="stochRsi">${sortLabel("Stoch RSI", "stochRsi")} <span class="rv-tooltip-wrapper"><span class="rv-tooltip-icon" aria-label="Information">ⓘ</span><span class="rv-tooltip-content"><strong>Stochastic RSI</strong><br>Source: Calculated from OHLC (stooq)<br>Update: EOD (1×/Tag)<br>Context: Stochastic oscillator of RSI</span></span></th>
              <th data-rv-sort="perf1w">${sortLabel("1W", "perf1w")} <span class="rv-tooltip-wrapper"><span class="rv-tooltip-icon" aria-label="Information">ⓘ</span><span class="rv-tooltip-content"><strong>1 Week Performance</strong><br>Source: Calculated from OHLC (stooq)<br>Update: EOD (1×/Tag)<br>Context: 7-day percentage change</span></span></th>
              <th data-rv-sort="relPerf1w">${sortLabel("Rel vs SP500", "relPerf1w")} <span class="rv-tooltip-wrapper"><span class="rv-tooltip-icon" aria-label="Information">ⓘ</span><span class="rv-tooltip-content"><strong>Relative Performance vs S&amp;P 500</strong><br>Source: Calculated from OHLC (stooq)<br>Update: EOD (1×/Tag)<br>Context: 1-week performance relative to SPY</span></span></th>
              <th data-rv-sort="perf1m">${sortLabel("1M", "perf1m")} <span class="rv-tooltip-wrapper"><span class="rv-tooltip-icon" aria-label="Information">ⓘ</span><span class="rv-tooltip-content"><strong>1 Month Performance</strong><br>Source: Calculated from OHLC (stooq)<br>Update: EOD (1×/Tag)<br>Context: 30-day percentage change</span></span></th>
              <th data-rv-sort="perf1y">${sortLabel("1Y", "perf1y")} <span class="rv-tooltip-wrapper"><span class="rv-tooltip-icon" aria-label="Information">ⓘ</span><span class="rv-tooltip-content"><strong>1 Year Performance</strong><br>Source: Calculated from OHLC (stooq)<br>Update: EOD (1×/Tag)<br>Context: 365-day percentage change</span></span></th>
              <th data-rv-sort="maRegime">${sortLabel("MA Regime", "maRegime")} <span class="rv-tooltip-wrapper"><span class="rv-tooltip-icon" aria-label="Information">ⓘ</span><span class="rv-tooltip-content"><strong>MA Regime</strong><br>Source: Calculated from OHLC (stooq)<br>Update: EOD (1×/Tag)<br>Context: Price position relative to moving averages</span></span></th>
            </tr>
          </thead>
          <tbody>
            ${sorted
              .map((item) => {
                const rsiValue = item.rsi ?? null;
                const rsiClass =
                  item.rsiLabel === "Oversold" || rsiValue <= 30
                    ? "rv-native-negative"
                    : item.rsiLabel === "Overbought" || rsiValue >= 70
                      ? "rv-native-positive"
                      : "rv-native-warning";
                const macdHist = item.macdHist ?? item.macd_hist ?? null;
                return `
                  <tr>
                    <td>${item.symbol || "—"}</td>
                    <td class="${rsiClass}">${formatNumberDash(rsiValue, { maximumFractionDigits: 1 })}</td>
                    <td>${formatNumberDash(item.macd, { maximumFractionDigits: 2 })}</td>
                    <td>${formatNumberDash(macdHist, { maximumFractionDigits: 2 })}</td>
                    <td>${formatNumberDash(item.stochRsi, { maximumFractionDigits: 1 })}</td>
                    <td class="${perfClass(item.perf1w)}">${formatPercentDash(item.perf1w)}</td>
                    <td class="${perfClass(item.relPerf1w)}">${formatPercentDash(item.relPerf1w)}</td>
                    <td class="${perfClass(item.perf1m)}">${formatPercentDash(item.perf1m)}</td>
                    <td class="${perfClass(item.perf1y)}">${formatPercentDash(item.perf1y)}</td>
                    <td>${item.maRegime || "—"}</td>
                  </tr>
              `;
              })
              .join("")}
          </tbody>
        </table>
      </div>
    `;
  };

  const model = normalizeTechSignals(snapshot);
  const meta = model.meta || {};
  const symbols = loadSymbols();
  const timeframes = model.timeframes;
  const availableTimeframes = ["daily", "weekly", "monthly"].filter((tf) => timeframes[tf]);
  const state = {
    timeframe: availableTimeframes.includes(model.timeframe)
      ? model.timeframe
      : availableTimeframes[0] || "daily",
    sortKey: "symbol",
    sortDir: "asc"
  };

  const renderBlock = () => {
    const tfPayload = timeframes[state.timeframe] || {};
    const watchlist = tfPayload.signals && tfPayload.signals.length ? tfPayload.signals : model.watchlist;
    const top30 = tfPayload.rows && tfPayload.rows.length ? tfPayload.rows : model.top30;
    const missingNote = model.missingKeys.length ? `Missing: ${model.missingKeys.join(", ")}` : "";
    const partialNote =
      meta.status === "PARTIAL" || model.warnings.length
        ? "Partial data — some sources unavailable."
        : "";
    const statusNote =
      meta.status && meta.status !== "LIVE"
        ? `Status: ${meta.status} · ${meta.reason || "NO_DATA"}`
        : "";

    contentEl.innerHTML = `
      ${statusNote ? `<div class="rv-native-note rv-native-warning">${statusNote}</div>` : ""}
      ${partialNote ? `<div class="rv-native-note">${partialNote}</div>` : ""}
      ${missingNote ? `<div class="rv-native-note">${missingNote}</div>` : ""}
      <div class="rv-tech-section">
        <h3>Watchlist Signals</h3>
        ${renderWatchlist(watchlist, symbols)}
      </div>
      <div class="rv-tech-section">
        <h3>Top 30 Market Cap Table</h3>
        <div class="rv-native-note">How computed? RSI/MACD/Stoch RSI are derived from OHLC (stooq) per timeframe.</div>
        <div class="rv-top30-controls">
          <button type="button" class="rv-top30-tab${state.timeframe === "daily" ? " is-active" : ""}" data-rv-timeframe="daily" ${availableTimeframes.length ? "" : "disabled"}>Daily</button>
          <button type="button" class="rv-top30-tab${state.timeframe === "weekly" ? " is-active" : ""}" data-rv-timeframe="weekly" ${availableTimeframes.length ? "" : "disabled"}>Weekly</button>
          <button type="button" class="rv-top30-tab${state.timeframe === "monthly" ? " is-active" : ""}" data-rv-timeframe="monthly" ${availableTimeframes.length ? "" : "disabled"}>Monthly</button>
        </div>
        <div data-rv-top30-table>
          ${renderTop30Table(top30, state)}
        </div>
        <div class="rv-native-note">Universe: fixed mega-cap list (approx top 30).</div>
      </div>
    `;

    const tabButtons = Array.from(contentEl.querySelectorAll("[data-rv-timeframe]"));
    tabButtons.forEach((button) => {
      button.addEventListener("click", () => {
        const next = button.getAttribute("data-rv-timeframe") || "daily";
        if (state.timeframe === next) return;
        if (availableTimeframes.length && !availableTimeframes.includes(next)) return;
        state.timeframe = next;
        renderBlock();
      });
    });
    const tableHead = contentEl.querySelector("[data-rv-top30-table] thead");
    tableHead?.addEventListener("click", (event) => {
      const th = event.target.closest("[data-rv-sort]");
      if (!th) return;
      const key = th.getAttribute("data-rv-sort");
      if (!key) return;
      if (state.sortKey === key) {
        state.sortDir = state.sortDir === "asc" ? "desc" : "asc";
      } else {
        state.sortKey = key;
        state.sortDir = "asc";
      }
      renderBlock();
    });

    renderDebugMeta(contentEl, meta);
  };

  renderBlock();
}

function normalizeAlphaRadar(payload) {
  const meta = payload?.meta || {};
  const data = payload?.data || {};
  const picksRaw = data.picks;
  const picksArray = Array.isArray(picksRaw) ? picksRaw : [];
  const picksObject =
    picksRaw && typeof picksRaw === "object" && !Array.isArray(picksRaw) ? picksRaw : {};
  const items = Array.isArray(data.items) ? data.items : [];

  const shortCandidates = picksObject.shortterm || picksObject.shortTerm || picksObject.short || picksObject.swing;
  const mediumCandidates = picksObject.top || picksObject.medium || picksObject.mid || picksObject.core;
  const longCandidates = picksObject.longterm || picksObject.longTerm || picksObject.long;

  const buckets = {
    short: Array.isArray(shortCandidates) ? shortCandidates : [],
    medium: Array.isArray(mediumCandidates) ? mediumCandidates : [],
    long: Array.isArray(longCandidates) ? longCandidates : []
  };

  if (!buckets.short.length && !buckets.medium.length && !buckets.long.length && picksArray.length) {
    buckets.medium = picksArray;
  }
  if (!buckets.short.length && !buckets.medium.length && !buckets.long.length && items.length) {
    buckets.medium = items;
  }

  const statusHints = [];
  if (!Array.isArray(data.picks) && !buckets.short.length && !buckets.medium.length && !buckets.long.length && items.length) {
    statusHints.push("Partial data — picks missing");
  }
  const allPicks = [...buckets.short, ...buckets.medium, ...buckets.long];
  const hasReasons = allPicks.some((pick) => Array.isArray(pick?.reasons) && pick.reasons.length > 0);
  const hasIndicators = allPicks.some((pick) => Array.isArray(pick?.indicators) && pick.indicators.length > 0);
  const hasChecklist =
    allPicks.some((pick) => pick?.setup && Object.keys(pick.setup).length > 0) ||
    allPicks.some((pick) => pick?.trigger && Object.keys(pick.trigger).length > 0);
  if (allPicks.length && !hasReasons && !hasIndicators && !hasChecklist) {
    statusHints.push("Partial data — indicators missing");
  }

  return {
    meta,
    data,
    buckets,
    statusHints
  };
}

function renderAlphaRadarSnapshot(contentEl, snapshot) {
  const SETUP_LABELS = {
    rsiExtreme: "RSI < 35",
    bbExtreme: "BB %B < 0.15",
    nearSma200: "Near SMA200",
    rvolGte15: "RVOL >= 1.5",
    extremeGate: "Extreme Gate"
  };
  const TRIGGER_LABELS = {
    ema21Reclaim: "EMA21 reclaim",
    higherLowFt: "Higher low + FT",
    bosBreak: "Break of structure",
    volumeConfirm: "Volume confirm",
    rsiUpturn: "RSI upturn"
  };
  const INFO_TEXT = {
    rsiExtreme: "RSI below 35 indicates oversold pressure.",
    bbExtreme: "Price near lower Bollinger band.",
    nearSma200: "Close within 2% of SMA200.",
    rvolGte15: "Relative volume >= 1.5.",
    extremeGate: "At least one extreme condition is required.",
    ema21Reclaim: "Close reclaimed EMA21 after being below.",
    higherLowFt: "New pivot low above prior pivot with follow-through.",
    bosBreak: "Break above last lower high.",
    volumeConfirm: "Volume above 1.2x 20D average.",
    rsiUpturn: "RSI rising vs prior day."
  };

  const formatPercent = (value) => {
    if (value === null || value === undefined || Number.isNaN(value)) return "N/A";
    return `${formatNumber(value, { maximumFractionDigits: 2 })}%`;
  };

  const badgeClass = (label) => {
    if (!label) return "";
    const upper = String(label || "").toUpperCase();
    if (upper === "BUY" || upper === "TOP PICK" || upper === "STRONG") return "rv-alpha-badge--top";
    if (upper === "WATCHLIST" || upper === "WATCH") return "rv-alpha-badge--watch";
    if (upper === "DATA_ERROR") return "rv-alpha-badge--data";
    return "rv-alpha-badge--wait";
  };

  const renderChecklist = (items = {}, labels = {}) =>
    Object.keys(labels)
      .map((key) => {
        const on = Boolean(items?.[key]);
        return `
          <div class="rv-alpha-check">
            <span class="rv-alpha-dot ${on ? "is-on" : "is-off"}"></span>
            <span>${labels[key]}</span>
            <button type="button" class="rv-alpha-info" title="${INFO_TEXT[key] || ""}">i</button>
          </div>
        `;
      })
      .join("");

  const normalizePick = (pick = {}) => {
    const reasons = Array.isArray(pick.reasons) ? pick.reasons : [];
    const indicators = Array.isArray(pick.indicators) ? pick.indicators : [];
    const tags = Array.isArray(pick.tags) ? pick.tags : pick.tag ? [String(pick.tag)] : [];
    return {
      symbol: pick.symbol || pick.ticker || "N/A",
      name: pick.name || "",
      label: pick.label || tags[0] || "",
      setupScore: pick.setupScore ?? null,
      triggerScore: pick.triggerScore ?? null,
      totalScore: pick.totalScore ?? pick.score ?? null,
      setup: pick.setup || {},
      trigger: pick.trigger || {},
      reasons,
      indicators,
      close: pick.close ?? null,
      stop: pick.stop ?? null,
      changePercent: pick.changePercent ?? pick.changePct ?? null,
      dataQuality: pick.dataQuality || {},
      earningsRisk: pick.earningsRisk,
      earningsDays: pick.earningsDays
    };
  };

  const model = normalizeAlphaRadar(snapshot);
  const meta = model.meta || {};
  const buckets = model.buckets || {};

  const shortPicks = buckets.short.map(normalizePick);
  const mediumPicks = buckets.medium.map(normalizePick);
  const longPicks = buckets.long.map(normalizePick);
  const hasAny = shortPicks.length || mediumPicks.length || longPicks.length;
  if (!hasAny) {
    if (meta.status === "LIVE" || meta.status === "STALE") {
      renderEmptySignals(contentEl, meta);
    } else {
      renderNoData(contentEl, meta);
    }
    return;
  }

  const renderPickCard = (pick = {}) => {
    const displayLabel = pick.label || "PICK";
    const changeClass =
      pick.changePercent === null ? "" : pick.changePercent >= 0 ? "rv-native-positive" : "rv-native-negative";
    const indicatorList =
      pick.indicators && pick.indicators.length
        ? `<div class="rv-alpha-reasons">${pick.indicators.map((ind) => ind.label || ind.key || ind).join(" · ")}</div>`
        : pick.reasons.length
          ? `<div class="rv-alpha-reasons">${pick.reasons.join(" · ")}</div>`
          : "";
    return `
      <div class="rv-alpha-card">
        <div class="rv-alpha-head">
          <div>
            <div class="rv-alpha-symbol">${pick.symbol}</div>
            <div class="rv-alpha-name">${pick.name || ""}</div>
          </div>
          <span class="rv-alpha-badge ${badgeClass(displayLabel)}">${displayLabel}</span>
        </div>
        <div class="rv-alpha-scores">
          <span>Setup ${formatNumber(pick.setupScore, { maximumFractionDigits: 0 })}</span>
          <span>Trigger ${formatNumber(pick.triggerScore, { maximumFractionDigits: 0 })}</span>
          <span>Total ${formatNumber(pick.totalScore, { maximumFractionDigits: 0 })}</span>
        </div>
        <div class="rv-alpha-checklist">
          <strong>Setup</strong>
          ${renderChecklist(pick.setup, SETUP_LABELS)}
        </div>
        <div class="rv-alpha-checklist">
          <strong>Trigger</strong>
          ${renderChecklist(pick.trigger, TRIGGER_LABELS)}
        </div>
        <div class="rv-alpha-meta">
          <span>Close $${formatNumber(pick.close, { maximumFractionDigits: 2 })}</span>
          <span class="${changeClass}">${formatPercent(pick.changePercent)}</span>
          <span>Stop $${formatNumber(pick.stop, { maximumFractionDigits: 2 })}</span>
        </div>
        ${indicatorList}
        ${pick.dataQuality?.isPartial ? `<div class="rv-alpha-warn">PARTIAL DATA</div>` : ""}
        ${pick.earningsRisk ? `<div class="rv-alpha-warn">Earnings in ${pick.earningsDays ?? "?"} days</div>` : ""}
      </div>
    `;
  };

  const renderSection = (title, picks = [], emptyText) => `
    <div class="rv-alpha-section">
      <h4>${title}</h4>
      ${picks.length ? `<div class="rv-alpha-grid">${picks.map((pick) => renderPickCard(pick)).join("")}</div>` : `<div class="rv-native-empty">${emptyText}</div>`}
    </div>
  `;

  const partialNote =
    meta.status === "PARTIAL" || model.statusHints.length
      ? `Partial data — ${model.statusHints.join("; ") || "some indicators missing"}.`
      : "";
  
  // Calculate Market Bias
  const allPicks = [...shortPicks, ...mediumPicks, ...longPicks];
  const riskOnCount = allPicks.filter(p => p.label && (p.label.toUpperCase().includes("BUY") || p.label.toUpperCase().includes("TOP"))).length;
  const riskOffCount = allPicks.filter(p => p.label && p.label.toUpperCase().includes("WATCH")).length;
  const marketBias = riskOnCount > riskOffCount ? "Risk-on" : riskOffCount > riskOnCount ? "Risk-off" : "Neutral";
  
  // Top 3 Assets
  const top3Assets = allPicks
    .sort((a, b) => (b.totalScore || 0) - (a.totalScore || 0))
    .slice(0, 3)
    .map(p => p.symbol);

  // Summary Card HTML
  const summaryCardHTML = `
    <div class="rv-alpha-summary-card">
      <div class="rv-alpha-summary-header">
        <h3>Alpha Radar Summary</h3>
        <span class="rv-tooltip-wrapper">
          <span class="rv-tooltip-icon" aria-label="Information">ⓘ</span>
          <span class="rv-tooltip-content">
            <strong>Alpha Radar Scoring Logic</strong><br>
            Scoring combines setup conditions (RSI extremes, Bollinger bands, SMA200 proximity) with trigger signals (EMA21 reclaim, higher lows, volume confirmation). Higher scores indicate stronger setups. Market bias is derived from the distribution of buy/watch signals across all picks.
          </span>
        </span>
      </div>
      <div class="rv-alpha-summary-content">
        <div class="rv-alpha-summary-item">
          <span class="rv-alpha-summary-label">Market Bias:</span>
          <span class="rv-alpha-summary-value rv-alpha-bias-${marketBias.toLowerCase().replace("-", "")}">${marketBias}</span>
        </div>
        <div class="rv-alpha-summary-item">
          <span class="rv-alpha-summary-label">Top Assets:</span>
          <span class="rv-alpha-summary-value">${top3Assets.length ? top3Assets.join(", ") : "None"}</span>
        </div>
        <div class="rv-alpha-summary-item">
          <span class="rv-alpha-summary-label">Total Picks:</span>
          <span class="rv-alpha-summary-value">${allPicks.length}</span>
        </div>
      </div>
      <button type="button" class="rv-alpha-details-btn" data-rv-alpha-toggle="details">
        Show Details
      </button>
    </div>
    <div class="rv-alpha-details" data-rv-alpha-details style="display: none;">
      ${partialNote ? `<div class="rv-native-note">${partialNote}</div>` : ""}
      ${renderSection("Short-term", shortPicks, "No short-term picks")}
      ${renderSection("Medium-term", mediumPicks, "No medium-term picks")}
      ${renderSection("Long-term", longPicks, "No long-term picks")}
    </div>
  `;

  contentEl.innerHTML = summaryCardHTML;
  
  // Toggle Details Button
  const detailsBtn = contentEl.querySelector("[data-rv-alpha-toggle]");
  const detailsSection = contentEl.querySelector("[data-rv-alpha-details]");
  if (detailsBtn && detailsSection) {
    detailsBtn.addEventListener("click", () => {
      const isHidden = detailsSection.style.display === "none";
      detailsSection.style.display = isHidden ? "block" : "none";
      detailsBtn.textContent = isHidden ? "Hide Details" : "Show Details";
    });
  }

  renderDebugMeta(contentEl, meta);
}

function renderVolumeAnomalySnapshot(contentEl, snapshot) {
  const items = Array.isArray(snapshot?.data?.items) ? snapshot.data.items : [];
  if (!items.length) {
    renderNoData(contentEl, snapshot.meta || {});
    return;
  }
  const rows = items.slice(0, 5);
  contentEl.innerHTML = `
    <div class="rv-native-table-wrap">
      <h4>Volume Anomaly</h4>
      <table class="rv-native-table">
        <thead>
          <tr>
            <th>Symbol</th>
            <th>Spike</th>
            <th>Change %</th>
          </tr>
        </thead>
        <tbody>
          ${rows
            .map((item) => {
              const symbol = item.symbol || item.ticker || "N/A";
              const spike =
                item.spike ??
                item.volumeSpike ??
                item.spikeMultiple ??
                item.zscore ??
                item.multiple ??
                null;
              const changePct = item.changePct ?? item.changePercent ?? item.pct ?? null;
              return `
                <tr>
                  <td>${symbol}</td>
                  <td>${formatNumber(spike, { maximumFractionDigits: 2 })}</td>
                  <td>${formatNumber(changePct, { maximumFractionDigits: 2 })}</td>
                </tr>
              `;
            })
            .join("")}
        </tbody>
      </table>
    </div>
  `;
  renderDebugMeta(contentEl, snapshot.meta || {});
}

async function renderRvciEngineSnapshot(contentEl, feature, logger) {
  const debug = new URLSearchParams(window.location.search).get("debug") === "1";
  const latestResult = await loadRvciLatest(debug);
  const latest = latestResult.payload || buildFallbackEnvelope("rvci-engine", "NO_DATA");
  const sourceUrl = latestResult.source || "unknown";
  const normalizedPaths = latestResult.paths || {};
  const pathCheck = hasCompletePaths(normalizedPaths);
  const missingKeys = latestResult.missing || pathCheck.missing || [];
  const meta = latest.meta || {};
  const data = latest.data || {};
  const warnings = Array.isArray(latest.warnings) ? latest.warnings : [];
  const status = meta.status || "NO_DATA";
  const reason = meta.reason || "NO_DATA";
  const uiStatus = status === "ERROR" ? "FAIL" : status === "NO_DATA" ? "PARTIAL" : "OK";
  logger?.setStatus(uiStatus, reason);
  logger?.setMeta({
    ok: latest.ok,
    metaStatus: status,
    metaReason: reason,
    itemsCount: 0,
    dataAt: meta.generatedAt || null,
    source: "rvci"
  });

  const isSkipped = status === "SKIPPED_MARKET_CLOSED" || status === "MARKET_NOT_CLOSED";
  if (debug) {
    console.log("[RVCI] Source selected:", sourceUrl);
    console.log(`[RVCI] Status: ${status} hasPaths=${Object.keys(normalizedPaths).length > 0} completePaths=${pathCheck.ok}`);
  }

  const baseDebugPayload = {
    source: sourceUrl,
    status,
    reason,
    missingKeys,
    errors: latestResult.errors || []
  };

  if (!contentEl) return latest;
  if (!pathCheck.ok) {
    renderNoData(contentEl, meta);
    if (debug) {
      const detail = document.createElement("details");
      if (isDebugEnabled()) {
        detail.className = "rv-block-debug";
        detail.innerHTML = `<summary>Show debug</summary><pre>${escapeHtml(JSON.stringify(baseDebugPayload, null, 2))}</pre>`;
      } else {
        detail.style.display = "none";
      }
      contentEl.appendChild(detail);
    }
    return latest;
  }
  if (!latest.ok && status === "NO_DATA") {
    renderNoData(contentEl, meta);
    return latest;
  }

  const paths = normalizedPaths;
  const tabRequests = {
    short: paths.short,
    mid: paths.mid,
    long: paths.long,
    triggers: paths.triggers,
    health: paths.health
  };
  const settled = await Promise.allSettled(
    Object.entries(tabRequests).map(([key, url]) =>
      loadRvciFile(url, debug).then((res) => ({ key, ...res }))
    )
  );
  const tabPayloads = {};
  const tabErrors = {};
  settled.forEach((result) => {
    if (result.status === "fulfilled") {
      const { key, payload, error } = result.value;
      tabPayloads[key] = payload;
      if (error) tabErrors[key] = error;
      return;
    }
    const key = result.reason?.key || "unknown";
    tabPayloads[key] = buildFallbackEnvelope("rvci-engine", "NO_DATA", result.reason);
    tabErrors[key] = { code: "FETCH_ERROR" };
  });

  const shortPayload = tabPayloads.short;
  const midPayload = tabPayloads.mid;
  const longPayload = tabPayloads.long;
  const triggerPayload = tabPayloads.triggers;
  const healthPayload = tabPayloads.health;
  if (debug) {
    const count = (payload) => (Array.isArray(payload?.data?.items) ? payload.data.items.length : 0);
    console.log(`[RVCI] Items loaded: short=${count(shortPayload)} mid=${count(midPayload)} long=${count(longPayload)} triggers=${count(triggerPayload)}`);
    if (!pathCheck.ok) {
      console.log(`[RVCI] paths incomplete missing=${missingKeys.join(", ")}`);
    }
  }

  const tabs = {
    short: { label: "Short-Term", payload: shortPayload },
    mid: { label: "Mid-Term", payload: midPayload },
    long: { label: "Long-Term", payload: longPayload },
    triggers: { label: "Triggers", payload: triggerPayload }
  };
  const state = { tab: "short" };

  const toItems = (payload) => (Array.isArray(payload?.data?.items) ? payload.data.items : []);

  const renderSignalsTable = (items, tabError) => {
    if (!items.length) {
      const errorNote = tabError ? `Data unavailable for this tab (${tabError.code || "ERROR"})` : `NO_DATA — ${reason}`;
      return `<div class="rv-native-empty">${errorNote}</div>`;
    }
    return `
      <div class="rv-native-table-wrap">
        <table class="rv-native-table rv-table--compact">
          <thead>
            <tr>
              <th>Symbol</th>
              <th>Score</th>
              <th>Trigger</th>
              <th>RSI</th>
              <th>MACD Hist</th>
              <th>RVOL</th>
              <th>Trend</th>
            </tr>
          </thead>
          <tbody>
            ${items
              .slice(0, 25)
              .map((item) => {
                const signals = item.signals || {};
                const trend =
                  signals.priceVsSma200 === null || signals.priceVsSma200 === undefined
                    ? "—"
                    : signals.priceVsSma200 >= 0
                      ? "Above SMA200"
                      : "Below SMA200";
                const triggerBadge = item.trigger
                  ? `<span class="rv-alpha-badge rv-alpha-badge--top">Yes</span>`
                  : `<span class="rv-alpha-badge rv-alpha-badge--wait">No</span>`;
                return `
                  <tr>
                    <td>${item.symbol || "—"}</td>
                    <td>${formatNumber(item.score, { maximumFractionDigits: 2 })}</td>
                    <td>${triggerBadge}</td>
                    <td>${formatNumber(signals.rsi14, { maximumFractionDigits: 1 })}</td>
                    <td>${formatNumber(signals.macdHist, { maximumFractionDigits: 2 })}</td>
                    <td>${formatNumber(signals.rvol20, { maximumFractionDigits: 2 })}</td>
                    <td>${trend}</td>
                  </tr>
                `;
              })
              .join("")}
          </tbody>
        </table>
      </div>
    `;
  };

  const renderTriggerTable = (items, tabError) => {
    if (!items.length) {
      const errorNote = tabError ? `Data unavailable for this tab (${tabError.code || "ERROR"})` : `NO_DATA — ${reason}`;
      return `<div class="rv-native-empty">${errorNote}</div>`;
    }
    return `
      <div class="rv-native-table-wrap">
        <table class="rv-native-table rv-table--compact">
          <thead>
            <tr>
              <th>Symbol</th>
              <th>Trigger Score</th>
              <th>Notes</th>
            </tr>
          </thead>
          <tbody>
            ${items
              .slice(0, 25)
              .map((item) => {
                const notes = Array.isArray(item.notes) ? item.notes.join(", ") : "—";
                return `
                  <tr>
                    <td>${item.symbol || "—"}</td>
                    <td>${formatNumber(item.triggerScore, { maximumFractionDigits: 0 })}</td>
                    <td>${notes || "—"}</td>
                  </tr>
                `;
              })
              .join("")}
          </tbody>
        </table>
      </div>
    `;
  };

  const renderBlock = () => {
    const tab = tabs[state.tab];
    const items = toItems(tab.payload);
    const tabError = tabErrors[state.tab] || null;
    const statusNote =
      status && status !== "LIVE" ? `Status: ${status} · ${reason}` : "";
    const coverageNote =
      typeof meta.coveragePct === "number"
        ? `Coverage: ${formatNumber(meta.coveragePct, { maximumFractionDigits: 1 })}%`
        : "";
    const regimeNote = meta.regime ? `Regime: ${meta.regime}` : "";
    const generatedNote = meta.generatedAt ? `Generated: ${meta.generatedAt}` : "";
    const warningNote = warnings.length ? warnings.join(" · ") : "";
    const generatedTs = Date.parse(meta.generatedAt || "");
    const ageHours = Number.isFinite(generatedTs) ? (Date.now() - generatedTs) / 3600000 : null;
    const ageNote = isSkipped && ageHours && ageHours > 48 ? ` (data is ${Math.round(ageHours / 24)} days old)` : "";
    const lastGoodNote = isSkipped ? `Market closed — showing last complete trading day${ageNote}` : "";
    const missingSample = healthPayload?.data?.missingSample || {};
    const missingList = [
      ...(Array.isArray(missingSample.A) ? missingSample.A : []),
      ...(Array.isArray(missingSample.B) ? missingSample.B : [])
    ];
    const debugPayload = {
      source: sourceUrl,
      meta,
      warnings,
      error: latest.error || null,
      missingKeys,
      tabErrors,
      fetchErrors: latestResult.errors || [],
      missingSample: missingList.slice(0, 25)
    };

    contentEl.innerHTML = `
      ${statusNote ? `<div class="rv-native-note rv-native-warning">${statusNote}</div>` : ""}
      ${warningNote ? `<div class="rv-native-note">${warningNote}</div>` : ""}
      ${lastGoodNote ? `<div class="rv-native-note">${lastGoodNote}</div>` : ""}
      <div class="rv-native-note">Composite Market Indicator (Daily)</div>
      <div class="rv-native-note">${[regimeNote, coverageNote, generatedNote].filter(Boolean).join(" · ")}</div>
      <div class="rv-tech-section">
        <div class="rv-top30-controls">
          ${Object.entries(tabs)
            .map(
              ([key, entry]) =>
                `<button type="button" class="rv-top30-tab${state.tab === key ? " is-active" : ""}" data-rv-rvci-tab="${key}">${entry.label}</button>`
            )
            .join("")}
        </div>
        ${state.tab === "triggers" ? renderTriggerTable(items, tabError) : renderSignalsTable(items, tabError)}
      </div>
      ${
        isDebugEnabled()
          ? `
            <details class="rv-block-debug">
              <summary>Show debug</summary>
              <pre>${escapeHtml(JSON.stringify(debugPayload, null, 2))}</pre>
            </details>
          `
          : ""
      }
    `;

    Array.from(contentEl.querySelectorAll("[data-rv-rvci-tab]")).forEach((button) => {
      button.addEventListener("click", () => {
        const next = button.getAttribute("data-rv-rvci-tab");
        if (!next || state.tab === next) return;
        state.tab = next;
        renderBlock();
      });
    });

    renderDebugMeta(contentEl, meta);
  };

  renderBlock();
  return latest;
}

async function renderSnapshotBlock(contentEl, feature, logger, section) {
  const blockId =
    getManifestBlockId(feature, section) ||
    feature?.id ||
    section?.getAttribute("data-rv-feature") ||
    "unknown";
  const normalizedId = normalizeId(blockId);
  if (normalizedId === "rvci-engine") {
    return renderRvciEngineSnapshot(contentEl, feature, logger);
  }
  const snapshot = await loadPreferredSnapshot(blockId);
  const meta = snapshot.meta || {};
  const status = meta.status || "NO_DATA";
  const reason = meta.reason || "NO_DATA";
  const defaultItems = Array.isArray(snapshot?.data?.items) ? snapshot.data.items : [];
  const signals = Array.isArray(snapshot?.data?.signals) ? snapshot.data.signals : [];
  const picksRaw = snapshot?.data?.picks;
  const picksArray = Array.isArray(picksRaw) ? picksRaw : [];
  const picksObject = picksRaw && typeof picksRaw === "object" && !Array.isArray(picksRaw) ? picksRaw : null;
  const picksCount = picksObject
    ? (Array.isArray(picksObject.top) ? picksObject.top.length : 0) +
      (Array.isArray(picksObject.shortterm) ? picksObject.shortterm.length : 0) +
      (Array.isArray(picksObject.shortTerm) ? picksObject.shortTerm.length : 0) +
      (Array.isArray(picksObject.longterm) ? picksObject.longterm.length : 0) +
      (Array.isArray(picksObject.longTerm) ? picksObject.longTerm.length : 0)
    : picksArray.length;
  const itemsCount = normalizedId.endsWith("tech-signals")
    ? signals.length || defaultItems.length
    : normalizedId.endsWith("alpha-radar") || normalizedId.endsWith("alpha-radar-lite")
      ? picksCount || defaultItems.length
      : defaultItems.length;
  const uiStatus = status === "ERROR" ? "FAIL" : status === "NO_DATA" ? "PARTIAL" : "OK";
  logger?.setStatus(uiStatus, reason);
  logger?.setMeta({
    ok: snapshot.ok,
    metaStatus: status,
    metaReason: reason,
    itemsCount,
    dataAt: meta.generatedAt || null,
    source: "snapshot"
  });

  if (normalizedId.endsWith("top-movers")) {
    renderTopMoversSnapshot(contentEl, snapshot);
  } else if (normalizedId.endsWith("yield-curve")) {
    renderYieldCurveSnapshot(contentEl, snapshot);
  } else if (normalizedId.endsWith("why-moved")) {
    renderWhyMovedSnapshot(contentEl, snapshot);
  } else if (normalizedId.endsWith("sp500-sectors")) {
    renderSp500SectorsSnapshot(contentEl, snapshot);
  } else if (normalizedId.endsWith("tech-signals")) {
    renderTechSignalsSnapshot(contentEl, snapshot);
  } else if (normalizedId.endsWith("volume-anomaly")) {
    renderVolumeAnomalySnapshot(contentEl, snapshot);
  } else if (normalizedId.endsWith("alpha-radar") || normalizedId.endsWith("alpha-radar-lite")) {
    renderAlphaRadarSnapshot(contentEl, snapshot);
  } else {
    renderSnapshotSummary(contentEl, snapshot);
  }
  return snapshot;
}

function renderManifestSnapshot(contentEl, feature, logger, section) {
  return renderSnapshotBlock(contentEl, feature, logger, section);
}

async function runFeature(section, feature, logger, contentEl) {
  const traceId = createTraceId();
  const blockName = getBlockName(section, feature);
  const endpoint = getFeatureEndpoint(feature) || getManifestEndpoint(feature, section);
  const blockId = feature?.id || section.getAttribute("data-rv-feature") || "unknown";
  setDebugContext({ blockId, blockName, endpoint });
  logger.setTraceId(traceId);
  applyApiMeta(logger);
  setLoading(section, true);

  try {
    const result = await renderSnapshotBlock(contentEl, feature, logger, section);
    // Hide block if it's empty (NO_DATA, PARTIAL, MISSING_SECRET) - but only in public view
    // EXCEPTION: Market Cockpit should always be visible (it has different data structure)
    if (!isDebugEnabled()) {
      const meta = result?.meta || {};
      const status = meta.status || "";
      const reason = meta.reason || "";
      const featureId = feature?.id || section.getAttribute("data-rv-feature") || "";
      const isMarketCockpit = featureId === "rv-market-cockpit";
      
      // Market Cockpit has different data structure - ALWAYS show it (even if NO_DATA)
      // It should display a fallback/loading state, not be hidden
      if (isMarketCockpit) {
        section.hidden = false; // Always show Market Cockpit
      } else {
        // Hide if NO_DATA, PARTIAL with no items, or MISSING_SECRET
        const hasItems = (result?.data?.items?.length > 0) || (result?.data?.signals?.length > 0) || (result?.data?.picks) || (result?.data?.sectors?.length > 0);
        if ((status === "NO_DATA" || (status === "PARTIAL" && !hasItems) || reason === "MISSING_SECRET")) {
          section.hidden = true;
        } else {
          section.hidden = false;
        }
      }
    } else {
      section.hidden = false; // Always show in debug mode
    }
    recordBlockEnd({ blockId, blockName, ok: true });
    clearDebugContext();
    return true;
  } catch (error) {
    logger.setStatus("FAIL", "Init failed");
    logger.error("init_error", { message: error?.message || "Unknown error" });
    renderError(contentEl, error);
    recordBlockEnd({
      blockId,
      blockName,
      ok: false,
      error
    });
    clearDebugContext();
    return false;
  } finally {
    setLoading(section, false);
  }
}

function bindRefresh(section, feature, logger, contentEl) {
  const refreshButton = section.querySelector('[data-rv-action="refresh"]');
  if (!refreshButton) return;
  const cooldownMs = 30_000;
  let lastRefreshAt = 0;

  refreshButton.addEventListener("click", async () => {
    const now = Date.now();
    if (now - lastRefreshAt < cooldownMs) {
      logger.warn("refresh_cooldown", { cooldownMs });
      return;
    }
    lastRefreshAt = now;
    refreshButton.disabled = true;
    setTimeout(() => {
      refreshButton.disabled = false;
    }, cooldownMs);

    const traceId = createTraceId();
    const blockName = getBlockName(section, feature);
    const endpoint = getFeatureEndpoint(feature) || getManifestEndpoint(feature, section);
    setDebugContext({ blockId: feature?.id || "unknown", blockName, endpoint });
    logger.setTraceId(traceId);
    setLoading(section, true);

    try {
      await renderSnapshotBlock(contentEl, feature, logger, section);
      recordBlockEnd({ blockId: feature?.id || "unknown", blockName, ok: true });
    } catch (error) {
      logger.setStatus("FAIL", "Refresh failed");
      logger.error("refresh_error", { message: error?.message || "Unknown error" });
      renderError(contentEl, error);
      recordBlockEnd({
        blockId: feature?.id || "unknown",
        blockName,
        ok: false,
        error
      });
    } finally {
      setLoading(section, false);
      clearDebugContext();
    }
  });
}

function startAutoRefresh(section, feature, logger, contentEl) {
  if (!feature?.refreshIntervalMs) return;
  const featureId = feature?.id || section.getAttribute("data-rv-feature") || "unknown";
  const baseInterval = Math.max(feature.refreshIntervalMs, DASHBOARD_MIN_REFRESH_MS);
  const state = refreshState.get(featureId) || {
    inflight: false,
    backoffMs: baseInterval,
    timer: null
  };
  refreshState.set(featureId, state);

  const scheduleNext = (ms) => {
    if (state.timer) window.clearTimeout(state.timer);
    state.timer = window.setTimeout(runRefresh, computeJitter(Math.max(ms, DASHBOARD_MIN_REFRESH_MS)));
  };

  const computeDelay = (entry = {}) => {
    const severity = getEntrySeverity(entry);
    if (severity === "error" || severity === "warning") {
      state.backoffMs = Math.min((state.backoffMs || baseInterval) * 2, REFRESH_BACKOFF_MAX_MS);
    } else {
      state.backoffMs = baseInterval;
    }
    return state.backoffMs;
  };

  const runRefresh = async () => {
    if (typeof document !== "undefined" && document.visibilityState !== "visible") {
      logger.info("auto_refresh_paused", { reason: "hidden" });
      scheduleNext(baseInterval);
      return;
    }
    if (section.getAttribute("data-rv-visible") === "false") {
      logger.info("auto_refresh_paused", { reason: "offscreen" });
      scheduleNext(baseInterval);
      return;
    }
    if (state.inflight) {
      scheduleNext(baseInterval);
      return;
    }
    state.inflight = true;
    const traceId = createTraceId();
    const blockName = getBlockName(section, feature);
    const endpoint = getFeatureEndpoint(feature) || getManifestEndpoint(feature, section);
    setDebugContext({ blockId: featureId, blockName, endpoint });
    logger.setTraceId(traceId);
    logger.info("auto_refresh", { intervalMs: baseInterval });
    setLoading(section, true);
    try {
      await renderSnapshotBlock(contentEl, feature, logger, section);
      recordBlockEnd({ blockId: featureId, blockName, ok: true });
    } catch (error) {
      logger.setStatus("FAIL", "Auto refresh failed");
      logger.error("auto_refresh_error", { message: error?.message || "Unknown error" });
      renderError(contentEl, error);
      recordBlockEnd({
        blockId: featureId,
        blockName,
        ok: false,
        error
      });
    } finally {
      setLoading(section, false);
      clearDebugContext();
      state.inflight = false;
      const entry = statusState.get(featureId) || {};
      const nextDelay = computeDelay(entry);
      scheduleNext(nextDelay);
    }
  };

  scheduleNext(baseInterval);
}

function initBlock(section, feature, blockIndex) {
  const root = section.querySelector("[data-rv-root]");
  if (!root) return;
  const featureId = section.getAttribute("data-rv-feature") || feature?.id || "unknown";
  const registry = feature?.registry || BLOCK_REGISTRY[featureId] || null;
  const blockNumber = Number.isFinite(blockIndex) ? blockIndex + 1 : 0;
  const idxLabel = String(blockNumber || 0).padStart(2, "0");
  const rawTitle =
    feature?.title || registry?.title || section.getAttribute("data-rv-block-name") || featureId;
  const title = sanitizeBlockTitle(rawTitle) || featureId;
  // Only add "Block XX" prefix in debug mode
  const formattedTitle = isDebugEnabled() ? `Block ${idxLabel} — ${title}` : title;
  section.setAttribute("data-block-id", idxLabel);
  section.setAttribute("data-feature-id", registry?.featureId || featureId);
  section.setAttribute("data-rv-block-name", title); // Use clean title, not formatted
  const titleEl = section.querySelector("h2, h3, .block-title, .card-title");
  if (titleEl) {
    titleEl.textContent = title; // Use clean title, not formatted
  }
  const blockName = getBlockName(section, feature);
  const manifestEndpoint = getManifestEndpoint(feature, section);
  registerBlock({
    id: featureId,
    name: blockName,
    endpoint: getFeatureEndpoint(feature) || manifestEndpoint
  });
  const logger = createLogger({
    featureId,
    blockName,
    rootEl: root,
    panicMode: DEBUG_PANIC_MODE
  });
  const originalSetStatus = logger.setStatus.bind(logger);
  logger.setStatus = (status, headline = "") => {
    const normalized = normalizeStatus(featureId, status, headline);
    originalSetStatus(normalized.status, normalized.headline);
    recordStatus(featureId, blockName, normalized.status, normalized.headline);
  };
  const originalSetMeta = logger.setMeta.bind(logger);
  logger.setMeta = (meta = {}) => {
    originalSetMeta(meta);
    if (meta.updatedAt) {
      const entry = statusState.get(featureId) || {};
      statusState.set(featureId, { ...entry, updatedAt: meta.updatedAt });
    }
    if (meta.cacheLayer !== undefined) {
      recordCache(featureId, meta.cacheLayer);
    }
    const entry = statusState.get(featureId) || {};
    statusState.set(featureId, {
      ...entry,
      ok: typeof meta.ok === "boolean" ? meta.ok : entry.ok,
      metaStatus: typeof meta.metaStatus === "string" ? meta.metaStatus : entry.metaStatus,
      metaReason: typeof meta.metaReason === "string" ? meta.metaReason : entry.metaReason,
      itemsCount: Number.isFinite(meta.itemsCount) ? meta.itemsCount : entry.itemsCount,
      mode: meta.mode || entry.mode,
      cadence: meta.cadence || entry.cadence,
      trust: meta.trust || entry.trust,
      sourceUpstream: meta.sourceUpstream || entry.sourceUpstream,
      delayMinutes: meta.delayMinutes ?? entry.delayMinutes,
      dataQuality: meta.dataQuality || entry.dataQuality
    });
  };
  const contentEl = logger.getContentEl();
  applyApiMeta(logger);
  if (feature?.computation) {
    logger.setMeta({ computation: feature.computation });
  }

  if (!feature || feature.enabled === false || section.getAttribute("data-rv-disabled") === "true") {
    logger.setStatus("DISABLED", "Disabled");
    logger.setMeta({ source: "config" });
    if (contentEl) {
      contentEl.innerHTML = `
        <div class="rv-native-empty">
          Dieses Feature ist deaktiviert.
        </div>
      `;
    }
    return;
  }

  logger.setStatus("PARTIAL", "Loading");
  bindRefresh(section, feature, logger, contentEl);
  startAutoRefresh(section, feature, logger, contentEl);
  return { logger, contentEl };
}

async function boot() {
  // Update "Data updated" date
  const dataUpdatedEl = document.getElementById("rv-data-updated-date");
  if (dataUpdatedEl) {
    const today = new Date();
    const dateStr = today.toISOString().split("T")[0];
    dataUpdatedEl.textContent = dateStr;
  }
  
  initDebugConsole();
  const loadResult = await loadFeatures();
  const features = loadResult.features;
  const featureMap = new Map(features.map((feature) => [feature.id, feature]));
  const blocksSource = Array.isArray(loadResult.blocks) ? loadResult.blocks : null;

  if (DEBUG_PANIC_MODE) {
    RV_CONFIG.DEBUG_PANIC_MODE = true;
  }

  if (blocksSource) {
    syncBlockGrid(blocksSource, features);
    if (loadResult.source === "manifest") {
      showManifestBanner(blocksSource.length);
    }
  }

  // Expected API calls per page load: 1-2 (dashboard fast/slow) with per-block fallback only when missing.
  prefetchDashboard(features);

  initFlagsPanel({ features });
  initPanicButton();

  if (isDebugEnabled()) {
    const assetPaths = [
      "./rv-loader.js",
      "./features/utils/api.js",
      "./features/utils/store.js",
      "./features/utils/flags.js",
      ...features.map((feature) => feature.module)
    ];
    const importPaths = features.map((feature) => feature.module);
    const apiResolution = getApiResolution();
    const apiPrefix = apiResolution.ok ? apiResolution.apiPrefix : "";
    const apiPaths = SNAPSHOT_ONLY
      ? []
      : apiResolution.ok
        ? features
            .filter((feature) => feature.api)
            .map((feature) => `${apiPrefix}/${feature.api}`)
        : [];
    if (!SNAPSHOT_ONLY) {
      if (apiResolution.ok) {
        apiPaths.unshift(`${apiPrefix}/health`);
      } else {
        console.warn("[RV] Config missing - API diagnostics disabled", apiResolution);
      }
    }

    Promise.all([
      import("./debug/diagnostics.js"),
      import("./debug/panel.js")
    ])
      .then(([diagnostics, panel]) => {
        diagnostics.initDiagnostics({ assetPaths, importPaths, apiPaths });
        panel.initDebugPanel();
      })
      .catch(() => {
        initInlineDiagnostics({ assetPaths, importPaths, apiPaths });
      });
  }

  const allSections = Array.from(document.querySelectorAll("[data-rv-feature]"));
  let sections = allSections;
  if (!isDebugEnabled()) {
    sections = allSections.filter((section) => {
      const featureId = section.getAttribute("data-rv-feature") || "";
      const keep = PUBLIC_FEATURE_ALLOWLIST.has(featureId);
      if (!keep) {
        section.hidden = true;
      }
      return keep;
    });
  }
  initAccordion(sections);
  setupSubnav();
  initVisibilityObserver(sections);
  updateStatusStrip();

  const lazy = sections.map((section, index) => {
    const featureId = section.getAttribute("data-rv-feature");
    const feature = featureMap.get(featureId);
    return { section, feature, index };
  });

  if (!lazy.length) return;

  if (typeof IntersectionObserver === "undefined") {
    lazy.forEach(({ section, feature, index }) => {
      const initState = initBlock(section, feature, index);
      if (!initState) return;
      const start = performance.now();
      runFeature(section, feature, initState.logger, initState.contentEl).then((ok) => {
        if (ok) {
          initState.logger.info("loaded", { loadTimeMs: Math.round(performance.now() - start) });
        }
      });
    });
    return;
  }

  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          observer.unobserve(entry.target);
          const featureId = entry.target.getAttribute("data-rv-feature");
          const feature = featureMap.get(featureId);
          const blockIndex = Number(entry.target.dataset.rvBlockIndex);
          const initState = initBlock(entry.target, feature, Number.isFinite(blockIndex) ? blockIndex : 0);
          if (!initState) return;
          const start = performance.now();
          runFeature(entry.target, feature, initState.logger, initState.contentEl).then((ok) => {
            if (ok) {
              initState.logger.info("lazy_loaded", {
                loadTimeMs: Math.round(performance.now() - start)
              });
            }
          });
        }
      });
    },
    {
      rootMargin: RV_CONFIG.loader?.rootMargin || "250px 0px 250px 0px",
      threshold: RV_CONFIG.loader?.threshold ?? 0.05
    }
  );

  // Load non-lazy features immediately (e.g., Market Cockpit)
  lazy.forEach(({ section, feature, index }) => {
    section.dataset.rvBlockIndex = String(index);
    const featureId = section.getAttribute("data-rv-feature");
    const shouldLoadImmediately = feature && !feature.lazyLoad;
    
    if (shouldLoadImmediately) {
      // Load immediately, don't wait for intersection
      const initState = initBlock(section, feature, index);
      if (initState) {
        const start = performance.now();
        runFeature(section, feature, initState.logger, initState.contentEl).then((ok) => {
          if (ok) {
            initState.logger.info("loaded_immediate", { loadTimeMs: Math.round(performance.now() - start) });
          }
        });
      }
    } else {
      // Use IntersectionObserver for lazy-loaded features
      observer.observe(section);
    }
  });

  const params = new URLSearchParams(window.location.search);
  if (params.get("diag") === "1") {
    window.setTimeout(() => {
      import("/diagnose.js")
        .then((mod) => mod.runDiagnostics({ overlay: true, onlyBad: false, includeDiscovered: true }))
        .catch((error) => console.warn("[RV_DIAG] failed to load diagnose.js", error));
    }, 2500);
  }
}

if (typeof window !== "undefined") {
  window.RV_SELFTEST = () => {
    const resolution = getApiResolution();
    const payload = {
      configLoaded: resolution.configLoaded,
      apiBase: resolution.apiBase || null,
      apiPrefix: resolution.apiPrefix || null,
      errors: resolution.errors || [],
      fetchAllowed: resolution.ok
    };
    console.log("[RV_SELFTEST]", payload);
    return payload;
  };
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", boot, { once: true });
} else {
  boot();
}
