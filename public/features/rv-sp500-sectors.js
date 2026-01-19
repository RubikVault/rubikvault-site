import { fetchJSON, getBindingHint } from "./utils/api.js";
import { getOrFetch } from "./utils/store.js";

const state = {
  sortKey: "rel.r1w",
  sortDir: "desc",
  lastPayload: null
};

function formatSignedPercent(value, digits = 2) {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  const sign = value > 0 ? "+" : "";
  return `${sign}${formatNumber(value, { maximumFractionDigits: digits })}%`;
}

function classifyFlow({ rel1d, rel1w, rel1m }) {
  const scores = [rel1d, rel1w, rel1m].filter((v) => typeof v === "number");
  if (!scores.length) return { label: "mixed", score: 0 };
  const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
  if (avg >= 0.5) return { label: "risk-on", score: avg };
  if (avg <= -0.5) return { label: "risk-off", score: avg };
  return { label: "mixed", score: avg };
}

function buildNarrative(rows) {
  const relRows = rows
    .map((row) => {
      const rel1w = row.rel?.r1w;
      return { row, rel1w: typeof rel1w === "number" ? rel1w : null };
    })
    .filter((x) => x.rel1w !== null);
  if (relRows.length < 4) {
    return "Sector rotation readout unavailable (insufficient relative data).";
  }
  relRows.sort((a, b) => b.rel1w - a.rel1w);
  const winner = relRows[0];
  const runner = relRows[1];
  const loser = relRows[relRows.length - 1];
  const safety = new Set(["Consumer Staples", "Utilities", "Health Care", "Real Estate"]);
  const cyclic = new Set(["Technology", "Consumer Discretionary", "Industrials", "Materials", "Financials"]);
  const winnerName = winner.row.name || winner.row.symbol;
  const loserName = loser.row.name || loser.row.symbol;
  const bucket =
    safety.has(winnerName) && (cyclic.has(loserName) || cyclic.has(loserName.replace(/\s+\(.+\)$/, "")))
      ? "defensive"
      : cyclic.has(winnerName) && safety.has(loserName)
        ? "risk-on"
        : "rotation";
  const tone =
    bucket === "defensive"
      ? "Risk-off tone: money is rotating into defensives."
      : bucket === "risk-on"
        ? "Risk-on tone: money is rotating into cyclicals/growth."
        : "Mixed rotation: leadership is changing across groups.";

  return `Over the last week, ${winnerName} is leading (vs S&P 500), while ${loserName} is lagging. ${tone} Runner-up: ${
    runner.row.name || runner.row.symbol
  }.`;
}

function computeBreadth(rows) {
  const rel1w = rows.map((r) => r.rel?.r1w).filter((v) => typeof v === "number");
  if (!rel1w.length) return null;
  const pos = rel1w.filter((v) => v > 0).length;
  const neg = rel1w.filter((v) => v < 0).length;
  return {
    pos,
    neg,
    total: rel1w.length,
    posPct: (pos / rel1w.length) * 100
  };
}

function signalLabel(row) {
  const rsi = row.relTech?.rsi;
  const stoch = row.relTech?.stochRsi;
  const macdHist = row.relTech?.macdHist;
  const rel1w = row.rel?.r1w;
  const rel1m = row.rel?.r1m;

  const hasMomentum = typeof rel1w === "number" && rel1w > 0 && typeof rel1m === "number" && rel1m > 0;
  const isOversold = typeof rsi === "number" && rsi < 35 && typeof stoch === "number" && stoch < 25;
  const isOverheated = typeof rsi === "number" && rsi > 70 && typeof stoch === "number" && stoch > 80;
  const macdUp = typeof macdHist === "number" && macdHist > 0;

  if (isOversold && macdUp) return "BUY (mean reversion)";
  if (hasMomentum && macdUp) return "LEADER";
  if (isOverheated) return "OVERHEATED";
  return "WATCH";
}

function renderRelTech(row) {
  const rsi = row.relTech?.rsi;
  const stoch = row.relTech?.stochRsi;
  const macdHist = row.relTech?.macdHist;
  const parts = [
    `RSI ${formatNumber(rsi, { maximumFractionDigits: 0 })}`,
    `Stoch ${formatNumber(stoch, { maximumFractionDigits: 0 })}`,
    `MACD ${formatNumber(macdHist, { maximumFractionDigits: 2 })}`
  ];
  return parts.join(" · ");
}

function pickLeaders(rows, n = 3) {
  const list = rows
    .map((row) => ({ row, rel1w: row.rel?.r1w }))
    .filter((x) => typeof x.rel1w === "number")
    .sort((a, b) => b.rel1w - a.rel1w);
  return {
    top: list.slice(0, n).map((x) => x.row),
    bottom: list.slice(-n).reverse().map((x) => x.row)
  };
}

function formatNumber(value, options = {}) {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  return new Intl.NumberFormat("en-US", options).format(value);
}

function sortRows(rows) {
  const key = state.sortKey;
  const dir = state.sortDir === "desc" ? -1 : 1;

  const read = (row, path) => {
    if (path === "signal") return signalLabel(row);
    if (path === "name") return row.name || row.symbol;
    const parts = String(path || "").split(".");
    let cur = row;
    for (const part of parts) {
      if (!cur) return undefined;
      cur = cur[part];
    }
    return cur;
  };

  return rows.slice().sort((a, b) => {
    const av = read(a, key);
    const bv = read(b, key);
    if (av === null || av === undefined) return 1;
    if (bv === null || bv === undefined) return -1;
    if (typeof av === "string") return av.localeCompare(bv) * dir;
    return (av - bv) * dir;
  });
}

function sortLabel(label, key) {
  if (state.sortKey !== key) return label;
  return `${label} ${state.sortDir === "asc" ? "^" : "v"}`;
}

function render(root, payload, logger) {
  const data = payload?.data || {};
  const sectors = Array.isArray(data.sectors) ? data.sectors : [];
  const missing = Array.isArray(data.missingSymbols) ? data.missingSymbols : [];
  state.lastPayload = payload;
  const partialNote =
    payload?.ok && (payload?.isStale || payload?.error?.code || missing.length)
      ? "Partial data — some sectors unavailable."
      : "";

  if (!payload?.ok) {
    const errorMessage = payload?.error?.message || "API error";
    const errorCode = payload?.error?.code || "";
    const upstreamStatus = payload?.upstream?.status;
    const upstreamSnippet = payload?.upstream?.snippet || "";
    const cacheLayer = payload?.cache?.layer || "none";
    const detailLine = [
      errorCode,
      upstreamStatus ? `Upstream ${upstreamStatus}` : "",
      `Cache ${cacheLayer}`
    ]
      .filter(Boolean)
      .join(" · ");
    const fixHint = errorCode === "BINDING_MISSING" ? getBindingHint(payload) : "";
    root.innerHTML = `
      <div class="rv-native-error">
        S&amp;P 500 Sectors konnte nicht geladen werden.<br />
        <span>${errorMessage}</span>
        ${detailLine ? `<div class="rv-native-note">${detailLine}</div>` : ""}
        ${fixHint ? `<div class="rv-native-note">${fixHint}</div>` : ""}
        ${upstreamSnippet ? `<pre class="rv-native-stack">${upstreamSnippet}</pre>` : ""}
      </div>
    `;
    logger?.setStatus("FAIL", errorCode || "API error");
    logger?.setMeta({
      updatedAt: payload?.ts,
      source: data?.source || "--",
      isStale: payload?.isStale,
      staleAgeMs: payload?.staleAgeMs
    });
    logger?.info("response_meta", {
      cache: payload?.cache || {},
      upstreamStatus: upstreamStatus ?? null
    });
    return;
  }

  const sorted = sortRows(sectors);
  const narrative = buildNarrative(sorted);
  const breadth = computeBreadth(sorted);
  const leaders = pickLeaders(sorted, 3);
  const spy = data.spy || {};
  const spyNote = spy?.ok
    ? `S&P 500 proxy (SPY): 1D ${formatSignedPercent(spy.r1d)} · 1W ${formatSignedPercent(spy.r1w)} · 1M ${formatSignedPercent(
        spy.r1m
      )}`
    : "S&P 500 proxy (SPY) unavailable.";

  root.innerHTML = `
    ${partialNote ? `<div class="rv-native-note">${partialNote}</div>` : ""}
    <div class="rv-native-note"><strong>Rotation readout:</strong> ${narrative}</div>
    <div class="rv-native-note">${spyNote}</div>
    ${
      breadth
        ? `<div class="rv-native-note">Breadth (vs S&P 500, 1W): ${breadth.pos}/${breadth.total} sectors outperforming (${formatNumber(
            breadth.posPct,
            { maximumFractionDigits: 0 }
          )}%).</div>`
        : ""
    }
    <div class="rv-native-split">
      <div>
        <div class="rv-native-note"><strong>Leaders (Rel 1W)</strong></div>
        <div class="rv-native-note">${leaders.top
          .map((r) => `${r.name || r.symbol} ${formatSignedPercent(r.rel?.r1w)}`)
          .join("<br />")}</div>
      </div>
      <div>
        <div class="rv-native-note"><strong>Laggards (Rel 1W)</strong></div>
        <div class="rv-native-note">${leaders.bottom
          .map((r) => `${r.name || r.symbol} ${formatSignedPercent(r.rel?.r1w)}`)
          .join("<br />")}</div>
      </div>
    </div>
    <table class="rv-native-table rv-table--compact">
      <thead>
        <tr>
          <th data-rv-sort="name">${sortLabel("Sector", "name")}</th>
          <th data-rv-sort="rel.r1d">${sortLabel("Rel 1D", "rel.r1d")}</th>
          <th data-rv-sort="rel.r1w">${sortLabel("Rel 1W", "rel.r1w")}</th>
          <th data-rv-sort="rel.r1m">${sortLabel("Rel 1M", "rel.r1m")}</th>
          <th data-rv-sort="relTech.rsi">${sortLabel("Rel Tech", "relTech.rsi")}</th>
          <th data-rv-sort="signal">${sortLabel("Signal", "signal")}</th>
        </tr>
      </thead>
      <tbody>
        ${sorted
          .map((row) => {
            const cls = (value) =>
              typeof value === "number" ? (value >= 0 ? "rv-native-positive" : "rv-native-negative") : "";
            const name = row.name ? `${row.name} (${row.symbol})` : row.symbol;
            const rel1d = row.rel?.r1d;
            const rel1w = row.rel?.r1w;
            const rel1m = row.rel?.r1m;
            const relRsi = row.relTech?.rsi;
            const sig = signalLabel(row);
            return `
              <tr>
                <td>${name}</td>
                <td class="${cls(rel1d)}">${formatSignedPercent(rel1d)}</td>
                <td class="${cls(rel1w)}">${formatSignedPercent(rel1w)}</td>
                <td class="${cls(rel1m)}">${formatSignedPercent(rel1m)}</td>
                <td class="${cls(relRsi)}">${renderRelTech(row)}</td>
                <td>${sig}</td>
              </tr>
            `;
          })
          .join("")}
      </tbody>
    </table>
    <div class="rv-native-note">Updated: ${new Date(data.updatedAt || payload.ts).toLocaleTimeString()}</div>
  `;

  root.querySelectorAll("[data-rv-sort]").forEach((th) => {
    th.addEventListener("click", () => {
      const key = th.getAttribute("data-rv-sort");
      if (!key) return;
      if (state.sortKey === key) {
        state.sortDir = state.sortDir === "asc" ? "desc" : "asc";
      } else {
        state.sortKey = key;
        state.sortDir = "asc";
      }
      if (state.lastPayload) {
        render(root, state.lastPayload, logger);
      }
    });
  });

  const status = payload?.isStale ? "PARTIAL" : "OK";
  logger?.setStatus(status, payload?.isStale ? "Stale data" : "Live");
  logger?.setMeta({
    updatedAt: data.updatedAt || payload.ts,
    source: data.source || "stooq",
    isStale: payload?.isStale,
    staleAgeMs: payload?.staleAgeMs
  });
  logger?.info("response_meta", {
    cache: payload?.cache || {},
    upstreamStatus: payload?.upstream?.status ?? null
  });
}

async function loadData({ featureId, traceId, logger }) {
  return fetchJSON("/sp500-sectors", { feature: featureId, traceId, logger });
}

export async function init(root, context = {}) {
  const { featureId = "rv-sp500-sectors", traceId, logger } = context;
  const data = await getOrFetch(
    "rv-sp500-sectors",
    () => loadData({ featureId, traceId, logger }),
    { ttlMs: 6 * 60 * 60 * 1000, featureId, logger }
  );
  render(root, data, logger);
}

export async function refresh(root, context = {}) {
  const { featureId = "rv-sp500-sectors", traceId, logger } = context;
  const data = await loadData({ featureId, traceId, logger });
  render(root, data, logger);
}
