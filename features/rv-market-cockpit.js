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
  const indices = data.indices || {};
  const sp500 = indices.sp500 || {};
  const nasdaq = indices.nasdaq || {};
  const dow = indices.dow || {};
  const russell = indices.russell || {};
  const yields = data.yields || {};
  const yieldValues = yields.values || {};
  const macro = data.macroSummary || {};
  const macroRates = Array.isArray(macro.rates) ? macro.rates : [];
  const macroFx = Array.isArray(macro.fx) ? macro.fx : [];
  const macroCpi = Array.isArray(macro.cpi) ? macro.cpi : [];
  const sectorTop = data.sectorPerformance?.top || [];
  const sectorBottom = data.sectorPerformance?.bottom || [];

  // Calculate 2Y-10Y spread
  const yield2y = yieldValues["2y"] || null;
  const yield10y = yieldValues["10y"] || null;
  const spread2y10y = (yield2y !== null && yield10y !== null) ? (yield10y - yield2y) * 100 : null; // Convert to basis points
  
  // Format timestamp
  const updatedAt = data.updatedAt || resolved.ts;
  const timestamp = updatedAt ? new Date(updatedAt).toISOString().split("T")[0] + " " + new Date(updatedAt).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", timeZoneName: "short" }) : "N/A";

  root.innerHTML = `
    ${partialNote ? `<div class="rv-native-note">${partialNote}</div>` : ""}
    <div class="rv-cockpit-header">
      <div class="rv-cockpit-regime">
        <span class="rv-cockpit-label">Regime</span>
        <strong data-rv-field="regime-label">${regime.label || "Neutral"}</strong>
        <span class="rv-native-note" data-rv-field="regime-score">Score ${formatNumber(regime.score, { maximumFractionDigits: 0 })}</span>
      </div>
      <div class="rv-cockpit-timestamp">
        <span class="rv-cockpit-label">As of:</span>
        <span data-rv-field="updated-at">${timestamp}</span>
      </div>
    </div>
    <div class="rv-cockpit-drivers">
      ${drivers.length ? drivers.map((driver) => `<span class="rv-cockpit-driver">${driver}</span>`).join("") : ""}
    </div>
    <!-- Segment A: Equities (USA) -->
    ${(sp500.value !== null && sp500.value !== undefined) || (nasdaq.value !== null && nasdaq.value !== undefined) || (dow.value !== null && dow.value !== undefined) ? `
    <div class="rv-cockpit-section">
      <h3 class="rv-cockpit-section-title">A) Equities (USA)</h3>
      <table class="rv-native-table rv-table--compact">
        <thead>
          <tr>
            <th>Index</th>
            <th>Value</th>
            <th>Change</th>
            <th>Source</th>
          </tr>
        </thead>
        <tbody>
          ${sp500.value !== null && sp500.value !== undefined ? `
          <tr>
            <td>S&amp;P 500 <span class="rv-tooltip-wrapper"><span class="rv-tooltip-icon" aria-label="Information">ⓘ</span><span class="rv-tooltip-content"><strong>S&amp;P 500</strong><br>Source: Yahoo Finance (Snapshot)<br>Update: EOD (1×/Tag)<br>Context: US market close</span></span></td>
            <td data-rv-field="sp500-value">${formatNumber(sp500.value, { maximumFractionDigits: 0 })}</td>
            <td data-rv-field="sp500-change" class="${sp500.changePercent >= 0 ? 'rv-native-positive' : 'rv-native-negative'}">${formatPercent(sp500.changePercent)}</td>
            <td>${sp500.source || indices.source || "Yahoo"}</td>
          </tr>
          ` : ''}
          ${nasdaq.value !== null && nasdaq.value !== undefined ? `
          <tr>
            <td>Nasdaq 100 <span class="rv-tooltip-wrapper"><span class="rv-tooltip-icon" aria-label="Information">ⓘ</span><span class="rv-tooltip-content"><strong>Nasdaq 100</strong><br>Source: Yahoo Finance (Snapshot)<br>Update: EOD (1×/Tag)<br>Context: US market close</span></span></td>
            <td data-rv-field="nasdaq-value">${formatNumber(nasdaq.value, { maximumFractionDigits: 0 })}</td>
            <td data-rv-field="nasdaq-change" class="${nasdaq.changePercent >= 0 ? 'rv-native-positive' : 'rv-native-negative'}">${formatPercent(nasdaq.changePercent)}</td>
            <td>${nasdaq.source || indices.source || "Yahoo"}</td>
          </tr>
          ` : ''}
          ${dow.value !== null && dow.value !== undefined ? `
          <tr>
            <td>Dow Jones <span class="rv-tooltip-wrapper"><span class="rv-tooltip-icon" aria-label="Information">ⓘ</span><span class="rv-tooltip-content"><strong>Dow Jones</strong><br>Source: Yahoo Finance (Snapshot)<br>Update: EOD (1×/Tag)<br>Context: US market close</span></span></td>
            <td data-rv-field="dow-value">${formatNumber(dow.value, { maximumFractionDigits: 0 })}</td>
            <td data-rv-field="dow-change" class="${dow.changePercent >= 0 ? 'rv-native-positive' : 'rv-native-negative'}">${formatPercent(dow.changePercent)}</td>
            <td>${dow.source || indices.source || "Yahoo"}</td>
          </tr>
          ` : ''}
          ${russell.value !== null && russell.value !== undefined ? `
          <tr>
            <td>Russell 2000 <span class="rv-tooltip-wrapper"><span class="rv-tooltip-icon" aria-label="Information">ⓘ</span><span class="rv-tooltip-content"><strong>Russell 2000</strong><br>Source: Yahoo Finance (Snapshot)<br>Update: EOD (1×/Tag)<br>Context: US market close</span></span></td>
            <td data-rv-field="russell-value">${formatNumber(russell.value, { maximumFractionDigits: 0 })}</td>
            <td data-rv-field="russell-change" class="${russell.changePercent >= 0 ? 'rv-native-positive' : 'rv-native-negative'}">${formatPercent(russell.changePercent)}</td>
            <td>${russell.source || indices.source || "Yahoo"}</td>
          </tr>
          ` : ''}
        </tbody>
      </table>
    </div>
    ` : ''}
    
    <!-- Segment B: Volatility & Sentiment -->
    <div class="rv-cockpit-section">
      <h3 class="rv-cockpit-section-title">B) Volatility & Sentiment</h3>
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
            <td>VIX <span class="rv-tooltip-wrapper"><span class="rv-tooltip-icon" aria-label="Information">ⓘ</span><span class="rv-tooltip-content"><strong>VIX (Volatility Index)</strong><br>Source: CBOE (Snapshot)<br>Update: EOD (1×/Tag)<br>Context: US market close</span></span></td>
            <td data-rv-field="vix">${formatNumber(vix.value, { maximumFractionDigits: 2 })}</td>
            <td>${vix.note || vix.source || "CBOE"}</td>
          </tr>
          <tr>
            <td>Fear & Greed – Stocks <span class="rv-tooltip-wrapper"><span class="rv-tooltip-icon" aria-label="Information">ⓘ</span><span class="rv-tooltip-content"><strong>Fear & Greed Index (Stocks)</strong><br>Source: CNN (Snapshot)<br>Update: Daily (1×/Tag)<br>Context: US equity market sentiment</span></span></td>
            <td data-rv-field="fng-stocks">${formatNumber(fngStocks.value)} ${fngStocks.label ? `(${fngStocks.label})` : ""}</td>
            <td>${fngStocks.source || "CNN"}</td>
          </tr>
        </tbody>
      </table>
    </div>
    
    <!-- Segment C: Rates (USA) -->
    ${(yield2y !== null || yield10y !== null || yieldValues["30y"] !== null) ? `
    <div class="rv-cockpit-section">
      <h3 class="rv-cockpit-section-title">C) Rates (USA)</h3>
      <table class="rv-native-table rv-table--compact">
        <thead>
          <tr>
            <th>Yield</th>
            <th>Value</th>
            <th>Source</th>
          </tr>
        </thead>
        <tbody>
          ${yield2y !== null ? `
          <tr>
            <td>US 2Y <span class="rv-tooltip-wrapper"><span class="rv-tooltip-icon" aria-label="Information">ⓘ</span><span class="rv-tooltip-content"><strong>US Treasury 2-Year Yield</strong><br>Source: US Treasury (Snapshot)<br>Update: EOD (1×/Tag)<br>Context: US market close</span></span></td>
            <td data-rv-field="yield-2y">${formatPercent(yield2y, 2)}</td>
            <td>${yields.source || "US Treasury"}</td>
          </tr>
          ` : ''}
          ${yield10y !== null ? `
          <tr>
            <td>US 10Y <span class="rv-tooltip-wrapper"><span class="rv-tooltip-icon" aria-label="Information">ⓘ</span><span class="rv-tooltip-content"><strong>US Treasury 10-Year Yield</strong><br>Source: US Treasury (Snapshot)<br>Update: EOD (1×/Tag)<br>Context: US market close</span></span></td>
            <td data-rv-field="yield-10y">${formatPercent(yield10y, 2)}</td>
            <td>${yields.source || "US Treasury"}</td>
          </tr>
          ` : ''}
          ${yieldValues["30y"] !== null ? `
          <tr>
            <td>US 30Y <span class="rv-tooltip-wrapper"><span class="rv-tooltip-icon" aria-label="Information">ⓘ</span><span class="rv-tooltip-content"><strong>US Treasury 30-Year Yield</strong><br>Source: US Treasury (Snapshot)<br>Update: EOD (1×/Tag)<br>Context: US market close</span></span></td>
            <td data-rv-field="yield-30y">${formatPercent(yieldValues["30y"], 2)}</td>
            <td>${yields.source || "US Treasury"}</td>
          </tr>
          ` : ''}
          ${spread2y10y !== null ? `
          <tr>
            <td>2Y–10Y Spread <span class="rv-tooltip-wrapper"><span class="rv-tooltip-icon" aria-label="Information">ⓘ</span><span class="rv-tooltip-content"><strong>2Y-10Y Yield Spread</strong><br>Source: Calculated (US Treasury)<br>Update: EOD (1×/Tag)<br>Context: US market close</span></span></td>
            <td data-rv-field="spread-2y10y">${formatNumber(spread2y10y, { maximumFractionDigits: 0 })} bp</td>
            <td>${yields.source || "US Treasury"}</td>
          </tr>
          ` : ''}
        </tbody>
      </table>
    </div>
    ` : ''}
    
    <!-- Segment D: FX / USD -->
    ${dxy.value !== null && dxy.value !== undefined ? `
    <div class="rv-cockpit-section">
      <h3 class="rv-cockpit-section-title">D) FX / USD</h3>
      <table class="rv-native-table rv-table--compact">
        <thead>
          <tr>
            <th>Index</th>
            <th>Value</th>
            <th>Change</th>
            <th>Source</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>DXY <span class="rv-tooltip-wrapper"><span class="rv-tooltip-icon" aria-label="Information">ⓘ</span><span class="rv-tooltip-content"><strong>US Dollar Index</strong><br>Source: Yahoo Finance (Snapshot)<br>Update: EOD (1×/Tag)<br>Context: US market close</span></span></td>
            <td data-rv-field="dxy">${formatNumber(dxy.value, { maximumFractionDigits: 2 })}</td>
            <td data-rv-field="dxy-change" class="${dxy.changePercent >= 0 ? 'rv-native-positive' : 'rv-native-negative'}">${formatPercent(dxy.changePercent)}</td>
            <td>${dxy.source || "Yahoo"}</td>
          </tr>
        </tbody>
      </table>
    </div>
    ` : ''}
    
    <!-- Segment E: Commodities -->
    ${(proxies.gold?.price !== null && proxies.gold?.price !== undefined) || (proxies.oil?.price !== null && proxies.oil?.price !== undefined) ? `
    <div class="rv-cockpit-section">
      <h3 class="rv-cockpit-section-title">E) Commodities</h3>
      <table class="rv-native-table rv-table--compact">
        <thead>
          <tr>
            <th>Commodity</th>
            <th>Value</th>
            <th>Change</th>
            <th>Source</th>
          </tr>
        </thead>
        <tbody>
          ${proxies.gold?.price !== null && proxies.gold?.price !== undefined ? `
          <tr>
            <td>Gold <span class="rv-tooltip-wrapper"><span class="rv-tooltip-icon" aria-label="Information">ⓘ</span><span class="rv-tooltip-content"><strong>Gold (GLD Proxy)</strong><br>Source: FMP (Snapshot)<br>Update: EOD (1×/Tag)<br>Context: US market close</span></span></td>
            <td data-rv-field="proxy-gold">$${formatNumber(proxies.gold.price, { maximumFractionDigits: 2 })}</td>
            <td data-rv-field="proxy-gold-change" class="${proxies.gold.changePercent >= 0 ? 'rv-native-positive' : 'rv-native-negative'}">${formatPercent(proxies.gold.changePercent)}</td>
            <td><span class="rv-pill-proxy">Proxy</span> ${proxies.gold.symbol || "GLD"}</td>
          </tr>
          ` : ''}
          ${proxies.oil?.price !== null && proxies.oil?.price !== undefined ? `
          <tr>
            <td>Oil (WTI) <span class="rv-tooltip-wrapper"><span class="rv-tooltip-icon" aria-label="Information">ⓘ</span><span class="rv-tooltip-content"><strong>Oil (USO Proxy)</strong><br>Source: FMP (Snapshot)<br>Update: EOD (1×/Tag)<br>Context: US market close</span></span></td>
            <td data-rv-field="proxy-oil">$${formatNumber(proxies.oil.price, { maximumFractionDigits: 2 })}</td>
            <td data-rv-field="proxy-oil-change" class="${proxies.oil.changePercent >= 0 ? 'rv-native-positive' : 'rv-native-negative'}">${formatPercent(proxies.oil.changePercent)}</td>
            <td><span class="rv-pill-proxy">Proxy</span> ${proxies.oil.symbol || "USO"}</td>
          </tr>
          ` : ''}
        </tbody>
      </table>
    </div>
    ` : ''}
    
    <!-- Segment F: Crypto (Core Segment) -->
    ${(btc.price !== null && btc.price !== undefined) || (eth.price !== null && eth.price !== undefined) || (sol.price !== null && sol.price !== undefined) || (xrp.price !== null && xrp.price !== undefined) ? `
    <div class="rv-cockpit-section">
      <h3 class="rv-cockpit-section-title">F) Crypto (Core Segment)</h3>
      <table class="rv-native-table rv-table--compact">
        <thead>
          <tr>
            <th>Asset</th>
            <th>Price</th>
            <th>Change</th>
            <th>Source</th>
          </tr>
        </thead>
        <tbody>
          ${btc.price !== null && btc.price !== undefined ? `
          <tr>
            <td>BTC <span class="rv-tooltip-wrapper"><span class="rv-tooltip-icon" aria-label="Information">ⓘ</span><span class="rv-tooltip-content"><strong>Bitcoin</strong><br>Source: CoinGecko (Snapshot)<br>Update: 2×/Tag (09:00/21:00 CET)<br>Context: Crypto 24/7 snapshot</span></span></td>
            <td data-rv-field="btc-price">$${formatNumber(btc.price, { maximumFractionDigits: 0 })}</td>
            <td data-rv-field="btc-change" class="${btc.changePercent >= 0 ? 'rv-native-positive' : 'rv-native-negative'}">${formatPercent(btc.changePercent)}</td>
            <td>${btc.source || "CoinGecko"}</td>
          </tr>
          ` : ''}
          ${eth.price !== null && eth.price !== undefined ? `
          <tr>
            <td>ETH <span class="rv-tooltip-wrapper"><span class="rv-tooltip-icon" aria-label="Information">ⓘ</span><span class="rv-tooltip-content"><strong>Ethereum</strong><br>Source: CoinGecko (Snapshot)<br>Update: 2×/Tag (09:00/21:00 CET)<br>Context: Crypto 24/7 snapshot</span></span></td>
            <td data-rv-field="eth-price">$${formatNumber(eth.price, { maximumFractionDigits: 0 })}</td>
            <td data-rv-field="eth-change" class="${eth.changePercent >= 0 ? 'rv-native-positive' : 'rv-native-negative'}">${formatPercent(eth.changePercent)}</td>
            <td>${eth.source || "CoinGecko"}</td>
          </tr>
          ` : ''}
          ${sol.price !== null && sol.price !== undefined ? `
          <tr>
            <td>SOL <span class="rv-tooltip-wrapper"><span class="rv-tooltip-icon" aria-label="Information">ⓘ</span><span class="rv-tooltip-content"><strong>Solana</strong><br>Source: CoinGecko (Snapshot)<br>Update: 2×/Tag (09:00/21:00 CET)<br>Context: Crypto 24/7 snapshot</span></span></td>
            <td data-rv-field="sol-price">$${formatNumber(sol.price, { maximumFractionDigits: 2 })}</td>
            <td data-rv-field="sol-change" class="${sol.changePercent >= 0 ? 'rv-native-positive' : 'rv-native-negative'}">${formatPercent(sol.changePercent)}</td>
            <td>${sol.source || "CoinGecko"}</td>
          </tr>
          ` : ''}
          ${xrp.price !== null && xrp.price !== undefined ? `
          <tr>
            <td>XRP <span class="rv-tooltip-wrapper"><span class="rv-tooltip-icon" aria-label="Information">ⓘ</span><span class="rv-tooltip-content"><strong>XRP</strong><br>Source: CoinGecko (Snapshot)<br>Update: 2×/Tag (09:00/21:00 CET)<br>Context: Crypto 24/7 snapshot</span></span></td>
            <td data-rv-field="xrp-price">$${formatNumber(xrp.price, { maximumFractionDigits: 3 })}</td>
            <td data-rv-field="xrp-change" class="${xrp.changePercent >= 0 ? 'rv-native-positive' : 'rv-native-negative'}">${formatPercent(xrp.changePercent)}</td>
            <td>${xrp.source || "CoinGecko"}</td>
          </tr>
          ` : ''}
          <tr>
            <td>Fear & Greed – Crypto <span class="rv-tooltip-wrapper"><span class="rv-tooltip-icon" aria-label="Information">ⓘ</span><span class="rv-tooltip-content"><strong>Fear & Greed Index (Crypto)</strong><br>Source: Alternative.me (Snapshot)<br>Update: Daily (1×/Tag)<br>Context: Crypto market sentiment</span></span></td>
            <td data-rv-field="fng-crypto">${formatNumber(fng.value)} ${fng.label ? `(${fng.label})` : ""}</td>
            <td>${fng.source || "Alternative.me"}</td>
          </tr>
        </tbody>
      </table>
    </div>
    ` : ''}
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
