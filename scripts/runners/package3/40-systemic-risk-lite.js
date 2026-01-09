import { getSnapshot, makeNoDataError, maxDate, clamp } from "./_shared.js";

export async function run(ctx, entry) {
  const stress = getSnapshot(ctx.cache, "market-stress-composite");
  const macro = getSnapshot(ctx.cache, "macro-risk-score");

  const stressItem = stress?.data?.items?.[0];
  const macroItem = macro?.data?.items?.[0];
  if (!stressItem && !macroItem) throw makeNoDataError("systemic_inputs_missing");

  const stressScore = Number.isFinite(stressItem?.score) ? stressItem.score : 50;
  const macroScore = Number.isFinite(macroItem?.score) ? macroItem.score : 50;
  const score = clamp(Math.round((stressScore * 0.6 + macroScore * 0.4)), 0, 100);

  const dataAt = maxDate(stress?.dataAt, macro?.dataAt);
  const items = [
    {
      score,
      stressScore,
      macroScore,
      date: dataAt
    }
  ];

  return { items, dataAt };
}
