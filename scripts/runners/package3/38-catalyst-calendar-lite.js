import { getSnapshot, makeNoDataError, maxDate } from "./_shared.js";

export async function run(ctx, entry) {
  const earnings = getSnapshot(ctx.cache, "earnings-pressure-lite");
  const macro = getSnapshot(ctx.cache, "macro-surprise-lite");

  const items = [];
  const earningsItems = Array.isArray(earnings?.data?.items) ? earnings.data.items : [];
  const macroItems = Array.isArray(macro?.data?.items) ? macro.data.items : [];

  for (const item of earningsItems.slice(0, 5)) {
    items.push({
      label: `Earnings: ${item.symbol || ""}`,
      date: item.date || null,
      detail: item.epsEstimated ?? null
    });
  }
  for (const item of macroItems.slice(0, 3)) {
    items.push({
      label: `Macro: ${item.series || ""}`,
      date: item.date || null,
      detail: item.delta ?? null
    });
  }

  if (!items.length) throw makeNoDataError("catalyst_inputs_missing");

  const dataAt = maxDate(earnings?.dataAt, macro?.dataAt);
  return { items, dataAt };
}
