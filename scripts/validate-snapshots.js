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

  // Snapshot contract (enforced by this validator):
  // - meta.status/meta.reason: non-empty strings
  // - meta.itemsCount/coveragePct/stalenessSec/latencyMs: finite numbers
  // - meta.timezoneAssumption/meta.dataAtDefinition: non-empty strings
  // - ERROR status requires meta.details with bounded snippet + urlHost
  assert(isNonEmptyString(meta.status), `${filePath}: meta.status invalid`, errors);
  assert(isNonEmptyString(meta.reason), `${filePath}: meta.reason invalid`, errors);
  assert(isNumber(meta.itemsCount), `${filePath}: meta.itemsCount invalid`, errors);
  assert(isNumber(meta.coveragePct), `${filePath}: meta.coveragePct invalid`, errors);
  assert(isNumber(meta.stalenessSec), `${filePath}: meta.stalenessSec invalid`, errors);
  assert(isNumber(meta.latencyMs), `${filePath}: meta.latencyMs invalid`, errors);
  assert(isNonEmptyString(meta.timezoneAssumption), `${filePath}: meta.timezoneAssumption invalid`, errors);
  assert(isNonEmptyString(meta.dataAtDefinition), `${filePath}: meta.dataAtDefinition invalid`, errors);

  if (meta.status === "ERROR") {
    const details = meta.details;
    assert(details && typeof details === "object", `${filePath}: meta.details missing`, errors);
    if (details && typeof details === "object") {
      const snippet = String(details.snippet || "");
      assert(snippet.length <= 200, `${filePath}: meta.details.snippet too long`, errors);
      assert(typeof details.urlHost === "string", `${filePath}: meta.details.urlHost invalid`, errors);
      const httpStatus = details.httpStatus;
      assert(httpStatus === null || isNumber(httpStatus), `${filePath}: meta.details.httpStatus invalid`, errors);
    }
  }

  const details = meta.details;
  if (details && typeof details === "object") {
    const snippet = String(details.snippet || "");
    assert(snippet.length <= 200, `${filePath}: meta.details.snippet too long`, errors);
  }

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
