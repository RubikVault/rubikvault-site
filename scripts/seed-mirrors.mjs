import fs from "node:fs/promises";
import path from "node:path";

const BASE_URL = process.env.PROD_URL || "https://rubikvault.com";
const TOKEN = process.env.RV_CRON_TOKEN || "";
const FEATURES = ["top-movers", "yield-curve", "sector-rotation", "market-health"];

async function fetchJson(url) {
  const res = await fetch(url, {
    headers: {
      Accept: "application/json",
      "x-rv-cron": "1",
      Authorization: `Bearer ${TOKEN}`
    }
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  if (text.trim().startsWith("<")) throw new Error("HTML response");
  return JSON.parse(text);
}

function isValidPayload(payload) {
  if (!payload || typeof payload !== "object") return false;
  if (!payload.meta || typeof payload.meta !== "object") return false;
  if (!payload.meta.status) return false;
  if (payload.ok === false) return false;
  return true;
}

async function atomicWrite(filePath, data) {
  const tmpPath = `${filePath}.tmp`;
  await fs.writeFile(tmpPath, JSON.stringify(data, null, 2));
  await fs.rename(tmpPath, filePath);
}

async function seed() {
  if (!TOKEN) {
    console.error("[seed-mirrors] missing RV_CRON_TOKEN; aborting");
    process.exit(1);
  }
  const outDir = path.join(process.cwd(), "public", "mirrors");
  await fs.mkdir(outDir, { recursive: true });
  const nowIso = new Date().toISOString();

  for (const featureId of FEATURES) {
    const url = `${BASE_URL}/api/${featureId}?debug=1`;
    let payload = null;
    try {
      payload = await fetchJson(url);
    } catch (error) {
      console.warn(`[seed-mirrors] fetch failed ${featureId}: ${error.message}`);
      continue;
    }
    if (!isValidPayload(payload)) {
      console.warn(`[seed-mirrors] invalid payload ${featureId}`);
      continue;
    }

    const mirror = {
      schemaVersion: 1,
      savedAt: nowIso,
      source: "github-actions",
      payload
    };
    const filePath = path.join(outDir, `${featureId}.json`);
    await atomicWrite(filePath, mirror);
    console.log(`[seed-mirrors] wrote ${filePath}`);
  }
}

seed().catch((error) => {
  console.error(`[seed-mirrors] fatal: ${error.message}`);
  process.exitCode = 1;
});
