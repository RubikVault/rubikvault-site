import { readFile } from "node:fs/promises";
import path from "node:path";
import { simulateBudget } from "./_lib/util/budget-sim.js";

async function main() {
  const root = process.cwd();
  const registryPath = path.join(root, "registry", "registry-built.json");
  const limitsPath = path.join(root, "registry", "limits.json");
  const registry = JSON.parse(await readFile(registryPath, "utf8"));
  const limits = JSON.parse(await readFile(limitsPath, "utf8"));

  const { totals, totalCost } = simulateBudget(registry, limits);
  let totalRequests = 0;
  let totalCredits = 0;

  console.log("Provider\tRequests\tCredits\tCost");
  for (const [provider, usage] of Object.entries(totals)) {
    totalRequests += usage.requests;
    totalCredits += usage.credits;
    console.log(
      `${provider}\t${usage.requests}\t${usage.credits}\t${usage.cost.toFixed(2)}`
    );
  }
  console.log(`TOTAL\t${totalRequests}\t${totalCredits}\t${totalCost.toFixed(2)}`);

  const thresholds = limits.thresholds || {};
  if (thresholds.maxDailyRequests !== undefined && totalRequests > thresholds.maxDailyRequests) {
    throw new Error("Estimated requests exceed maxDailyRequests threshold");
  }
  if (thresholds.maxDailyCredits !== undefined && totalCredits > thresholds.maxDailyCredits) {
    throw new Error("Estimated credits exceed maxDailyCredits threshold");
  }
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
