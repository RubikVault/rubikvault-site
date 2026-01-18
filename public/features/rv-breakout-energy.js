import { fetchJSON, getBindingHint } from "./utils/api.js";
import { getOrFetch } from "./utils/store.js";
import { resolveWithShadow } from "./utils/resilience.js";
import {
  normalizeResponse,
  unwrapFeatureData,
  formatMetaLines
} from "./utils/feature-contract.js";

const STATE_LABELS = {
  IGNORE: "Ignore",
  SETUP: "Setup",
  TRIGGER: "Trigger",
  CONFIRMED: "Confirmed",
  COOLDOWN: "Cooldown"
};

function formatNumber(value, options = {}) {
  if (value === null || value === undefined || Number.isNaN(value)) return "N/A";
  return new Intl.NumberFormat("en-US", options).format(value);
}

function scoreBar(score) {
  const safeScore = Number.isFinite(score) ? Math.max(0, Math.min(100, score)) : 0;
  return `
    <div class="rv-health-gauge-bar">
      <div class="rv-health-gauge-fill" style="width:${safeScore}%"></div>
    </div>
    <div class="rv-native-note">Score: ${formatNumber(safeScore, { maximumFractionDigits: 0 })}</div>
  `;
}

function isPlaceholderItem(item) {
  const barsUsed = Number(item?.debug?.barsUsed || 0);
  const missing = Array.isArray(item?.debug?.missingFields) ? item.debug.missingFields : [];
  const hasMirrorMissing = missing.some((value) => String(value).toUpperCase().startsWith("MIRROR"));
  return barsUsed === 0 || hasMirrorMissing;
}

function renderDefinitions(definitions) {
  const machine = definitions?.stateMachine;
  if (!machine) return "";
  const states = Array.isArray(machine.states) ? machine.states.join(" → ") : "";
  const transitions = machine.transitions || {};
  const transitionsList = Object.entries(transitions)
    .map(([state, targets]) => `${state}: ${(targets || []).join(", ")}`)
    .join("<br />");
  return `
    <div class="rv-native-note"><strong>State Machine</strong></div>
    ${states ? `<div class="rv-native-note">${states}</div>` : ""}
    ${transitionsList ? `<div class="rv-native-note">${transitionsList}</div>` : ""}
  `;
}

function render(root, payload, logger, featureId) {
  const resolved = resolveWithShadow(featureId, payload, {
    logger,
    isMissing: (value) => !value?.ok || !(value?.data?.data?.items || []).length,
    reason: "STALE_FALLBACK"
  });
  const envelope = normalizeResponse(resolved, { feature: featureId });
  const { meta, data } = unwrapFeatureData(envelope);
  const items = data.items || data.symbols || [];
  const quality = envelope.dataQuality || { status: "PARTIAL", reason: "NO_DATA" };
  const placeholder = items.length
    ? items.every((item) => isPlaceholderItem(item))
    : true;
  const definitions = meta.definitions || {};

  if (!envelope?.ok) {
    const errorMessage = envelope?.error?.message || "API error";
    const errorCode = envelope?.error?.code || "";
    const fixHint = errorCode === "BINDING_MISSING" ? getBindingHint(envelope) : "";
    root.innerHTML = `
      <div class="rv-native-error">
        Breakout Energy Radar konnte nicht geladen werden.<br />
        <span>${errorMessage}</span>
        ${fixHint ? `<div class="rv-native-note">${fixHint}</div>` : ""}
      </div>
      ${formatMetaLines({ meta, envelope })}
    `;
    logger?.setStatus("FAIL", errorCode || "API error");
    return;
  }

  if (!items.length || placeholder) {
    root.innerHTML = `
      <div class="rv-native-empty">Mirror placeholder / no live items yet.</div>
      <div class="rv-native-note">Data Quality: ${quality.status} · ${quality.reason}</div>
      ${renderDefinitions(definitions)}
      ${formatMetaLines({ meta, envelope })}
    `;
    logger?.setStatus("PARTIAL", quality.reason || "NO_DATA");
    return;
  }

  const sorted = items
    .slice()
    .sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
    .slice(0, 12);

  root.innerHTML = `
    <div class="rv-native-note">Data Quality: ${quality.status} · ${quality.reason}</div>
    <div class="rv-native-note">Items: ${sorted.length} / ${items.length}</div>
    <table class="rv-native-table rv-table--compact">
      <thead>
        <tr>
          <th>Symbol</th>
          <th>Status</th>
          <th>Score</th>
          <th>Stages</th>
          <th>Signals</th>
        </tr>
      </thead>
      <tbody>
        ${sorted
          .map((item) => {
            const state = item.state || "IGNORE";
            const stateLabel = STATE_LABELS[state] || state;
            const signals = Array.isArray(item.signals) && item.signals.length
              ? item.signals.slice(0, 4).join(", ")
              : "N/A";
            const stages = item.stageScores || {};
            return `
              <tr>
                <td>${item.symbol || "N/A"}</td>
                <td><span class="rv-native-pill">${stateLabel}</span></td>
                <td>${scoreBar(item.score)}</td>
                <td>${formatNumber(stages.setup)}/${formatNumber(stages.trigger)}/${formatNumber(
                  stages.confirm
                )}</td>
                <td title="${signals}">${signals}</td>
              </tr>
            `;
          })
          .join("")}
      </tbody>
    </table>
    ${renderDefinitions(definitions)}
    ${formatMetaLines({ meta, envelope })}
  `;

  const status = envelope?.isStale || quality.status !== "LIVE" ? "PARTIAL" : "OK";
  logger?.setStatus(status, quality.reason || quality.status);
  logger?.setMeta({
    updatedAt: meta.updatedAt || envelope?.ts,
    source: meta.source || "stooq",
    isStale: envelope?.isStale
  });
}

async function loadData({ featureId, traceId, logger }) {
  return fetchJSON("breakout-energy", { feature: featureId, traceId, logger });
}

export async function init(root, context = {}) {
  const { featureId = "rv-breakout-energy", traceId, logger } = context;
  const data = await getOrFetch(
    "rv-breakout-energy",
    () => loadData({ featureId, traceId, logger }),
    { ttlMs: 60 * 60 * 1000, featureId, logger }
  );
  render(root, data, logger, featureId);
}

export async function refresh(root, context = {}) {
  const { featureId = "rv-breakout-energy", traceId, logger } = context;
  const data = await loadData({ featureId, traceId, logger });
  render(root, data, logger, featureId);
}
