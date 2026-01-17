import { fetchJSON, getBindingHint } from "./utils/api.js";
import { getOrFetch } from "./utils/store.js";
import { resolveWithShadow } from "./utils/resilience.js";
import { rvSetText } from "./rv-dom.js";

const LAYOUT_STORAGE_KEY = "rv-market-snapshot-layout";
const DEFAULT_LAYOUT = "A";

const HERO_METRIC_IDS = [
  "risk.regime",
  "risk.vix",
  "risk.vix3m",
  "risk.vix_ratio",
  "risk.move",
  "rates.us2y",
  "rates.us10y",
  "rates.us30y",
  "rates.yield_curve",
  "rates.sofr",
  "rates.effr",
  "credit.hy_oas",
  "credit.ig_oas",
  "credit.bbb_oas",
  "credit.baa",
  "credit.stress_spread",
  "fx.dxy",
  "fx.eurusd",
  "fx.usdjpy",
  "fx.gbpusd",
  "fx.usdcny",
  "comm.wti",
  "comm.gold",
  "comm.brent",
  "comm.copper",
  "comm.natgas",
  "eq.sp500",
  "eq.nasdaq",
  "eq.dax",
  "eq.nikkei",
  "eq.russell2000",
  "crypto.market_cap",
  "crypto.btc_dominance",
  "crypto.stablecoin_cap",
  "crypto.defi_tvl",
  "crypto.eth_gas",
  "crypto.btc_price",
  "crypto.eth_price",
  "macro.us_cpi",
  "macro.ea_cpi",
  "macro.uk_cpi",
  "macro.jp_cpi",
  "macro.us_unemployment",
  "macro.ea_unemployment",
  "macro.us_gdp",
  "val.cape",
  "val.buffett_indicator"
];

const HERO_GROUPS = [
  {
    title: "RISK & VOL",
    items: [
      { label: "RiskRegime", id: "risk.regime" },
      { label: "VIX Close", id: "risk.vix" },
      { label: "VIX3M Close", id: "risk.vix3m" },
      { label: "VIX/VIX3M", id: "risk.vix_ratio" },
      { label: "Curve10-2", id: "rates.yield_curve" }
    ]
  },
  {
    title: "RATES",
    items: [
      { label: "US2Y Yield", id: "rates.us2y" },
      { label: "US10Y Yield", id: "rates.us10y" },
      { label: "US30Y Yield", id: "rates.us30y" },
      { label: "SOFR", id: "rates.sofr" },
      { label: "EFFR", id: "rates.effr" }
    ]
  },
  {
    title: "CREDIT",
    items: [
      { label: "HY OAS", id: "credit.hy_oas" },
      { label: "IG OAS", id: "credit.ig_oas" },
      { label: "BBB OAS", id: "credit.bbb_oas" },
      { label: "BAA Yield", id: "credit.baa" },
      { label: "StressSprd", id: "credit.stress_spread" }
    ]
  },
  {
    title: "USD & FX",
    items: [
      { label: "USD Broad", id: "fx.dxy" },
      { label: "EURUSD", id: "fx.eurusd" },
      { label: "USDJPY", id: "fx.usdjpy" },
      { label: "GBPUSD", id: "fx.gbpusd" },
      { label: "USDCNY", id: "fx.usdcny" }
    ]
  },
  {
    title: "COMMOD",
    items: [
      { label: "WTI Oil", id: "comm.wti" },
      { label: "Gold USD", id: "comm.gold" },
      { label: "Brent Oil", id: "comm.brent" },
      { label: "Copper", id: "comm.copper" },
      { label: "NatGas", id: "comm.natgas" }
    ]
  },
  {
    title: "EQUITIES",
    items: [
      { label: "SPX Close", id: "eq.sp500" },
      { label: "NDX Close", id: "eq.nasdaq" },
      { label: "DAX Close", id: "eq.dax" },
      { label: "NikkeiCls", id: "eq.nikkei" },
      { label: "R2K Close", id: "eq.russell2000" }
    ]
  },
  {
    title: "CRYPTO",
    items: [
      { label: "BTC Price", id: "crypto.btc_price" },
      { label: "ETH Price", id: "crypto.eth_price" },
      { label: "Crypto MC", id: "crypto.market_cap" },
      { label: "BTC Dom", id: "crypto.btc_dominance" },
      { label: "DeFi TVL", id: "crypto.defi_tvl" }
    ]
  },
  {
    title: "MACRO & VAL",
    items: [
      { label: "US CPI YoY", id: "macro.us_cpi" },
      { label: "US Unemp", id: "macro.us_unemployment" },
      { label: "US GDP", id: "macro.us_gdp" },
      { label: "BuffettInd", id: "val.buffett_indicator" },
      { label: "CAPE", id: "val.cape" }
    ]
  }
];

let heroMetricsAwait = false;

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

function formatMetricValue(metric) {
  if (!metric) return "N/A";
  if (metric.valueType === "label" || metric.valueType === "dataset") {
    return metric.value || "N/A";
  }
  const raw = Number(metric.value);
  if (Number.isNaN(raw)) return "N/A";
  const unit = metric.unit;
  if (unit === "%") return formatPercent(raw, 2);
  if (unit === "bp") return `${Math.round(raw)} bp`;
  if (unit === "index") return formatNumber(raw, { maximumFractionDigits: 2 });
  if (unit === "count") return formatNumber(raw, { maximumFractionDigits: 0 });
  if (unit === "ratio") return raw.toFixed(2);
  if (unit === "usd") {
    const abs = Math.abs(raw);
    if (abs >= 1_000_000_000) return `$${(raw / 1_000_000_000).toFixed(2)}B`;
    if (abs >= 1_000_000) return `$${(raw / 1_000_000).toFixed(2)}M`;
    if (abs >= 1_000) return `$${(raw / 1_000).toFixed(2)}K`;
    return `$${raw.toFixed(2)}`;
  }
  if (unit === "usd/oz" || unit === "usd/bbl" || unit === "usd/mt") {
    return `$${raw.toFixed(2)}`;
  }
  if (unit === "gwei") return `${raw.toFixed(1)} gwei`;
  return `${raw}`;
}

function getMetricsEnvelope() {
  if (typeof window === "undefined") return null;
  return window.__RV_METRICS_ENVELOPE || null;
}

function buildMetricsMap(envelope) {
  const data = envelope?.data || {};
  const metricsById = data.metricsById || {};
  const map = {};
  const groups = Array.isArray(data.groups) ? data.groups : [];
  groups.forEach((group) => {
    const ids = Array.isArray(group.metricIds) ? group.metricIds : [];
    ids.forEach((id) => {
      if (!(id in map)) map[id] = metricsById[id] || null;
    });
  });
  HERO_METRIC_IDS.forEach((id) => {
    if (!(id in map)) map[id] = metricsById[id] || null;
  });
  return map;
}

function buildHeroMetricsModel(envelope) {
  const metricsById = buildMetricsMap(envelope);
  const missingIds = [];
  const groups = HERO_GROUPS.map((group) => {
    const metrics = group.items.map((item) => {
      const metric = metricsById[item.id] || null;
      const label = item.label;
      const value = formatMetricValue(metric);
      const sub = metric?.source || metric?.provider || metric?.asOf || "N/A";
      const missing = !metric || value === "N/A";
      if (missing) missingIds.push(item.id);
      return { id: item.id, label, value, sub, missing, group: group.title };
    });
    return { title: group.title, metrics };
  });
  const metaMissingIds = Array.isArray(envelope?.meta?.missingMetricIds)
    ? envelope.meta.missingMetricIds
    : [];
  const totalCount = groups.reduce((acc, group) => acc + group.metrics.length, 0);
  return {
    groups,
    flat: groups.flatMap((group) => group.metrics),
    missingIds,
    metaMissingIds,
    totalCount
  };
}


function renderHeroAudit(model, fetchCount) {
  const missingLine = model.missingIds.length ? model.missingIds.join(", ") : "none";
  const metaMissing = model.metaMissingIds.length ? model.metaMissingIds.join(", ") : "none";
  const rows = model.flat
    .map(
      (metric) => `
      <tr>
        <td>${metric.id}</td>
        <td>${metric.missing ? "MISSING" : "OK"}</td>
        <td>${metric.group}</td>
        <td>${metric.label}</td>
      </tr>`
    )
    .join("");
  return `
    <div class="rv-native-note">
      <strong>Hero Audit</strong><br/>
      missingMetricIds (meta): ${metaMissing}<br/>
      missingMetricIds (hero): ${missingLine}<br/>
      metricsFetchCount: ${fetchCount}
    </div>
    <div data-hero-audit-values class="rv-native-note"></div>
    <table class="rv-native-table rv-table--compact">
      <thead>
        <tr><th>metricId</th><th>Status</th><th>Group</th><th>Label</th></tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
  `;
}

function renderHeroSections(model, mode) {
  const rowGroups = [model.groups.slice(0, 4), model.groups.slice(4, 8), model.groups.slice(8)];
  const rowsHtml = rowGroups
    .map((row) => {
      const sections = row
        .map((group) => {
          const rows = group.metrics
            .map(
              (metric) => `
          <tr>
            <td class="rv-cell-label" style="word-break: break-word;overflow:hidden;text-overflow:ellipsis;">${metric.label}</td>
            <td class="rv-cell-num" style="text-align:right;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${metric.value}</td>
          </tr>`
            )
            .join("");
          const cards = group.metrics
            .map((metric) => metricCard(metric.label, metric.value, metric.sub))
            .join("");
          const content = mode === "table"
            ? `
        <table class="rv-native-table rv-table--compact" style="width:100%;table-layout:fixed;">
          <tbody>
            ${rows}
          </tbody>
        </table>
        `
            : `
        <div class="rv-ms-grid">
          ${cards}
        </div>
        `;
          return `
        <section class="rv-cockpit-section" style="max-width:100%;overflow:hidden;">
          <div class="rv-cockpit-section-title">${group.title}</div>
          ${content}
        </section>
      `;
        })
        .join("");
      return `<div class="rv-cockpit-grid" style="gap:12px;margin:12px 0 16px;">${sections}</div>`;
    })
    .join("");
  return rowsHtml;
}

function renderHeroSectionsB(model) {
  const rowGroups = [model.groups.slice(0, 4), model.groups.slice(4, 8), model.groups.slice(8)];
  const rowsHtml = rowGroups
    .map((row) => {
      const sections = row
        .map((group) => {
          const rows = group.metrics
            .map(
              (metric) => `
          <div class="rv-gh-row" style="display:grid;grid-template-columns:1fr auto;column-gap:10px;align-items:center;">
            <div class="rv-gh-label" title="${metric.label}" style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${metric.label}</div>
            <div class="rv-gh-value" title="${metric.value}" style="text-align:right;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${metric.value}</div>
          </div>`
            )
            .join("");
          return `
        <section class="rv-cockpit-section" style="max-width:100%;overflow:hidden;">
          <div class="rv-cockpit-section-title">${group.title}</div>
          <div class="rv-gh-table" style="display:grid;row-gap:6px;max-width:100%;overflow:hidden;">
            ${rows}
          </div>
        </section>
      `;
        })
        .join("");
      return `<div class="rv-cockpit-grid" style="gap:12px;margin:12px 0 16px;">${sections}</div>`;
    })
    .join("");
  return rowsHtml;
}


function setHeroTitle(root, { regime, vix, fngStocks } = {}) {
  const block = root?.closest?.('[data-rv-feature="rv-market-cockpit"]');
  const title = block?.querySelector?.('.rv-native-header h2');
  if (!title) return;
  const textNode = Array.from(title.childNodes || []).find((node) => node.nodeType === Node.TEXT_NODE);
  if (textNode) {
    textNode.textContent = "Global Macro Hub ";
  }
  const driversLabel = regime?.label || "Neutral";
  const score = Number.isFinite(regime?.score) ? formatNumber(regime.score, { maximumFractionDigits: 0 }) : "N/A";
  const vixState = vix?.note || (Number.isFinite(vix?.value) ? `VIX ${formatNumber(vix.value, { maximumFractionDigits: 2 })}` : "VIX N/A");
  const stocksState = fngStocks?.label || (Number.isFinite(fngStocks?.value) ? `Stocks ${formatNumber(fngStocks.value)}` : "Stocks N/A");
  let strip = title.querySelector('.rv-cockpit-status-strip');
  if (!strip) {
    strip = document.createElement('span');
    strip.className = 'rv-cockpit-status-strip';
    strip.style.fontSize = '12px';
    strip.style.fontWeight = '400';
    strip.style.color = 'var(--rv-text-muted)';
    strip.style.marginLeft = '8px';
    const tooltip = title.querySelector('.rv-tooltip-wrapper');
    if (tooltip) {
      title.insertBefore(strip, tooltip);
    } else {
      title.appendChild(strip);
    }
  }
  strip.textContent = `Drivers: ${driversLabel} | Score: ${score} | VIX: ${vixState} | Stocks: ${stocksState}`;
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

function renderLayoutA({ regime, drivers, vix, fng, fngStocks, btc, dxy, yields, heroMetrics }) {
  const yield10y = yields?.values?.["10y"];
  const driversHtml = drivers.length ? drivers.map((d) => `<span>${d}</span>`).join("") : "No drivers yet";
  const sections = renderHeroSections(heroMetrics, "cards");
  return `
    <div class="rv-native-note">Choose a layout to compare: cards vs tables vs dashboard.</div>
    ${sections}
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

function renderLayoutB({ regime, drivers, vix, fng, fngStocks, news, btc, dxy, yields, proxies, heroMetrics }) {
  const driversHtml = drivers.length ? drivers.map((d) => `<span>${d}</span>`).join("") : "No drivers yet";
  const sections = renderHeroSectionsB(heroMetrics);

  return `
    <div class="rv-cockpit-summary">
      <div class="rv-cockpit-regime">
        <span class="rv-cockpit-label">Drivers</span>
        <strong>${regime.label || "Neutral"}</strong>
        <span class="rv-native-note">Score ${formatNumber(regime.score, { maximumFractionDigits: 0 })}</span>
      </div>
      <div class="rv-cockpit-drivers">${driversHtml}</div>
    </div>
    ${sections}
  `;
}

function renderLayoutC({ regime, drivers, vix, fng, fngStocks, btc, dxy, yields, heroMetrics }) {
  const driversHtml = drivers.length ? drivers.map((d) => `<span>${d}</span>`).join("") : "No drivers yet";
  const sections = renderHeroSections(heroMetrics, "cards");
  return `
    <div class="rv-cockpit-summary">
      <div class="rv-cockpit-regime">
        <span class="rv-cockpit-label">Regime</span>
        <strong>${regime.label || "Neutral"}</strong>
        <span class="rv-native-note">Score ${formatNumber(regime.score, { maximumFractionDigits: 0 })}</span>
      </div>
      <div class="rv-cockpit-drivers">${driversHtml}</div>
    </div>
    ${sections}
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
  setHeroTitle(root, { regime, vix: data.vix || {}, fngStocks: data.fngStocks || {} });
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
  const layout = "B";
  const metricsEnvelope = getMetricsEnvelope();
  const heroMetrics = buildHeroMetricsModel(metricsEnvelope);
  const missingNote = heroMetrics.missingIds.length
    ? `<div class="rv-native-note">Missing metrics: ${heroMetrics.missingIds.join(", ")}</div>`
    : "";
  const auditEnabled = typeof window !== "undefined" && new URLSearchParams(window.location.search).get("heroAudit") === "1";
  const auditHtml = auditEnabled
    ? renderHeroAudit(heroMetrics, window.__RV_METRICS_FETCH_COUNT || 0)
    : "";

  if (!metricsEnvelope && typeof window !== "undefined" && window.__RV_METRICS_PROMISE && !heroMetricsAwait) {
    heroMetricsAwait = true;
    window.__RV_METRICS_PROMISE
      .then((env) => {
        window.__RV_METRICS_ENVELOPE = env;
        heroMetricsAwait = false;
        render(root, payload, logger, featureId);
      })
      .catch(() => {
        heroMetricsAwait = false;
      });
  }

  root.innerHTML = `
        ${
      layout === "B"
        ? renderLayoutB({ regime, drivers, vix, fng, fngStocks, news, btc, dxy, yields, proxies, heroMetrics })
        : layout === "C"
          ? renderLayoutC({ regime, drivers, vix, fng, fngStocks, btc, dxy, yields, heroMetrics })
          : renderLayoutA({ regime, drivers, vix, fng, fngStocks, btc, dxy, yields, heroMetrics })
    }
        ${auditHtml}
    <div class="rv-native-note">
      Updated: ${new Date(data.updatedAt || resolved.ts).toLocaleTimeString()} · Freshness: ${
        resolved?.freshness || "unknown"
      } · Metrics: ${heroMetrics.missingIds.length ? `PARTIAL (${heroMetrics.totalCount - heroMetrics.missingIds.length}/${heroMetrics.totalCount})` : "OK"}
    </div>
  `;
  if (auditEnabled && layout === "B") {
    const holder = root.querySelector("[data-hero-audit-values]");
    if (holder) {
      const values = Array.from(root.querySelectorAll(".rv-gh-value"));
      const samples = values.slice(0, 5).map((node) => node.textContent.trim()).join(" | ");
      holder.textContent = `valueCells=${values.length} sample=${samples || "(none)"}`;
    }
  }

  root
    .querySelectorAll("[data-rv-field]")
    .forEach((node) => rvSetText(node, node.dataset.rvField, node.textContent));

  const status = resolved?.isStale || data.partial || heroMetrics.missingIds.length ? "PARTIAL" : "OK";
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
