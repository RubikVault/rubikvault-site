import { getOrFetch } from "./utils/store.js";
import { rvSetText } from "./rv-dom.js";

const HERO_LABEL_TO_ID = {
  "RiskRegime": "RISKREG",
  "VIX Close": "VIXCLS",
  "VIX3M Close": "VIX3M",
  "VIX/VIX3M": "VIXRATIO",
  "Curve10-2": "CURVE10_2",
  "US2Y Yield": "US2Y",
  "US10Y Yield": "US10Y",
  "US30Y Yield": "US30Y",
  "SOFR": "SOFR",
  "EFFR": "EFFR",
  "HY OAS": "HY_OAS",
  "IG OAS": "IG_OAS",
  "BBB OAS": "BBB_OAS",
  "BAA Yield": "BAA_YLD",
  "StressSprd": "STRESS",
  "USD Broad": "USD_BRD",
  "EURUSD": "EURUSD",
  "USDJPY": "USDJPY",
  "Gold USD": "GOLD",
  "WTI Oil": "WTI",
  "SPY": "SPY",
  "QQQ": "QQQ",
  "IWM": "IWM",
  "EWG": "EWG",
  "EWJ": "EWJ",
  "HY OAS 1M": "HY_OAS_1M",
  "Curve 1M": "CURVE_1M",
  "SPY 20D": "SPY_20D",
  "SPY 200D": "SPY_200D",
  "Vol Term": "VOL_TERM",
  "BTC Price": "BTCUSD",
  "ETH Price": "ETHUSD",
  "Crypto MC": "CRY_MCAP",
  "BTC Dom": "BTC_DOM",
  "Stbl MC": "STBL_MCAP",
  "US CPI YoY": "CPI_YOY",
  "US Unemp": "UNRATE",
  "GDP QoQ": "GDP_QOQ",
  "BuffettInd": "BUFFETT",
  "CAPE": "CAPE"
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
    title: "FX & CMDS",
    labels: ["USD Broad", "EURUSD", "USDJPY", "Gold USD", "WTI Oil"]
  },
  {
    title: "EQUITIES",
    labels: ["SPY", "QQQ", "IWM", "EWG", "EWJ"]
  },
  {
    title: "BREADTH",
    labels: ["HY OAS 1M", "Curve 1M", "SPY 20D", "SPY 200D", "Vol Term"]
  },
  {
    title: "CRYPTO",
    labels: ["BTC Price", "ETH Price", "Crypto MC", "BTC Dom", "Stbl MC"]
  },
  {
    title: "MACRO & VAL",
    labels: ["US CPI YoY", "US Unemp", "GDP QoQ", "BuffettInd", "CAPE"]
  }
];

const HERO_LABEL_INFO = {
  "RiskRegime": "Composite risk regime from volatility and breadth. Helps judge risk-on vs risk-off conditions.",
  "VIX Close": "S&P 500 implied volatility index level. Rising VIX often signals stress and tighter risk appetite.",
  "VIX3M Close": "3-month implied volatility expectation. Shows medium-term uncertainty beyond short-term noise.",
  "VIX/VIX3M": "Term-structure ratio (front vs 3M vol). High values can indicate near-term fear.",
  "Curve10-2": "US 10Y minus 2Y yield spread. Inversions often precede slowdowns and risk repricing.",
  "US2Y Yield": "2-year Treasury yield. Sensitive to Fed policy expectations and near-term growth/inflation.",
  "US10Y Yield": "10-year Treasury yield. Key discount rate for equities and mortgages; reflects growth/inflation outlook.",
  "US30Y Yield": "30-year Treasury yield. Long-duration rate that affects housing/valuations and term premium.",
  "SOFR": "Secured Overnight Financing Rate. Proxy for short-term funding conditions in USD.",
  "EFFR": "Effective Federal Funds Rate. The Fed’s policy anchor for the short end of the curve.",
  "HY OAS": "High-yield option-adjusted spread. Wider spreads imply rising default risk and risk-off credit conditions.",
  "IG OAS": "Investment-grade option-adjusted spread. Tracks corporate funding stress for higher-quality issuers.",
  "BBB OAS": "BBB spread (lowest IG tier). Early-warning gauge for credit deterioration before HY moves.",
  "BAA Yield": "Moody’s Baa corporate yield. Useful long history; reflects borrowing costs for mid-grade corporates.",
  "StressSprd": "Composite credit stress spread. Summarizes broad credit risk premium in one gauge.",
  "USD Broad": "Broad trade-weighted USD index. Strong USD tightens global financial conditions.",
  "EURUSD": "Euro vs USD exchange rate. Impacts global liquidity and risk sentiment.",
  "USDJPY": "USD vs JPY rate. Often reflects risk appetite and relative rate differentials.",
  "SPY": "SPY ETF price. Proxy for the S&P 500 equity benchmark.",
  "QQQ": "QQQ ETF price. Proxy for the Nasdaq 100 growth index.",
  "IWM": "IWM ETF price. Proxy for US small-cap equities.",
  "EWG": "EWG ETF price. Proxy for German equities.",
  "EWJ": "EWJ ETF price. Proxy for Japanese equities.",
  "HY OAS 1M": "30-day change in HY OAS. Rising values signal widening credit stress.",
  "Curve 1M": "30-day change in the 10Y-2Y curve. Big moves flag shifts in rate expectations.",
  "SPY 20D": "20-day SPY return. Short-term trend proxy for equity momentum.",
  "SPY 200D": "200-day SPY return. Long-horizon trend proxy for equities.",
  "Vol Term": "VIX3M minus VIX. Positive values imply calmer near-term volatility.",
  "Gold USD": "Gold price in USD. Hedge vs real-rate drops, stress, and USD debasement narratives.",
  "WTI Oil": "WTI crude price. Key input for inflation and growth expectations.",
  "BTC Price": "Bitcoin spot price. High-beta liquidity proxy; often leads risk appetite shifts.",
  "ETH Price": "Ethereum spot price. Crypto risk-on proxy with ecosystem/activity sensitivity.",
  "Crypto MC": "Total crypto market cap. Broad measure of crypto risk appetite.",
  "BTC Dom": "Bitcoin dominance share. Rising dominance can signal flight to quality within crypto.",
  "Stbl MC": "Stablecoin market cap proxy. Tracks on-chain liquidity availability.",
  "US CPI YoY": "Year-over-year consumer inflation. Drives rate expectations and real yield regime.",
  "US Unemp": "US unemployment rate. Key recession/risk signal and consumer health proxy.",
  "GDP QoQ": "Quarterly US GDP growth. Signals the macro backdrop for earnings and policy.",
  "BuffettInd": "Market cap to GDP proxy. Rough valuation regime gauge versus economic size.",
  "CAPE": "Cyclically adjusted P/E. Long-horizon valuation indicator; high CAPE implies lower forward returns on average."
};

const EMPTY_VALUE = "—";
const COLOR_MUTED = "var(--rv-text-muted, #64748b)";
const COLOR_POSITIVE = "var(--rv-success, #16a34a)";
const COLOR_NEGATIVE = "var(--rv-danger, #dc2626)";

let heroTooltipKey = null;
let heroTooltipRoot = null;
let heroTooltipHandlersBound = false;
let heroDebugLogged = false;

function formatNumber(value, options = {}) {
  if (!Number.isFinite(value)) return EMPTY_VALUE;
  return new Intl.NumberFormat("en-US", options).format(value);
}

function toNumber(value) {
  if (value === null || value === undefined) return null;
  const num = typeof value === "string" ? Number(value) : value;
  return Number.isFinite(num) ? num : null;
}

function formatMetricValue(metric) {
  if (!metric) return EMPTY_VALUE;
  const rawValue = metric.value;
  if (rawValue === null || rawValue === undefined) return EMPTY_VALUE;
  if (typeof rawValue === "string") {
    const trimmed = rawValue.trim();
    return trimmed ? trimmed : EMPTY_VALUE;
  }
  if (typeof rawValue !== "number" || !Number.isFinite(rawValue)) return EMPTY_VALUE;
  const unit = String(metric.unit || "").toLowerCase();
  if (unit === "%") return `${formatNumber(rawValue, { maximumFractionDigits: 2 })}%`;
  if (unit === "bp") return `${Math.round(rawValue)} bp`;
  if (unit === "score") return formatNumber(rawValue, { maximumFractionDigits: 0 });
  if (unit === "ratio") return formatNumber(rawValue, { maximumFractionDigits: 2 });
  if (unit === "index") return formatNumber(rawValue, { maximumFractionDigits: 2 });
  if (unit === "pts") return formatNumber(rawValue, { maximumFractionDigits: 2 });
  if (unit === "usd") {
    const abs = Math.abs(rawValue);
    if (abs >= 1_000_000_000_000) return `$${(rawValue / 1_000_000_000_000).toFixed(2)}T`;
    if (abs >= 1_000_000_000) return `$${(rawValue / 1_000_000_000).toFixed(2)}B`;
    if (abs >= 1_000_000) return `$${(rawValue / 1_000_000).toFixed(2)}M`;
    if (abs >= 1_000) return `$${(rawValue / 1_000).toFixed(2)}K`;
    return `$${rawValue.toFixed(2)}`;
  }
  return formatNumber(rawValue, { maximumFractionDigits: 2 });
}

function formatMetricChange(change, changeUnit) {
  if (!Number.isFinite(change)) {
    return { text: EMPTY_VALUE, color: COLOR_MUTED };
  }
  const unit = String(changeUnit || "").toLowerCase();
  let digits = 2;
  if (unit === "bp") digits = 0;
  else if (unit === "%") digits = 1;
  else if (unit === "pts") digits = 2;
  const rounded =
    digits === 0 ? Math.round(change) : Math.round(change * Math.pow(10, digits)) / Math.pow(10, digits);
  const sign = rounded > 0 ? "+" : "";
  const formatted = formatNumber(rounded, {
    maximumFractionDigits: digits,
    minimumFractionDigits: digits
  });
  if (formatted === EMPTY_VALUE) return { text: EMPTY_VALUE, color: COLOR_MUTED };
  let suffix = "";
  if (unit === "%") suffix = "%";
  else if (unit === "bp") suffix = " bp";
  else if (unit === "pts") suffix = " pts";
  else if (unit) suffix = ` ${unit}`;
  const text = `${sign}${formatted}${suffix}`;
  const color = rounded > 0 ? COLOR_POSITIVE : rounded < 0 ? COLOR_NEGATIVE : COLOR_MUTED;
  return { text, color };
}

function classifyRiskRegime(score) {
  if (!Number.isFinite(score)) return EMPTY_VALUE;
  if (score >= 65) return "Risk-off";
  if (score <= 35) return "Risk-on";
  return "Neutral";
}

function buildHeroMetricsModel(snapshot) {
  const metricsById = snapshot?.data || {};
  const missingIds = [];
  const groups = HERO_GROUPS.map((group) => {
    const metrics = group.labels.map((label) => {
      const id = HERO_LABEL_TO_ID[label];
      const metric = id ? metricsById[id] || null : null;
      const valueText = formatMetricValue(metric);
      const change = formatMetricChange(metric?.change, metric?.changeUnit);
      const info = HERO_LABEL_INFO[label] || "Explanation unavailable.";
      // Consider metric "present" even if value is null (for display purposes)
      // Missing means the metric object itself doesn't exist
      const missing = !metric;
      if (missing) missingIds.push(id || label);
      return {
        id: id || label,
        label,
        valueText,
        changeText: change.text,
        changeColor: change.color,
        info,
        missing,
        stale: Boolean(metric?.stale),
        staleReason: metric?.staleReason || null,
        group: group.title
      };
    });
    return { title: group.title, metrics };
  });
  const totalCount = 40;
  const counts = snapshot?.meta?.counts || {};
  return {
    groups,
    flat: groups.flatMap((group) => group.metrics),
    missingIds,
    totalCount,
    counts
  };
}


function renderHeroAudit(model, fetchCount) {
  const missingLine = model.missingIds.length ? model.missingIds.join(", ") : "none";
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
            <td class="rv-cell-num" style="text-align:right;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${metric.valueText}</td>
          </tr>`
            )
            .join("");
          const cards = group.metrics
            .map((metric) => metricCard(metric.label, metric.valueText, ""))
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
  const infoText = metric.info || "Explanation unavailable.";
  const staleDot = metric.stale
    ? `<span class="rv-gh-stale" title="${metric.staleReason || "stale"}" style="display:inline-block;width:6px;height:6px;border-radius:999px;background:var(--rv-warning, #f59e0b);"></span>`
    : "";
  return `
          <div class="rv-gh-row" data-label="${labelText}" style="display:grid;grid-template-columns:1fr auto auto;column-gap:10px;align-items:center;position:relative;">
            <div class="rv-gh-label" title="${labelText}" style="min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;display:flex;align-items:center;gap:6px;">
              <span class="rv-gh-label-text" style="min-width:0;flex:1 1 auto;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${labelText}</span>
              ${staleDot}
              <button type="button" class="rv-gh-info" aria-label="Info: ${labelText}" style="display:inline-flex;align-items:center;justify-content:center;width:14px;height:14px;border-radius:50%;border:1px solid rgba(148,163,184,0.5);background:transparent;color:var(--rv-text-muted);font-size:10px;line-height:1;padding:0;cursor:pointer;flex:0 0 auto;">i</button>
              <span class="rv-gh-tooltip" role="tooltip" style="position:absolute;z-index:20;min-width:220px;max-width:260px;background:#000;color:#f8fafc;padding:8px 10px;border-radius:8px;font-size:11px;line-height:1.35;box-shadow:0 8px 20px rgba(0,0,0,0.35);top:100%;left:0;margin-top:6px;display:none;">${infoText}</span>
            </div>
            <div class="rv-gh-value" title="${metric.valueText}" style="text-align:right;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${metric.valueText}</div>
            <div class="rv-gh-delta" title="${metric.changeText}" style="text-align:right;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;color:${metric.changeColor};">${metric.changeText}</div>
          </div>`;
}

function renderHeroSectionsB(model) {
  const rowGroups = [model.groups.slice(0, 4), model.groups.slice(4, 8), model.groups.slice(8)];
  const rowsHtml = rowGroups
    .map((row) => {
      const sections = row
        .map((group) => {
          const rows = group.metrics.map((metric) => renderMetricRow(metric)).join("");
          return `
        <section class="rv-cockpit-section" style="max-width:100%;overflow:visible;">
          <div class="rv-cockpit-section-title">${group.title}</div>
          <div class="rv-gh-table" style="display:grid;row-gap:6px;max-width:100%;overflow:visible;">
            ${rows}
          </div>
        </section>
      `;
        })
        .join("");
      return `<div class="rv-cockpit-grid" style="gap:8px;margin:8px 0 12px;">${sections}</div>`;
    })
    .join("");
  return rowsHtml;
}


function setHeroTitle(root, { driversLabel, scoreText, vixText, stocksText } = {}) {
  const block = root?.closest?.('[data-rv-feature="rv-market-cockpit"]');
  const title = block?.querySelector?.('.rv-native-header h2');
  if (!title) return;
  const textNode = Array.from(title.childNodes || []).find((node) => node.nodeType === Node.TEXT_NODE);
  if (textNode) {
    textNode.textContent = "Global Macro Hub ";
  }
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
  const drivers = driversLabel || EMPTY_VALUE;
  const score = scoreText || EMPTY_VALUE;
  const vix = vixText || EMPTY_VALUE;
  const stocks = stocksText || EMPTY_VALUE;
  strip.textContent = `Drivers: ${drivers} | Score: ${score} | VIX: ${vix} | Stocks: ${stocks}`;
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
  if (!heroTooltipRoot) return;
  heroTooltipRoot.querySelectorAll(".rv-gh-tooltip").forEach((tooltip) => {
    tooltip.style.display = "none";
  });
  heroTooltipKey = null;
}

function attachHeroTooltips(root) {
  heroTooltipRoot = root;
  const rows = root.querySelectorAll(".rv-gh-row");
  rows.forEach((row) => {
    const label = row.getAttribute("data-label") || "";
    const button = row.querySelector(".rv-gh-info");
    const tooltip = row.querySelector(".rv-gh-tooltip");
    if (!button || !tooltip) return;
    const toggle = () => {
      const isOpen = tooltip.style.display === "block";
      if (isOpen) {
        closeHeroTooltip();
        return;
      }
      closeHeroTooltip();
      tooltip.style.display = "block";
      heroTooltipKey = label;
    };
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      toggle();
    });
    button.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        toggle();
      }
    });
  });
  if (!heroTooltipHandlersBound) {
    document.addEventListener("click", (event) => {
      if (event.target.closest(".rv-gh-info") || event.target.closest(".rv-gh-tooltip")) return;
      closeHeroTooltip();
    });
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

function renderLayoutB({ heroMetrics }) {
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
  const snapshot = payload?.snapshot || payload?.data || null;
  if (!payload?.ok || !snapshot || !snapshot.data) {
    const errorMessage = payload?.error?.message || "Snapshot unavailable";
    const errorCode = payload?.error?.code || "NO_DATA";
    root.innerHTML = `
      <div class="rv-native-error">
        Global Macro Hub konnte nicht geladen werden.<br />
        <span>${errorMessage}</span>
      </div>
    `;
    logger?.setStatus("FAIL", errorCode);
    logger?.setMeta({
      updatedAt: payload?.ts || null,
      source: "macro-hub",
      isStale: true,
      staleAgeMs: null
    });
    return;
  }

  const heroMetrics = buildHeroMetricsModel(snapshot);
  const auditEnabled =
    typeof window !== "undefined" &&
    new URLSearchParams(window.location.search).get("heroAudit") === "1";
  const debugEnabled =
    auditEnabled ||
    (typeof window !== "undefined" &&
      new URLSearchParams(window.location.search).get("debug") === "1");
  const auditHtml = auditEnabled ? renderHeroAudit(heroMetrics, 0) : "";

  const counts = heroMetrics.counts || {};
  // Count metrics with actual values (not null)
  const metricsById = snapshot?.data || {};
  const metricsWithValues = heroMetrics.flat.filter(m => {
    const metric = metricsById[m.id];
    return metric && metric.value !== null && metric.value !== undefined;
  }).length;
  const freshCount = Number.isFinite(counts.freshOrDerivedOk)
    ? counts.freshOrDerivedOk
    : metricsWithValues;
  const metricsStatus =
    freshCount >= heroMetrics.totalCount
      ? "OK"
      : `PARTIAL (${freshCount}/${heroMetrics.totalCount})`;
  const asOfDate = snapshot?.meta?.asOfDate || snapshot?.meta?.asOf || EMPTY_VALUE;
  const freshness = snapshot?.meta?.freshness?.status || "unknown";
  const headerStatus = `Data as of ${asOfDate} · Freshness: ${freshness} · Metrics: ${metricsStatus}`;

  const riskScore = toNumber(snapshot?.data?.RISKREG?.value);
  const driversLabel = classifyRiskRegime(riskScore);
  const scoreText = Number.isFinite(riskScore)
    ? formatNumber(riskScore, { maximumFractionDigits: 0 })
    : EMPTY_VALUE;
  const vixValue = toNumber(snapshot?.data?.VIXCLS?.value);
  const vixText = Number.isFinite(vixValue)
    ? formatNumber(vixValue, { maximumFractionDigits: 2 })
    : EMPTY_VALUE;
  const spyMetric = snapshot?.data?.SPY || null;
  const stocksChange = toNumber(spyMetric?.change);
  const stocksChangeText = formatMetricChange(stocksChange, spyMetric?.changeUnit || "%").text;
  const stocksValueText = formatMetricValue(spyMetric);
  const stocksText =
    stocksChangeText !== EMPTY_VALUE
      ? `SPY ${stocksChangeText}`
      : stocksValueText !== EMPTY_VALUE
        ? `SPY ${stocksValueText}`
        : EMPTY_VALUE;

  setHeroTitle(root, { driversLabel, scoreText, vixText, stocksText });

  root.innerHTML = `
    ${renderLayoutB({ heroMetrics })}
    ${auditHtml}
  `;

  const body = root?.closest?.('[data-rv-feature="rv-market-cockpit"]')?.querySelector?.(".rv-native-body");
  if (body) {
    body.style.border = "none";
    body.style.boxShadow = "none";
    body.style.background = "transparent";
    body.style.padding = "0";
    body.classList.remove("rv-card");
  }
  root.style.border = "none";
  root.style.boxShadow = "none";
  setHeroHeaderMeta(root, headerStatus);
  attachHeroTooltips(root);

  if (debugEnabled && !heroDebugLogged) {
    heroDebugLogged = true;
    console.info("[Global Macro Hub] render path: public/features/rv-market-cockpit.js");
  }

  if (auditEnabled) {
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

  const status = freshCount >= heroMetrics.totalCount ? "OK" : "PARTIAL";
  logger?.setStatus(status, status === "OK" ? "Live" : "Partial");
  logger?.setMeta({
    updatedAt: snapshot?.meta?.updatedAt || snapshot?.meta?.asOfDate || null,
    source: "macro-hub",
    isStale: freshness !== "fresh",
    staleAgeMs: null
  });
}

async function loadData() {
  // Try main snapshot first
  const url = "/data/snapshots/macro-hub.json";
  try {
    const response = await fetch(url, { cache: "no-store" });
    const text = await response.text();
    if (response.ok && text) {
      const snapshot = JSON.parse(text);
      if (snapshot && typeof snapshot === "object") {
        return { ok: true, snapshot, ts: snapshot?.meta?.updatedAt || new Date().toISOString() };
      }
    }
    // If main snapshot fails, try lastGood fallback
    const lastGoodUrl = "/data/snapshots/macro-hub.lastgood.json";
    try {
      const lastGoodResponse = await fetch(lastGoodUrl, { cache: "no-store" });
      const lastGoodText = await lastGoodResponse.text();
      if (lastGoodResponse.ok && lastGoodText) {
        const lastGoodSnapshot = JSON.parse(lastGoodText);
        if (lastGoodSnapshot && typeof lastGoodSnapshot === "object") {
          // Mark as stale since we're using lastGood
          lastGoodSnapshot.meta = lastGoodSnapshot.meta || {};
          lastGoodSnapshot.meta.freshness = { status: "stale", reason: "lastgood_fallback" };
          return { 
            ok: true, 
            snapshot: lastGoodSnapshot, 
            ts: lastGoodSnapshot?.meta?.updatedAt || new Date().toISOString(),
            isLastGood: true
          };
        }
      }
    } catch (lastGoodError) {
      // Ignore lastGood fetch errors, fall through to main error
    }
    // Both failed
      return {
        ok: false,
        ts: new Date().toISOString(),
        error: { code: `HTTP_${response.status}`, message: `HTTP ${response.status}` }
      };
  } catch (error) {
    // Try lastGood on network error too
    try {
      const lastGoodUrl = "/data/snapshots/macro-hub.lastgood.json";
      const lastGoodResponse = await fetch(lastGoodUrl, { cache: "no-store" });
      const lastGoodText = await lastGoodResponse.text();
      if (lastGoodResponse.ok && lastGoodText) {
        const lastGoodSnapshot = JSON.parse(lastGoodText);
        if (lastGoodSnapshot && typeof lastGoodSnapshot === "object") {
          lastGoodSnapshot.meta = lastGoodSnapshot.meta || {};
          lastGoodSnapshot.meta.freshness = { status: "stale", reason: "lastgood_fallback" };
      return {
            ok: true, 
            snapshot: lastGoodSnapshot, 
            ts: lastGoodSnapshot?.meta?.updatedAt || new Date().toISOString(),
            isLastGood: true
          };
        }
      }
    } catch (lastGoodError) {
      // Ignore
    }
    return {
      ok: false,
      ts: new Date().toISOString(),
      error: { code: "FETCH_FAILED", message: error?.message || "Snapshot fetch failed" }
    };
  }
}

export async function init(root, context = {}) {
  const { featureId = "rv-market-cockpit", logger } = context;
  const data = await getOrFetch(
    "rv-market-cockpit",
    () => loadData(),
    { ttlMs: 15 * 60 * 1000, featureId, logger }
  );
  render(root, data, logger, featureId);
}

export async function refresh(root, context = {}) {
  const { featureId = "rv-market-cockpit", logger } = context;
  const data = await loadData();
  render(root, data, logger, featureId);
}
