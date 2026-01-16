import { fetchJSON, getBindingHint } from "./utils/api.js";
import { getOrFetch } from "./utils/store.js";
import { resolveWithShadow } from "./utils/resilience.js";
import { rvSetText } from "./rv-dom.js";

const LAYOUT_STORAGE_KEY = "rv-market-snapshot-layout";
const DEFAULT_LAYOUT = "A";

function getLayout() {
  try {
    const value = window?.localStorage?.getItem(LAYOUT_STORAGE_KEY) || "";
    return value === "A" || value === "B" || value === "C" ? value : DEFAULT_LAYOUT;
  } catch {
    return DEFAULT_LAYOUT;
  }
}

function setLayout(value) {
  try {
    window?.localStorage?.setItem(LAYOUT_STORAGE_KEY, value);
  } catch {
    // ignore
  }
}

function formatNumber(value, options = {}) {
  if (value === null || value === undefined || Number.isNaN(value)) return "N/A";
  return new Intl.NumberFormat("en-US", options).format(value);
}

function formatPercent(value, digits = 2) {
  if (value === null || value === undefined || Number.isNaN(value)) return "N/A";
  return `${formatNumber(value, { maximumFractionDigits: digits })}%`;
}

function formatSignedPercent(value, digits = 2) {
  if (value === null || value === undefined || Number.isNaN(value)) return "N/A";
  const sign = value > 0 ? "+" : "";
  return `${sign}${formatNumber(value, { maximumFractionDigits: digits })}%`;
}

function metricCard(label, value, sub = "") {
  return `
    <div class="rv-ms-card">
      <div class="label">${label}</div>
      <div class="value">${value}</div>
      ${sub ? `<div class="sub">${sub}</div>` : ""}
    </div>
  `;
}

function renderLayoutControls(active) {
  const options = [
    { id: "A", label: "Option A" },
    { id: "B", label: "Option B" },
    { id: "C", label: "Option C" }
  ];
  return `
    <div class="rv-ms-controls" role="group" aria-label="Market Snapshot layout">
      ${options
        .map(
          (opt) =>
            `<button type="button" data-rv-ms-layout="${opt.id}" class="${opt.id === active ? "is-active" : ""}">${opt.label}</button>`
        )
        .join("")}
    </div>
  `;
}

function renderLayoutA({ regime, drivers, vix, fng, fngStocks, btc, dxy, yields }) {
  const yield10y = yields?.values?.["10y"];
  const cards = [
    metricCard("Regime", `${regime.label || "Neutral"}`, `Score ${formatNumber(regime.score, { maximumFractionDigits: 0 })}`),
    metricCard("Volatility", `${formatNumber(vix.value, { maximumFractionDigits: 2 })}`, vix.note || vix.source || "N/A"),
    metricCard(
      "Sentiment",
      `${formatNumber(fngStocks.value)} / ${formatNumber(fng.value)}`,
      `Stocks F&G / Crypto F&G`
    ),
    metricCard("BTC", `$${formatNumber(btc.price, { maximumFractionDigits: 0 })}`, formatSignedPercent(btc.changePercent))
  ];

  const driversHtml = drivers.length ? drivers.map((d) => `<span>${d}</span>`).join("") : "No drivers yet";
  return `
    <div class="rv-native-note">Choose a layout to compare: cards vs tables vs dashboard.</div>
    <div class="rv-ms-grid">${cards.join("")}</div>
    <div class="rv-cockpit-summary">
      <div class="rv-cockpit-regime">
        <span class="rv-cockpit-label">Macro</span>
        <strong>DXY ${formatNumber(dxy.value, { maximumFractionDigits: 2 })}</strong>
        <span class="rv-native-note">10Y ${formatNumber(yield10y, { maximumFractionDigits: 2 })}</span>
      </div>
      <div class="rv-cockpit-drivers">${driversHtml}</div>
    </div>
  `;
}

function renderLayoutB({ regime, drivers, vix, fng, fngStocks, news, btc, dxy, yields, proxies }) {
  const yieldValues = yields?.values || {};
  const driversHtml = drivers.length ? drivers.map((d) => `<span>${d}</span>`).join("") : "No drivers yet";

  const rows = [
    ["Regime", `${regime.label || "Neutral"} (Score ${formatNumber(regime.score, { maximumFractionDigits: 0 })})`, "derived"],
    ["VIX", formatNumber(vix.value, { maximumFractionDigits: 2 }), vix.note || vix.source || "N/A"],
    ["Stocks F&G", `${formatNumber(fngStocks.value)} ${fngStocks.label ? `(${fngStocks.label})` : ""}`, fngStocks.source || "N/A"],
    ["Crypto F&G", `${formatNumber(fng.value)} ${fng.label ? `(${fng.label})` : ""}`, fng.source || "N/A"],
    ["News Sentiment", `${formatNumber(news.score, { maximumFractionDigits: 2 })} ${news.label || ""}`, news.source || "N/A"],
    ["BTC", `$${formatNumber(btc.price, { maximumFractionDigits: 0 })} (${formatSignedPercent(btc.changePercent)})`, btc.source || "N/A"],
    ["DXY", `${formatNumber(dxy.value, { maximumFractionDigits: 2 })} (${formatSignedPercent(dxy.changePercent)})`, dxy.source || "N/A"],
    ["Gold (proxy)", formatNumber(proxies.gold?.price, { maximumFractionDigits: 2 }), proxies.gold?.symbol || "GLD"],
    ["Oil (proxy)", formatNumber(proxies.oil?.price, { maximumFractionDigits: 2 }), proxies.oil?.symbol || "USO"],
    ["USD (proxy)", formatNumber(proxies.usd?.price, { maximumFractionDigits: 2 }), proxies.usd?.symbol || "UUP"],
    ["US 2Y", formatNumber(yieldValues["2y"], { maximumFractionDigits: 2 }), yields.source || "US Treasury"],
    ["US 10Y", formatNumber(yieldValues["10y"], { maximumFractionDigits: 2 }), yields.source || "US Treasury"],
    ["US 30Y", formatNumber(yieldValues["30y"], { maximumFractionDigits: 2 }), yields.source || "US Treasury"]
  ];

  return `
    <div class="rv-cockpit-summary">
      <div class="rv-cockpit-regime">
        <span class="rv-cockpit-label">Drivers</span>
        <strong>${regime.label || "Neutral"}</strong>
        <span class="rv-native-note">Score ${formatNumber(regime.score, { maximumFractionDigits: 0 })}</span>
      </div>
      <div class="rv-cockpit-drivers">${driversHtml}</div>
    </div>
    <table class="rv-native-table rv-table--compact">
      <thead>
        <tr>
          <th>Signal</th>
          <th>Value</th>
          <th>Source</th>
        </tr>
      </thead>
      <tbody>
        ${rows
          .map(
            ([signal, value, source]) => `
          <tr>
            <td>${signal}</td>
            <td>${value}</td>
            <td>${source}</td>
          </tr>`
          )
          .join("")}
      </tbody>
    </table>
  `;
}

function renderLayoutC({ regime, drivers, vix, fng, fngStocks, btc, dxy, yields }) {
  const yieldValues = yields?.values || {};
  const driversHtml = drivers.length ? drivers.map((d) => `<span>${d}</span>`).join("") : "No drivers yet";
  return `
    <div class="rv-cockpit-summary">
      <div class="rv-cockpit-regime">
        <span class="rv-cockpit-label">Regime</span>
        <strong>${regime.label || "Neutral"}</strong>
        <span class="rv-native-note">Score ${formatNumber(regime.score, { maximumFractionDigits: 0 })}</span>
      </div>
      <div class="rv-cockpit-drivers">${driversHtml}</div>
    </div>
    <div class="rv-ms-grid">
      ${metricCard("VIX", formatNumber(vix.value, { maximumFractionDigits: 2 }), vix.note || vix.source || "N/A")}
      ${metricCard("Stocks F&G", formatNumber(fngStocks.value), fngStocks.label || "")}
      ${metricCard("Crypto F&G", formatNumber(fng.value), fng.label || "")}
      ${metricCard("BTC", `$${formatNumber(btc.price, { maximumFractionDigits: 0 })}`, formatSignedPercent(btc.changePercent))}
      ${metricCard("DXY", formatNumber(dxy.value, { maximumFractionDigits: 2 }), formatSignedPercent(dxy.changePercent))}
      ${metricCard("US 10Y", formatNumber(yieldValues["10y"], { maximumFractionDigits: 2 }), yields.source || "US Treasury")}
    </div>
  `;
}

function render(root, payload, logger, featureId) {
  const resolved = resolveWithShadow(featureId, payload, {
    logger,
    isMissing: (value) => !value?.ok || !value?.data,
    reason: "STALE_FALLBACK"
  });
  const data = resolved?.data || {};
  const regime = data.regime || {};
  const drivers = Array.isArray(regime.drivers) ? regime.drivers : [];
  const partialNote =
    resolved?.ok && (resolved?.isStale || data.partial || resolved?.error?.code)
      ? "Partial data — some signals unavailable."
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
        Market Cockpit konnte nicht geladen werden.<br />
        <span>${errorMessage}</span>
        ${detailLine ? `<div class="rv-native-note">${detailLine}</div>` : ""}
        ${fixHint ? `<div class="rv-native-note">${fixHint}</div>` : ""}
        ${upstreamSnippet ? `<pre class="rv-native-stack">${upstreamSnippet}</pre>` : ""}
      </div>
    `;
    logger?.setStatus("FAIL", errorCode || "API error");
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

  const vix = data.vix || {};
  const fng = data.fngCrypto || {};
  const fngStocks = data.fngStocks || {};
  const news = data.newsSentiment || {};
  const proxies = data.proxies || {};
  const btc = data.btc || {};
  const dxy = data.dxy || {};
  const yields = data.yields || {};
  const yieldValues = yields.values || {};
  const macro = data.macroSummary || {};
  const macroRates = Array.isArray(macro.rates) ? macro.rates : [];
  const macroFx = Array.isArray(macro.fx) ? macro.fx : [];
  const macroCpi = Array.isArray(macro.cpi) ? macro.cpi : [];
  const layout = getLayout();

  root.innerHTML = `
    ${partialNote ? `<div class="rv-native-note">${partialNote}</div>` : ""}
    ${renderLayoutControls(layout)}
    ${
      layout === "B"
        ? renderLayoutB({ regime, drivers, vix, fng, fngStocks, news, btc, dxy, yields, proxies })
        : layout === "C"
          ? renderLayoutC({ regime, drivers, vix, fng, fngStocks, btc, dxy, yields })
          : renderLayoutA({ regime, drivers, vix, fng, fngStocks, btc, dxy, yields })
    }
    <div class="rv-native-note">Sector rotation details are in the S&amp;P 500 Sectors block below.</div>
    <div class="rv-native-note">
      Updated: ${new Date(data.updatedAt || resolved.ts).toLocaleTimeString()} · Freshness: ${
        resolved?.freshness || "unknown"
      }
    </div>
  `;
  root
    .querySelectorAll("[data-rv-field]")
    .forEach((node) => rvSetText(node, node.dataset.rvField, node.textContent));

  const status = resolved?.isStale || data.partial ? "PARTIAL" : "OK";
  logger?.setStatus(status, resolved?.isStale ? "Stale data" : data.partial ? "Partial data" : "Live");
  logger?.setMeta({
    updatedAt: data.updatedAt || resolved.ts,
    source: data.source || "multi",
    isStale: resolved?.isStale,
    staleAgeMs: resolved?.staleAgeMs
  });
  logger?.info("response_meta", {
    cache: resolved?.cache || {},
    upstreamStatus: resolved?.upstream?.status ?? null
  });

  root.querySelectorAll("[data-rv-ms-layout]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const next = btn.getAttribute("data-rv-ms-layout") || "";
      if (next !== "A" && next !== "B" && next !== "C") return;
      setLayout(next);
      render(root, payload, logger, featureId);
    });
  });
}

async function loadData({ featureId, traceId, logger }) {
  return fetchJSON("/market-cockpit", { feature: featureId, traceId, logger });
}

export async function init(root, context = {}) {
  const { featureId = "rv-market-cockpit", traceId, logger } = context;
  const data = await getOrFetch(
    "rv-market-cockpit",
    () => loadData({ featureId, traceId, logger }),
    { ttlMs: 15 * 60 * 1000, featureId, logger }
  );
  render(root, data, logger, featureId);
}

export async function refresh(root, context = {}) {
  const { featureId = "rv-market-cockpit", traceId, logger } = context;
  const data = await loadData({ featureId, traceId, logger });
  render(root, data, logger, featureId);
}
