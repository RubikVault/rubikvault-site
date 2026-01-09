import { getSnapshot, makeNoDataError } from "./_shared.js";

export async function run(ctx, entry) {
  const breadthSnapshot = getSnapshot(ctx.cache, "market-breadth");
  const summary = breadthSnapshot?.data?.summary || {};
  const itemsList = Array.isArray(breadthSnapshot?.data?.items) ? breadthSnapshot.data.items : [];
  const advancers = Number.isFinite(summary.advancers)
    ? summary.advancers
    : itemsList.filter((row) => row.changePct > 0).length;
  const decliners = Number.isFinite(summary.decliners)
    ? summary.decliners
    : itemsList.filter((row) => row.changePct < 0).length;
  const total = advancers + decliners;
  if (!total) throw makeNoDataError("breadth_missing");

  const ratio = advancers / total;
  const anomaly = ratio > 0.7 || ratio < 0.3;
  const items = [
    {
      advancers,
      decliners,
      ratio,
      anomaly,
      date: breadthSnapshot?.dataAt || null
    }
  ];

  return { items, dataAt: breadthSnapshot?.dataAt || null };
}
