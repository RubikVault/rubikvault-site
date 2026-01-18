import fs from "node:fs";
import path from "node:path";
import { sanitizeForPublic, assertPublicSafe } from "./_lib/sanitize-public.mjs";

const SOURCE = path.join("registry", "feature-registry.json");
const DEST = path.join("public", "data", "feature-registry.json");
const MAX_PUBLIC_BYTES = 200 * 1024;

function fail(message) {
  console.error(message);
  process.exit(1);
}

if (!fs.existsSync(SOURCE)) {
  fail("Missing registry/feature-registry.json");
}

let payload;
try {
  const raw = fs.readFileSync(SOURCE, "utf8");
  payload = JSON.parse(raw);
} catch (error) {
  fail(`Invalid registry JSON: ${error.message}`);
}

if (!payload || typeof payload !== "object") {
  fail("Registry payload must be an object");
}

if (!payload.schemaVersion) {
  fail("Registry payload missing schemaVersion");
}

if (!Array.isArray(payload.features)) {
  fail("Registry payload missing features array");
}

const sanitized = sanitizeForPublic(payload);
assertPublicSafe(sanitized, path.basename(DEST));
const output = JSON.stringify(sanitized, null, 2);
const bytes = Buffer.byteLength(output, "utf8");
if (bytes > MAX_PUBLIC_BYTES) {
  fail(`public snapshot too large: ${bytes} bytes`);
}
fs.mkdirSync(path.dirname(DEST), { recursive: true });
fs.writeFileSync(DEST, output);
console.log(`Copied registry (${payload.features.length} features) to ${DEST}`);
