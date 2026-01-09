import { getSnapshot, makeNoDataError, maxDate, clamp } from "./_shared.js";

export async function run(ctx, entry) {
  const inflation = getSnapshot(ctx.cache, "inflation-pulse");
  const labor = getSnapshot(ctx.cache, "labor-pulse");
  const energy = getSnapshot(ctx.cache, "energy-macro");
  const credit = getSnapshot(ctx.cache, "credit-stress-proxy");

  const inflationItem = inflation?.data?.items?.[0];
  const laborItems = Array.isArray(labor?.data?.items) ? labor.data.items : [];
  const unrateItem = laborItems.find((row) => row.series === "UNRATE");
  const creditItem = credit?.data?.items?.[0];
  const energyItem = energy?.data?.items?.[0];

  const values = [inflationItem?.yoyPct, unrateItem?.value, creditItem?.value, energyItem?.value];
  if (!values.some((value) => Number.isFinite(value))) {
    throw makeNoDataError("macro_inputs_missing");
  }

  let score = 50;
  if (Number.isFinite(inflationItem?.yoyPct)) {
    if (inflationItem.yoyPct >= 6) score += 20;
    else if (inflationItem.yoyPct >= 4) score += 10;
  }
  if (Number.isFinite(unrateItem?.value) && unrateItem.value >= 5) score += 10;
  if (Number.isFinite(creditItem?.value)) {
    if (creditItem.value >= 5) score += 15;
    else if (creditItem.value >= 3) score += 8;
  }
  if (Number.isFinite(energyItem?.value) && energyItem.value >= 100) score += 5;

  score = clamp(Math.round(score), 0, 100);

  const dataAt = maxDate(inflation?.dataAt, labor?.dataAt, energy?.dataAt, credit?.dataAt);
  const items = [
    {
      score,
      inflationYoy: inflationItem?.yoyPct ?? null,
      unemploymentRate: unrateItem?.value ?? null,
      creditSpread: creditItem?.value ?? null,
      wti: energyItem?.value ?? null,
      date: dataAt
    }
  ];

  return { items, dataAt };
}
