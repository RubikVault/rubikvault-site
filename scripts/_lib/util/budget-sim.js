export function simulateBudget(registry, limits) {
  const providers = limits?.providers || {};
  const totals = {};
  const features = Array.isArray(registry?.features) ? registry.features : [];

  for (const feature of features) {
    const provider = feature.provider || "unknown";
    const cadence = Number(feature.cadencePerDay || 0);
    const maxFanout = Number(feature.maxFanout || 1);
    const creditsPerRequest = Number(feature.creditsPerRequest || 0);
    const requests = cadence * maxFanout;
    const credits = requests * creditsPerRequest;

    if (!totals[provider]) {
      totals[provider] = { requests: 0, credits: 0, cost: 0 };
    }
    totals[provider].requests += requests;
    totals[provider].credits += credits;
  }

  let totalCost = 0;
  for (const [provider, usage] of Object.entries(totals)) {
    const limitsEntry = providers[provider] || {};
    const costPerRequest = Number(limitsEntry.costPerRequest || 0);
    const costPerCredit = Number(limitsEntry.costPerCredit || 0);
    usage.cost = usage.requests * costPerRequest + usage.credits * costPerCredit;
    totalCost += usage.cost;
  }

  return { totals, totalCost };
}
