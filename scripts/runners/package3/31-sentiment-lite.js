import { fetchMarketauxNews } from "../../providers/marketaux.js";
import { makeNoDataError, maxDate } from "./_shared.js";

export async function run(ctx, entry) {
  const seriesCtx = { ...ctx, providerId: entry.provider };
  const result = await fetchMarketauxNews(seriesCtx, { symbols: "SPY,QQQ,SPX", limit: 10 });
  const rows = Array.isArray(result.data) ? result.data : [];
  if (!rows.length) throw makeNoDataError("sentiment_missing");

  const items = rows.map((row) => ({
    title: row.title,
    source: row.source,
    sentiment: row.sentiment,
    date: row.date || null
  }));

  const dataAt = maxDate(...items.map((item) => item.date));
  return { items, dataAt };
}
