import { fetchFinnhubOptionChain } from "../../providers/finnhub.js";
import { makeNoDataError } from "./_shared.js";

export async function run(ctx, entry) {
  const seriesCtx = { ...ctx, providerId: entry.provider };
  const result = await fetchFinnhubOptionChain(seriesCtx, { symbol: "SPY" });
  const rows = Array.isArray(result.data) ? result.data : [];
  if (!rows.length) throw makeNoDataError("options_chain_missing");

  let callOpenInterest = 0;
  let putOpenInterest = 0;
  for (const row of rows) {
    const openInterest = Number(row.openInterest ?? row.open_interest ?? 0);
    const type = String(row.optionType || row.option_type || "").toLowerCase();
    if (!Number.isFinite(openInterest)) continue;
    if (type.startsWith("c")) callOpenInterest += openInterest;
    if (type.startsWith("p")) putOpenInterest += openInterest;
  }

  if (!callOpenInterest && !putOpenInterest) throw makeNoDataError("options_open_interest_missing");

  const skewRatio = putOpenInterest > 0 ? callOpenInterest / putOpenInterest : null;
  const items = [
    {
      symbol: "SPY",
      callOpenInterest,
      putOpenInterest,
      skewRatio,
      date: result.dataAt || null
    }
  ];

  return { items, dataAt: result.dataAt || null };
}
