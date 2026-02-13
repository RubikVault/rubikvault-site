#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";

async function main() {
  const root = process.cwd();
  const file = path.join(root, "reports/v3/forensics/collisions.json");
  const doc = JSON.parse(await fs.readFile(file, "utf8"));
  const collisions = doc.collisions || [];
  if (collisions.length > 0) {
    throw new Error(`V3_PRODUCER_COLLISIONS:${collisions.map((c) => c.path).join(",")}`);
  }
  console.log("V3_COLLISIONS_OK");
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
