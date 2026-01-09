import { getSnapshot, makeNoDataError, maxDate } from "./_shared.js";

export async function run(ctx, entry) {
  const fx = getSnapshot(ctx.cache, "fx-board");
  const yields = getSnapshot(ctx.cache, "us-yield-curve");
  const sectors = getSnapshot(ctx.cache, "sector-rotation");

  const fxItems = Array.isArray(fx?.data?.items) ? fx.data.items : [];
  const usdEur = fxItems.find((item) => item.pair === "USD/EUR");
  const yieldItems = Array.isArray(yields?.data?.items) ? yields.data.items : [];
  const y10 = yieldItems.find((item) => item.maturity === "10y");
  const sectorItems = Array.isArray(sectors?.data?.items) ? sectors.data.items : [];

  if (!usdEur && !y10 && !sectorItems.length) throw makeNoDataError("cross_asset_inputs_missing");

  const sectorAvg =
    sectorItems.reduce((sum, item) => sum + (Number(item.returnPct) || 0), 0) /
    (sectorItems.length || 1);

  const divergence =
    (Number.isFinite(usdEur?.value) && usdEur.value > 1.1 && sectorAvg < 0) ||
    (Number.isFinite(y10?.value) && y10.value < 3 && sectorAvg > 1);

  const dataAt = maxDate(fx?.dataAt, yields?.dataAt, sectors?.dataAt);
  const items = [
    {
      usdEur: usdEur?.value ?? null,
      yield10y: y10?.value ?? null,
      sectorAvgReturn: sectorAvg,
      divergence,
      date: dataAt
    }
  ];

  return { items, dataAt };
}
