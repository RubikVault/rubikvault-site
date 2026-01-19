const LAYOUTS = ["A", "B", "C", "D", "E", "F", "G", "H"];
const DEFAULT_SYMBOL = "AAPL";
const DISCLAIMER_TEXT =
  "This visualization provides historical Elliott Wave structure analysis for research and education only.\n" +
  "It does not predict or recommend future trading actions.";
const LEGAL_FALLBACK =
  "MarketPhase AI — Scientific Elliott Research (v8.0)\n" +
  "provides deterministic, rule-based historical analysis only.\n" +
  "It does not forecast future prices or offer financial advice.\n" +
  "Use solely for educational and research purposes.\n" +
  "ISO 8000 / IEEE 7000 Compliant - Bit-exact reproducibility guaranteed.";

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function formatDate(value) {
  if (!value) return "N/A";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "N/A";
  return date.toISOString().slice(0, 10);
}

function formatNumber(value, options = {}) {
  if (typeof value !== "number" || Number.isNaN(value)) return "N/A";
  return new Intl.NumberFormat("en-US", options).format(value);
}

function formatPercent(value, digits = 1) {
  if (typeof value !== "number" || Number.isNaN(value)) return "N/A";
  return `${value.toFixed(digits)}%`;
}

function formatMaybe(value, options = {}) {
  if (typeof value === "number") return formatNumber(value, options);
  if (typeof value === "string") return value;
  return "N/A";
}

function normalizeLayout(value) {
  const candidate = String(value || "").toUpperCase();
  return LAYOUTS.includes(candidate) ? candidate : "A";
}

function resolveSymbol() {
  if (typeof window === "undefined") return DEFAULT_SYMBOL;
  const params = new URLSearchParams(window.location.search);
  const raw = String(params.get("symbol") || DEFAULT_SYMBOL).trim().toUpperCase();
  const cleaned = raw.replace(/[^A-Z0-9.-]/g, "");
  return cleaned || DEFAULT_SYMBOL;
}

function resolveLayout() {
  if (typeof window === "undefined") return "A";
  const params = new URLSearchParams(window.location.search);
  const paramLayout = params.get("ui");
  if (paramLayout) return normalizeLayout(paramLayout);
  return normalizeLayout(window.__RV_MP_LAYOUT || "A");
}

function isDebugEnabled() {
  if (typeof window === "undefined") return false;
  const params = new URLSearchParams(window.location.search);
  return params.get("debug") === "1";
}

function getCache() {
  if (typeof window === "undefined") return new Map();
  if (!window.__RV_MP_CACHE) {
    window.__RV_MP_CACHE = new Map();
  }
  return window.__RV_MP_CACHE;
}

async function fetchMarketPhase(symbol) {
  // Use absolute root path to avoid 404 on subroutes (SSOT rule)
  const response = await fetch(`/data/marketphase/${symbol}.json`, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`MarketPhase fetch failed (${response.status})`);
  }
  return response.json();
}

function loadMarketPhase(symbol) {
  const cache = getCache();
  if (cache.has(symbol)) return cache.get(symbol);
  const promise = fetchMarketPhase(symbol);
  cache.set(symbol, promise);
  return promise;
}

function getState(root) {
  if (!root.__rvMarketphaseState) {
    root.__rvMarketphaseState = {
      symbol: resolveSymbol(),
      layout: resolveLayout(),
      data: null,
      error: null
    };
  }
  return root.__rvMarketphaseState;
}

function pickRegime(completed, features) {
  if (completed?.valid && completed.direction) return completed.direction;
  if (features?.SMATrend) return features.SMATrend;
  return "neutral";
}

function formatRegimeLabel(regime) {
  const normalized = String(regime || "").toLowerCase();
  if (normalized === "bullish") return { label: "Bullish", className: "bullish" };
  if (normalized === "bearish") return { label: "Bearish", className: "bearish" };
  if (normalized === "neutral") return { label: "Neutral", className: "neutral" };
  return { label: "Unknown", className: "neutral" };
}

function renderLayoutButtons(layout) {
  return LAYOUTS.map((letter) => {
    const active = letter === layout ? "is-active" : "";
    return `<button class="rv-mp-layout-btn ${active}" type="button" data-mp-layout="${letter}" aria-pressed="${letter === layout}">${letter}</button>`;
  }).join("");
}

function renderKeyValueRows(rows) {
  return rows
    .map(([label, value]) => {
      return `<div class="rv-mp-kv-row"><span>${escapeHtml(label)}</span><span>${escapeHtml(value)}</span></div>`;
    })
    .join("");
}

function renderSwingPoints(swings) {
  if (!swings.length) {
    return `<div class="rv-mp-swing-empty">No confirmed swing points yet.</div>`;
  }
  return swings
    .map((swing) => {
      const date = formatDate(swing.date);
      const price = formatMaybe(swing.price, { maximumFractionDigits: 2 });
      const type = swing.type === "high" ? "High" : "Low";
      return `<div class="rv-mp-swing"><span>${escapeHtml(date)}</span><span>${type}</span><span>${escapeHtml(price)}</span></div>`;
    })
    .join("");
}

function render(root, state) {
  if (!state.data || typeof state.data !== "object") {
    const error = state.error ? escapeHtml(state.error.message || state.error) : "No data.";
    root.innerHTML = `<div class="rv-native-error">MarketPhase data unavailable.<br /><span>${error}</span></div>`;
    return;
  }

  const payload = state.data;
  const meta = payload.meta || {};
  const auditTrail = meta.auditTrail || {};
  const data = payload.data || {};
  const features = data.features || {};
  const elliott = data.elliott || {};
  const completed = elliott.completedPattern || {};
  const developing = elliott.developingPattern || {};
  const uncertainty = elliott.uncertainty || {};
  const fib = data.fib || elliott.fib || {};
  const ratios = fib.ratios || {};
  const swings = data.swings || {};
  const swingPoints = Array.isArray(swings.confirmed) && swings.confirmed.length
    ? swings.confirmed
    : Array.isArray(swings.raw)
      ? swings.raw
      : [];
  const recentSwings = swingPoints.slice(-6);
  const regimeInfo = formatRegimeLabel(pickRegime(completed, features));
  const agreement = data.multiTimeframeAgreement;
  const agreementLabel =
    agreement === true ? "Agreement" : agreement === false ? "Disagree" : "N/A";
  const legalText = meta.legal || data.disclaimer || LEGAL_FALLBACK;
  
  // v8.0 Scientific Audit Panel data
  const methodologyVersion = meta.methodologyVersion || meta.version || "8.0";
  const commitHash = auditTrail.commitHash ? auditTrail.commitHash.substring(0, 7) : "unknown";
  const precision = meta.precision || "IEEE754-Double-Round6";

  const indicators = [
    { label: "RSI", value: formatMaybe(features.RSI, { maximumFractionDigits: 2 }) },
    { label: "MACD Hist", value: formatMaybe(features.MACDHist, { maximumFractionDigits: 3 }) },
    { label: "ATR%", value: formatPercent(features["ATR%"], 2) },
    { label: "SMA Trend", value: formatMaybe(features.SMATrend) }
  ];

  const completedRows = [
    ["Valid", completed.valid ? "Yes" : "No"],
    ["Direction", completed.direction ? completed.direction : "N/A"],
    ["Ended", formatDate(completed.endedAt)],
    ["Confidence", typeof completed.confidence0_100 === "number" ? `${completed.confidence0_100}` : "N/A"],
    [
      "Rules",
      completed.rules
        ? `R1 ${completed.rules.r1 ? "OK" : "X"} / R2 ${completed.rules.r2 ? "OK" : "X"} / R3 ${completed.rules.r3 ? "OK" : "X"}`
        : "N/A"
    ]
  ];

  const developingRows = [
    ["Possible Wave", developing.possibleWave || "N/A"],
    ["Confidence", typeof developing.confidence === "number" ? `${developing.confidence}` : "N/A"],
    [
      "Support",
      Array.isArray(developing.fibLevels?.support)
        ? developing.fibLevels.support.map((val) => formatMaybe(val, { maximumFractionDigits: 2 })).join(", ")
        : "N/A"
    ],
    [
      "Resistance",
      Array.isArray(developing.fibLevels?.resistance)
        ? developing.fibLevels.resistance.map((val) => formatMaybe(val, { maximumFractionDigits: 2 })).join(", ")
        : "N/A"
    ]
  ];

  const fibRows = [
    ["Wave 2", formatMaybe(ratios.wave2, { maximumFractionDigits: 2 })],
    ["Wave 3", formatMaybe(ratios.wave3, { maximumFractionDigits: 2 })],
    ["Wave 4", formatMaybe(ratios.wave4, { maximumFractionDigits: 2 })],
    ["Wave 5", formatMaybe(ratios.wave5, { maximumFractionDigits: 2 })],
    ["Conformance", formatMaybe(fib.conformanceScore, { maximumFractionDigits: 1 })]
  ];

  const uncertaintyRows = [
    ["Last Swing Confirmed", uncertainty.lastSwingConfirmed === false ? "No" : "Yes"],
    ["Alternative Counts", formatMaybe(uncertainty.alternativeCounts, { maximumFractionDigits: 0 })],
    [
      "Confidence Decay",
      uncertainty.confidenceDecay
        ? `${formatMaybe(uncertainty.confidenceDecay.base, { maximumFractionDigits: 0 })} -> ${formatMaybe(
            uncertainty.confidenceDecay.adjusted,
            { maximumFractionDigits: 0 }
          )}`
        : "N/A"
    ]
  ];

  root.innerHTML = `
    <div class="rv-marketphase" data-layout="${state.layout}">
      <div class="rv-mp-top">
        <div class="rv-mp-meta-line">
          <span class="rv-mp-regime rv-mp-regime-${regimeInfo.className}">Regime: ${escapeHtml(
            regimeInfo.label
          )}</span>
          <span>Symbol: ${escapeHtml(meta.symbol || state.symbol)}</span>
          <span>Generated: ${escapeHtml(formatDate(meta.generatedAt))}</span>
          <span>Multi-timeframe: ${escapeHtml(agreementLabel)}</span>
        </div>
        <div class="rv-mp-scientific-audit">
          <div class="rv-mp-audit-item">
            <strong>Method:</strong> v${escapeHtml(methodologyVersion)} (ISO 8000 Compliant)
          </div>
          <div class="rv-mp-audit-item">
            <strong>Precision:</strong> ${escapeHtml(precision)}
          </div>
          <div class="rv-mp-audit-item">
            <strong>Replication Seed:</strong> ${escapeHtml(commitHash)}
          </div>
        </div>
        <div class="rv-mp-layout">
          <span class="rv-mp-layout-label">Layout</span>
          <div class="rv-mp-layout-buttons">
            ${renderLayoutButtons(state.layout)}
          </div>
        </div>
      </div>

      <div class="rv-mp-indicators">
        ${indicators
          .map(
            (item) => `
            <div class="rv-mp-indicator">
              <span>${escapeHtml(item.label)}</span>
              <strong>${escapeHtml(item.value)}</strong>
            </div>
          `
          )
          .join("")}
      </div>

      <div class="rv-mp-grid">
        <div class="rv-mp-card">
          <h3>Completed Pattern</h3>
          <div class="rv-mp-kv">${renderKeyValueRows(completedRows)}</div>
        </div>
        <div class="rv-mp-card">
          <h3>Developing Structure</h3>
          <div class="rv-mp-kv">${renderKeyValueRows(developingRows)}</div>
          <div class="rv-mp-note">${escapeHtml(developing.disclaimer || "Reference levels only - no prediction")}</div>
        </div>
        <div class="rv-mp-card">
          <h3>Fibonacci Reference</h3>
          <div class="rv-mp-kv">${renderKeyValueRows(fibRows)}</div>
          <div class="rv-mp-note">Reference zones only - not targets.</div>
        </div>
        <div class="rv-mp-card">
          <h3>Uncertainty</h3>
          <div class="rv-mp-kv">${renderKeyValueRows(uncertaintyRows)}</div>
        </div>
      </div>

      <div class="rv-mp-swings">
        <div class="rv-mp-swings-header">
          <h3>Recent Swing Points</h3>
          <span>${escapeHtml(formatMaybe(recentSwings.length, { maximumFractionDigits: 0 }))} points</span>
        </div>
        <div class="rv-mp-swings-grid">
          ${renderSwingPoints(recentSwings)}
        </div>
      </div>

      ${
        isDebugEnabled()
          ? `
            <details class="rv-mp-debug" open>
              <summary>Debug details</summary>
              <pre>${escapeHtml(
                JSON.stringify(
                  {
                    debug: data.debug || {},
                    window: data.swings?.window,
                    rawSwingCount: data.swings?.raw?.length || 0,
                    confirmedSwingCount: data.swings?.confirmed?.length || 0
                  },
                  null,
                  2
                )
              )}</pre>
            </details>
          `
          : ""
      }

      <div class="rv-mp-disclaimer">${escapeHtml(DISCLAIMER_TEXT).replace(/\n/g, "<br />")}</div>
      <div class="rv-mp-legal">${escapeHtml(legalText).replace(/\n/g, "<br />")}</div>
    </div>
  `;

  root.querySelectorAll("[data-mp-layout]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const next = normalizeLayout(btn.getAttribute("data-mp-layout"));
      state.layout = next;
      if (typeof window !== "undefined") {
        window.__RV_MP_LAYOUT = next;
      }
      render(root, state);
    });
  });
}

export async function init(root, context = {}) {
  const state = getState(root);
  state.error = null;
  try {
    const data = await loadMarketPhase(state.symbol);
    state.data = data;
    render(root, state);
  } catch (error) {
    state.error = error;
    state.data = null;
    render(root, state);
  }
}

export async function refresh(root, context = {}) {
  const state = getState(root);
  if (state.data) {
    render(root, state);
    return;
  }
  await init(root, context);
}
