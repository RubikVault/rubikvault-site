const DEFAULT_OPTIONS = {
  overlay: true,
  onlyBad: false,
  includeDiscovered: true
};

const ROOT_CAUSE_HINTS = {
  NO_SERVER_BLOCK_MATCH: "Block not found in /api/health-report. Check featureId wiring.",
  API_ERROR: "Endpoint error. Check routing, schema, or upstream availability.",
  EXPECTED_PREVIEW: "Preview blocks upstream. Seed lastGood in PROD once.",
  CLIENT_ONLY: "Client-only block; no API payload expected.",
  API_EMPTY: "Endpoint returned EMPTY. Check upstream/auth/mapper and seed lastGood.",
  RENDER_OR_MAPPING: "Server OK but DOM empty. Check renderer mapping or selector.",
  OK: "No obvious issues detected."
};

function isPlaceholder(value) {
  const text = String(value || "").trim().toLowerCase();
  return text === "" || text === "—" || text === "-" || text === "n/a" || text === "na";
}

function isSuspicious(value) {
  const text = String(value || "").trim().toLowerCase();
  return text === "undefined" || text === "null" || text === "nan";
}

function shortValue(value) {
  const text = String(value || "").trim();
  if (!text) return "";
  return text.length > 80 ? `${text.slice(0, 77)}...` : text;
}

function getTextValue(node) {
  if (!node) return "";
  if (node.dataset && node.dataset.value) return node.dataset.value;
  const attr = node.getAttribute && node.getAttribute("data-value");
  if (attr) return attr;
  return node.textContent || "";
}

function getBlockTitle(block) {
  const titleEl = block.querySelector("h2, h3, .block-title, .card-title");
  return (titleEl?.textContent || "").trim();
}

function discoverObservedFields(block) {
  const observed = [];
  const nodes = Array.from(block.querySelectorAll("[data-rv-field]"));
  nodes.forEach((node) => {
    const key = node.getAttribute("data-rv-field") || "unknown";
    const value = getTextValue(node).trim();
    observed.push({
      key,
      value,
      domPresent: true,
      domEmpty: isPlaceholder(value),
      domSuspicious: isSuspicious(value),
      selector: `[data-rv-field="${key}"]`
    });
  });
  return observed;
}

function discoverExtraNodes(block, includeDiscovered) {
  if (!includeDiscovered) return [];
  const candidates = Array.from(
    block.querySelectorAll(".kpi, .metric, .value, [data-value], td")
  ).filter((node) => !node.hasAttribute("data-rv-field"));
  return candidates.slice(0, 25).map((node) => ({
    textPreview: shortValue(getTextValue(node)),
    tag: node.tagName,
    classPreview: (node.className || "").toString().slice(0, 80)
  }));
}

function inferRootCause(serverBlock, field) {
  if (!serverBlock) return "NO_SERVER_BLOCK_MATCH";
  const status = serverBlock.endpointStatus || "UNKNOWN";
  const reason = serverBlock.reason || "";
  if (status === "ERROR") return "API_ERROR";
  if (status === "EMPTY" && reason === "PREVIEW") return "EXPECTED_PREVIEW";
  if (reason === "CLIENT_ONLY") return "CLIENT_ONLY";
  if (status === "EMPTY") return "API_EMPTY";
  if ((status === "LIVE" || status === "STALE") && (field.domEmpty || field.domSuspicious)) {
    return "RENDER_OR_MAPPING";
  }
  return "OK";
}

function createOverlayBadge(block, summary) {
  const badge = document.createElement("button");
  badge.type = "button";
  badge.className = "rv-diag-badge";
  badge.textContent = `${summary.blockState} · ${summary.invalidCount}/${summary.fieldCount}`;
  badge.style.cssText =
    "position:absolute;top:8px;right:8px;z-index:50;padding:4px 8px;font-size:11px;border-radius:999px;border:1px solid rgba(255,255,255,0.2);background:#0b1222;color:#e5e7eb;cursor:pointer;";
  badge.addEventListener("click", () => {
    console.table(summary.fields);
  });
  block.style.position = "relative";
  block.appendChild(badge);
  return badge;
}

function applyOverlay(block, summary) {
  if (!summary) return;
  const border =
    summary.blockState === "BAD"
      ? "2px solid #f87171"
      : summary.blockState === "EXPECTED"
        ? "2px solid #fbbf24"
        : "2px solid #34d399";
  block.style.outline = border;
  createOverlayBadge(block, summary);
}

function createPanel() {
  let panel = document.getElementById("rv-diag-panel");
  if (panel) return panel;
  panel = document.createElement("div");
  panel.id = "rv-diag-panel";
  panel.style.cssText =
    "position:fixed;top:16px;right:16px;z-index:9999;width:360px;max-height:80vh;overflow:auto;background:#0b1222;color:#e5e7eb;border:1px solid rgba(255,255,255,0.15);border-radius:12px;padding:12px;box-shadow:0 10px 30px rgba(0,0,0,0.35);font:12px/1.4 system-ui, -apple-system, Segoe UI, sans-serif;";
  document.body.appendChild(panel);
  return panel;
}

function createButton(label, onClick) {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.textContent = label;
  btn.style.cssText =
    "margin-right:6px;margin-top:6px;padding:4px 8px;border-radius:6px;border:1px solid rgba(255,255,255,0.2);background:#111827;color:#e5e7eb;font-size:11px;cursor:pointer;";
  btn.addEventListener("click", onClick);
  return btn;
}

function renderPanel(report) {
  const panel = createPanel();
  const summary = report.summary || {};
  const issues = Array.isArray(report.issues) ? report.issues : [];
  const issueList = issues
    .slice(0, 10)
    .map(
      (issue) =>
        `<div style="margin-bottom:4px;"><strong>${issue.blockId}</strong> ${issue.featureId} · ${issue.fieldKey} · ${issue.rootCause}</div>`
    )
    .join("");
  panel.innerHTML = `
    <div style="font-weight:600;margin-bottom:6px;">RubikVault Diagnostics</div>
    <div style="margin-bottom:6px;">Blocks: ${summary.blocks || 0} · Invalid fields: ${
    summary.invalidFields || 0
  }</div>
    <div style="margin-bottom:8px;color:#9ca3af;">Generated: ${report.generatedAt}</div>
    <div style="margin-bottom:6px;font-weight:600;">Issues</div>
    <div style="margin-bottom:8px;color:#cbd5f5;">${issueList || "No issues detected."}</div>
    <pre style="white-space:pre-wrap;color:#9ca3af;background:#0f172a;padding:8px;border-radius:8px;max-height:160px;overflow:auto;">${report.compact}</pre>
  `;
  const copyBtn = createButton("Copy JSON", () => {
    const text = JSON.stringify(report.full, null, 2);
    navigator.clipboard?.writeText(text).catch(() => {
      const textarea = document.createElement("textarea");
      textarea.value = text;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand("copy");
      textarea.remove();
    });
  });
  const downloadBtn = createButton("Download JSON", () => {
    const blob = new Blob([JSON.stringify(report.full, null, 2)], {
      type: "application/json"
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "rv-diagnostics.json";
    link.click();
    URL.revokeObjectURL(url);
  });
  panel.appendChild(copyBtn);
  panel.appendChild(downloadBtn);
  return panel;
}

export async function runDiagnostics(opts = {}) {
  const options = { ...DEFAULT_OPTIONS, ...opts };
  const server = await fetch("/api/health-report?debug=1")
    .then((r) => r.json())
    .catch(() => null);
  const serverBlocks = new Map(
    ((server && server.blocks) || []).map((block) => [block.featureId, block])
  );

  const blocks = Array.from(document.querySelectorAll("[data-rv-feature]"));
  const fieldRows = [];
  const blockSummaries = [];

  blocks.forEach((block) => {
    const featureId = block.getAttribute("data-rv-feature") || "unknown";
    const blockId = block.getAttribute("data-block-id") || "??";
    const title = getBlockTitle(block);
    const observed = discoverObservedFields(block);
    const discoveredNodes = discoverExtraNodes(block, options.includeDiscovered);
    const serverBlock = serverBlocks.get(featureId);
    const endpointStatus = serverBlock?.endpointStatus || "UNKNOWN";
    const reason = serverBlock?.reason || null;

    let invalidCount = 0;
    observed.forEach((field) => {
      const rootCause = inferRootCause(serverBlock, field);
      const fixHint = ROOT_CAUSE_HINTS[rootCause] || ROOT_CAUSE_HINTS.OK;
      const row = {
        blockId,
        featureId,
        title,
        fieldKey: field.key,
        domValue: shortValue(field.value),
        domEmpty: field.domEmpty,
        domSuspicious: field.domSuspicious,
        serverStatus: endpointStatus,
        serverReason: reason,
        rootCause,
        fixHint
      };
      if (field.domEmpty || field.domSuspicious) {
        invalidCount += 1;
      }
      fieldRows.push(row);
    });

    const blockState =
      endpointStatus === "ERROR"
        ? "BAD"
        : endpointStatus === "EMPTY" && reason === "PREVIEW"
          ? "EXPECTED"
          : endpointStatus === "EMPTY"
            ? "BAD"
            : invalidCount > 0
              ? "BAD"
              : "OK";

    const summary = {
      blockId,
      featureId,
      title,
      endpointStatus,
      reason,
      fieldCount: observed.length,
      invalidCount,
      blockState,
      discoveredDomNodes: discoveredNodes
    };
    blockSummaries.push(summary);
    if (options.overlay) applyOverlay(block, summary);
  });

  const filteredRows = options.onlyBad
    ? fieldRows.filter((row) => row.rootCause !== "OK")
    : fieldRows;

  console.table(filteredRows);
  const totalInvalid = fieldRows.filter((row) => row.rootCause !== "OK").length;
  console.log("[RV_DIAG] blocks:", blockSummaries.length, "invalid fields:", totalInvalid);

  const issues = filteredRows.filter((row) => row.rootCause !== "OK");
  const compact = JSON.stringify(
    {
      blocks: blockSummaries.length,
      invalidFields: totalInvalid,
      worst: issues.slice(0, 10)
    },
    null,
    2
  );
  const report = {
    server,
    blocks: blockSummaries,
    fields: filteredRows,
    issues,
    summary: { blocks: blockSummaries.length, invalidFields: totalInvalid },
    generatedAt: new Date().toISOString()
  };
  report.compact = compact;
  report.full = report;
  window.__RV_DIAG_REPORT__ = report;
  if (options.overlay) renderPanel(report);
  return report;
}
