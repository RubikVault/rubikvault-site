export async function onRequestGet() {
  try {
    const response = await fetch(
      "https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=price_change_percentage_24h_desc&per_page=6&page=1&sparkline=false&price_change_percentage=24h",
      { cf: { cacheTtl: 90, cacheEverything: true } }
    );
    if (!response.ok) {
      throw new Error(`Movers upstream ${response.status}`);
    }

    const payload = await response.json();
    const items = Array.isArray(payload)
      ? payload.slice(0, 6).map((coin) => ({
          name: coin.name || coin.symbol?.toUpperCase() || "Unknown",
          price: coin.current_price ?? null,
          change: coin.price_change_percentage_24h ?? null
        }))
      : [];

    return json(
      { items, updatedAt: new Date().toISOString(), source: "coingecko" },
      { "Cache-Control": "public, max-age=90, stale-while-revalidate=60" }
    );
  } catch (error) {
    return json(
      { error: "top_movers_failed", message: error?.message || "Request failed" },
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
