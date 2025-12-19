export async function onRequestGet() {
  try {
    const response = await fetch(
      "https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,ethereum,solana&vs_currencies=usd&include_24hr_change=true",
      { cf: { cacheTtl: 90, cacheEverything: true } }
    );
    if (!response.ok) {
      throw new Error(`Snapshot upstream ${response.status}`);
    }
    const payload = await response.json();

    const assets = [
      { key: "bitcoin", label: "Bitcoin" },
      { key: "ethereum", label: "Ethereum" },
      { key: "solana", label: "Solana" }
    ].map((asset) => {
      const data = payload[asset.key] || {};
      return {
        label: asset.label,
        price: data.usd ?? null,
        change: data.usd_24h_change ?? 0
      };
    });

    return json(
      { assets, updatedAt: new Date().toISOString(), source: "coingecko" },
      { "Cache-Control": "public, max-age=90, stale-while-revalidate=60" }
    );
  } catch (error) {
    return json(
      { error: "price_snapshot_failed", message: error?.message || "Request failed" },
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
      ...headers
    }
  });
}
