import { buildProviderError, fetchWithRetry, normalizeProviderDetails } from "./_shared.js";

const STOOQ_BASE = "https://stooq.com/q/d/l/?s=";

function parseCsv(text) {
  const lines = text.trim().split("\n");
  if (lines.length < 3 || !lines[0].startsWith("Date")) return null;
  const rows = [];
  for (let i = 1; i < lines.length; i += 1) {
    const parts = lines[i].split(",");
    if (parts.length < 6) continue;
    const close = Number(parts[4]);
    if (!Number.isFinite(close)) continue;
    rows.push({
      date: parts[0],
      open: Number(parts[1]),
      high: Number(parts[2]),
      low: Number(parts[3]),
      close,
      volume: Number(parts[5]) || 0
    });
  }
  return rows;
}

export async function fetchStooqDaily(ctx, symbol) {
  const requestCtx = ctx ? (ctx.endpoint ? ctx : { ...ctx, endpoint: "daily" }) : { endpoint: "daily" };
  const stooqSymbol = `${symbol.toLowerCase()}.us`;
  const url = `${STOOQ_BASE}${encodeURIComponent(stooqSymbol)}&i=d`;
  const { text } = await fetchWithRetry(url, requestCtx, {
    headers: { "User-Agent": "RVSeeder/1.0" },
    timeoutMs: 15000
  });

  if (/Exceeded the daily hits limit/i.test(text)) {
    throw buildProviderError(
      "RATE_LIMITED",
      "stooq_rate_limited",
      normalizeProviderDetails(url, { snippet: text })
    );
  }
  if (text.trim().startsWith("<!DOCTYPE") || text.trim().startsWith("<html")) {
    throw buildProviderError("PROVIDER_BAD_PAYLOAD", "stooq_html", normalizeProviderDetails(url, { snippet: text }));
  }

  const rows = parseCsv(text);
  if (!rows) {
    throw buildProviderError(
      "PROVIDER_SCHEMA_MISMATCH",
      "stooq_csv_parse_failed",
      normalizeProviderDetails(url, { snippet: text })
    );
  }

  const dataAt =
    rows
      .map((row) => row.date)
      .filter(Boolean)
      .sort()
      .slice(-1)[0] || null;
  return { data: rows, dataAt };
}
