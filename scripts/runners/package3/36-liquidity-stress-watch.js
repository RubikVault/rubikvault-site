import { getSnapshot, makeNoDataError, maxDate } from "./_shared.js";

export async function run(ctx, entry) {
  const liquidity = getSnapshot(ctx.cache, "liquidity-conditions-proxy");
  const credit = getSnapshot(ctx.cache, "credit-stress-proxy");
  const liquidityItem = liquidity?.data?.items?.[0];
  const creditItem = credit?.data?.items?.[0];

  if (!liquidityItem && !creditItem) throw makeNoDataError("liquidity_stress_inputs_missing");

  const rrp = liquidityItem?.value ?? null;
  const creditSpread = creditItem?.value ?? null;
  const stress =
    (Number.isFinite(rrp) && rrp >= 2000) ||
    (Number.isFinite(creditSpread) && creditSpread >= 5);

  const dataAt = maxDate(liquidity?.dataAt, credit?.dataAt);
  const items = [
    {
      rrp,
      creditSpread,
      stress,
      date: dataAt
    }
  ];

  return { items, dataAt };
}
