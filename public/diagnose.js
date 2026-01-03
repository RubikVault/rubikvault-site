const DEFAULT_OPTIONS = {
  overlay: true,
  onlyBad: false,
  includeCoverage: true,
  includeDiscovered: true
};

const ROOT_CAUSE_HINTS = {
  NO_SERVER_BLOCK_MATCH: "Block not found in /api/health-report. Check featureId wiring.",
  API_ERROR: "Endpoint error. Check routing, schema, or upstream availability.",
  EXPECTED_PREVIEW: "Preview blocks upstream. Seed lastGood in PROD once.",
  CLIENT_ONLY: "Client-only block; no API payload expected.",
  API_EMPTY: "Endpoint returned EMPTY. Check upstream/auth/mapper and seed lastGood.",
  RENDER_OR_MAPPING: "Server OK but DOM empty. Check renderer mapping or selector.",
  ENVELOPE_NONCOMPLIANT: "Envelope missing required meta/status. Check resilience wrapper.",
  OK: "No obvious issues detected."
};

const BLOCK_SELECTOR = "[data-rv-feature]";
const FIELD_SELECTOR = "[data-rv-field]";
const DISCOVERY_SELECTOR = ".kpi, .metric, .value, [data-value], td";

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
  const nodes = Array.from(block.querySelectorAll(FIELD_SELECTOR));
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
  const candidates = Array.from(block.querySelectorAll(DISCOVERY_SELECTOR)).filter(
    (node) => !node.hasAttribute("data-rv-field")
  );
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

function ensureLauncher() {
  let btn = document.getElementById("rv-diag-launcher");
  if (btn) return btn;
  btn = document.createElement("button");
  btn.id = "rv-diag-launcher";
  btn.type = "button";
  btn.textContent = "Diagnostics";
  btn.style.cssText =
    "position:fixed;top:16px;right:16px;z-index:9999;padding:6px 10px;border-radius:999px;border:1px solid rgba(255,255,255,0.2);background:#111827;color:#e5e7eb;font-size:11px;cursor:pointer;";
  document.body.appendChild(btn);
  return btn;
}

function ensurePanel() {
  let panel = document.getElementById("rv-diag-panel");
  if (panel) return panel;
  panel = document.createElement("div");
  panel.id = "rv-diag-panel";
  panel.style.cssText =
    "position:fixed;top:48px;right:16px;z-index:9999;width:420px;max-height:80vh;overflow:auto;background:#0b1222;color:#e5e7eb;border:1px solid rgba(255,255,255,0.15);border-radius:12px;padding:12px;box-shadow:0 10px 30px rgba(0,0,0,0.35);font:12px/1.4 system-ui, -apple-system, Segoe UI, sans-serif;display:none;";
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

function buildIssuesTable(issues) {
  if (!issues.length) return "<div>No issues detected.</div>";
  return `<table style="width:100%;border-collapse:collapse;">
    <thead>
      <tr>
        <th style="text-align:left;padding:4px 0;border-bottom:1px solid rgba(255,255,255,0.1);">Block</th>
        <th style="text-align:left;padding:4px 0;border-bottom:1px solid rgba(255,255,255,0.1);">Field</th>
        <th style="text-align:left;padding:4px 0;border-bottom:1px solid rgba(255,255,255,0.1);">Cause</th>
      </tr>
    </thead>
    <tbody>
      ${issues
        .slice(0, 30)
        .map(
          (row) => `<tr>
        <td style="padding:3px 0;">${row.blockId}</td>
        <td style="padding:3px 0;">${row.fieldKey}</td>
        <td style="padding:3px 0;">${row.rootCause}</td>
      </tr>`
        )
        .join("")}
    </tbody>
  </table>`;
}

function renderPanel(report) {
  const panel = ensurePanel();
  const summary = report.summary || {};
  const issues = Array.isArray(report.issues) ? report.issues : [];
  panel.innerHTML = `
    <div style="font-weight:600;margin-bottom:6px;">RubikVault Diagnostics</div>
    <div style="margin-bottom:6px;">Blocks: ${summary.blocks || 0} · Invalid fields: ${summary.invalidFields || 0}</div>
    <div style="margin-bottom:8px;color:#9ca3af;">Generated: ${report.generatedAt}</div>
    <div style="margin-bottom:6px;font-weight:600;">Issues</div>
    <div style="margin-bottom:8px;">${buildIssuesTable(issues)}</div>
    <div style="margin-bottom:6px;font-weight:600;">Coverage</div>
    <div style="margin-bottom:8px;color:#cbd5f5;">${
      report.coverageSummary || "Coverage checks complete."
    }</div>
    <pre style="white-space:pre-wrap;color:#9ca3af;background:#0f172a;padding:8px;border-radius:8px;max-height:160px;overflow:auto;">${
      report.compact
    }</pre>
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
  const clearBtn = createButton("Clear", () => {
    panel.style.display = "none";
  });
  panel.appendChild(copyBtn);
  panel.appendChild(downloadBtn);
  panel.appendChild(clearBtn);
  return panel;
}

function buildReport({ blocks, server, options }) {
  const fieldRows = [];
  const blockSummaries = [];
  let coverageIssues = 0;

  blocks.forEach((block) => {
    const observed = discoverObservedFields(block.element);
    const discoveredNodes = discoverExtraNodes(block.element, options.includeDiscovered);
    const serverBlock = block.serverBlock;
    const endpointStatus = serverBlock?.endpointStatus || "UNKNOWN";
    const reason = serverBlock?.reason || null;
    const envelopeIssues = serverBlock?.discovered?.envelopeIssues || [];

    let invalidCount = 0;
    const fieldDetails = observed.map((field) => {
      const rootCause = envelopeIssues.length > 0 ? "ENVELOPE_NONCOMPLIANT" : inferRootCause(serverBlock, field);
      const fixHint = ROOT_CAUSE_HINTS[rootCause] || ROOT_CAUSE_HINTS.OK;
      if (field.domEmpty || field.domSuspicious) invalidCount += 1;
      const row = {
        blockId: block.blockId,
        featureId: block.featureId,
        title: block.title,
        fieldKey: field.key,
        domValue: shortValue(field.value),
        domEmpty: field.domEmpty,
        domSuspicious: field.domSuspicious,
        serverStatus: endpointStatus,
        serverReason: reason,
        rootCause,
        fixHint
      };
      fieldRows.push(row);
      return row;
    });

    if (options.includeCoverage && observed.length === 0 && discoveredNodes.length > 0) {
      coverageIssues += 1;
    }

    const blockState =
      endpointStatus === "ERROR"
        ? "BAD"
        : endpointStatus === "EMPTY" && reason === "PREVIEW"
          ? "EXPECTED"
          : reason === "CLIENT_ONLY"
            ? "EXPECTED"
            : endpointStatus === "EMPTY"
              ? "BAD"
              : invalidCount > 0
                ? "BAD"
                : "OK";

    blockSummaries.push({
      blockId: block.blockId,
      featureId: block.featureId,
      title: block.title,
      endpointStatus,
      reason,
      fieldCount: observed.length,
      invalidCount,
      blockState,
      discoveredDomNodes: discoveredNodes,
      fields: fieldDetails
    });
  });

  const filteredRows = options.onlyBad
    ? fieldRows.filter((row) => row.rootCause !== "OK")
    : fieldRows;
  const issues = filteredRows.filter((row) => row.rootCause !== "OK");
  const totalInvalid = issues.length;
  const compact = JSON.stringify(
    {
      blocks: blockSummaries.length,
      invalidFields: totalInvalid,
      coverageIssues,
      worst: issues.slice(0, 10)
    },
    null,
    2
  );

  return {
    server,
    blocks: blockSummaries,
    fields: filteredRows,
    issues,
    summary: { blocks: blockSummaries.length, invalidFields: totalInvalid },
    coverageSummary:
      coverageIssues > 0
        ? `${coverageIssues} blocks have visible values but no data-rv-field tags.`
        : "All observed blocks expose data-rv-field tags.",
    generatedAt: new Date().toISOString(),
    compact,
    full: null
  };
}

export async function runDiagnostics(opts = {}) {
  const options = { ...DEFAULT_OPTIONS, ...opts };
  const server = await fetch("/api/health-report?debug=1")
    .then((r) => r.json())
    .catch(() => null);
  const serverBlocks = new Map(
    ((server && server.blocks) || []).map((block) => [block.featureId, block])
  );

  const elements = Array.from(document.querySelectorAll(BLOCK_SELECTOR));
  const blocks = elements.map((element) => {
    const featureId = element.getAttribute("data-rv-feature") || "unknown";
    return {
      element,
      featureId,
      blockId: element.getAttribute("data-block-id") || "??",
      title: getBlockTitle(element),
      serverBlock: serverBlocks.get(featureId)
    };
  });

  const report = buildReport({ blocks, server, options });
  report.full = report;
  window.__RV_DIAG_REPORT__ = report;

  const launcher = ensureLauncher();
  const panel = renderPanel(report);
  launcher.onclick = () => {
    panel.style.display = panel.style.display === "none" ? "block" : "none";
  };
  if (options.overlay) {
    blocks.forEach((block) => {
      const summary = report.blocks.find((entry) => entry.featureId === block.featureId);
      applyOverlay(block.element, summary);
    });
  }

  console.table(report.fields);
  console.log("[RV_DIAG] blocks:", report.summary.blocks, "invalid fields:", report.summary.invalidFields);
  return report;
}
