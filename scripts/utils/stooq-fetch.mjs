import { withRetries } from "./mirror-io.mjs";

const STOOQ_BASE = "https://stooq.com/q/d/l/?s=";

function parseCsv(text) {
  const lines = text.trim().split("\n");
  if (lines.length < 3 || !lines[0].startsWith("Date")) return null;
  const dates = [];
  const opens = [];
  const highs = [];
  const lows = [];
  const closes = [];
  const volumes = [];
  for (let i = 1; i < lines.length; i += 1) {
    const parts = lines[i].split(",");
    if (parts.length < 6) continue;
    const open = Number(parts[1]);
    const high = Number(parts[2]);
    const low = Number(parts[3]);
    const close = Number(parts[4]);
    const volume = Number(parts[5]);
    if (!Number.isFinite(close)) continue;
    dates.push(parts[0]);
    opens.push(open);
    highs.push(high);
    lows.push(low);
    closes.push(close);
    volumes.push(Number.isFinite(volume) ? volume : 0);
  }
  return { dates, opens, highs, lows, closes, volumes };
}

export async function fetchStooqDaily(symbol) {
  const stooqSymbol = `${symbol.toLowerCase()}.us`;
  const url = `${STOOQ_BASE}${encodeURIComponent(stooqSymbol)}&i=d`;
  return withRetries(async () => {
    const res = await fetch(url, {
      headers: { "User-Agent": "RubikVault/1.0" }
    });
    const text = await res.text();
    if (!res.ok) {
      throw new Error(`stooq_http_${res.status}`);
    }
    if (/Exceeded the daily hits limit/i.test(text) || text.trim().startsWith("<!DOCTYPE") || text.trim().startsWith("<html")) {
      throw new Error("stooq_rate_limited");
    }
    const parsed = parseCsv(text);
    if (!parsed) throw new Error("stooq_parse_error");
    return parsed;
  }, { retries: 2, baseDelayMs: 600 });
}
