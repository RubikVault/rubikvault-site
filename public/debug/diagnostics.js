import {
  buildDebugLink,
  createRingBuffer,
  detectNavigationType,
  elementDescriptor,
  formatBytes,
  isHtmlResponse,
  nowIso,
  readResponsePreview,
  sanitizeString,
  safeJsonParse,
  truncate
} from "./utils.js";

const MAX_ERRORS = 200;
const MAX_INTERACTIONS = 5;

const state = {
  enabled: false,
  buildInfo: null,
  environment: null,
  assetChecks: [],
  importChecks: [],
  apiChecks: [],
  networkLogs: createRingBuffer(100),
  consoleLogs: createRingBuffer(200),
  errors: [],
  interactions: [],
  cacheInfo: null,
  performance: {},
  warnings: []
};

const listeners = new Set();

function notify() {
  listeners.forEach((listener) => listener(getSnapshot()));
}

function pushError(entry) {
  state.errors.unshift(entry);
  if (state.errors.length > MAX_ERRORS) {
    state.errors.pop();
  }
}

function pushInteraction(entry) {
  state.interactions.unshift(entry);
  if (state.interactions.length > MAX_INTERACTIONS) {
    state.interactions.pop();
  }
}

function getConfig() {
  if (typeof window === "undefined") return {};
  return window.RV_CONFIG || {};
}

function isDebugEnabled() {
  if (typeof window === "undefined") return false;
  const config = getConfig();
  if (!config.DEBUG_ENABLED) return false;
  const params = new URLSearchParams(window.location.search);
  const activated = params.get("debug") === "1";
  if (!activated) return false;
  if (config.debugAuthToken) {
    return window.localStorage?.getItem("debugAuth") === config.debugAuthToken;
  }
  return true;
}

async function loadBuildInfo() {
  const config = getConfig();
  let buildInfo = config.buildInfo || null;
  try {
    const response = await fetch("/data/snapshots/build-info/latest.json", { cache: "no-store" });
    if (response.ok) {
      const data = await response.json();
      buildInfo = data?.data || data;
    }
  } catch (error) {
    // ignore; fallback to config
  }
  state.buildInfo = buildInfo;
  return buildInfo;
}

async function collectCacheInfo() {
  if (typeof window === "undefined") return null;
  const cacheInfo = {
    serviceWorkers: [],
    caches: []
  };

  try {
    if ("serviceWorker" in navigator) {
      const registrations = await navigator.serviceWorker.getRegistrations();
      cacheInfo.serviceWorkers = registrations.map((reg) => ({
        scope: reg.scope,
        active: reg.active?.state || "unknown",
        waiting: reg.waiting?.state || "none",
        installing: reg.installing?.state || "none"
      }));
    }
  } catch (error) {
    cacheInfo.serviceWorkers = [{ error: error?.message || "Unknown error" }];
  }

  try {
    if ("caches" in window) {
      const cacheNames = await caches.keys();
      for (const name of cacheNames) {
        const cache = await caches.open(name);
        const keys = await cache.keys();
        const sample = keys[0];
        let sampleHeaders = null;
        if (sample) {
          const cachedResponse = await cache.match(sample);
          sampleHeaders = {
            cacheControl: cachedResponse?.headers?.get("cache-control") || "",
            etag: cachedResponse?.headers?.get("etag") || "",
            age: cachedResponse?.headers?.get("age") || ""
          };
        }
        cacheInfo.caches.push({
          name,
          entries: keys.length,
          sampleUrl: sample?.url || "",
          sampleHeaders
        });
      }
    }
  } catch (error) {
    cacheInfo.caches.push({ error: error?.message || "Unknown error" });
  }

  state.cacheInfo = cacheInfo;
  return cacheInfo;
}

function collectPerformance() {
  if (typeof window === "undefined" || typeof performance === "undefined") return;
  const navEntries = performance.getEntriesByType("navigation");
  if (navEntries.length) {
    const entry = navEntries[0];
    state.performance.ttfb = entry.responseStart;
    state.performance.domContentLoaded = entry.domContentLoadedEventEnd;
    state.performance.loadEvent = entry.loadEventEnd;
  }

  if ("PerformanceObserver" in window) {
    try {
      const observer = new PerformanceObserver((list) => {
        list.getEntries().forEach((entry) => {
          if (entry.entryType === "largest-contentful-paint") {
            state.performance.lcp = entry.startTime;
          }
          if (entry.entryType === "layout-shift" && !entry.hadRecentInput) {
            state.performance.cls = (state.performance.cls || 0) + entry.value;
          }
        });
        notify();
      });
      observer.observe({ type: "largest-contentful-paint", buffered: true });
      observer.observe({ type: "layout-shift", buffered: true });
    } catch (error) {
      // ignore
    }
  }
}

async function runAssetChecks(assetPaths) {
  const results = [];
  for (const path of assetPaths) {
    const entry = {
      url: path,
      status: 0,
      contentType: "",
      cfCacheStatus: "",
      preview: "",
      htmlFallback: false,
      syntaxOk: null,
      syntaxError: ""
    };
    try {
      const response = await fetch(path, { cache: "no-store" });
      entry.status = response.status;
      entry.contentType = response.headers.get("content-type") || "";
      entry.cfCacheStatus = response.headers.get("cf-cache-status") || "";
      const text = await response.text();
      entry.preview = truncate(text);
      entry.htmlFallback = isHtmlResponse(entry.contentType, entry.preview);
      try {
        new Function(text); // eslint-disable-line no-new-func
        entry.syntaxOk = true;
      } catch (error) {
        entry.syntaxOk = false;
        entry.syntaxError = error?.message || "Syntax error";
      }
    } catch (error) {
      entry.preview = sanitizeString(error?.message || "Fetch failed");
    }
    results.push(entry);
  }
  state.assetChecks = results;
}

async function runImportChecks(importPaths) {
  const results = [];
  for (const path of importPaths) {
    const startedAt = performance.now();
    try {
      await import(path);
      results.push({
        path,
        ok: true,
        durationMs: Math.round(performance.now() - startedAt)
      });
    } catch (error) {
      results.push({
        path,
        ok: false,
        durationMs: Math.round(performance.now() - startedAt),
        error: sanitizeString(error?.message || "Import failed"),
        stack: sanitizeString(error?.stack || "")
      });
    }
  }
  state.importChecks = results;
}

async function runApiChecks(apiPaths) {
  const results = [];
  for (const path of apiPaths) {
    const startedAt = performance.now();
    try {
      const response = await fetch(path, { headers: { Accept: "application/json" } });
      const preview = await readResponsePreview(response);
      const contentType = response.headers.get("content-type") || "";
      const htmlFallback = isHtmlResponse(contentType, preview);
      const data = htmlFallback ? null : safeJsonParse(preview);
      const emptyPayload =
        data &&
        (Array.isArray(data) ? data.length === 0 : Object.keys(data).length === 0);
      results.push({
        path,
        status: response.status,
        durationMs: Math.round(performance.now() - startedAt),
        contentType,
        preview,
        htmlFallback,
        emptyPayload,
        cfCacheStatus: response.headers.get("cf-cache-status") || ""
      });
    } catch (error) {
      results.push({
        path,
        status: 0,
        durationMs: Math.round(performance.now() - startedAt),
        error: sanitizeString(error?.message || "Fetch failed")
      });
    }
  }
  state.apiChecks = results;
}

function evaluateBuildWarnings() {
  const warnings = [];
  const build = state.buildInfo;
  if (build?.environment && window?.location?.host) {
    if (!window.location.host.includes(build.environment)) {
      warnings.push(`Build environment mismatch: ${build.environment}`);
    }
  }
  state.warnings = warnings;
}

function setupGlobalListeners() {
  if (typeof window === "undefined") return;
  window.addEventListener("error", (event) => {
    pushError({
      type: "error",
      message: sanitizeString(event.message),
      file: event.filename || "",
      line: event.lineno || 0,
      column: event.colno || 0,
      ts: nowIso()
    });
    notify();
  });

  window.addEventListener("unhandledrejection", (event) => {
    pushError({
      type: "unhandledrejection",
      message: sanitizeString(event.reason?.message || String(event.reason || "")),
      stack: sanitizeString(event.reason?.stack || ""),
      ts: nowIso()
    });
    notify();
  });

  window.addEventListener("click", (event) => {
    pushInteraction({
      target: elementDescriptor(event.target),
      ts: nowIso()
    });
    notify();
  }, true);
}

function serializeConsoleArgs(args) {
  return args.map((arg) => {
    if (arg instanceof Error) {
      return sanitizeString(arg.stack || arg.message || "Error");
    }
    if (typeof arg === "object") {
      try {
        return sanitizeString(JSON.stringify(arg));
      } catch (error) {
        return "[unserializable]";
      }
    }
    return sanitizeString(String(arg));
  }).join(" ");
}

function hookConsole() {
  if (typeof window === "undefined") return;
  if (window.__RV_CONSOLE_HOOKED__) return;
  window.__RV_CONSOLE_HOOKED__ = true;

  const methods = ["log", "warn", "error"];
  methods.forEach((method) => {
    const original = console[method];
    if (typeof original !== "function") return;
    console[method] = (...args) => {
      state.consoleLogs.push({
        type: method,
        message: serializeConsoleArgs(args),
        ts: nowIso()
      });
      notify();
      original.apply(console, args);
    };
  });
}

export function initDiagnostics(options = {}) {
  if (!isDebugEnabled()) return false;
  state.enabled = true;
  state.environment = {
    url: window.location.href,
    host: window.location.host,
    userAgent: navigator.userAgent,
    viewport: `${window.innerWidth}x${window.innerHeight}`,
    navigation: detectNavigationType()
  };

  setupGlobalListeners();
  hookConsole();
  collectPerformance();
  const assetPaths = (options.assetPaths || []).filter(Boolean);
  const importPaths = (options.importPaths || []).filter(Boolean);
  const apiPaths = (options.apiPaths || []).filter(Boolean);
  Promise.all([
    loadBuildInfo(),
    collectCacheInfo(),
    runAssetChecks(assetPaths),
    runImportChecks(importPaths),
    runApiChecks(apiPaths)
  ]).then(() => {
    evaluateBuildWarnings();
    notify();
  });

  notify();
  window.RV_DIAGNOSTICS = {
    logFetchStart,
    logFetchSuccess,
    logFetchError,
    logFetchException
  };
  return true;
}

export function subscribe(listener) {
  listeners.add(listener);
  listener(getSnapshot());
  return () => listeners.delete(listener);
}

export function getSnapshot() {
  return {
    enabled: state.enabled,
    buildInfo: state.buildInfo,
    environment: state.environment,
    assetChecks: state.assetChecks,
    importChecks: state.importChecks,
    apiChecks: state.apiChecks,
    networkLogs: state.networkLogs.get(),
    consoleLogs: state.consoleLogs.get(),
    errors: state.errors,
    interactions: state.interactions,
    cacheInfo: state.cacheInfo,
    performance: state.performance,
    warnings: state.warnings
  };
}

export function logFetchStart(entry) {
  state.networkLogs.push({
    ...entry,
    type: "start",
    ts: nowIso()
  });
  notify();
}

export function logFetchSuccess(entry) {
  const preview = truncate(JSON.stringify(entry.data ?? ""));
  const htmlFallback = isHtmlResponse(entry.contentType || "", preview);
  state.networkLogs.push({
    ...entry,
    type: "success",
    ts: nowIso(),
    preview,
    htmlFallback
  });
  notify();
}

export function logFetchError(entry) {
  state.networkLogs.push({
    ...entry,
    type: "error",
    ts: nowIso()
  });
  notify();
}

export function logFetchException(entry) {
  state.networkLogs.push({
    ...entry,
    type: "exception",
    ts: nowIso()
  });
  notify();
}

export function clearCachesAndReload() {
  if (typeof window === "undefined") return;
  if ("caches" in window) {
    caches.keys().then((keys) => Promise.all(keys.map((key) => caches.delete(key)))).finally(() => {
      window.location.reload();
    });
  } else {
    window.location.reload();
  }
}

export function hardReload() {
  if (typeof window === "undefined") return;
  window.location.reload();
}

export function getDiagnosticsPayload() {
  return {
    generatedAt: nowIso(),
    buildInfo: state.buildInfo,
    environment: state.environment,
    warnings: state.warnings,
    assets: state.assetChecks,
    dynamicImports: state.importChecks,
    apis: state.apiChecks,
    network: state.networkLogs.get(),
    console: state.consoleLogs.get(),
    errors: state.errors,
    interactions: state.interactions,
    cache: state.cacheInfo,
    performance: state.performance
  };
}

export function toMarkdown(payload) {
  const safe = (value) => sanitizeString(JSON.stringify(value, null, 2));
  return [
    "# RubikVault Diagnostics",
    `Generated: ${payload.generatedAt}`,
    "## Build Info",
    "```json",
    safe(payload.buildInfo),
    "```",
    "## Environment",
    "```json",
    safe(payload.environment),
    "```",
    "## Warnings",
    "```json",
    safe(payload.warnings),
    "```",
    "## Assets",
    "```json",
    safe(payload.assets),
    "```",
    "## Dynamic Imports",
    "```json",
    safe(payload.dynamicImports),
    "```",
    "## APIs",
    "```json",
    safe(payload.apis),
    "```",
    "## Network",
    "```json",
    safe(payload.network),
    "```",
    "## Console",
    "```json",
    safe(payload.console),
    "```",
    "## Errors",
    "```json",
    safe(payload.errors),
    "```",
    "## Interactions",
    "```json",
    safe(payload.interactions),
    "```",
    "## Cache",
    "```json",
    safe(payload.cache),
    "```",
    "## Performance",
    "```json",
    safe(payload.performance),
    "```"
  ].join("\n");
}

export function getDebugLink() {
  return buildDebugLink();
}

export function getSummary() {
  return {
    assetErrors: state.assetChecks.filter((item) => item.htmlFallback).length,
    importErrors: state.importChecks.filter((item) => !item.ok).length,
    apiErrors: state.apiChecks.filter((item) => item.htmlFallback || item.status >= 400).length,
    errors: state.errors.length
  };
}
