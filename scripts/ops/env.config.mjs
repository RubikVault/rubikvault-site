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
    return 'http://127.0.0.1:8788';
  }

  const value = String(candidates[chosenKey]).trim();
  return value.replace(/\/+$/, '');
}
