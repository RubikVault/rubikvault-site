import { getSnapshot, makeNoDataError, maxDate } from "./_shared.js";

export async function run(ctx, entry) {
  const vol = getSnapshot(ctx.cache, "vol-regime");
  const credit = getSnapshot(ctx.cache, "credit-stress-proxy");
  const volItem = vol?.data?.items?.[0];
  const creditItem = credit?.data?.items?.[0];

  if (!volItem && !creditItem) throw makeNoDataError("tail_risk_inputs_missing");

  const vix = volItem?.value ?? null;
  const creditSpread = creditItem?.value ?? null;
  const alert =
    (Number.isFinite(vix) && vix >= 25) || (Number.isFinite(creditSpread) && creditSpread >= 5);

  const dataAt = maxDate(vol?.dataAt, credit?.dataAt);
  const items = [
    {
      vix,
      creditSpread,
      alert,
      date: dataAt
    }
  ];

  return { items, dataAt };
}
