import { getSnapshot, makeNoDataError, maxDate } from "./_shared.js";

export async function run(ctx, entry) {
  const health = getSnapshot(ctx.cache, "market-health-summary");
  const stress = getSnapshot(ctx.cache, "market-stress-composite");
  const drawdown = getSnapshot(ctx.cache, "drawdown-monitor");
  const macro = getSnapshot(ctx.cache, "macro-risk-score");

  const items = [];
  if (health?.data?.summary) {
    items.push({
      label: "Health",
      value: `live ${health.data.summary.live || 0} / total ${health.data.summary.total || 0}`
    });
  }
  if (stress?.data?.items?.[0]) {
    items.push({
      label: "Stress",
      value: String(stress.data.items[0].score ?? "")
    });
  }
  if (drawdown?.data?.items?.[0]) {
    items.push({
      label: "Drawdown",
      value: String(drawdown.data.items[0].drawdownPct ?? "")
    });
  }
  if (macro?.data?.items?.[0]) {
    items.push({
      label: "Macro",
      value: String(macro.data.items[0].score ?? "")
    });
  }

  if (!items.length) throw makeNoDataError("weekly_brief_inputs_missing");

  const dataAt = maxDate(health?.dataAt, stress?.dataAt, drawdown?.dataAt, macro?.dataAt);
  return { items, dataAt };
}
