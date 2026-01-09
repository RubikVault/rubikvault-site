import { fetchFmpAnalystRevisions } from "../../providers/fmp.js";
import { makeNoDataError, maxDate } from "./_shared.js";

export async function run(ctx, entry) {
  const seriesCtx = { ...ctx, providerId: entry.provider };
  const result = await fetchFmpAnalystRevisions(seriesCtx, { symbol: "SPY" });
  const rows = Array.isArray(result.data) ? result.data : [];
  if (!rows.length) throw makeNoDataError("analyst_revisions_missing");

  const items = rows.slice(0, 10).map((row) => ({
    symbol: row.symbol || "SPY",
    date: row.date || null,
    rating: row.rating || row.recommendation || null,
    analyst: row.analyst || null
  }));

  const dataAt = maxDate(...items.map((item) => item.date));
  return { items, dataAt };
}
