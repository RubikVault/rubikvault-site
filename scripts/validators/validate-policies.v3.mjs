#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";

const ROOT = process.cwd();

const REQUIRED_FILES = [
  "policies/providers/providers.json",
  "policies/budgets/budget-allocation.v3.json",
  "policies/errors.v3.json",
  "policies/exchanges.v3.json",
  "policies/universe/universe.v3.json",
  "policies/universe/symbol-mapping.v3.json",
  "policies/calendars/US/2026.json",
  "policies/build.v3.json",
  "policies/concurrency.v3.json",
  "policies/retention.v3.json",
  "policies/precision.v3.json",
  "policies/dynamic-budgets.v3.json",
  "policies/schemas/rv.health.v3.json",
  "policies/schemas/rv.manifest.v3.json",
  "policies/schemas/rv.eod.v3.json",
  "policies/schemas/rv.fx.v1.json",
  "policies/schemas/rv.actions.v3.json",
  "policies/schemas/rv.series.v3.json",
  "policies/schemas/rv.pulse.v3.json",
  "policies/schemas/rv.news.v2.json",
  "policies/schemas/rv.fundamentals.v1.json",
  "policies/schemas/rv.calendar.v1.json",
  "policies/schemas/evolution.json"
];

const PROVIDER_KEYS = ["schema_version", "policy", "providers"];
const BUDGET_KEYS = ["schema_version", "currency", "hard_cap", "reserve", "stop_before_calls", "allocations", "max_planned_calls"];
const ERROR_KEYS = ["schema_version", "taxonomy", "circuit_rules", "actions"];
const RETENTION_KEYS = ["schema_version", "active_strategy", "strategy_a", "strategy_b", "hot_window_days", "mirrors_retention_days", "ops_ledger_retention_days", "cleanup_cadence", "safeguards"];

function assert(condition, message, failures) {
  if (!condition) failures.push(message);
}

async function readJson(relPath, failures) {
  const absPath = path.join(ROOT, relPath);
  try {
    const raw = await fs.readFile(absPath, "utf8");
    return JSON.parse(raw);
  } catch (error) {
    failures.push(`${relPath}: ${error.message}`);
    return null;
  }
}

function assertOnlyKnownKeys(doc, allowed, label, failures) {
  if (!doc || typeof doc !== "object" || Array.isArray(doc)) return;
  for (const key of Object.keys(doc)) {
    if (!allowed.includes(key)) {
      failures.push(`${label}: unknown top-level key '${key}'`);
    }
  }
}

async function main() {
  const failures = [];

  for (const relPath of REQUIRED_FILES) {
    const absPath = path.join(ROOT, relPath);
    try {
      await fs.access(absPath);
    } catch {
      failures.push(`missing required policy file: ${relPath}`);
    }
  }

  const providers = await readJson("policies/providers/providers.json", failures);
  const budget = await readJson("policies/budgets/budget-allocation.v3.json", failures);
  const errors = await readJson("policies/errors.v3.json", failures);
  const retention = await readJson("policies/retention.v3.json", failures);
  const universe = await readJson("policies/universe/universe.v3.json", failures);
  const mapping = await readJson("policies/universe/symbol-mapping.v3.json", failures);

  assertOnlyKnownKeys(providers, PROVIDER_KEYS, "providers policy", failures);
  assertOnlyKnownKeys(budget, BUDGET_KEYS, "budget policy", failures);
  assertOnlyKnownKeys(errors, ERROR_KEYS, "errors policy", failures);
  assertOnlyKnownKeys(retention, RETENTION_KEYS, "retention policy", failures);

  if (providers) {
    assert(providers.policy?.equities_primary === "eodhd", "providers.policy.equities_primary must be 'eodhd'", failures);
    assert(Array.isArray(providers.policy?.fallbacks) && providers.policy.fallbacks.includes("tiingo"), "providers.policy.fallbacks must include 'tiingo'", failures);
    assert(Array.isArray(providers.providers?.eodhd?.blocked_endpoints), "providers.providers.eodhd.blocked_endpoints must exist", failures);
    assert(providers.providers?.eodhd?.blocked_endpoints?.includes("fundamentals"), "EODHD fundamentals endpoint must be blocked for this tier", failures);
  }

  if (budget) {
    assert(Number.isFinite(budget.hard_cap) && budget.hard_cap > 0, "budget.hard_cap must be positive", failures);
    assert(Number.isFinite(budget.reserve) && budget.reserve >= 0, "budget.reserve must be non-negative", failures);
    assert(budget.stop_before_calls === true, "budget.stop_before_calls must be true", failures);
  }

  if (errors) {
    assert(typeof errors.circuit_rules?.open_after === "object", "errors.circuit_rules.open_after missing", failures);
    assert(typeof errors.actions?.schema_violation === "string", "errors.actions.schema_violation missing", failures);
  }

  if (retention) {
    assert(["A", "B"].includes(retention.active_strategy), "retention.active_strategy must be A or B", failures);
    assert(retention.safeguards?.never_remove_last_good === true, "retention.safeguards.never_remove_last_good must be true", failures);
  }

  if (universe && mapping) {
    const universeCount = Array.isArray(universe.symbols) ? universe.symbols.length : 0;
    const mappingCount = mapping.mappings && typeof mapping.mappings === "object" ? Object.keys(mapping.mappings).length : 0;
    assert(universeCount > 0, "universe.v3 symbols must not be empty", failures);
    assert(universe.expected_count === universeCount, "universe.expected_count must equal symbols length", failures);
    assert(universeCount === mappingCount, "symbol mapping must cover 100% of universe", failures);
    if (mapping.coverage) {
      assert(mapping.coverage.percent === 100, "symbol mapping coverage.percent must be 100", failures);
    }
  }

  if (failures.length > 0) {
    console.error("POLICY_VALIDATION_FAILED");
    for (const failure of failures) {
      console.error(` - ${failure}`);
    }
    process.exitCode = 1;
    return;
  }

  console.log("POLICY_VALIDATION_OK");
}

main().catch((error) => {
  console.error(`POLICY_VALIDATION_CRASH: ${error.message}`);
  process.exitCode = 1;
});
