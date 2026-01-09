import { getSnapshot, makeNoDataError, maxDate } from "./_shared.js";

export async function run(ctx, entry) {
  const regime = getSnapshot(ctx.cache, "risk-regime-lite");
  const breadth = getSnapshot(ctx.cache, "breadth-delta");
  const sector = getSnapshot(ctx.cache, "sector-relative-strength");

  const regimeItem = regime?.data?.items?.[0];
  const breadthItem = breadth?.data?.items?.[0];
  const sectorItems = Array.isArray(sector?.data?.items) ? sector.data.items : [];

  if (!regimeItem || !breadthItem) throw makeNoDataError("regime_fracture_inputs_missing");

  const avgRelative =
    sectorItems.reduce((sum, item) => sum + (Number(item.relativeStrength) || 0), 0) /
    (sectorItems.length || 1);
  const breadthShift = Number(breadthItem.netDelta) || 0;
  const fracture =
    (regimeItem.regime === "risk-off" && breadthShift > 0) ||
    (regimeItem.regime === "risk-on" && breadthShift < 0) ||
    Math.abs(avgRelative) >= 2;

  const dataAt = maxDate(regime?.dataAt, breadth?.dataAt, sector?.dataAt);
  const items = [
    {
      regime: regimeItem.regime,
      breadthDelta: breadthShift,
      avgRelativeStrength: avgRelative,
      fracture,
      date: dataAt
    }
  ];

  return { items, dataAt };
}
