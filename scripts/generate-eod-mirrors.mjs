import fs from "node:fs";
import path from "node:path";
import { FEATURES } from "../rv-config.js";

const OUT_DIRS = ["mirrors"];
const NOW = new Date().toISOString();
const EXTRA_ENDPOINTS = ["quotes", "tech-signals"];

function getApiNames() {
  const names = new Set();
  FEATURES.forEach((feature) => {
    if (feature?.api) names.add(feature.api);
  });
  EXTRA_ENDPOINTS.forEach((name) => names.add(name));
  return Array.from(names);
}

function readExistingDefinitions(filePath) {
  try {
    const raw = fs.readFileSync(filePath, "utf8");
    const parsed = JSON.parse(raw);
    const payload = parsed?.payload || {};
    return payload?.data?.definitions || payload?.definitions || {};
  } catch (error) {
    return {};
  }
}

function buildPayload(apiName, definitions) {
  const dataQuality = { status: "LIVE", reason: "EMPTY", missingFields: [] };
  return {
    ok: true,
    feature: apiName,
    ts: NOW,
    traceId: "mirror",
    schemaVersion: 1,
    cache: { hit: true, ttl: 0, layer: "mirror" },
    upstream: { url: "mirror", status: null, snippet: "" },
    rateLimit: { remaining: "unknown", reset: null, estimated: true },
    dataQuality,
    data: {
      updatedAt: NOW,
      source: "mirror",
      dataQuality,
      confidence: 0,
      definitions: definitions || {},
      reasons: ["MIRROR", "EMPTY"],
      data: {
        items: [],
        signals: [],
        trades: [],
        quotes: [],
        metrics: [],
        stocks: { volumeLeaders: [], gainers: [] }
      }
    }
  };
}

function writeMirrorFile(apiName) {
  const fileName = `${apiName}.json`;
  OUT_DIRS.forEach((dir) => {
    fs.mkdirSync(dir, { recursive: true });
    const filePath = path.join(dir, fileName);
    const existingDefinitions = readExistingDefinitions(filePath);
    const wrapper = {
      ts: NOW,
      source: "mirror",
      payload: buildPayload(apiName, existingDefinitions)
    };
    fs.writeFileSync(filePath, JSON.stringify(wrapper, null, 2));
  });
}

const apiNames = getApiNames();
apiNames.forEach((apiName) => writeMirrorFile(apiName));
console.log(`MIRRORS_WRITTEN=${apiNames.length}`);
