export function getOpsBase() {
  const candidates = {
    OPS_BASE: process.env.OPS_BASE,
    RV_BASE: process.env.RV_BASE,
    BASE_URL: process.env.BASE_URL,
    BASE: process.env.BASE
  };

  const order = ['OPS_BASE', 'RV_BASE', 'BASE_URL', 'BASE'];
  const chosenKey = order.find((key) => {
    const value = candidates[key];
    return typeof value === 'string' && value.trim().length > 0;
  });

  if (!chosenKey) {
    const summary = Object.fromEntries(order.map((key) => [key, Boolean(candidates[key])]));
    throw new Error(`OPS_BASE missing. Provide OPS_BASE/RV_BASE/BASE_URL/BASE. ${JSON.stringify(summary)}`);
  }

  const value = String(candidates[chosenKey]).trim();
  return value.replace(/\/+$/, '');
}

