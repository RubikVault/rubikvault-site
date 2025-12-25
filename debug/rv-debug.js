const MAX_DEBUG_LINES = 300;

export function createTraceId() {
  return Math.random().toString(36).slice(2, 10);
}

function formatTime(ts = Date.now()) {
  return new Date(ts).toLocaleTimeString();
}

function safeStringify(value) {
  if (value === undefined) return "";
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value);
  } catch (error) {
    return "[unserializable]";
  }
}

function ensureShell(rootEl) {
  let shell = rootEl.querySelector("[data-rv-shell]");
  if (shell) return shell;

  shell = document.createElement("div");
  shell.setAttribute("data-rv-shell", "true");
  shell.innerHTML = `
    <div class="rv-block-meta">
      <div class="rv-block-title">
        <span class="rv-block-id" data-rv-feature-id></span>
        <span class="rv-block-name" data-rv-block-name></span>
      </div>
      <div class="rv-block-status" data-rv-status>PARTIAL</div>
    </div>
    <div class="rv-block-submeta">
      <span data-rv-updated>Updated: --</span>
      <span data-rv-source>Source: --</span>
      <span data-rv-trace>Trace: --</span>
      <span data-rv-cache>Cache: --</span>
      <span data-rv-upstream>Upstream: --</span>
      <span data-rv-config>Config: --</span>
    </div>
    <div class="rv-block-actions">
      <button class="rv-block-debug-toggle" type="button" data-rv-debug-toggle>Show debug</button>
    </div>
    <div class="rv-block-debug is-collapsed" data-rv-debug>
      <div class="rv-block-debug-header">
        <strong>Debug</strong>
        <div class="rv-block-debug-actions">
          <button type="button" data-rv-debug-clear>Clear</button>
          <button type="button" data-rv-debug-copy>Copy</button>
          <button type="button" data-rv-debug-toggle>Hide</button>
        </div>
      </div>
      <pre class="rv-block-debug-body" data-rv-debug-body></pre>
    </div>
    <div class="rv-block-content" data-rv-content></div>
  `;

  rootEl.appendChild(shell);
  return shell;
}

export function createLogger({ featureId, blockName, rootEl, panicMode = false } = {}) {
  const state = {
    featureId,
    blockName,
    traceId: null,
    status: "PARTIAL",
    headline: "Loading",
    updatedAt: null,
    source: null,
    isStale: false,
    staleAgeMs: null,
    cacheLayer: null,
    cacheTtl: null,
    upstreamStatus: null,
    configLoaded: null,
    apiBase: null,
    apiPrefix: null,
    configErrors: [],
    lines: []
  };

  const shell = ensureShell(rootEl);
  const statusEl = shell.querySelector("[data-rv-status]");
  const updatedEl = shell.querySelector("[data-rv-updated]");
  const sourceEl = shell.querySelector("[data-rv-source]");
  const traceEl = shell.querySelector("[data-rv-trace]");
  const cacheEl = shell.querySelector("[data-rv-cache]");
  const upstreamEl = shell.querySelector("[data-rv-upstream]");
  const configEl = shell.querySelector("[data-rv-config]");
  const featureEl = shell.querySelector("[data-rv-feature-id]");
  const blockEl = shell.querySelector("[data-rv-block-name]");
  const debugEl = shell.querySelector("[data-rv-debug]");
  const debugBodyEl = shell.querySelector("[data-rv-debug-body]");
  const toggleButtons = Array.from(shell.querySelectorAll("[data-rv-debug-toggle]"));
  const copyButton = shell.querySelector("[data-rv-debug-copy]");
  const clearButton = shell.querySelector("[data-rv-debug-clear]");

  if (featureEl) featureEl.textContent = `Feature: ${featureId || "unknown"}`;
  if (blockEl) blockEl.textContent = `Block: ${blockName || "unknown"}`;

  const renderStatus = () => {
    if (!statusEl) return;
    statusEl.textContent = `${state.status} · ${state.headline || ""}`.trim();
    statusEl.dataset.rvStatus = state.status.toLowerCase();
  };

  const renderMeta = () => {
    if (updatedEl) {
      updatedEl.textContent = `Updated: ${
        state.updatedAt ? new Date(state.updatedAt).toLocaleTimeString() : "--"
      }`;
    }
    if (sourceEl) {
      const sourceLabel = state.source || "--";
      const staleNote =
        state.isStale && typeof state.staleAgeMs === "number"
          ? ` (stale ${Math.max(1, Math.round(state.staleAgeMs / 60000))}m)`
          : state.isStale
            ? " (stale)"
            : "";
      sourceEl.textContent = `Source: ${sourceLabel}${staleNote}`;
    }
    if (traceEl) traceEl.textContent = `Trace: ${state.traceId || "--"}`;
    if (cacheEl) {
      const layer = state.cacheLayer || "--";
      const ttl =
        state.cacheTtl === null || state.cacheTtl === undefined ? "--" : `${state.cacheTtl}s`;
      cacheEl.textContent = `Cache: ${layer} (ttl ${ttl})`;
    }
    if (upstreamEl) {
      const status =
        state.upstreamStatus === null || state.upstreamStatus === undefined
          ? "--"
          : state.upstreamStatus;
      upstreamEl.textContent = `Upstream: ${status}`;
    }
    if (configEl) {
      const baseLabel = state.apiPrefix || state.apiBase || "--";
      const errorSuffix =
        state.configErrors && state.configErrors.length
          ? ` (${state.configErrors.join(", ")})`
          : "";
      if (state.configLoaded === false) {
        configEl.textContent = `Config: missing${errorSuffix}`;
      } else {
        configEl.textContent = `Config: loaded ${baseLabel}${errorSuffix}`;
      }
    }
  };

  const renderDebug = () => {
    if (!debugBodyEl) return;
    debugBodyEl.textContent = state.lines.join("\n");
  };

  const appendLine = (level, message, payload) => {
    const time = formatTime();
    const line = `[${time}] ${level.toUpperCase()} ${message}${
      payload ? ` ${safeStringify(payload)}` : ""
    }`;
    state.lines.push(line);
    if (state.lines.length > MAX_DEBUG_LINES) {
      state.lines.splice(0, state.lines.length - MAX_DEBUG_LINES);
    }
    renderDebug();
  };

  const toggleDebug = () => {
    if (!debugEl) return;
    debugEl.classList.toggle("is-collapsed");
    const isCollapsed = debugEl.classList.contains("is-collapsed");
    toggleButtons.forEach((button) => {
      button.textContent = isCollapsed ? "Show debug" : "Hide";
    });
  };

  toggleButtons.forEach((button) => {
    button.addEventListener("click", toggleDebug);
  });

  if (copyButton) {
    copyButton.addEventListener("click", () => {
      const text = state.lines.join("\n");
      navigator.clipboard?.writeText(text);
    });
  }

  if (clearButton) {
    clearButton.addEventListener("click", () => {
      state.lines = [];
      renderDebug();
    });
  }

  if (panicMode && debugEl) {
    debugEl.classList.remove("is-collapsed");
    toggleButtons.forEach((button) => {
      button.textContent = "Hide";
    });
  }

  const logger = {
    info(message, payload) {
      console.info(`[RV:${featureId}] ${message}`, payload || "");
      appendLine("info", message, payload);
    },
    warn(message, payload) {
      console.warn(`[RV:${featureId}] ${message}`, payload || "");
      appendLine("warn", message, payload);
    },
    error(message, payload) {
      console.error(`[RV:${featureId}] ${message}`, payload || "");
      appendLine("error", message, payload);
    },
    setStatus(status, headline = "") {
      state.status = status || "PARTIAL";
      state.headline = headline || "";
      renderStatus();
    },
    setMeta({
      updatedAt,
      source,
      isStale,
      staleAgeMs,
      cacheLayer,
      cacheTtl,
      upstreamStatus,
      configLoaded,
      apiBase,
      apiPrefix,
      configErrors
    } = {}) {
      if (updatedAt) state.updatedAt = updatedAt;
      if (source !== undefined) state.source = source;
      if (typeof isStale === "boolean") state.isStale = isStale;
      if (typeof staleAgeMs === "number") state.staleAgeMs = staleAgeMs;
      if (cacheLayer !== undefined) state.cacheLayer = cacheLayer;
      if (cacheTtl !== undefined) state.cacheTtl = cacheTtl;
      if (upstreamStatus !== undefined) state.upstreamStatus = upstreamStatus;
      if (typeof configLoaded === "boolean") state.configLoaded = configLoaded;
      if (apiBase !== undefined) state.apiBase = apiBase;
      if (apiPrefix !== undefined) state.apiPrefix = apiPrefix;
      if (configErrors !== undefined) state.configErrors = configErrors;
      renderMeta();
    },
    setTraceId(traceId) {
      state.traceId = traceId;
      renderMeta();
    },
    getContentEl() {
      return shell.querySelector("[data-rv-content]");
    },
    getDebugLines() {
      return state.lines.slice();
    }
  };

  renderStatus();
  renderMeta();
  renderDebug();

  return logger;
}
