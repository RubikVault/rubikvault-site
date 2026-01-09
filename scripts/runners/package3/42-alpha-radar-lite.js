import { getSnapshot, makeNoDataError, maxDate } from "./_shared.js";

export async function run(ctx, entry) {
  const momentum = getSnapshot(ctx.cache, "momentum-heatmap-lite");
  const trend = getSnapshot(ctx.cache, "trend-strength-board");

  const momentumItems = Array.isArray(momentum?.data?.items) ? momentum.data.items : [];
  const trendItems = Array.isArray(trend?.data?.items) ? trend.data.items : [];
  if (!momentumItems.length && !trendItems.length) throw makeNoDataError("alpha_inputs_missing");

  const hot = momentumItems.filter((item) => item.bucket === "hot").map((item) => item.symbol);
  const strongTrend = trendItems
    .filter((item) => Number(item.slopePct) > 0)
    .map((item) => item.symbol);

  const signals = Array.from(new Set([...hot, ...strongTrend])).slice(0, 6);
  const items = signals.map((symbol) => ({ symbol }));

  const dataAt = maxDate(momentum?.dataAt, trend?.dataAt);
  return { items, dataAt };
}
