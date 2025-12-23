export async function onRequestGet() {
  try {
    const [fngRes, btcRes] = await Promise.all([
      fetch("https://api.alternative.me/fng/?limit=1&format=json", {
        cf: { cacheTtl: 90, cacheEverything: true }
      }),
      fetch(
        "https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd&include_24hr_change=true",
        { cf: { cacheTtl: 90, cacheEverything: true } }
      )
    ]);

    if (!fngRes.ok) {
      throw new Error(`FNG upstream ${fngRes.status}`);
    }
    if (!btcRes.ok) {
      throw new Error(`BTC upstream ${btcRes.status}`);
    }

    const fngPayload = await fngRes.json();
    const btcPayload = await btcRes.json();
    const fngItem = Array.isArray(fngPayload?.data) ? fngPayload.data[0] : null;
    const fng = fngItem
      ? {
          value: Number(fngItem.value),
          valueClassification: fngItem.value_classification || fngItem.valueClassification || null
        }
      : null;
    const btcData = btcPayload?.bitcoin || {};
    const btc = {
      usd: btcData.usd ?? null,
      usd_24h_change: btcData.usd_24h_change ?? null
    };

    return json(
      { fng, btc, updatedAt: new Date().toISOString(), source: ["alternative.me", "coingecko"] },
      { "Cache-Control": "public, max-age=90, stale-while-revalidate=60" }
    );
  } catch (error) {
    return json(
      { error: "market_health_failed", message: error?.message || "Request failed" },
      { "Cache-Control": "no-store" },
      502
    );
  }
}

function json(body, headers = {}, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Access-Control-Allow-Origin": "*",
      ...headers
    }
  });
}
