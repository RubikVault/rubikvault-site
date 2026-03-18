#!/usr/bin/env node
/**
 * Pipeline Input Validator — replaces raw `test -s` checks.
 *
 * Validates artifacts using structured contracts with graduated responses:
 *   FRESH → proceed normally
 *   STALE + fallback → proceed with warning
 *   MISSING + fallback → proceed with warning
 *   MISSING + no fallback → hard fail
 *
 * Usage: node scripts/ci/validate-pipeline-inputs.mjs [--strict]
 *   --strict: fail on any non-FRESH artifact (no fallback accepted)
 */

import { validateArtifacts, ArtifactState } from '../lib/v3/artifact-contract.mjs';
import {
  MARKET_LATEST_CONTRACT,
  MARKET_HEALTH_CONTRACT,
  TOP_MOVERS_CONTRACT,
  STOCK_ANALYSIS_CONTRACT,
} from '../lib/v3/market-hub-contracts.mjs';

const rootDir = process.cwd();
const strict = process.argv.includes('--strict');

const contracts = [
  MARKET_LATEST_CONTRACT,
  MARKET_HEALTH_CONTRACT,
  TOP_MOVERS_CONTRACT,
];

// Add stock-analysis if it exists in git (not needed for all pipelines)
if (process.argv.includes('--with-stock-analysis')) {
  contracts.push(STOCK_ANALYSIS_CONTRACT);
}

async function main() {
  const { summary, results } = await validateArtifacts(rootDir, contracts);

  console.log(`\n=== Pipeline Input Validation ===`);
  console.log(`Total: ${summary.total} | Fresh: ${summary.fresh} | Stale: ${summary.stale} | Missing: ${summary.missing} | Invalid: ${summary.invalid} | Fallbacks: ${summary.fallbacks_used}`);

  for (const r of results) {
    const icon = r.state === ArtifactState.FRESH ? '✓' : r.state === ArtifactState.STALE ? '⚠' : '✗';
    const fallback = r.usedFallback ? ` [FALLBACK: ${r.fallbackPath}]` : '';
    const age = r.staleDays != null ? ` (${r.staleDays}d old)` : '';
    console.log(`  ${icon} ${r.path}: ${r.state}${age}${fallback}`);
    if (r.errors.length) {
      r.errors.forEach((e) => console.log(`    → ${e}`));
    }
  }

  if (strict && summary.fresh < summary.total) {
    console.error(`\nSTRICT MODE: ${summary.total - summary.fresh} artifact(s) not FRESH — failing.`);
    process.exitCode = 1;
    return;
  }

  if (!summary.all_usable) {
    const unusable = results.filter((r) => r.doc === null);
    console.error(`\nFATAL: ${unusable.length} artifact(s) unusable (no data, no fallback):`);
    unusable.forEach((r) => console.error(`  - ${r.path}: ${r.errors.join('; ')}`));
    process.exitCode = 1;
    return;
  }

  if (summary.fallbacks_used > 0) {
    console.log(`\nWARNING: ${summary.fallbacks_used} artifact(s) using last-known-good fallback.`);
  }

  console.log(`\nAll inputs usable. Proceeding.`);
}

main().catch((e) => {
  console.error(`VALIDATION_FAILED: ${e.message}`);
  process.exitCode = 1;
});
