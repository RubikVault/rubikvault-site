import { fetchFmpEarningsCalendar } from "../../providers/fmp.js";
import { maxDate, makeNoDataError } from "./_shared.js";

export async function run(ctx, entry) {
  const seriesCtx = { ...ctx, providerId: entry.provider };
  const result = await fetchFmpEarningsCalendar(seriesCtx, { limit: 10 });
  const rows = Array.isArray(result.data) ? result.data : [];
  if (!rows.length) throw makeNoDataError("earnings_missing");

  const items = rows.slice(0, 10).map((row) => ({
    symbol: row.symbol || row.company || "",
    date: row.date || null,
    epsEstimated: row.epsEstimated ?? null,
    epsActual: row.eps ?? row.epsActual ?? null
  }));

  const dataAt = maxDate(...items.map((item) => item.date));
  return { items, dataAt };
}
