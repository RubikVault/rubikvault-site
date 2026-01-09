import { fetchSecRecentFilings } from "../../providers/sec_edgar.js";
import { makeNoDataError, maxDate } from "./_shared.js";

export async function run(ctx, entry) {
  const seriesCtx = { ...ctx, providerId: entry.provider };
  const result = await fetchSecRecentFilings(seriesCtx, { cik: "0000320193" });
  const rows = Array.isArray(result.data) ? result.data : [];
  if (!rows.length) throw makeNoDataError("insider_missing");

  const items = rows.map((row) => ({
    accessionNumber: row.accessionNumber,
    form: row.form,
    filedAt: row.filedAt
  }));

  const dataAt = maxDate(...items.map((item) => item.filedAt));
  return { items, dataAt };
}
