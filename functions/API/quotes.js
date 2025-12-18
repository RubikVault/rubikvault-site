export async function onRequestGet(context) {
  const { request } = context;
  const url = new URL(request.url);

  const raw = (url.searchParams.get("tickers") || "").trim();
  const nocache = url.searchParams.get("nocache") === "1";

  if (!raw) {
    return new Response(JSON.stringify({ error: "Missing tickers parameter (?tickers=AAPL,MSFT)" }), {
      status: 400,
      headers: { "Content-Type": "application/json; charset=utf-8" },
    });
  }

  const TTL_SECONDS = 60;
  const TIMEOUT_MS = 3500;
  const MAX_TICKERS = 20;

  const tickers = raw
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean)
    .slice(0, MAX_TICKERS);

  // Cache key stable (sorted)
  const cache = caches.default;
  const keyUrl = new URL(url.origin + "/api/quotes");
  keyUrl.searchParams.set("tickers", tickers.slice().sort().join(","));
  keyUrl.searchParams.set("v", "1");

  const cacheKey = new Request(keyUrl.toString(), { method: "GET" });

  if (!nocache) {
    const cached = await cache.match(cacheKey);
    if (cached) return cached;
  }

  const startedAt = Date.now();

  // Stooq symbol mapping:
  // - US stocks: aapl.us
  // - Indices are tricky on Stooq; for simplicity, keep only tickers you know exist.
  // - Crypto often not available.
  // We'll be strict: if stooq has no data => return nulls with error, no fake fallback.
  const toStooq = (t) => {
    const x = t.toLowerCase();

    // If user already provides ".us" etc
    if (x.includes(".")) return x;

    // Common US ticker default
    return `${x}.us`;
  };

  const fetchOne = async (ticker) => {
    const stooq = toStooq(ticker);
    const endpoint = `https://stooq.com/q/l/?s=${encodeURIComponent(stooq)}&f=sd2t2ohlcv&h&e=csv`;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

    try {
      const res = await fetch(endpoint, {
        method: "GET",
        headers: { "User-Agent": "RubikVault/1.0 (Quotes)" },
        signal: controller.signal,
      });

      if (!res.ok) {
        return { ticker, price: null, changePct: null, ts: null, source: "stooq", error: `http_${res.status}` };
      }

      const text = (await res.text()).trim();
      const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);

      // Expect header + 1 row
      if (lines.length < 2) return { ticker, price: null, changePct: null, ts: null, source: "stooq", error: "no_data" };

      const row = lines[1].split(",");
      // Symbol,Date,Time,Open,High,Low,Close,Volume
      const date = row[1];
      const time = row[2];
      const open = parseFloat(row[3]);
      const close = parseFloat(row[6]);

      if (!Number.isFinite(open) || !Number.isFinite(close)) {
        return { ticker, price: null, changePct: null, ts: null, source: "stooq", error: "bad_numbers" };
      }

      const changePct = open !== 0 ? ((close - open) / open) * 100 : null;
      const ts = new Date(`${date}T${time}Z`).toISOString();

      return { ticker, price: close, changePct: changePct === null ? null : Number(changePct.toFixed(2)), ts, source: "stooq", error: null };
    } catch (e) {
      const reason = e && e.name === "AbortError" ? "timeout" : "fetch_error";
      return { ticker, price: null, changePct: null, ts: null, source: "stooq", error: reason };
    } finally {
      clearTimeout(timer);
    }
  };

  const items = await Promise.all(tickers.map(fetchOne));

  const body = {
    items,
    meta: {
      generatedAt: new Date().toISOString(),
      ttlSeconds: TTL_SECONDS,
      cached: false,
      durationMs: Date.now() - startedAt,
    },
  };

  const response = new Response(JSON.stringify(body), {
    status: 200,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": `public, max-age=${TTL_SECONDS}`,
    },
  });

  await cache.put(cacheKey, response.clone());
  return response;
}