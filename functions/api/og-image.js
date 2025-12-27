import { createTraceId, kvGetJson, logServer } from "./_shared.js";

const FEATURE_ID = "og-image";

function buildSvg({ title, subtitle, metrics }) {
  const lines = metrics
    .map((metric, index) => {
      const y = 140 + index * 32;
      return `<text x="48" y="${y}" font-size="18" fill="#e2e8f0">${metric}</text>`;
    })
    .join("");
  return `
    <svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630">
      <defs>
        <linearGradient id="bg" x1="0" x2="1" y1="0" y2="1">
          <stop offset="0%" stop-color="#0f172a"/>
          <stop offset="100%" stop-color="#020617"/>
        </linearGradient>
      </defs>
      <rect width="1200" height="630" fill="url(#bg)"/>
      <text x="48" y="80" font-size="36" fill="#f8fafc" font-weight="700">${title}</text>
      <text x="48" y="114" font-size="20" fill="#94a3b8">${subtitle}</text>
      ${lines}
      <text x="48" y="590" font-size="14" fill="#64748b">RubikVault Preview</text>
    </svg>
  `;
}

export async function onRequestGet({ request, env, data }) {
  const traceId = data?.traceId || createTraceId(request);
  const started = Date.now();

  const hasKV =
    env?.RV_KV &&
    typeof env.RV_KV.get === "function" &&
    typeof env.RV_KV.put === "function";

  const market = hasKV ? await kvGetJson(env, "market_health:last_ok") : null;
  const macro = hasKV ? await kvGetJson(env, "macro-rates:v2") : null;

  const marketData = market?.value?.data || null;
  const macroData = macro?.value?.data || null;

  const spx = (marketData?.indices || []).find((entry) => entry.label === "S&P 500");
  const btc = (marketData?.crypto || []).find((entry) => entry.symbol === "BTC");
  const us10y = (macroData?.series || []).find((entry) => entry.seriesId === "DGS10");

  const metrics = [
    spx ? `S&P 500: ${spx.changePercent?.toFixed(2) ?? "—"}%` : "S&P 500: —",
    btc ? `BTC: $${btc.price?.toFixed(0) ?? "—"}` : "BTC: —",
    us10y ? `US 10Y: ${us10y.value?.toFixed(2) ?? "—"}%` : "US 10Y: —",
    hasKV ? "Source: KV cache" : "KV binding missing"
  ];

  const svg = buildSvg({
    title: "RubikVault Daily Brief",
    subtitle: new Date().toISOString().slice(0, 10),
    metrics
  });

  logServer({
    feature: FEATURE_ID,
    traceId,
    cacheLayer: hasKV ? "kv" : "none",
    upstreamStatus: null,
    durationMs: Date.now() - started
  });

  return new Response(svg.trim(), {
    status: 200,
    headers: {
      "Content-Type": "image/svg+xml; charset=utf-8",
      "Cache-Control": "public, max-age=300"
    }
  });
}
