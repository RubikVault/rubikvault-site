import { fetchJSON, getBindingHint } from "./utils/api.js";
import { getOrFetch } from "./utils/store.js";
import { resolveWithShadow } from "./utils/resilience.js";
import { rvSetText } from "./rv-dom.js";

function formatNumber(value, options = {}) {
  if (value === null || value === undefined || Number.isNaN(value)) return "N/A";
  return new Intl.NumberFormat("en-US", options).format(value);
}

function formatPercent(value, digits = 2) {
  if (value === null || value === undefined || Number.isNaN(value)) return "N/A";
  return `${formatNumber(value, { maximumFractionDigits: digits })}%`;
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
  const eth = data.eth || {};
  const sol = data.sol || {};
  const xrp = data.xrp || {};
  const dxy = data.dxy || {};
  const yields = data.yields || {};
  const yieldValues = yields.values || {};
  const macro = data.macroSummary || {};
  const macroRates = Array.isArray(macro.rates) ? macro.rates : [];
  const macroFx = Array.isArray(macro.fx) ? macro.fx : [];
  const macroCpi = Array.isArray(macro.cpi) ? macro.cpi : [];
  const sectorTop = data.sectorPerformance?.top || [];
  const sectorBottom = data.sectorPerformance?.bottom || [];

  root.innerHTML = `
    ${partialNote ? `<div class="rv-native-note">${partialNote}</div>` : ""}
    <div class="rv-cockpit-summary">
      <div class="rv-cockpit-regime">
        <span class="rv-cockpit-label">Regime</span>
        <strong data-rv-field="regime-label">${regime.label || "Neutral"}</strong>
        <span class="rv-native-note" data-rv-field="regime-score">Score ${formatNumber(regime.score, { maximumFractionDigits: 0 })}</span>
      </div>
      <div class="rv-cockpit-drivers">
        ${drivers.length ? drivers.map((driver) => `<span>${driver}</span>`).join("") : "No drivers yet"}
      </div>
    </div>
    <div class="rv-native-note">Why it matters: regime blends volatility, sentiment, and narrative risk.</div>
    ${
      sectorTop.length || sectorBottom.length
        ? `<div class="rv-native-note">Sector performance (1D/1W/1M)</div>
           <table class="rv-native-table rv-table--compact">
             <thead>
               <tr><th>Sector</th><th>1D</th><th>1W</th><th>1M</th><th>Rank</th></tr>
             </thead>
             <tbody>
               ${sectorTop
                 .map(
                   (sector) => `
                 <tr>
                   <td>${sector.name || sector.symbol}</td>
                   <td>${formatPercent(sector.r1d)}</td>
                   <td>${formatPercent(sector.r1w)}</td>
                   <td>${formatPercent(sector.r1m)}</td>
                   <td class="rv-native-positive">Top</td>
                 </tr>
               `
                 )
                 .join("")}
               ${sectorBottom
                 .map(
                   (sector) => `
                 <tr>
                   <td>${sector.name || sector.symbol}</td>
                   <td>${formatPercent(sector.r1d)}</td>
                   <td>${formatPercent(sector.r1w)}</td>
                   <td>${formatPercent(sector.r1m)}</td>
                   <td class="rv-native-negative">Bottom</td>
                 </tr>
               `
                 )
                 .join("")}
             </tbody>
           </table>`
        : `<div class="rv-native-note">Sector performance unavailable (see Block 13).</div>`
    }
    <table class="rv-native-table rv-table--compact">
      <thead>
        <tr>
          <th>Signal</th>
          <th>Value</th>
          <th>Source</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td>VIX <span class="rv-tooltip-wrapper"><span class="rv-tooltip-icon" aria-label="Information">ⓘ</span><span class="rv-tooltip-content"><strong>VIX (Volatility Index)</strong><br>Source: CBOE<br>Update: EOD<br>Context: US market close</span></span></td>
          <td data-rv-field="vix">${formatNumber(vix.value, { maximumFractionDigits: 2 })}</td>
          <td>${vix.note || vix.source || "N/A"}</td>
        </tr>
        <tr>
          <td>Crypto F&amp;G <span class="rv-tooltip-wrapper"><span class="rv-tooltip-icon" aria-label="Information">ⓘ</span><span class="rv-tooltip-content"><strong>Fear & Greed Index (Crypto)</strong><br>Source: Alternative.me<br>Update: Daily<br>Context: Crypto market sentiment</span></span></td>
          <td data-rv-field="fng-crypto">${formatNumber(fng.value)} ${fng.label ? `(${fng.label})` : ""}</td>
          <td>${fng.source || "N/A"}</td>
        </tr>
        <tr>
          <td>Stocks F&amp;G <span class="rv-tooltip-wrapper"><span class="rv-tooltip-icon" aria-label="Information">ⓘ</span><span class="rv-tooltip-content"><strong>Fear & Greed Index (Stocks)</strong><br>Source: CNN<br>Update: Daily<br>Context: US equity market sentiment</span></span></td>
          <td data-rv-field="fng-stocks">${formatNumber(fngStocks.value)} ${fngStocks.label ? `(${fngStocks.label})` : ""}</td>
          <td>${fngStocks.source || "N/A"}</td>
        </tr>
        <tr>
          <td>News Sentiment <span class="rv-tooltip-wrapper"><span class="rv-tooltip-icon" aria-label="Information">ⓘ</span><span class="rv-tooltip-content"><strong>News Sentiment Score</strong><br>Source: Marketaux<br>Update: 15m<br>Context: Aggregated news tone</span></span></td>
          <td data-rv-field="news-sentiment">${formatNumber(news.score, { maximumFractionDigits: 2 })} ${news.label || ""}</td>
          <td>${news.source || "N/A"}</td>
        </tr>
        <tr>
          <td>BTC <span class="rv-tooltip-wrapper"><span class="rv-tooltip-icon" aria-label="Information">ⓘ</span><span class="rv-tooltip-content"><strong>Bitcoin</strong><br>Source: CoinGecko<br>Update: 2m<br>Context: Crypto 24/7 snapshot</span></span></td>
          <td data-rv-field="btc-price">$${formatNumber(btc.price, { maximumFractionDigits: 0 })} (${formatPercent(
    btc.changePercent
  )})</td>
          <td>${btc.source || "N/A"}</td>
        </tr>
        <tr>
          <td>ETH <span class="rv-tooltip-wrapper"><span class="rv-tooltip-icon" aria-label="Information">ⓘ</span><span class="rv-tooltip-content"><strong>Ethereum</strong><br>Source: CoinGecko<br>Update: 2m<br>Context: Crypto 24/7 snapshot</span></span></td>
          <td data-rv-field="eth-price">$${formatNumber(eth.price, { maximumFractionDigits: 0 })} (${formatPercent(
    eth.changePercent
  )})</td>
          <td>${eth.source || "N/A"}</td>
        </tr>
        <tr>
          <td>SOL <span class="rv-tooltip-wrapper"><span class="rv-tooltip-icon" aria-label="Information">ⓘ</span><span class="rv-tooltip-content"><strong>Solana</strong><br>Source: CoinGecko<br>Update: 2m<br>Context: Crypto 24/7 snapshot</span></span></td>
          <td data-rv-field="sol-price">$${formatNumber(sol.price, { maximumFractionDigits: 2 })} (${formatPercent(
    sol.changePercent
  )})</td>
          <td>${sol.source || "N/A"}</td>
        </tr>
        <tr>
          <td>XRP <span class="rv-tooltip-wrapper"><span class="rv-tooltip-icon" aria-label="Information">ⓘ</span><span class="rv-tooltip-content"><strong>XRP</strong><br>Source: CoinGecko<br>Update: 2m<br>Context: Crypto 24/7 snapshot</span></span></td>
          <td data-rv-field="xrp-price">$${formatNumber(xrp.price, { maximumFractionDigits: 3 })} (${formatPercent(
    xrp.changePercent
  )})</td>
          <td>${xrp.source || "N/A"}</td>
        </tr>
        <tr>
          <td>DXY <span class="rv-tooltip-wrapper"><span class="rv-tooltip-icon" aria-label="Information">ⓘ</span><span class="rv-tooltip-content"><strong>US Dollar Index</strong><br>Source: Yahoo Finance<br>Update: EOD<br>Context: US market close</span></span></td>
          <td data-rv-field="dxy">${formatNumber(dxy.value, { maximumFractionDigits: 2 })} (${formatPercent(
    dxy.changePercent
  )})</td>
          <td>${dxy.source || "N/A"}</td>
        </tr>
        <tr>
          <td>USD (UUP)</td>
          <td data-rv-field="proxy-usd">${formatNumber(proxies.usd?.price, { maximumFractionDigits: 2 })}</td>
          <td><span class="rv-pill-proxy">Proxy</span> ${proxies.usd?.symbol || "UUP"}</td>
        </tr>
        <tr>
          <td>Oil (USO)</td>
          <td data-rv-field="proxy-oil">${formatNumber(proxies.oil?.price, { maximumFractionDigits: 2 })}</td>
          <td><span class="rv-pill-proxy">Proxy</span> ${proxies.oil?.symbol || "USO"}</td>
        </tr>
        <tr>
          <td>Gold (GLD)</td>
          <td data-rv-field="proxy-gold">${formatNumber(proxies.gold?.price, { maximumFractionDigits: 2 })}</td>
          <td><span class="rv-pill-proxy">Proxy</span> ${proxies.gold?.symbol || "GLD"}</td>
        </tr>
        <tr>
          <td>US Yields 1Y</td>
          <td data-rv-field="yield-1y">${formatNumber(yieldValues["1y"], { maximumFractionDigits: 2 })}</td>
          <td>${yields.source || "US Treasury"}</td>
        </tr>
        <tr>
          <td>US Yields 2Y</td>
          <td data-rv-field="yield-2y">${formatNumber(yieldValues["2y"], { maximumFractionDigits: 2 })}</td>
          <td>${yields.source || "US Treasury"}</td>
        </tr>
        <tr>
          <td>US Yields 5Y</td>
          <td data-rv-field="yield-5y">${formatNumber(yieldValues["5y"], { maximumFractionDigits: 2 })}</td>
          <td>${yields.source || "US Treasury"}</td>
        </tr>
        <tr>
          <td>US Yields 10Y</td>
          <td data-rv-field="yield-10y">${formatNumber(yieldValues["10y"], { maximumFractionDigits: 2 })}</td>
          <td>${yields.source || "US Treasury"}</td>
        </tr>
        <tr>
          <td>US Yields 30Y <span class="rv-tooltip-wrapper"><span class="rv-tooltip-icon" aria-label="Information">ⓘ</span><span class="rv-tooltip-content"><strong>US Treasury 30-Year Yield</strong><br>Source: US Treasury<br>Update: EOD<br>Context: US market close</span></span></td>
          <td data-rv-field="yield-30y">${formatNumber(yieldValues["30y"], { maximumFractionDigits: 2 })}</td>
          <td>${yields.source || "US Treasury"}</td>
        </tr>
        ${
          macroRates.length || macroFx.length || macroCpi.length
            ? `${macroRates
                .map(
                  (item) => `
          <tr>
            <td>${item.label}</td>
            <td>${formatNumber(item.value, { maximumFractionDigits: 2 })}</td>
            <td>${item.source || "macro-rates"}</td>
          </tr>`
                )
                .join("")}
        ${macroFx
          .map(
            (item) => `
          <tr>
            <td>${item.label}</td>
            <td>${formatNumber(item.value, { maximumFractionDigits: 4 })}</td>
            <td>${item.source || "macro-rates"}</td>
          </tr>`
          )
          .join("")}
        ${macroCpi
          .map(
            (item) => `
          <tr>
            <td>${item.label}</td>
            <td>${formatNumber(item.value, { maximumFractionDigits: 2 })}</td>
            <td>${item.source || "macro-rates"}</td>
          </tr>`
          )
          .join("")}`
            : `<tr>
            <td>Macro Snapshot</td>
            <td>N/A</td>
            <td>See Block 08</td>
          </tr>`
        }
      </tbody>
    </table>
    <div class="rv-native-note">Sentiment details live in Block 10 (Sentiment Barometer).</div>
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
