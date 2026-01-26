import fs from "node:fs";
import path from "node:path";
import { loadSnapshotEnvelopeSchema, createValidator, buildEnvelope } from "./lib/envelope-builder.mjs";

const OUT = "public/data/snapshots/health/latest.json";
const SCHEMA_PATH = "schemas/snapshot-envelope.schema.json";

function readJsonIfExists(p) {
  try { return JSON.parse(fs.readFileSync(p, "utf-8")); } catch { return null; }
}

function ensureDir(p) {
  fs.mkdirSync(path.dirname(p), { recursive: true });
}

function main() {
  const schema = loadSnapshotEnvelopeSchema(SCHEMA_PATH);
  const { validate } = createValidator(schema);

  const existing = readJsonIfExists(OUT);

  // Preserve any existing meaningful content as data payload, but normalize envelope strictly.
  // Priority:
  // 1) existing.data if present
  // 2) existing.data.data if envelope-like legacy
  // 3) whole existing object as data
  let payload = null;
  if (existing && existing.data !== undefined) payload = existing.data;
  else if (existing && existing.data && existing.data.data !== undefined) payload = existing.data.data;
  else payload = existing;

  const env = buildEnvelope(schema, {
    module: "health",
    tier: "critical",
    domain: "system",
    source: "generator",
    data: payload ?? { note: "health snapshot regenerated (empty legacy payload)" },
    // validation/upstream/freshness will be schema-driven; passed defaults to true
  });

  const ok = validate(env);
  if (!ok) {
    console.error("FAIL: generated health snapshot does not validate against schema");
    console.error(validate.errors);
    process.exit(1);
  }

  ensureDir(OUT);
  fs.writeFileSync(OUT, JSON.stringify(env, null, 2) + "\n", "utf-8");
  console.log(`OK: wrote ${OUT}`);
}

main();
