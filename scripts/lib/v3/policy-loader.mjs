import fs from "node:fs/promises";
import path from "node:path";
import { resolveRepoRoot } from "./run-context.mjs";

const REQUIRED_POLICY_PATHS = [
  "policies/providers/providers.json",
  "policies/budgets/budget-allocation.v3.json",
  "policies/errors.v3.json",
  "policies/exchanges.v3.json",
  "policies/universe/universe.v3.json",
  "policies/universe/symbol-mapping.v3.json",
  "policies/build.v3.json",
  "policies/concurrency.v3.json",
  "policies/retention.v3.json",
  "policies/precision.v3.json",
  "policies/dynamic-budgets.v3.json"
];

export async function loadJsonStrict(absPath) {
  const raw = await fs.readFile(absPath, "utf8");
  return JSON.parse(raw);
}

export async function loadPolicy(relPath, rootDir = resolveRepoRoot()) {
  const absPath = path.join(rootDir, relPath);
  return loadJsonStrict(absPath);
}

export async function loadV3Policies(rootDir = resolveRepoRoot()) {
  const policies = {};
  for (const relPath of REQUIRED_POLICY_PATHS) {
    const key = relPath
      .replace(/^policies\//, "")
      .replace(/\//g, "_")
      .replace(/\.json$/, "")
      .replace(/\./g, "_");
    policies[key] = await loadPolicy(relPath, rootDir);
  }
  return policies;
}

export async function assertPoliciesPresent(rootDir = resolveRepoRoot()) {
  const missing = [];
  for (const relPath of REQUIRED_POLICY_PATHS) {
    const absPath = path.join(rootDir, relPath);
    try {
      await fs.access(absPath);
    } catch {
      missing.push(relPath);
    }
  }
  if (missing.length > 0) {
    throw new Error(`POLICIES_MISSING:${missing.join(",")}`);
  }
}

export function assertNoUnknownKeys(doc, allowedKeys, label) {
  const unknown = Object.keys(doc || {}).filter((key) => !allowedKeys.includes(key));
  if (unknown.length > 0) {
    throw new Error(`${label}:UNKNOWN_KEYS:${unknown.join(",")}`);
  }
}
