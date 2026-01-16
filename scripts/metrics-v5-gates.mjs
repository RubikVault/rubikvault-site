import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const baseUrl = process.env.BASE_URL || "http://127.0.0.1:8788";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function logOk(message) {
  console.log(`OK: ${message}`);
}

async function loadCatalog() {
  const file = await fs.readFile(path.join(repoRoot, "config/metrics-catalog.json"), "utf8");
  return JSON.parse(file);
}

async function fetchJson(url) {
  if (typeof fetch !== "function") {
    throw new Error("global fetch is missing (use Node 18+ or enable experimental fetch)");
  }
  try {
    const res = await fetch(url, { headers: { Accept: "application/json" } });
    const text = await res.text();
    return text ? JSON.parse(text) : null;
  } catch (error) {
    const hint = `Fetch failed. Is the dev server running? Try: npm run dev (or set BASE_URL).`;
    throw new Error(`${error?.message || "fetch failed"} - ${hint}`);
  }
}

function validateEnvelope(payload, catalog) {
  assert(payload && typeof payload === "object", "Envelope missing");
  assert(payload.meta && typeof payload.meta === "object", "meta missing");
  assert("data" in payload, "data key missing");
  assert("error" in payload, "error key missing");

  const meta = payload.meta;
  assert(["OK", "PARTIAL", "ERROR"].includes(meta.status), "meta.status invalid");
  assert(typeof meta.requestId === "string", "meta.requestId missing");
  assert(typeof meta.asOf === "string", "meta.asOf missing");
  assert(typeof meta.generatedAt === "string", "meta.generatedAt missing");
  assert(typeof meta.ageSeconds === "number", "meta.ageSeconds missing");
  assert(meta.version === "5.0", "meta.version missing");
  assert(meta.cache && typeof meta.cache === "object", "meta.cache missing");
  assert(typeof meta.cache.hit === "boolean", "meta.cache.hit missing");
  assert(typeof meta.cache.ttlSeconds === "number", "meta.cache.ttlSeconds missing");
  assert(typeof meta.cache.kvAvailable === "boolean", "meta.cache.kvAvailable missing");

  if (meta.status === "ERROR") {
    assert(payload.data === null, "data must be null on ERROR");
    assert(payload.error && payload.error.code, "error missing on ERROR");
    return;
  }

  assert(payload.data && typeof payload.data === "object", "data missing on OK/PARTIAL");
  const data = payload.data;
  assert(Array.isArray(data.groups), "data.groups missing");
  assert(typeof data.metricsById === "object", "data.metricsById missing");
  assert(Array.isArray(data.signals), "data.signals missing");
  assert(data.uiDefaults, "data.uiDefaults missing");
  assert(Array.isArray(data.uiDefaults.availableUis), "data.uiDefaults.availableUis missing");

  const metricIds = Object.keys(catalog.metricsCatalog);
  const presentIds = Object.keys(data.metricsById);
  presentIds.forEach((id) => assert(metricIds.includes(id), `Unknown metric id ${id}`));

  if (meta.status === "OK") {
    assert(meta.metricsCount === 43, "metricsCount should be 43 on OK");
    assert(meta.groupsCount === 9, "groupsCount should be 9 on OK");
    assert(Array.isArray(meta.missingMetricIds), "missingMetricIds missing");
    assert(meta.missingMetricIds.length === 0, "missingMetricIds not empty on OK");
  }

  if (meta.status === "PARTIAL") {
    assert(meta.metricsCount > 0 && meta.metricsCount < 43, "metricsCount invalid on PARTIAL");
    assert(Array.isArray(meta.missingMetricIds), "missingMetricIds missing on PARTIAL");
    assert(
      meta.missingMetricIds.length === 43 - meta.metricsCount,
      "missingMetricIds length mismatch"
    );
  }
}

async function run() {
  const catalog = await loadCatalog();
  const payload = await fetchJson(`${baseUrl}/api/metrics?v=5`);
  validateEnvelope(payload, catalog);
  logOk("Structure gate passed");

  const partialPayload = await fetchJson(`${baseUrl}/api/metrics?v=5&omit=risk.vix`);
  assert(partialPayload.meta.status === "PARTIAL", "Partial gate status mismatch");
  assert(
    partialPayload.meta.missingMetricIds.includes("risk.vix"),
    "Partial gate missing risk.vix"
  );
  logOk("Partial data gate passed");

  console.log("NOTE: Network gate and renderer consistency require browser verification.");
}

run().catch((error) => {
  console.error(`FAIL: ${error.message}`);
  process.exit(1);
});
