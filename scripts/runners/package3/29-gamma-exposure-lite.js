import { getSnapshot, makeNoDataError } from "./_shared.js";

export async function run(ctx, entry) {
  const optionsSnapshot = getSnapshot(ctx.cache, "options-skew-lite");
  const item = optionsSnapshot?.data?.items?.[0];
  if (!item || !Number.isFinite(item.skewRatio)) {
    throw makeNoDataError("options_skew_missing");
  }

  const skew = item.skewRatio;
  const bias = skew > 1.05 ? "call" : skew < 0.95 ? "put" : "neutral";
  const exposure = skew > 1.05 ? "positive" : skew < 0.95 ? "negative" : "flat";

  const items = [
    {
      symbol: item.symbol || "SPY",
      skewRatio: skew,
      bias,
      exposure,
      date: item.date || optionsSnapshot?.dataAt || null
    }
  ];

  return { items, dataAt: optionsSnapshot?.dataAt || null };
}
