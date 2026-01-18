import fs from "node:fs";
import path from "node:path";

const SNAPSHOT_DIR = path.join("public", "data", "snapshots");

function isNonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function isNumber(value) {
  return typeof value === "number" && Number.isFinite(value);
}

function assert(condition, message, errors) {
  if (!condition) errors.push(message);
}

function validateSnapshot(filePath) {
  const errors = [];
  let payload;
  try {
    payload = JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (error) {
    return [`${filePath}: invalid json (${error.message})`];
  }

  const meta = payload?.meta;
  assert(meta && typeof meta === "object", `${filePath}: meta missing`, errors);
  if (!meta || typeof meta !== "object") return errors;

  // Snapshot contract (v3):
  // - meta.status/meta.reason/meta.generatedAt/meta.asOf/meta.source/meta.ttlSeconds/meta.runId
  // - meta.freshness/meta.validation/meta.schedule present
  assert(isNonEmptyString(meta.status), `${filePath}: meta.status invalid`, errors);
  assert(isNonEmptyString(meta.reason), `${filePath}: meta.reason invalid`, errors);
  assert(isNonEmptyString(meta.generatedAt), `${filePath}: meta.generatedAt invalid`, errors);
  assert(isNonEmptyString(meta.asOf), `${filePath}: meta.asOf invalid`, errors);
  assert(isNonEmptyString(meta.source), `${filePath}: meta.source invalid`, errors);
  assert(isNumber(meta.ttlSeconds), `${filePath}: meta.ttlSeconds invalid`, errors);
  assert(isNonEmptyString(meta.runId), `${filePath}: meta.runId invalid`, errors);
  assert(meta.freshness && typeof meta.freshness === "object", `${filePath}: meta.freshness missing`, errors);
  assert(meta.validation && typeof meta.validation === "object", `${filePath}: meta.validation missing`, errors);
  assert(meta.schedule && typeof meta.schedule === "object", `${filePath}: meta.schedule missing`, errors);

  return errors;
}

function main() {
  if (!fs.existsSync(SNAPSHOT_DIR)) {
    console.error("snapshot directory missing");
    process.exit(1);
  }

  const files = fs.readdirSync(SNAPSHOT_DIR).filter((name) => name.endsWith(".json"));
  const errors = [];

  for (const name of files) {
    const filePath = path.join(SNAPSHOT_DIR, name);
    errors.push(...validateSnapshot(filePath));
  }

  if (errors.length) {
    console.error("Snapshot validation failed:\n" + errors.join("\n"));
    process.exit(1);
  }

  console.log(`Snapshot validation OK (${files.length} files)`);
}

main();
