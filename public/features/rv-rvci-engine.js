import { fetchJSON, getBindingHint } from "./utils/api.js";
import { getOrFetch } from "./utils/store.js";

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function render(root, payload, logger, featureId) {
  if (!payload?.ok) {
    const errorMessage = payload?.error?.message || "API error";
    const errorCode = payload?.error?.code || "";
    const upstreamStatus = payload?.upstream?.status ?? null;
    const cacheLayer = payload?.cache?.layer || "none";
    const fixHint = errorCode === "BINDING_MISSING" ? getBindingHint(payload) : "";
    root.innerHTML = `
      <div class="rv-native-error">
        RVCI Engine konnte nicht geladen werden.<br />
        <span>${escapeHtml(errorMessage)}</span>
        <div class="rv-native-note">${escapeHtml(errorCode || "ERROR")} · Cache ${escapeHtml(cacheLayer)}${upstreamStatus ? ` · Upstream ${upstreamStatus}` : ""}</div>
        ${fixHint ? `<div class="rv-native-note">${escapeHtml(fixHint)}</div>` : ""}
      </div>
    `;
    logger?.setStatus("FAIL", errorCode || "API error");
    logger?.setMeta({ updatedAt: payload?.ts || null });
    return;
  }

  const meta = payload.meta || {};
  const counts = payload.data?.counts || {};
  const paths = payload.data?.paths || {};
  const updatedAt = meta.generatedAt || meta.dataAsOf || payload.ts || null;

  const pathRows = Object.entries(paths)
    .map(([key, path]) => {
      if (!path) return "";
      return `
        <tr>
          <td>${escapeHtml(key)}</td>
          <td><a href="/${escapeHtml(path)}" target="_blank" rel="noopener noreferrer">${escapeHtml(path)}</a></td>
        </tr>
      `;
    })
    .join("");

  root.innerHTML = `
    <div class="rv-native-table-wrap">
      <table class="rv-native-table">
        <tbody>
          <tr><th>Status</th><td>${escapeHtml(meta.status || "OK")}</td></tr>
          <tr><th>Regime</th><td>${escapeHtml(meta.regime || "—")}</td></tr>
          <tr><th>Coverage</th><td>${meta.coveragePct ?? "—"}%</td></tr>
          <tr><th>Data As Of</th><td>${escapeHtml(meta.dataAsOf || "—")}</td></tr>
          <tr><th>Generated</th><td>${escapeHtml(meta.generatedAt || "—")}</td></tr>
          <tr><th>Counts (short/mid/long/trigger)</th><td>${escapeHtml(
            `${counts.short ?? "—"} / ${counts.mid ?? "—"} / ${counts.long ?? "—"} / ${counts.triggers ?? "—"}`
          )}</td></tr>
        </tbody>
      </table>
    </div>
    ${
      pathRows
        ? `
        <div class="rv-native-table-wrap">
          <h4>Data paths</h4>
          <table class="rv-native-table">
            <thead>
              <tr><th>Key</th><th>Path</th></tr>
            </thead>
            <tbody>${pathRows}</tbody>
          </table>
        </div>
      `
        : ""
    }
  `;

  logger?.setStatus(meta.status === "DEGRADED_COVERAGE" ? "PARTIAL" : "OK", meta.status || "OK");
  logger?.setMeta({
    updatedAt,
    source: "rvci",
    dataQuality: meta.status ? { status: meta.status } : null
  });
}

async function loadData({ featureId, traceId, logger }) {
  return fetchJSON("/rvci-engine", { feature: featureId, traceId, logger });
}

export async function init(root, context = {}) {
  const { featureId = "rv-rvci-engine", traceId, logger } = context;
  const data = await getOrFetch(
    "rv-rvci-engine",
    () => loadData({ featureId, traceId, logger }),
    { ttlMs: 6 * 60 * 60 * 1000, featureId, logger }
  );
  render(root, data, logger, featureId);
}

export async function refresh(root, context = {}) {
  const { featureId = "rv-rvci-engine", traceId, logger } = context;
  const data = await loadData({ featureId, traceId, logger });
  render(root, data, logger, featureId);
}
