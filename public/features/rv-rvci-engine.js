import { fetchJSON, getBindingHint } from "./utils/api.js";
import { getOrFetch } from "./utils/store.js";

const rvciSortState = new Map();

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function setRvciHeader(root, meta) {
  const block = root?.closest?.('[data-rv-feature="rv-rvci-engine"]');
  const title = block?.querySelector?.(".rv-native-header h2");
  if (!title) return;
  const textNode = Array.from(title.childNodes || []).find((node) => node.nodeType === Node.TEXT_NODE);
  const status = meta.status || "OK";
  const regime = meta.regime || "—";
  const coverage =
    typeof meta.coveragePct === "number"
      ? `${meta.coveragePct.toFixed(1)}%`
      : meta.coveragePct
        ? `${meta.coveragePct}%`
        : "—";
  const headerText = `RVCI Engine | Status: ${status} | Composite: Daily | Regime: ${regime} | Coverage: ${coverage} `;
  if (textNode) {
    textNode.textContent = headerText;
  } else {
    title.prepend(document.createTextNode(headerText));
  }
}

function toSortable(value) {
  const raw = String(value ?? "").trim();
  const cleaned = raw.replace(/[%,$]/g, "");
  const numeric = Number(cleaned);
  if (!Number.isNaN(numeric) && cleaned !== "") return { type: "number", value: numeric };
  return { type: "string", value: raw.toLowerCase() };
}

function bindSortableTable(table) {
  const tbody = table.querySelector("tbody");
  if (!tbody) return;
  const headers = table.querySelectorAll("th");
  if (!headers.length) return;
  table.addEventListener("click", (event) => {
    const th = event.target.closest("th");
    if (!th || !table.contains(th)) return;
    const index = Array.from(th.parentNode.children).indexOf(th);
    if (index < 0) return;
    const key = table.getAttribute("data-rv-sortable") || "default";
    const current = rvciSortState.get(key) || { index: -1, dir: "asc" };
    const dir = current.index === index && current.dir === "asc" ? "desc" : "asc";
    rvciSortState.set(key, { index, dir });
    const rows = Array.from(tbody.querySelectorAll("tr"));
    rows.sort((a, b) => {
      const av = toSortable(a.children[index]?.textContent || "");
      const bv = toSortable(b.children[index]?.textContent || "");
      if (av.type === "number" && bv.type === "number") {
        return dir === "asc" ? av.value - bv.value : bv.value - av.value;
      }
      if (av.value === bv.value) return 0;
      return dir === "asc" ? av.value.localeCompare(bv.value) : bv.value.localeCompare(av.value);
    });
    rows.forEach((row) => tbody.appendChild(row));
  });
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
      <table class="rv-native-table" data-rv-sortable="rvci-meta">
        <thead>
          <tr><th>Field</th><th>Value</th></tr>
        </thead>
        <tbody>
          <tr><th>Data As Of</th><td>${escapeHtml(meta.dataAsOf || "—")}</td></tr>
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
          <table class="rv-native-table" data-rv-sortable="rvci-paths">
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
  setRvciHeader(root, meta);
  root.querySelectorAll("table[data-rv-sortable]").forEach((table) => bindSortableTable(table));

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
