export async function onRequestGet({ request }) {
  const { searchParams } = new URL(request.url);
  const raw = (searchParams.get("tickers") || "").trim();

  const tickers = raw
    .split(",")
    .map(s => s.trim().toUpperCase())
    .filter(Boolean)
    .slice(0, 20);

  if (!tickers.length) {
    return json({ error: "Missing tickers parameter, e.g. ?tickers=AAPL,MSFT" }, 400);
  }

  // Stooq ist kostenlos, ohne Key, liefert CSV
  // US-Aktien: AAPL -> aapl.us
  const stooqSymbols = tickers.map(t => `${t.toLowerCase()}.us`).join(",");

  const url = `https://stooq.com/q/l/?s=${encodeURIComponent(stooqSymbols)}&f=sd2t2ohlcv&h&e=csv`;

  try {
    const res = await fetch(url, {
      headers: { "user-agent": "RubikVault/1.0" }
    });
    if (!res.ok) return json({ error: `Upstream error: ${res.status}` }, 502);

    const csv = await res.text();
    const rows = parseCsv(csv);

    // rows[0] header
    const out = {};
    for (let i = 1; i < rows.length; i++) {
      const r = rows[i];
      const sym = (r.Symbol || "").toUpperCase(); // e.g. AAPL.US
      const t = sym.split(".")[0]; // AAPL

      const close = num(r.Close);
      const open = num(r.Open);

      let changePct = null;
      if (close !== null && open !== null && open !== 0) {
        changePct = ((close - open) / open) * 100;
      }

      out[t] = {
        price: close,
        open,
        changePct
      };
    }

    return json({ quotes: out, source: "stooq.com" });
  } catch (e) {
    return json({ error: `Fetch failed: ${e.message}` }, 502);
  }
}

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store"
    }
  });
}

function num(v) {
  if (!v) return null;
  const x = Number(String(v).replace(",", "."));
  return Number.isFinite(x) ? x : null;
}

function parseCsv(text) {
  // simple CSV parser (Stooq ist clean genug)
  const lines = text.trim().split(/\r?\n/);
  if (!lines.length) return [];
  const header = lines[0].split(",").map(s => s.trim());
  const out = [toObj(header, header)];

  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(",").map(s => s.trim());
    out.push(toObj(header, cols));
  }
  return out;
}

function toObj(header, cols) {
  const o = {};
  for (let i = 0; i < header.length; i++) o[header[i]] = cols[i] ?? "";
  return o;
}