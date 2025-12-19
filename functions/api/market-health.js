export async function onRequestGet() {
  try {
    const [fng, btc] = await Promise.all([fetchFearGreed(), fetchBtc()]);

    return json(
      {
        fng,
        btc,
        updatedAt: new Date().toISOString()
      },
      {
        "Cache-Control": "public, max-age=120, stale-while-revalidate=60"
      }
    );
  } catch (error) {
    return json(
      { error: "market_health_failed", message: error?.message || "Request failed" },
      { "Cache-Control": "no-store" },
      502
    );
  }
}

async function fetchFearGreed() {
  const response = await fetch("https://api.alternative.me/fng/?limit=1&format=json", {
    cf: { cacheTtl: 120, cacheEverything: true }
  });
  if (!response.ok) {
    throw new Error(`Fear & Greed upstream ${response.status}`);
  }
  const payload = await response.json();
  const entry = payload?.data?.[0];
  if (!entry) return null;

  return {
    value: Number(entry.value),
    valueClassification: entry.value_classification
  };
}

async function fetchBtc() {
  const response = await fetch(
    "https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd&include_24hr_change=true",
    { cf: { cacheTtl: 120, cacheEverything: true } }
  );
  if (!response.ok) {
    throw new Error(`BTC upstream ${response.status}`);
  }
  const payload = await response.json();
  return payload?.bitcoin || null;
}

function json(body, headers = {}, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      ...headers
    }
  });
}
