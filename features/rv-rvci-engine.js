import { fetchJSON, getBindingHint } from "./utils/api.js";
import { getOrFetch } from "./utils/store.js";
import { resolveWithShadow } from "./utils/resilience.js";
import { createTooltip } from "./utils/tooltip.js";

function formatNumber(value, options = {}) {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  return new Intl.NumberFormat("en-US", options).format(value);
}

function safeLink(path) {
  if (!path) return "";
  const raw = String(path);
  const cleaned = raw.startsWith("/") ? raw : `/${raw}`;
  return cleaned;
}

function render(root, payload, logger, featureId) {
  const resolved = resolveWithShadow(featureId, payload, {
    logger,
    isMissing: (value) => !value?.ok || !value?.data,
    reason: "STALE_FALLBACK"
  });

  const data = resolved?.data || {};
  const meta = resolved?.meta || {};
  const errorCode = resolved?.error?.code || "";

  if (!resolved?.ok) {
    const errorMessage = resolved?.error?.message || "API error";
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
        RVCI Engine konnte nicht geladen werden.<br />
        <span>${errorMessage}</span>
        ${detailLine ? `<div class="rv-native-note">${detailLine}</div>` : ""}
        ${fixHint ? `<div class="rv-native-note">${fixHint}</div>` : ""}
        ${upstreamSnippet ? `<pre class="rv-native-stack">${upstreamSnippet}</pre>` : ""}
      </div>
    `;

    logger?.setStatus("FAIL", errorCode || "API error");
    logger?.setMeta({
      updatedAt: resolved?.ts,
      source: meta?.source || "--",
      isStale: resolved?.isStale,
      staleAgeMs: resolved?.staleAgeMs
    });
    return;
  }

  const counts = data.counts || {};
  const paths = data.paths || {};
  const updatedAt = meta.dataAsOf || meta.generatedAt || resolved?.ts || null;
  const status = meta.status || meta.reason || resolved?.meta?.status || "OK";
  const coveragePct = meta.coveragePct ?? null;
  const universe = meta.universe || {};
  const regime = meta.regime || "—";

  const links = [
    { label: "Top Short", href: safeLink(paths.short) },
    { label: "Top Mid", href: safeLink(paths.mid) },
    { label: "Top Long", href: safeLink(paths.long) },
    { label: "Triggers", href: safeLink(paths.triggers) },
    { label: "Health", href: safeLink(paths.health) }
  ].filter((item) => item.href);

  root.innerHTML = `
    <div class="rv-native-note" style="margin-bottom: 10px;">
      ${createTooltip("RVCI Engine (EOD snapshot)", {
        source: meta?.source?.prices || meta?.source?.universe || meta?.source || "snapshot",
        asOf: updatedAt ? new Date(updatedAt).toISOString().slice(0, 10) : "—",
        cadence: "EOD",
        marketContext: "Regime + breadth coverage"
      })}
      <strong>${regime}</strong>
      <span style="opacity:0.85;"> · Status: ${status}</span>
      ${coveragePct !== null ? `<span style="opacity:0.85;"> · Coverage: ${formatNumber(coveragePct, { maximumFractionDigits: 2 })}%</span>` : ""}
    </div>

    <div class="rv-native-table-wrap">
      <table class="rv-native-table">
        <thead>
          <tr>
            <th>Bucket</th>
            <th>Items</th>
          </tr>
        </thead>
        <tbody>
          <tr><td>Short</td><td>${formatNumber(counts.short ?? null)}</td></tr>
          <tr><td>Mid</td><td>${formatNumber(counts.mid ?? null)}</td></tr>
          <tr><td>Long</td><td>${formatNumber(counts.long ?? null)}</td></tr>
          <tr><td>Triggers</td><td>${formatNumber(counts.triggers ?? null)}</td></tr>
        </tbody>
      </table>
    </div>

    <div class="rv-native-note" style="margin-top: 10px;">
      Universe: ${formatNumber(universe.received ?? null)}/${formatNumber(universe.expected ?? null)} (missing ${formatNumber(universe.missing ?? null)})
    </div>

    ${links.length ? `
      <div class="rv-native-note" style="margin-top: 10px; display:flex; flex-wrap:wrap; gap:10px;">
        ${links.map((l) => `<a href="${l.href}" target="_blank" rel="noopener noreferrer">${l.label}</a>`).join(" ")}
      </div>
    ` : ""}
  `;

  logger?.setStatus(resolved?.isStale ? "PARTIAL" : "OK", resolved?.isStale ? "STALE" : "LIVE");
  logger?.setMeta({
    updatedAt,
    source: meta?.source?.prices || meta?.source || "snapshot",
    isStale: resolved?.isStale,
    staleAgeMs: resolved?.staleAgeMs
  });
}

export async function init({ root, config, logger }) {
  const featureId = config?.id || "rv-rvci-engine";
  const apiPath = config?.api ? `/api/${config.api}` : "/api/rvci-engine";

  const payload = await getOrFetch(featureId, async () => {
    const res = await fetchJSON(apiPath);
    return res;
  }, {
    ttlMs: config?.refreshIntervalMs || 6 * 60 * 60 * 1000,
    logger
  });

  render(root, payload, logger, featureId);
}
