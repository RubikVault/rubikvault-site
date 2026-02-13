#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";

async function main() {
  const root = process.cwd();
  const universe = JSON.parse(await fs.readFile(path.join(root, "policies/universe/universe.v3.json"), "utf8"));
  const mapping = JSON.parse(await fs.readFile(path.join(root, "policies/universe/symbol-mapping.v3.json"), "utf8"));

  const symbols = universe.symbols || [];
  const map = mapping.mappings || {};

  const missing = [];
  for (const row of symbols) {
    if (!map[row.canonical_id]) {
      missing.push(row.canonical_id);
    }
  }

  const expected = Number(universe.expected_count || symbols.length);
  const actual = symbols.length;

  if (actual !== expected) {
    throw new Error(`UNIVERSE_COUNT_MISMATCH: expected=${expected} actual=${actual}`);
  }
  if (missing.length > 0) {
    throw new Error(`UNIVERSE_MAPPING_GAP:${missing.slice(0, 20).join(",")}`);
  }

  console.log(`UNIVERSE_COVERAGE_OK count=${actual}`);
}

main().catch((error) => {
  console.error(`UNIVERSE_COVERAGE_FAILED:${error.message}`);
  process.exitCode = 1;
});
