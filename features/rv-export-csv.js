import { getMemorySnapshot, getShadowSnapshot } from "./utils/store.js";

function csvEscape(value) {
  if (value === null || value === undefined) return "";
  const text = String(value);
  if (text.includes(",") || text.includes("\"") || text.includes("\n")) {
    return `"${text.replace(/"/g, "\"\"")}"`;
  }
  return text;
}

function buildRows() {
  const rows = [];
  const memory = getMemorySnapshot();
  const shadow = getShadowSnapshot();

  Object.entries(memory).forEach(([key, payload]) => {
    rows.push({
      store: "memory",
      key,
      feature: payload?.feature || key,
      ts: payload?.ts || "",
      ok: payload?.ok ?? "",
      isStale: payload?.isStale ?? "",
      source: payload?.data?.source || "",
      data: JSON.stringify(payload?.data || {})
    });
  });

  Object.entries(shadow).forEach(([key, entry]) => {
    const payload = entry?.payload || {};
    rows.push({
      store: "shadow",
      key,
      feature: payload?.feature || key,
      ts: payload?.ts || entry?.savedAt || "",
      ok: payload?.ok ?? "",
      isStale: payload?.isStale ?? "",
      source: payload?.data?.source || "",
      data: JSON.stringify(payload?.data || {})
    });
  });

  return rows;
}

function toCsv(rows) {
  const headers = ["store", "key", "feature", "ts", "ok", "isStale", "source", "data"];
  const lines = [headers.join(",")];
  rows.forEach((row) => {
    const line = headers.map((key) => csvEscape(row[key])).join(",");
    lines.push(line);
  });
  return lines.join("\n");
}

function render(root, logger) {
  const rows = buildRows();
  root.innerHTML = `
    <div class="rv-export">
      <p>Exportiere aggregierte Cache-Daten aus Memory + Shadow.</p>
      <p class="rv-native-note">What is this block for? Downloading debug snapshots for offline review.</p>
      <div class="rv-export-meta">
        <span>Rows: ${rows.length}</span>
      </div>
      <button class="rv-export-button" type="button" data-rv-export-btn>Export CSV</button>
    </div>
  `;

  const button = root.querySelector("[data-rv-export-btn]");
  button?.addEventListener("click", () => {
    const refreshedRows = buildRows();
    const csv = toCsv(refreshedRows);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `rubikvault_export_${Date.now()}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    logger?.info("export_csv", { rows: refreshedRows.length, bytes: csv.length });
  });

  logger?.setStatus("OK", "Ready");
  logger?.setMeta({ updatedAt: new Date().toISOString(), source: "local" });
}

export async function init(root, context = {}) {
  render(root, context?.logger);
}

export async function refresh(root, context = {}) {
  render(root, context?.logger);
}
