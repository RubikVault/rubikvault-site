export function planSubpacks(entries = [], options = {}) {
  const maxTickers = Math.max(1, Number(options.maxTickersPerSubpack || 500));
  const maxBars = Math.max(1, Number(options.maxBarsPerSubpack || 250000));
  const subpacks = [];
  let current = [];
  let currentBars = 0;

  for (const entry of entries) {
    const bars = Math.max(0, Number(entry?.bars_count || 0));
    const exceeds = current.length >= maxTickers || (currentBars + bars) > maxBars;
    if (exceeds && current.length > 0) {
      subpacks.push(current);
      current = [];
      currentBars = 0;
    }
    current.push(entry);
    currentBars += bars;
  }
  if (current.length > 0) subpacks.push(current);

  return subpacks.map((items, index) => ({
    subpack_id: `subpack_${String(index + 1).padStart(4, '0')}`,
    item_count: items.length,
    bars_estimate: items.reduce((sum, item) => sum + Math.max(0, Number(item?.bars_count || 0)), 0),
    items,
  }));
}

export default { planSubpacks };
