import { fetchJSON, getBindingHint } from "./utils/api.js";
import { getOrFetch } from "./utils/store.js";
import { resolveWithShadow } from "./utils/resilience.js";

const SETUP_LABELS = {
  rsiExtreme: "RSI < 35",
  bbExtreme: "BB %B < 0.15",
  nearSma200: "Near SMA200",
  rvolBonus: "RVOL >= 1.5",
  setupGate: "Extreme Gate"
};

const TRIGGER_LABELS = {
  emaReclaim: "EMA21 reclaim",
  higherLow: "Higher low + FT",
  bos: "Break of structure",
  volConfirm: "Volume confirm",
  rsiUpturn: "RSI upturn"
};

const INFO_TEXT = {
  rsiExtreme: "RSI below 35 indicates oversold pressure.",
  bbExtreme: "Price near lower Bollinger band.",
  nearSma200: "Close within 2% of SMA200.",
  rvolBonus: "Relative volume >= 1.5.",
  setupGate: "At least one extreme condition is required.",
  emaReclaim: "Close reclaimed EMA21 after being below.",
  higherLow: "New pivot low above prior pivot with follow-through.",
  bos: "Break above last lower high.",
  volConfirm: "Volume above 1.2x 20D average.",
  rsiUpturn: "RSI rising vs prior day."
};

function formatNumber(value, options = {}) {
  if (value === null || value === undefined || Number.isNaN(value)) return "N/A";
  return new Intl.NumberFormat("en-US", options).format(value);
}

function formatPercent(value) {
  if (value === null || value === undefined || Number.isNaN(value)) return "N/A";
  return `${formatNumber(value, { maximumFractionDigits: 2 })}%`;
}

function badgeClass(label) {
  if (!label) return "";
  const upper = label.toUpperCase();
  if (upper === "BUY" || upper === "TOP PICK") return "rv-alpha-badge--top";
  if (upper === "WATCHLIST") return "rv-alpha-badge--watch";
  if (upper === "DATA_ERROR") return "rv-alpha-badge--data";
  return "rv-alpha-badge--wait";
}

function renderChecklist(items = {}, labels = {}) {
  return Object.keys(labels)
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
}

function renderPickCard(pick = {}) {
  const dataQuality = pick.dataQuality || {};
  const label = pick.label || "IGNORE";
  const displayLabel =
    label === "BUY" && !dataQuality.isPartial ? "TOP PICK" : label;
  const changeValue = typeof pick.changePercent === "number" ? pick.changePercent : null;
  const changeClass =
    changeValue === null ? "" : changeValue >= 0 ? "rv-native-positive" : "rv-native-negative";
  return `
    <div class="rv-alpha-card">
      <div class="rv-alpha-head">
        <div>
          <div class="rv-alpha-symbol">${pick.symbol || "N/A"}</div>
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
        <span class="${changeClass}">${formatPercent(changeValue)}</span>
        <span>Stop $${formatNumber(pick.stop, { maximumFractionDigits: 2 })}</span>
      </div>
      ${dataQuality.isPartial ? `<div class="rv-alpha-warn">PARTIAL DATA</div>` : ""}
      ${
        pick.earningsRisk
          ? `<div class="rv-alpha-warn">Earnings in ${pick.earningsDays ?? "?"} days</div>`
          : ""
      }
      ${
        Array.isArray(pick.reasons) && pick.reasons.length
          ? `<div class="rv-alpha-reasons">${pick.reasons.join(" · ")}</div>`
          : ""
      }
    </div>
  `;
}

function renderSection(title, picks = []) {
  return `
    <div class="rv-alpha-section">
      <h4>${title}</h4>
      <div class="rv-alpha-grid">
        ${picks.map((pick) => renderPickCard(pick)).join("")}
      </div>
    </div>
  `;
}

function render(root, payload, logger, featureId) {
  const resolved = resolveWithShadow(featureId, payload, {
    logger,
    isMissing: (value) => !value?.ok || !value?.data?.picks,
    reason: "STALE_FALLBACK"
  });
  const data = resolved?.data || {};
  const picks = data.picks || {};
  const shortterm = Array.isArray(picks.shortterm) ? picks.shortterm : [];
  const longterm = Array.isArray(picks.longterm) ? picks.longterm : [];
  const top = Array.isArray(picks.top) ? picks.top : [];
  // #region agent log
  const topScores = top.slice(0, 3).map(p => ({symbol:p.symbol,setupScore:p.setupScore,triggerScore:p.triggerScore,totalScore:p.totalScore}));
  const uniqueScores = new Set(top.map(p => `${p.setupScore}-${p.triggerScore}-${p.totalScore}`));
  const isDummyData = uniqueScores.size === 1 && top.length > 1;
  fetch('http://127.0.0.1:7242/ingest/7b213daf-87b9-4130-9bc8-db3131856ffb',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'rv-alpha-radar.js:139',message:'alpha radar picks check',data:{topCount:top.length,shorttermCount:shortterm.length,longtermCount:longterm.length,topScores,uniqueScoresCount:uniqueScores.size,isDummyData},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'C'})}).catch(()=>{});
  // #endregion
  const partialNote =
    resolved?.ok && (resolved?.isStale || data.partial || resolved?.error?.code)
      ? "Partial data — some symbols unavailable."
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
        Alpha Radar konnte nicht geladen werden.<br />
        <span>${errorMessage}</span>
        ${detailLine ? `<div class="rv-native-note">${detailLine}</div>` : ""}
        ${fixHint ? `<div class="rv-native-note">${fixHint}</div>` : ""}
        ${upstreamSnippet ? `<pre class="rv-native-stack">${upstreamSnippet}</pre>` : ""}
      </div>
    `;
    const statusLevel = errorCode === "RATE_LIMITED" ? "PARTIAL" : "FAIL";
    const statusHeadline = errorCode || "API error";
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

  if (!shortterm.length && !longterm.length) {
    root.innerHTML = `
      <div class="rv-native-empty">Keine Alpha Radar Picks verfügbar. Bitte später erneut versuchen.</div>
    `;
    logger?.setStatus("PARTIAL", "No data");
    logger?.setMeta({
      updatedAt: data.updatedAt || resolved?.ts,
      source: data.source || "stooq",
      isStale: resolved?.isStale,
      staleAgeMs: resolved?.staleAgeMs
    });
    return;
  }

  root.innerHTML = `
    ${partialNote ? `<div class="rv-native-note">${partialNote}</div>` : ""}
    <div class="rv-alpha-top">
      <strong>Top Picks</strong>
      <div class="rv-alpha-chips">
        ${top
          .map((pick) => {
            const dq = pick.dataQuality || {};
            const label = pick.label || "IGNORE";
            const displayLabel = label === "BUY" && !dq.isPartial ? "TOP PICK" : label;
            return `<span class="rv-alpha-chip ${badgeClass(displayLabel)}">${pick.symbol}</span>`;
          })
          .join("")}
      </div>
    </div>
    ${renderSection("Shortterm & Swing", shortterm)}
    ${renderSection("Longterm", longterm)}
    <div class="rv-native-note">Method: ${data.method || "Alpha Radar v1"}</div>
    <div class="rv-native-note">Updated: ${new Date(data.updatedAt || resolved.ts).toLocaleTimeString()}</div>
  `;

  const hasWarning = resolved?.error?.code || data.partial;
  const headline = resolved?.isStale ? "Stale data" : hasWarning ? "Partial data" : "Live";
  logger?.setStatus(resolved?.isStale || hasWarning ? "PARTIAL" : "OK", headline);
  logger?.setMeta({
    updatedAt: data.updatedAt || resolved.ts,
    source: data.source || "stooq",
    isStale: resolved?.isStale,
    staleAgeMs: resolved?.staleAgeMs
  });
  logger?.info("response_meta", {
    cache: resolved?.cache || {},
    upstreamStatus: resolved?.upstream?.status ?? null
  });
}

async function loadData({ featureId, traceId, logger }) {
  return fetchJSON("/alpha-radar", { feature: featureId, traceId, logger });
}

export async function init(root, context = {}) {
  const { featureId = "rv-alpha-radar", traceId, logger } = context;
  const data = await getOrFetch(
    "rv-alpha-radar",
    () => loadData({ featureId, traceId, logger }),
    { ttlMs: 6 * 60 * 60 * 1000, featureId, logger }
  );
  render(root, data, logger, featureId);
}

export async function refresh(root, context = {}) {
  const { featureId = "rv-alpha-radar", traceId, logger } = context;
  const data = await loadData({ featureId, traceId, logger });
  render(root, data, logger, featureId);
}
