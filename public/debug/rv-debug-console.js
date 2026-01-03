import { BLOCK_REGISTRY } from "../features/blocks-registry.js";

const DEBUG_VERSION = "rv-debug-v1";
const MAX_EVENTS = 200;
const MAX_FETCHES = 200;
const MAX_ERRORS = 100;
const MAX_SNIPPET = 2048;
const MAX_COMPACT_BYTES = 25000;
const MAX_CHAT_BYTES = 10000;

function nowIso() {
  return new Date().toISOString();
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function safeParse(text) {
  try {
    return { ok: true, json: JSON.parse(text) };
  } catch (error) {
    return { ok: false, error: error?.message || String(error || "") };
  }
}

function hash8(value) {
  const text = String(value || "");
  let hash = 0;
  for (let i = 0; i < text.length; i += 1) {
    hash = (hash * 31 + text.charCodeAt(i)) >>> 0;
  }
  return hash.toString(36).padStart(8, "0").slice(-8);
}

function getJSONSize(obj) {
  try {
    return new Blob([JSON.stringify(obj)]).size;
  } catch (error) {
    return 0;
  }
}

function shouldRedactKey(key) {
  return /api_key|token|secret|authorization|bearer/i.test(String(key || ""));
}

function redactValue(value) {
  if (typeof value !== "string") return value;
  if (/api_key|token|secret|authorization|bearer/i.test(value)) return "[REDACTED]";
  return value;
}

function redactObject(value) {
  if (Array.isArray(value)) return value.map((item) => redactObject(item));
  if (value && typeof value === "object") {
    const result = {};
    Object.entries(value).forEach(([key, val]) => {
      if (shouldRedactKey(key)) {
        result[key] = "[REDACTED]";
      } else {
        result[key] = redactObject(redactValue(val));
      }
    });
    return result;
  }
  return redactValue(value);
}

function getDebugFlag() {
  if (typeof window === "undefined") return false;
  const params = new URLSearchParams(window.location.search);
  return params.get("debug") === "1" || window.localStorage?.getItem("RV_DEBUG") === "1";
}

function getDebugToken() {
  if (typeof window === "undefined") return "";
  const config = window.RV_CONFIG || {};
  return (
    window.localStorage?.getItem("RV_DEBUG_TOKEN") ||
    window.localStorage?.getItem("debugToken") ||
    (config.debugAuthToken ? window.localStorage?.getItem("debugAuth") : "")
  );
}

function getDebugHeaders() {
  const token = getDebugToken();
  return token ? { "x-rv-debug-token": token } : {};
}

function getBlockLines(blockId) {
  if (typeof window === "undefined") return [];
  const store = window.__RV_BLOCK_LOGS__ || {};
  return Array.isArray(store[blockId]) ? store[blockId].slice(-100) : [];
}

function getRegistryEntry(blockId) {
  if (!BLOCK_REGISTRY) return null;
  return BLOCK_REGISTRY[blockId] || null;
}

function normalizeSeverity({ blockId, errorCode, httpStatus, dataQuality, itemsCount, traceId }) {
  if (!traceId) return "CRITICAL";
  if (errorCode === "SCHEMA_INVALID") return "CRITICAL";
  if (httpStatus >= 500) return "CRITICAL";
  const registry = getRegistryEntry(blockId);
  if (registry?.blockType === "CONTINUOUS") {
    const expected = Number.isFinite(registry.expectedMinItems) ? registry.expectedMinItems : 0;
    if (Number.isFinite(itemsCount) && itemsCount < expected) return "WARN";
  }
  const dqStatus = dataQuality?.status || dataQuality || "";
  if (["PARTIAL", "STALE", "COVERAGE_LIMIT"].includes(String(dqStatus))) return "DEGRADED";
  return "OK";
}

function ensureRoot() {
  if (typeof document === "undefined") return null;
  let root = document.getElementById("rv-debug-root");
  if (!root) {
    root = document.createElement("div");
    root.id = "rv-debug-root";
    root.hidden = true;
    document.body.appendChild(root);
  }
  return root;
}

function buildTextReport(state) {
  const lines = [];
  const blocks = Object.values(state.blocks || {});
  blocks.forEach((block) => {
    lines.push(`[featureId=${block.id}]`);
    lines.push(`endpoint: ${block.endpoint || "(unknown)"}`);
    lines.push(`status: ${block.status || "UNKNOWN"}`);
    lines.push(`http: ${block.lastResponse?.status ?? "--"}`);
    lines.push(`error.code: ${block.lastResponse?.errorCode || "--"}`);
    lines.push(`traceId: ${block.lastResponse?.traceId || "--"}`);
    lines.push(`durationMs: ${block.lastRun?.durationMs ?? "--"}`);
    if (block.lastResponse?.cache) {
      lines.push(
        `cache: ${block.lastResponse.cache.layer || "--"} ttl=${
          block.lastResponse.cache.ttl ?? "--"
        } hit=${block.lastResponse.cache.hit ?? "--"}`
      );
    }
    if (block.lastResponse?.upstream) {
      lines.push(
        `upstream: status=${block.lastResponse.upstream.status ?? "--"} url=${
          block.lastResponse.upstream.url || "--"
        }`
      );
    }
    lines.push("");
  });
  return lines.join("\n").trim();
}

function buildTopErrorCodes(blocks) {
  const map = new Map();
  blocks.forEach((block) => {
    const code = block.lastResponse?.errorCode;
    if (!code) return;
    const ts = block.lastRun?.endTime || block.lastRun?.startTime || nowIso();
    const entry = map.get(code) || { code, count: 0, firstSeen: ts, lastSeen: ts };
    entry.count += 1;
    entry.firstSeen = entry.firstSeen < ts ? entry.firstSeen : ts;
    entry.lastSeen = entry.lastSeen > ts ? entry.lastSeen : ts;
    map.set(code, entry);
  });
  return Array.from(map.values())
    .sort((a, b) => b.count - a.count)
    .slice(0, 10)
    .map((entry) => ({ ...entry, hash: hash8(entry.code) }));
}

function inferRootCauses(summary) {
  const causes = [];
  const top = summary.topErrorCodes?.[0];
  if (top?.code === "BINDING_MISSING") {
    causes.push({
      cause: "BINDING_MISSING",
      confidence: 0.9,
      nextAction:
        "Cloudflare Dashboard -> Pages -> rubikvault-site -> Settings -> Functions -> KV namespace bindings -> Add RV_KV for Preview + Production."
    });
  } else if (top?.code === "SCHEMA_INVALID") {
    causes.push({
      cause: "SCHEMA_INVALID",
      confidence: 0.7,
      nextAction: "Upstream returned HTML/invalid JSON; check /api/diag and upstream feeds."
    });
  } else if (top?.code?.startsWith("UPSTREAM")) {
    causes.push({
      cause: "UPSTREAM_ERRORS",
      confidence: 0.6,
      nextAction: "Upstream error detected; use /api/diag to identify failing endpoints."
    });
  }
  if (causes.length === 0) {
    causes.push({
      cause: "NO_DOMINANT_ROOT",
      confidence: 0.3,
      nextAction: "No dominant root cause detected. Inspect worstEndpoints and error codes."
    });
  }
  return causes.slice(0, 3);
}

function buildCompactReport(state) {
  const blocks = Object.values(state.blocks || {});
  const worstEndpoints = blocks
    .map((block) => ({
      p: block.endpoint || "--",
      s: block.lastResponse?.status ?? null,
      c: block.lastResponse?.errorCode || "",
      t: block.lastRun?.durationMs ?? null,
      up: block.lastResponse?.upstream?.status ?? null,
      cache: block.lastResponse?.cache?.layer ?? null
    }))
    .sort((a, b) => (b.t || 0) - (a.t || 0))
    .slice(0, 10);

  const topErrorCodes = buildTopErrorCodes(blocks);
  const summary = {
    totalBlocks: blocks.length,
    failBlocks: blocks.filter((block) => block.status === "FAIL").length,
    topErrorCodes
  };

  const examples = [];
  const seenCodes = new Set();
  blocks.forEach((block) => {
    if (!block.lastResponse?.errorCode || seenCodes.has(block.lastResponse.errorCode)) return;
    if (examples.length >= 2) return;
    const payload = block.lastResponse.json
      ? JSON.stringify(block.lastResponse.json).slice(0, 600)
      : (block.lastResponse.rawSnippet || "").slice(0, 600);
    examples.push({
      code: block.lastResponse.errorCode,
      example: payload
    });
    seenCodes.add(block.lastResponse.errorCode);
  });

  let compact = {
    meta: {
      url: state.page.url,
      ts: nowIso(),
      userAgent: state.page.userAgent
    },
    summary,
    rootCause: inferRootCauses(summary),
    worstEndpoints,
    examples
  };

  const originalSize = getJSONSize(compact);
  if (originalSize > MAX_COMPACT_BYTES) {
    compact = { ...compact, examples: [] };
  }
  if (getJSONSize(compact) > MAX_COMPACT_BYTES) {
    compact = { ...compact, worstEndpoints: compact.worstEndpoints.slice(0, 5) };
  }
  if (getJSONSize(compact) > MAX_COMPACT_BYTES) {
    compact = { ...compact, rootCause: compact.rootCause.slice(0, 1) };
  }
  if (getJSONSize(compact) > MAX_COMPACT_BYTES) {
    compact.summary = { ...compact.summary, truncated: true, originalSize };
  }
  return compact;
}

function buildClientSnapshot(state) {
  const blocks = Object.values(state.blocks || {}).map((block) => {
    const lastResponse = block.lastResponse || {};
    const dataQuality = lastResponse.json?.dataQuality || null;
    const itemsCount = Array.isArray(lastResponse.json?.data?.items)
      ? lastResponse.json.data.items.length
      : null;
    return {
      blockId: block.id,
      status: block.status,
      meta: {
        endpoint: block.endpoint || "",
        traceId: lastResponse.traceId || "",
        cache: lastResponse.cache || null,
        upstream: lastResponse.upstream || null,
        dataQuality,
        itemsCount
      },
      lines: getBlockLines(block.id)
    };
  });

  return redactObject({
    ts: nowIso(),
    page: state.page,
    blocks,
    events: state.events.slice(-200),
    fetchLog: state.fetches.filter((entry) => entry.isApi).slice(-100),
    consoleErrors: state.console.errors.slice(-50),
    jsErrors: state.jsErrors.slice(-50)
  });
}

function buildCorrelationIndex(clientBlocks, serverEvents) {
  const index = {};
  clientBlocks.forEach((block) => {
    const traceId = block.meta?.traceId;
    if (!traceId) return;
    index[traceId] = index[traceId] || { client: [], server: [] };
    index[traceId].client.push({
      blockId: block.blockId,
      status: block.status
    });
  });
  (serverEvents || []).forEach((event) => {
    const traceId = event?.traceId;
    if (!traceId) return;
    index[traceId] = index[traceId] || { client: [], server: [] };
    index[traceId].server.push({
      feature: event.feature,
      errorCode: event.errorCode,
      httpStatus: event.httpStatus
    });
  });
  return index;
}

function buildSummaryFromBlocks(blocks) {
  const countsBySeverity = { OK: 0, DEGRADED: 0, WARN: 0, CRITICAL: 0 };
  const countsByFeature = {};
  const errorCounts = {};
  blocks.forEach((block) => {
    const severity = normalizeSeverity({
      blockId: block.blockId,
      errorCode: block.meta?.dataQuality?.reason || block.meta?.dataQuality?.status || "",
      httpStatus: block.meta?.upstream?.status || 0,
      dataQuality: block.meta?.dataQuality,
      itemsCount: block.meta?.itemsCount,
      traceId: block.meta?.traceId
    });
    countsBySeverity[severity] = (countsBySeverity[severity] || 0) + 1;
    countsByFeature[block.blockId] = severity;
    const errorCode = block.meta?.dataQuality?.reason || block.meta?.dataQuality?.status || "";
    if (errorCode) {
      errorCounts[errorCode] = (errorCounts[errorCode] || 0) + 1;
    }
  });
  const topErrors = Object.entries(errorCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([code, count]) => ({ code, count, hash: hash8(code) }));
  let severity = "OK";
  if (countsBySeverity.CRITICAL > 0) severity = "CRITICAL";
  else if (countsBySeverity.WARN > 0) severity = "WARN";
  else if (countsBySeverity.DEGRADED > 0) severity = "DEGRADED";
  return { severity, countsBySeverity, countsByFeature, topErrors };
}

function buildUnifiedReport(state) {
  const client = buildClientSnapshot(state);
  const serverBundle = state.serverBundle || {};
  const server = {
    health: serverBundle?.health || state.serverDiag?.health?.json || {},
    diag: serverBundle?.diag || state.serverDiag?.diag?.json || {},
    debugBundle: serverBundle || {}
  };
  const correlation = {
    byTraceId: buildCorrelationIndex(client.blocks || [], serverBundle?.recentEvents || [])
  };
  const summary = buildSummaryFromBlocks(client.blocks || []);
  const report = {
    schemaVersion: "1.0",
    generatedAt: nowIso(),
    runId: state.runId || "",
    location: {
      href: state.page.url,
      userAgent: state.page.userAgent
    },
    client,
    server,
    correlation,
    summary,
    redaction: {
      enabled: true,
      snippetMaxBytes: MAX_SNIPPET
    }
  };
  const redacted = redactObject(report);
  redacted.sizeBytes = getJSONSize(redacted);
  return redacted;
}

function buildUnifiedCompactReport(report) {
  if (!report) return {};
  let compact = {
    schemaVersion: report.schemaVersion,
    generatedAt: report.generatedAt,
    runId: report.runId,
    summary: report.summary,
    topErrors: report.summary?.topErrors || [],
    worstEndpoints: (report.server?.debugBundle?.recentEvents || [])
      .filter((event) => event.errorCode)
      .slice(0, 20)
      .map((event) => ({
        ts: event.ts,
        feature: event.feature,
        errorCode: event.errorCode,
        httpStatus: event.httpStatus,
        traceId: event.traceId
      }))
  };
  const originalSize = getJSONSize(compact);
  if (originalSize > MAX_CHAT_BYTES) {
    compact.worstEndpoints = compact.worstEndpoints.slice(0, 10);
  }
  if (getJSONSize(compact) > MAX_CHAT_BYTES) {
    compact.topErrors = compact.topErrors.slice(0, 3);
    compact.summary = { ...compact.summary, truncated: true, originalSize };
  }
  return compact;
}

function createState() {
  return {
    enabled: getDebugFlag(),
    version: DEBUG_VERSION,
    startedAt: nowIso(),
    runId: typeof window !== "undefined" ? window.__RV_RUN_ID || "" : "",
    page: {
      url: typeof window !== "undefined" ? window.location.href : "",
      userAgent: typeof navigator !== "undefined" ? navigator.userAgent : ""
    },
    blocks: {},
    events: [],
    fetches: [],
    console: { errors: [], warnings: [] },
    jsErrors: [],
    currentBlock: null,
    expanded: false,
    filter: "all",
    sort: "status",
    renderQueued: false,
    consolePatched: false,
    errorPatched: false,
    fetchPatched: false,
    togglePatched: false,
    diag: { running: false, progress: 0, total: 0, message: "", aborters: [] },
    serverDiag: null,
    serverBundle: null,
    aiReport: null,
    aiReportCompact: null,
    aiStatus: { running: false, message: "" }
  };
}

function getBlock(state, blockId, blockName) {
  if (!state.blocks[blockId]) {
    state.blocks[blockId] = {
      id: blockId,
      name: blockName || blockId,
      status: "UNKNOWN",
      endpoint: "",
      lastRun: null,
      lastResponse: null
    };
  }
  return state.blocks[blockId];
}

function recordEvent(state, event) {
  state.events.push(event);
  if (state.events.length > MAX_EVENTS) {
    state.events.splice(0, state.events.length - MAX_EVENTS);
  }
}

function recordFetch(state, entry) {
  state.fetches.push(entry);
  if (state.fetches.length > MAX_FETCHES) {
    state.fetches.splice(0, state.fetches.length - MAX_FETCHES);
  }
}

function scheduleRender(state) {
  if (!state.enabled) return;
  if (state.renderQueued) return;
  state.renderQueued = true;
  requestAnimationFrame(() => {
    state.renderQueued = false;
    render(state);
  });
}

function buildSummary(state) {
  const blocks = Object.values(state.blocks || {});
  const failBlocks = blocks.filter((block) => block.status === "FAIL");
  const okBlocks = blocks.filter((block) => block.status === "OK");
  const errorCodes = {};
  failBlocks.forEach((block) => {
    const code = block.lastResponse?.errorCode || "UNKNOWN";
    errorCodes[code] = (errorCodes[code] || 0) + 1;
  });
  const topErrors = Object.entries(errorCodes)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([code, count]) => `${code}(${count})`)
    .join(", ");
  return {
    total: blocks.length,
    ok: okBlocks.length,
    fail: failBlocks.length,
    lastError:
      failBlocks.find((block) => block.lastResponse?.errorCode)?.lastResponse?.errorCode || "--",
    topErrors: topErrors || "--",
    bindingMissing: blocks.some((block) => block.lastResponse?.errorCode === "BINDING_MISSING")
  };
}

function render(state) {
  const root = ensureRoot();
  if (!root) return;
  if (!state.enabled) {
    root.hidden = true;
    return;
  }

  const blocks = Object.values(state.blocks || {});
  const summary = buildSummary(state);
  const blockRows = blocks
    .filter((block) => {
      if (state.filter === "fail") return block.status === "FAIL";
      if (state.filter === "ok") return block.status === "OK";
      return true;
    })
    .sort((a, b) => {
      if (state.sort === "duration") {
        return (b.lastRun?.durationMs || 0) - (a.lastRun?.durationMs || 0);
      }
      if (state.sort === "status") {
        return a.status.localeCompare(b.status);
      }
      return 0;
    })
    .map((block) => {
      const response = block.lastResponse || {};
      const status = response.status ?? "--";
      const errorCode = response.errorCode || "--";
      const traceId = response.traceId || "--";
      const duration = block.lastRun?.durationMs ?? "--";
      const payload = response.json ? escapeHtml(JSON.stringify(response.json, null, 2)) : "";
      const raw = response.rawSnippet ? escapeHtml(response.rawSnippet) : "";
      return `
        <details class="rvdbg-item">
          <summary>
            <span class="rvdbg-name">${escapeHtml(block.name || block.id)}</span>
            <span class="rvdbg-status rvdbg-${block.status.toLowerCase()}">${block.status}</span>
            <span class="rvdbg-meta">HTTP ${status}</span>
            <span class="rvdbg-meta">${errorCode}</span>
            <span class="rvdbg-meta">${traceId}</span>
            <span class="rvdbg-meta">${duration}ms</span>
          </summary>
          <div class="rvdbg-detail">
            <div><strong>Feature:</strong> ${escapeHtml(block.id)}</div>
            <div><strong>Endpoint:</strong> ${escapeHtml(block.endpoint || "--")}</div>
            <div><strong>Upstream:</strong> ${escapeHtml(
              response.upstream
                ? `${response.upstream.status ?? "--"} ${response.upstream.url || ""}`
                : "--"
            )}</div>
            <div><strong>Cache:</strong> ${escapeHtml(
              response.cache
                ? `${response.cache.layer || "--"} ttl=${response.cache.ttl ?? "--"}`
                : "--"
            )}</div>
            ${payload ? `<pre class="rvdbg-pre">${payload}</pre>` : ""}
            ${raw ? `<pre class="rvdbg-pre">${raw}</pre>` : ""}
          </div>
        </details>
      `;
    })
    .join("");

  const apiFetches = state.fetches.filter((entry) => entry.isApi);
  const fetchRows = apiFetches
    .slice(-50)
    .map((entry) => {
      return `
        <div class="rvdbg-fetch">
          <span>${escapeHtml(entry.method || "GET")} ${escapeHtml(entry.url)}</span>
          <span>HTTP ${entry.status ?? "--"}</span>
          <span>${entry.durationMs}ms</span>
        </div>
      `;
    })
    .join("");

  const errorRows = state.jsErrors
    .slice(-20)
    .map((entry) => `<div class="rvdbg-log">${escapeHtml(entry.message)}</div>`)
    .join("");
  const consoleRows = state.console.errors
    .slice(-20)
    .map((entry) => `<div class="rvdbg-log">${escapeHtml(entry.message)}</div>`)
    .join("");

  root.hidden = false;
  root.innerHTML = `
    <div class="rvdbg-panel ${state.expanded ? "is-open" : ""}">
      <div class="rvdbg-header">
        <div class="rvdbg-title">RubikVault Debug</div>
        <div class="rvdbg-meta">${escapeHtml(state.page.url)}</div>
        <button class="rvdbg-btn" data-action="toggle">${
          state.expanded ? "Hide" : "Show"
        }</button>
      </div>
      <div class="rvdbg-summary">
        <span>Total: ${summary.total}</span>
        <span>OK: ${summary.ok}</span>
        <span>Fail: ${summary.fail}</span>
        <span>Top errors: ${escapeHtml(summary.topErrors)}</span>
        <span>Last error: ${escapeHtml(summary.lastError)}</span>
      </div>
      ${
        summary.bindingMissing
          ? '<div class="rvdbg-banner">ROOT CAUSE: Missing binding RV_KV in this environment (Preview/Prod).</div>'
          : ""
      }
      ${
        state.diag?.running
          ? `<div class="rvdbg-progress">Checking ${state.diag.progress}/${state.diag.total}... ${escapeHtml(
              state.diag.message || ""
            )}</div>`
          : ""
      }
      ${
        state.aiStatus?.running
          ? `<div class="rvdbg-progress">AI Report: ${escapeHtml(state.aiStatus.message || "working...")}</div>`
          : ""
      }
      <div class="rvdbg-controls">
        <label>
          Filter
          <select data-action="filter">
            <option value="all" ${state.filter === "all" ? "selected" : ""}>ALL</option>
            <option value="fail" ${state.filter === "fail" ? "selected" : ""}>FAIL only</option>
            <option value="ok" ${state.filter === "ok" ? "selected" : ""}>OK only</option>
          </select>
        </label>
        <label>
          Sort
          <select data-action="sort">
            <option value="status" ${state.sort === "status" ? "selected" : ""}>Status</option>
            <option value="duration" ${state.sort === "duration" ? "selected" : ""}>Duration</option>
          </select>
        </label>
        <button class="rvdbg-btn" data-action="copy-compact">Copy Compact</button>
        <button class="rvdbg-btn" data-action="copy">Copy Full</button>
        <button class="rvdbg-btn" data-action="download">Download Full JSON</button>
        <button class="rvdbg-btn" data-action="clear">Clear</button>
        <button class="rvdbg-btn" data-action="diagnose">Run Diagnostics</button>
        <button class="rvdbg-btn" data-action="ai-report">Generate AI Report</button>
        ${
          state.diag?.running
            ? '<button class="rvdbg-btn" data-action="cancel">Cancel</button>'
            : ""
        }
      </div>
      <div class="rvdbg-section">
        <h4>Blocks</h4>
        <div class="rvdbg-list">${blockRows || "<em>No blocks captured yet.</em>"}</div>
      </div>
      <div class="rvdbg-section">
        <h4>Global JS Errors</h4>
        ${errorRows || "<em>None</em>"}
      </div>
      <div class="rvdbg-section">
        <h4>Console Errors</h4>
        ${consoleRows || "<em>None</em>"}
      </div>
      <div class="rvdbg-section">
        <h4>API Fetch Log</h4>
        ${fetchRows || "<em>No API fetches captured.</em>"}
      </div>
    </div>
    <button class="rvdbg-toggle" data-action="toggle">DBG</button>
  `;

  root.querySelectorAll("[data-action]").forEach((el) => {
    el.addEventListener("click", (event) => {
      const action = event.currentTarget.getAttribute("data-action");
      if (action === "toggle") {
        state.expanded = !state.expanded;
        scheduleRender(state);
      }
      if (action === "copy") {
        state.copyAll();
      }
      if (action === "copy-compact") {
        state.copyCompact();
      }
      if (action === "download") {
        state.download();
      }
      if (action === "clear") {
        state.events = [];
        state.fetches = [];
        state.console = { errors: [], warnings: [] };
        state.jsErrors = [];
        scheduleRender(state);
      }
      if (action === "diagnose") {
        state.runDiagnostics();
      }
      if (action === "ai-report") {
        state.generateAIReport();
      }
      if (action === "cancel") {
        if (state.diag?.aborters?.length) {
          state.diag.aborters.forEach((controller) => controller.abort());
        }
        state.diag.running = false;
        state.diag.message = "Cancelled";
        scheduleRender(state);
      }
    });
  });

  const filterEl = root.querySelector("select[data-action='filter']");
  if (filterEl) {
    filterEl.addEventListener("change", (event) => {
      state.filter = event.target.value || "all";
      scheduleRender(state);
    });
  }
  const sortEl = root.querySelector("select[data-action='sort']");
  if (sortEl) {
    sortEl.addEventListener("change", (event) => {
      state.sort = event.target.value || "status";
      scheduleRender(state);
    });
  }
}

function patchConsole(state) {
  if (state.consolePatched || typeof console === "undefined") return;
  let inPatch = false;
  const wrap = (method, bucket) => {
    const original = console[method];
    console[method] = (...args) => {
      if (inPatch) {
        return original.apply(console, args);
      }
      inPatch = true;
      if (state.enabled) {
        const entry = {
          ts: nowIso(),
          message: args.map((arg) => (typeof arg === "string" ? arg : JSON.stringify(arg))).join(" ")
        };
        state.console[bucket].push(entry);
        if (state.console[bucket].length > MAX_ERRORS) {
          state.console[bucket].splice(0, state.console[bucket].length - MAX_ERRORS);
        }
      }
      original.apply(console, args);
      inPatch = false;
    };
  };
  wrap("error", "errors");
  wrap("warn", "warnings");
  state.consolePatched = true;
}

function patchGlobalErrors(state) {
  if (state.errorPatched || typeof window === "undefined") return;
  window.addEventListener("error", (event) => {
    state.jsErrors.push({ ts: nowIso(), message: event.message || "Error", stack: event.error?.stack });
    if (state.jsErrors.length > MAX_ERRORS) state.jsErrors.shift();
    if (state.enabled) scheduleRender(state);
  });
  window.addEventListener("unhandledrejection", (event) => {
    state.jsErrors.push({ ts: nowIso(), message: event.reason?.message || String(event.reason || "Unhandled"), stack: event.reason?.stack });
    if (state.jsErrors.length > MAX_ERRORS) state.jsErrors.shift();
    if (state.enabled) scheduleRender(state);
  });
  state.errorPatched = true;
}

function getSafeHeaders(headers) {
  if (!headers) return {};
  try {
    const result = {};
    const read = (key) => headers.get?.(key) || headers[key];
    ["accept", "content-type", "x-rv-feature", "x-rv-trace"].forEach((key) => {
      const value = read(key);
      if (value) result[key] = value;
    });
    return result;
  } catch (error) {
    return {};
  }
}

function normalizeUrl(url) {
  if (typeof window === "undefined") return url;
  if (url.startsWith(window.location.origin)) {
    return url.slice(window.location.origin.length) || "/";
  }
  return url;
}

function patchFetch(state) {
  if (state.fetchPatched || typeof window === "undefined" || !window.fetch) return;
  const original = window.fetch.bind(window);
  window.fetch = async (...args) => {
    const started = performance.now();
    const request = args[0];
    const options = args[1] || {};
    const url = typeof request === "string" ? request : request?.url || "";
    const method = options?.method || "GET";
    const headers = getSafeHeaders(options?.headers || request?.headers);
    try {
      const response = await original(...args);
      let text = "";
      try {
        text = await response.clone().text();
      } catch (error) {
        text = "";
      }
      const parsed = safeParse(text);
      const entry = {
        ts: nowIso(),
        url: normalizeUrl(url),
        method,
        headers,
        status: response.status,
        durationMs: Math.round(performance.now() - started),
        ok: parsed.ok ? parsed.json?.ok : null,
        errorCode: parsed.ok ? parsed.json?.error?.code : "SCHEMA_INVALID",
        traceId: parsed.ok ? parsed.json?.traceId : null,
        requestId: parsed.ok ? parsed.json?.trace?.requestId : null,
        cache: parsed.ok ? parsed.json?.cache : null,
        upstream: parsed.ok ? parsed.json?.upstream : null,
        json: parsed.ok ? parsed.json : null,
        rawSnippet: parsed.ok ? "" : text.slice(0, MAX_SNIPPET),
        isApi: url.includes("/api/")
      };
      recordFetch(state, entry);
      const block = state.currentBlock;
      if (block) {
        recordBlockFetch(state, block.id, block.name, block.endpoint, entry);
      }
      return response;
    } catch (error) {
      const entry = {
        ts: nowIso(),
        url: normalizeUrl(url),
        method,
        headers,
        status: null,
        durationMs: Math.round(performance.now() - started),
        ok: null,
        errorCode: "FETCH_ERROR",
        traceId: null,
        cache: null,
        upstream: null,
        json: null,
        rawSnippet: String(error?.message || error || "fetch failed").slice(0, MAX_SNIPPET),
        isApi: url.includes("/api/")
      };
      recordFetch(state, entry);
      if (state.currentBlock) {
        recordBlockFetch(state, state.currentBlock.id, state.currentBlock.name, state.currentBlock.endpoint, entry);
      }
      throw error;
    }
  };
  state.fetchPatched = true;
}

function recordBlockFetch(state, blockId, blockName, endpoint, entry) {
  const block = getBlock(state, blockId, blockName);
  block.endpoint = endpoint || block.endpoint;
  block.lastResponse = {
    url: entry.url,
    status: entry.status,
    ok: entry.ok,
    errorCode: entry.errorCode,
    traceId: entry.traceId,
    requestId: entry.requestId,
    cache: entry.cache,
    upstream: entry.upstream,
    json: entry.json,
    rawSnippet: entry.rawSnippet
  };
  if (entry.ok === true) {
    block.status = "OK";
  } else if (entry.ok === false || entry.errorCode) {
    block.status = "FAIL";
  }
  recordEvent(state, {
    ts: nowIso(),
    type: "fetch",
    blockId,
    url: entry.url,
    status: entry.status,
    durationMs: entry.durationMs
  });
  if (state.enabled && entry.errorCode && !state.expanded) {
    state.expanded = true;
  }
  scheduleRender(state);
}

function attachKeyboardToggle(state) {
  if (state.togglePatched || typeof window === "undefined") return;
  window.addEventListener("keydown", (event) => {
    const isToggle = (event.ctrlKey || event.metaKey) && event.shiftKey && event.key.toLowerCase() === "d";
    if (!isToggle) return;
    state.enabled = !state.enabled;
    if (state.enabled) {
      window.localStorage?.setItem("RV_DEBUG", "1");
      patchConsole(state);
      patchGlobalErrors(state);
      patchFetch(state);
    } else {
      window.localStorage?.removeItem("RV_DEBUG");
    }
    state.expanded = state.enabled;
    scheduleRender(state);
  });
  state.togglePatched = true;
}

function exportReport(state) {
  return buildUnifiedReport(state);
}

function copyAll(state) {
  const report = exportReport(state);
  const text = JSON.stringify(report, null, 2);
  if (navigator?.clipboard?.writeText) {
    return navigator.clipboard.writeText(text);
  }
  try {
    const textarea = document.createElement("textarea");
    textarea.value = text;
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand("copy");
    textarea.remove();
  } catch (error) {
    // ignore
  }
  return Promise.resolve();
}

function copyCompact(state) {
  const compact =
    state.aiReportCompact || buildUnifiedCompactReport(state.aiReport || buildUnifiedReport(state));
  const text = JSON.stringify(compact, null, 2);
  if (navigator?.clipboard?.writeText) {
    return navigator.clipboard.writeText(text);
  }
  try {
    const textarea = document.createElement("textarea");
    textarea.value = text;
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand("copy");
    textarea.remove();
  } catch (error) {
    // ignore
  }
  return Promise.resolve();
}

function download(state) {
  const report = state.aiReport || exportReport(state);
  const blob = new Blob([JSON.stringify(report, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `rv-debug-${Date.now()}.json`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

async function runDiagnostics(state) {
  if (!state.enabled) return;
  if (state.diag?.running) return;
  const features = window.RV_CONFIG?.FEATURES || [];
  const apiBase = window.RV_CONFIG?.apiBase || "/api";
  const endpoints = features
    .filter((feature) => feature?.api)
    .map((feature) => ({
      id: feature.id,
      url: feature.api.startsWith("http") ? feature.api : `${apiBase}/${feature.api}`
    }));

  state.diag = { running: true, progress: 0, total: endpoints.length, message: "Starting", aborters: [] };
  scheduleRender(state);

  const fetchJsonSafe = async (url, controller) => {
    const started = performance.now();
    try {
      const res = await fetch(url, {
        signal: controller.signal,
        headers: { Accept: "application/json", ...getDebugHeaders() }
      });
      const text = await res.text();
      const parsed = safeParse(text);
      return {
        ok: parsed.ok,
        status: res.status,
        json: parsed.ok ? parsed.json : null,
        rawSnippet: parsed.ok ? "" : text.slice(0, MAX_SNIPPET),
        durationMs: Math.round(performance.now() - started),
        error: parsed.ok ? null : parsed.error
      };
    } catch (error) {
      return {
        ok: false,
        status: 0,
        json: null,
        rawSnippet: String(error?.message || error || "fetch failed").slice(0, MAX_SNIPPET),
        durationMs: Math.round(performance.now() - started),
        error: error?.message || "fetch failed"
      };
    }
  };

  const healthController = new AbortController();
  const diagController = new AbortController();
  state.diag.aborters.push(healthController, diagController);
  const healthUrl = `${apiBase}/health`;
  const diagUrl = `${apiBase}/diag`;
  state.diag.message = "Checking /api/health";
  scheduleRender(state);
  const health = await fetchJsonSafe(healthUrl, healthController);
  state.serverDiag = { health };
  await new Promise((resolve) => requestAnimationFrame(resolve));
  state.diag.message = "Checking /api/diag";
  scheduleRender(state);
  const diag = await fetchJsonSafe(diagUrl, diagController);
  state.serverDiag.diag = diag;

  const diagTop = diag.json?.data?.summary?.topErrorCodes?.[0];
  const diagFail = diag.json?.data?.summary?.endpointsFail;
  if (diagTop?.code === "BINDING_MISSING" && Number(diagFail) >= 5) {
    state.diag.running = false;
    state.diag.message = "Binding missing detected. Skipped client diagnostics.";
    scheduleRender(state);
    return;
  }

  let index = 0;
  for (const endpoint of endpoints) {
    if (!state.diag.running) break;
    index += 1;
    state.diag.progress = index;
    state.diag.message = `Checking ${endpoint.id} (${index}/${endpoints.length})`;
    scheduleRender(state);
    const controller = new AbortController();
    state.diag.aborters.push(controller);
    try {
      await fetchJsonSafe(endpoint.url, controller);
    } catch (error) {
      recordEvent(state, {
        ts: nowIso(),
        type: "diagnostic_error",
        blockId: endpoint.id,
        message: error?.message || "Diagnostic failed"
      });
    }
    await new Promise((resolve) => requestAnimationFrame(resolve));
  }
  state.diag.running = false;
  state.diag.message = "Done";
  scheduleRender(state);
}

async function generateAIReport(state) {
  if (!state.enabled) return;
  if (state.aiStatus?.running) return;
  const apiBase = window.RV_CONFIG?.apiBase || "/api";
  const bundleUrl = `${apiBase}/debug-bundle?limit=200`;
  state.aiStatus = { running: true, message: "Fetching server bundle" };
  scheduleRender(state);
  let serverBundle = null;
  try {
    const response = await fetch(bundleUrl, {
      headers: { Accept: "application/json", ...getDebugHeaders() }
    });
    const text = await response.text();
    const parsed = safeParse(text);
    serverBundle = parsed.ok ? parsed.json : null;
  } catch (error) {
    serverBundle = null;
  }
  state.aiStatus.message = "Merging client snapshot";
  scheduleRender(state);
  if (!serverBundle) {
    state.serverBundle = {
      schema: "RUBIKVAULT_DEBUG_BUNDLE_V1",
      meta: { ts: nowIso(), envHint: "unknown", host: window.location.host, version: null },
      infra: { kv: { hasKV: false, binding: "RV_KV", errors: ["FETCH_FAILED"] }, notes: [] },
      health: {},
      diag: {},
      recentEvents: [],
      client: {},
      correlations: [],
      summary: { status: "FAIL", topErrorCodes: [], blocksDown: [], endpointsDown: [] }
    };
  } else {
    state.serverBundle = serverBundle;
  }
  state.aiReport = buildUnifiedReport(state);
  state.aiReportCompact = buildUnifiedCompactReport(state.aiReport);
  state.aiStatus.running = false;
  state.aiStatus.message = "Ready";
  scheduleRender(state);
  try {
    await fetch(`${apiBase}/debug/ingest`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ client: buildClientSnapshot(state) })
    });
  } catch (error) {
    // ignore ingest failures
  }
}

export function initDebugConsole() {
  if (typeof window === "undefined") return null;
  if (window.__RV_DEBUG__) return window.__RV_DEBUG__;
  const state = createState();
  state.exportReport = () => exportReport(state);
  state.copyAll = () => copyAll(state);
  state.copyCompact = () => copyCompact(state);
  state.download = () => download(state);
  state.runDiagnostics = () => runDiagnostics(state);
  state.generateAIReport = () => generateAIReport(state);
  state.toggle = () => {
    state.enabled = !state.enabled;
    if (state.enabled) {
      window.localStorage?.setItem("RV_DEBUG", "1");
      patchConsole(state);
      patchGlobalErrors(state);
      patchFetch(state);
    } else {
      window.localStorage?.removeItem("RV_DEBUG");
    }
    state.expanded = state.enabled;
    scheduleRender(state);
  };
  attachKeyboardToggle(state);
  if (state.enabled) {
    patchConsole(state);
    patchGlobalErrors(state);
    patchFetch(state);
    state.expanded = true;
    render(state);
  }
  window.__RV_DEBUG__ = state;
  return state;
}

export function registerBlock(block) {
  const state = window.__RV_DEBUG__;
  if (!state) return;
  const entry = getBlock(state, block.id, block.name);
  entry.endpoint = block.endpoint || entry.endpoint;
  if (block.title) entry.title = block.title;
  scheduleRender(state);
}

export function setDebugContext({ blockId, blockName, endpoint }) {
  const state = window.__RV_DEBUG__;
  if (!state || !state.enabled) return;
  state.currentBlock = { id: blockId, name: blockName, endpoint };
  const block = getBlock(state, blockId, blockName);
  block.endpoint = endpoint || block.endpoint;
  block.lastRun = { startTime: nowIso(), endTime: null, durationMs: null };
  recordEvent(state, { ts: nowIso(), type: "block_start", blockId });
  scheduleRender(state);
}

export function clearDebugContext() {
  const state = window.__RV_DEBUG__;
  if (!state || !state.enabled) return;
  state.currentBlock = null;
}

export function recordBlockEnd({ blockId, blockName, ok, error }) {
  const state = window.__RV_DEBUG__;
  if (!state || !state.enabled) return;
  const block = getBlock(state, blockId, blockName);
  if (block.lastRun) {
    block.lastRun.endTime = nowIso();
    block.lastRun.durationMs = Math.round(
      (new Date(block.lastRun.endTime).getTime() - new Date(block.lastRun.startTime).getTime())
    );
  }
  if (ok === true) {
    block.status = "OK";
  } else if (ok === false || error) {
    block.status = "FAIL";
  }
  if (error) {
    recordEvent(state, {
      ts: nowIso(),
      type: "block_error",
      blockId,
      message: error?.message || String(error || "Unknown error")
    });
  }
  scheduleRender(state);
}
