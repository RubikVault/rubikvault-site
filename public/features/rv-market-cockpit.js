import { fetchJSON, getBindingHint } from "./utils/api.js";
import { getOrFetch } from "./utils/store.js";
import { resolveWithShadow } from "./utils/resilience.js";
import { rvSetText } from "./rv-dom.js";

const LAYOUT_STORAGE_KEY = "rv-market-snapshot-layout";
const DEFAULT_LAYOUT = "A";

const HERO_LABEL_TO_ID = {
  "RiskRegime": "risk.regime",
  "VIX Close": "risk.vix",
  "VIX3M Close": "risk.vix3m",
  "VIX/VIX3M": "risk.vix_ratio",
  "Curve10-2": "rates.yield_curve",
  "US2Y Yield": "rates.us2y",
  "US10Y Yield": "rates.us10y",
  "US30Y Yield": "rates.us30y",
  "SOFR": "rates.sofr",
  "EFFR": "rates.effr",
  "HY OAS": "credit.hy_oas",
  "IG OAS": "credit.ig_oas",
  "BBB OAS": "credit.bbb_oas",
  "BAA Yield": "credit.baa",
  "StressSprd": "credit.stress_spread",
  "USD Broad": "fx.dxy",
  "EURUSD": "fx.eurusd",
  "USDJPY": "fx.usdjpy",
  "GBPUSD": "fx.gbpusd",
  "USDCNY": "fx.usdcny",
  "Gold USD": "comm.gold",
  "WTI Oil": "comm.wti",
  "Brent Oil": "comm.brent",
  "Copper": "comm.copper",
  "NatGas": "comm.natgas",
  "SPX Close": "eq.sp500",
  "NDX Close": "eq.nasdaq",
  "DAX Close": "eq.dax",
  "NikkeiCls": "eq.nikkei",
  "R2K Close": "eq.russell2000",
  "BTC Price": "crypto.btc_price",
  "ETH Price": "crypto.eth_price",
  "Crypto MC": "crypto.market_cap",
  "BTC Dom": "crypto.btc_dominance",
  "DeFi TVL": "crypto.defi_tvl",
  "US CPI YoY": "macro.us_cpi",
  "US Unemp": "macro.us_unemployment",
  "US GDP": "macro.us_gdp",
  "BuffettInd": "val.buffett_indicator",
  "CAPE": "val.cape"
};

const HERO_GROUPS = [
  {
    title: "RISK & VOL",
    labels: ["RiskRegime", "VIX Close", "VIX3M Close", "VIX/VIX3M", "Curve10-2"]
  },
  {
    title: "RATES",
    labels: ["US2Y Yield", "US10Y Yield", "US30Y Yield", "SOFR", "EFFR"]
  },
  {
    title: "CREDIT",
    labels: ["HY OAS", "IG OAS", "BBB OAS", "BAA Yield", "StressSprd"]
  },
  {
    title: "USD & FX",
    labels: ["USD Broad", "EURUSD", "USDJPY", "GBPUSD", "USDCNY"]
  },
  {
    title: "COMMOD",
    labels: ["Gold USD", "WTI Oil", "Brent Oil", "Copper", "NatGas"]
  },
  {
    title: "EQUITIES",
    labels: ["SPX Close", "NDX Close", "DAX Close", "NikkeiCls", "R2K Close"]
  },
  {
    title: "CRYPTO",
    labels: ["BTC Price", "ETH Price", "Crypto MC", "BTC Dom", "DeFi TVL"]
  },
  {
    title: "MACRO & VAL",
    labels: ["US CPI YoY", "US Unemp", "US GDP", "BuffettInd", "CAPE"]
  }
];

const HERO_LABEL_INFO = {
  "RiskRegime": "RiskRegime: Composite risk-on/off regime signal — helps gauge overall market stress.",
  "VIX Close": "VIX Close: The S&P 500 implied volatility index — spikes often signal risk-off stress.",
  "VIX3M Close": "VIX3M Close: 3-month implied volatility for the S&P 500 — captures medium-term fear.",
  "VIX/VIX3M": "VIX/VIX3M: Ratio of front vs 3-month vol — above 1 can flag short-term stress.",
  "Curve10-2": "Curve10-2: 10Y minus 2Y yield spread — inversions often precede slowdowns.",
  "US2Y Yield": "US2Y Yield: 2-year Treasury yield — sensitive to Fed policy expectations.",
  "US10Y Yield": "US10Y Yield: 10-year Treasury yield — benchmark for growth and inflation outlook.",
  "US30Y Yield": "US30Y Yield: 30-year Treasury yield — reflects long-term inflation and term premium.",
  "SOFR": "SOFR: Secured Overnight Financing Rate — key U.S. overnight funding benchmark.",
  "EFFR": "EFFR: Effective Fed Funds Rate — actual policy rate anchor for money markets.",
  "HY OAS": "HY OAS: High-yield option-adjusted spread — widening signals credit stress.",
  "IG OAS": "IG OAS: Investment-grade option-adjusted spread — gauges corporate credit risk.",
  "BBB OAS": "BBB OAS: BBB-rated spread — watch for pressure in lowest IG tier.",
  "BAA Yield": "BAA Yield: Moody's Baa corporate yield — tracks broad corporate borrowing costs.",
  "StressSprd": "StressSprd: Composite credit stress spread — higher levels flag tightening conditions.",
  "USD Broad": "USD Broad: Broad dollar index — strength tightens global financial conditions.",
  "EURUSD": "EURUSD: Euro vs dollar — key global risk and rate differential signal.",
  "USDJPY": "USDJPY: Dollar vs yen — risk sentiment and yield differential gauge.",
  "GBPUSD": "GBPUSD: Pound vs dollar — reflects UK growth and policy divergence.",
  "USDCNY": "USDCNY: Dollar vs offshore yuan — China growth and capital flow barometer.",
  "Gold USD": "Gold USD: Gold price in dollars — hedge for real yields and risk.",
  "WTI Oil": "WTI Oil: U.S. crude benchmark — reflects growth and supply balance.",
  "Brent Oil": "Brent Oil: Global crude benchmark — captures international energy demand.",
  "Copper": "Copper: Industrial metal price — proxy for global growth momentum.",
  "NatGas": "NatGas: U.S. natural gas price — sensitive to weather and supply dynamics.",
  "SPX Close": "SPX Close: S&P 500 level — core U.S. equity risk appetite.",
  "NDX Close": "NDX Close: Nasdaq 100 level — growth and tech risk barometer.",
  "DAX Close": "DAX Close: German equity index — European growth pulse.",
  "NikkeiCls": "NikkeiCls: Nikkei 225 level — Japan equity and global cycle signal.",
  "R2K Close": "R2K Close: Russell 2000 level — U.S. small-cap risk appetite.",
  "BTC Price": "BTC Price: Bitcoin spot price — crypto risk sentiment anchor.",
  "ETH Price": "ETH Price: Ethereum spot price — smart-contract ecosystem health gauge.",
  "Crypto MC": "Crypto MC: Total crypto market cap — overall crypto risk appetite.",
  "BTC Dom": "BTC Dom: Bitcoin dominance — shifts between BTC and altcoin risk.",
  "DeFi TVL": "DeFi TVL: Total value locked in DeFi — gauges crypto activity and leverage.",
  "US CPI YoY": "US CPI YoY: U.S. inflation rate — drives real yields and policy.",
  "US Unemp": "US Unemp: U.S. unemployment rate — labor slack and recession risk.",
  "US GDP": "US GDP: U.S. growth rate — baseline for earnings and rates.",
  "BuffettInd": "BuffettInd: Market cap to GDP — valuation vs economic size.",
  "CAPE": "CAPE: Cyclically adjusted P/E — long-run equity valuation signal."
};

const DELTA_FIELD_CANDIDATES = [
  "changePct",
  "pct_change",
  "deltaPct",
  "dayChangePct",
  "change_percent",
  "change_1d_pct",
  "change1dPct",
  "pctChange",
  "pctChange1d",
  "pctChange1D",
  "changePct1d",
  "changePct1D",
  "changePercent",
  "changePercent1d",
  "changePercent1D",
  "percentChange",
  "delta_percent",
  "delta_pct",
  "dailyChangePct",
  "changePctDaily",
  "chgPct"
];

const PREV_VALUE_FIELDS = [
  "prevValue",
  "prev",
  "previous",
  "prior",
  "last",
  "value_prev",
  "valuePrev",
  "prev_value",
  "previousValue",
  "priorValue",
  "lastValue",
  "valueLast",
  "closePrev",
  "prevClose",
  "lastClose"
];

let heroMetricsAwait = false;
let heroTooltipOpen = null;
let heroTooltipHandlersBound = false;

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

function readNumber(value) {
  if (value === null || value === undefined) return null;
  const num = typeof value === "string" ? Number(value) : value;
  return Number.isFinite(num) ? num : null;
}

function findDeltaPercent(metric) {
  if (!metric) return null;
  for (const key of DELTA_FIELD_CANDIDATES) {
    const candidate = readNumber(metric[key]);
    if (candidate !== null) return candidate;
  }
  const nestedCandidate = readNumber(metric?.change?.pct ?? metric?.change?.pctChange ?? metric?.change?.percent);
  if (nestedCandidate !== null) return nestedCandidate;
  const current = readNumber(metric.value);
  if (current === null) return null;
  let prev = null;
  for (const key of PREV_VALUE_FIELDS) {
    prev = readNumber(metric[key]);
    if (prev !== null) break;
  }
  if (prev === null) {
    prev = readNumber(metric?.prev?.value ?? metric?.prev?.close ?? metric?.prev?.last);
  }
  if (prev === null || prev === 0) return null;
  return ((current - prev) / prev) * 100;
}

function formatDeltaPercent(metric) {
  const delta = findDeltaPercent(metric);
  if (!Number.isFinite(delta)) {
    return { text: "—", color: "var(--rv-text-muted, #64748b)" };
  }
  const rounded = Math.round(delta * 10) / 10;
  const sign = rounded > 0 ? "+" : "";
  const text = `${sign}${rounded.toFixed(1)}%`;
  const color =
    rounded > 0
      ? "var(--rv-success, #16a34a)"
      : rounded < 0
        ? "var(--rv-danger, #dc2626)"
        : "var(--rv-text-muted, #64748b)";
  return { text, color };
}

function getMetricsEnvelope() {
  if (typeof window === "undefined") return null;
  return window.__RV_METRICS_ENVELOPE || null;
}

function buildHeroMetricsModel(envelope) {
  const metricsById = envelope?.data?.metricsById || {};
  const missingIds = [];
  const groups = HERO_GROUPS.map((group) => {
    const metrics = group.labels.map((label) => {
      const id = HERO_LABEL_TO_ID[label];
      const metric = id ? metricsById[id] || null : null;
      const value = formatMetricValue(metric);
      const sub = metric?.source || metric?.provider || metric?.asOf || "N/A";
      const delta = formatDeltaPercent(metric);
      const info = HERO_LABEL_INFO[label] || `${label}: Metric detail unavailable — review data sources.`;
      const missing = !metric || value === "N/A";
      if (missing) missingIds.push(id || label);
      return {
        id: id || label,
        label,
        value,
        sub,
        deltaText: delta.text,
        deltaColor: delta.color,
        info,
        missing,
        group: group.title
      };
    });
    return { title: group.title, metrics };
  });
  const metaMissingIds = Array.isArray(envelope?.meta?.missingMetricIds)
    ? envelope.meta.missingMetricIds
    : [];
  const totalCount = 40;
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

function renderMetricRow(metric) {
  const labelText = metric.label;
  const infoText = metric.info;
  const tooltip = infoText
    ? `<span class="rv-gh-tooltip" role="tooltip" style="position:absolute;z-index:20;min-width:180px;max-width:240px;background:#111;color:#fff;padding:6px 8px;border-radius:6px;font-size:11px;line-height:1.3;box-shadow:0 6px 16px rgba(0,0,0,0.2);top:100%;left:0;margin-top:6px;display:none;">${infoText}</span>`
    : "";
  const infoButton = infoText
    ? `<button type="button" class="rv-gh-info" aria-label="Info: ${labelText}" style="display:inline-flex;align-items:center;justify-content:center;width:14px;height:14px;border-radius:50%;border:1px solid rgba(148,163,184,0.5);background:transparent;color:var(--rv-text-muted);font-size:10px;line-height:1;padding:0;cursor:pointer;flex:0 0 auto;">i</button>`
    : "";
  return `
          <tr class="rv-gh-row">
            <td class="rv-gh-label" title="${labelText}" style="width:56%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;padding:2px 8px 2px 0;">
              <div class="rv-gh-label-wrap" style="display:inline-flex;align-items:center;gap:6px;max-width:100%;position:relative;">
                <span class="rv-gh-label-text" style="min-width:0;flex:1 1 auto;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${labelText}</span>
                ${infoButton}
                ${tooltip}
              </div>
            </td>
            <td class="rv-gh-value" title="${metric.value}" style="width:26%;text-align:right;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;padding:2px 8px 2px 0;">${metric.value}</td>
            <td class="rv-gh-delta" title="${metric.deltaText}" style="width:18%;text-align:right;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;padding:2px 0;color:${metric.deltaColor};">${metric.deltaText}</td>
          </tr>`;
}

function renderHeroSectionsB(model) {
  const rowGroups = [model.groups.slice(0, 4), model.groups.slice(4, 8), model.groups.slice(8)];
  const rowsHtml = rowGroups
    .map((row) => {
      const sections = row
        .map((group) => {
          const rows = group.metrics.map((metric) => renderMetricRow(metric)).join("");
          return `
        <section class="rv-cockpit-section" style="max-width:100%;overflow:hidden;">
          <div class="rv-cockpit-section-title">${group.title}</div>
          <table class="rv-gh-table rv-native-table rv-table--compact" style="width:100%;table-layout:fixed;border-collapse:collapse;max-width:100%;overflow:hidden;">
            <colgroup>
              <col style="width:56%;">
              <col style="width:26%;">
              <col style="width:18%;">
            </colgroup>
            <tbody>
              ${rows}
            </tbody>
          </table>
        </section>
      `;
        })
        .join("");
      return `<div class="rv-cockpit-grid" style="gap:8px;margin:8px 0 12px;">${sections}</div>`;
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

function setHeroHeaderMeta(root, text) {
  const block = root?.closest?.('[data-rv-feature="rv-market-cockpit"]');
  const header = block?.querySelector?.(".rv-native-header");
  if (!header) return;
  const refreshButton = header.querySelector(".rv-native-refresh");
  let right = header.querySelector(".rv-cockpit-header-right");
  if (!right) {
    right = document.createElement("div");
    right.className = "rv-cockpit-header-right";
    right.style.display = "inline-flex";
    right.style.alignItems = "center";
    right.style.gap = "8px";
    right.style.flexWrap = "wrap";
    if (refreshButton) {
      header.insertBefore(right, refreshButton);
      right.appendChild(refreshButton);
    } else {
      header.appendChild(right);
    }
  } else if (refreshButton && !right.contains(refreshButton)) {
    right.appendChild(refreshButton);
  }
  let meta = header.querySelector(".rv-cockpit-meta");
  if (!meta) {
    meta = document.createElement("div");
    meta.className = "rv-cockpit-meta";
    meta.style.fontSize = "11px";
    meta.style.fontWeight = "400";
    meta.style.color = "var(--rv-text-muted)";
    meta.style.whiteSpace = "normal";
  }
  if (refreshButton && right.contains(refreshButton)) {
    right.insertBefore(meta, refreshButton);
  } else if (!right.contains(meta)) {
    right.appendChild(meta);
  }
  meta.textContent = text;
}

function closeHeroTooltip() {
  if (heroTooltipOpen) {
    heroTooltipOpen.style.display = "none";
    heroTooltipOpen = null;
  }
}

function attachHeroTooltips(root) {
  const wraps = root.querySelectorAll(".rv-gh-label-wrap");
  wraps.forEach((wrap) => {
    const button = wrap.querySelector(".rv-gh-info");
    const tooltip = wrap.querySelector(".rv-gh-tooltip");
    if (!button || !tooltip) return;
    const show = () => {
      if (heroTooltipOpen && heroTooltipOpen !== tooltip) {
        heroTooltipOpen.style.display = "none";
      }
      tooltip.style.display = "block";
      heroTooltipOpen = tooltip;
    };
    const hide = () => {
      if (heroTooltipOpen === tooltip) {
        tooltip.style.display = "none";
        heroTooltipOpen = null;
      }
    };
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      if (tooltip.style.display === "block") {
        hide();
      } else {
        show();
      }
    });
    button.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        if (tooltip.style.display === "block") {
          hide();
        } else {
          show();
        }
      }
    });
    wrap.addEventListener("mouseenter", show);
    wrap.addEventListener("mouseleave", hide);
    button.addEventListener("focus", show);
    button.addEventListener("blur", hide);
  });
  if (!heroTooltipHandlersBound) {
    document.addEventListener("click", closeHeroTooltip);
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        closeHeroTooltip();
      }
    });
    heroTooltipHandlersBound = true;
  }
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
  const sections = renderHeroSectionsB(heroMetrics);

  return `
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
  const auditEnabled = typeof window !== "undefined" && new URLSearchParams(window.location.search).get("heroAudit") === "1";
  const auditHtml = auditEnabled
    ? renderHeroAudit(heroMetrics, window.__RV_METRICS_FETCH_COUNT || 0)
    : "";
  const metricsStatus = heroMetrics.missingIds.length
    ? `PARTIAL (${heroMetrics.totalCount - heroMetrics.missingIds.length}/${heroMetrics.totalCount})`
    : "OK";
  const headerStatus = `Updated: ${new Date(data.updatedAt || resolved.ts).toLocaleTimeString()} · Freshness: ${
    resolved?.freshness || "unknown"
  } · Metrics: ${metricsStatus}`;

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
  `;
  if (layout === "B") {
    const body = root?.closest?.('[data-rv-feature="rv-market-cockpit"]')?.querySelector?.(".rv-native-body");
    if (body) {
      body.style.border = "none";
      body.style.boxShadow = "none";
      body.style.background = "transparent";
    }
    root.style.border = "none";
    root.style.boxShadow = "none";
    setHeroHeaderMeta(root, headerStatus);
    attachHeroTooltips(root);
  }
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
  logger?.setStatus(status, resolved?.isStale ? "Stale data" : data.partial ? "Partial" : "Live");
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
