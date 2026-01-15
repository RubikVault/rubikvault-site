import { FEATURES } from "../rv-config.js";
import { CONTINUOUS_BLOCKS } from "./blocks-registry-continuous.js";
import { EVENT_BLOCKS } from "./blocks-registry-event.js";
import { LIVE_BLOCKS } from "./blocks-registry-live.js";

const BLOCK_ORDER = [
  "rv-market-cockpit",
  "rv-yield-curve",
  "rv-sector-rotation",
  "rv-central-bank-watch",
  "rv-market-health",
  "rv-price-snapshot",
  "rv-top-movers",
  "rv-earnings-calendar",
  "rv-news-headlines",
  "rv-news-intelligence",
  "rv-watchlist-local",
  "rv-export-csv",
  "rv-macro-rates",
  "rv-sp500-sectors",
  "rv-market-regime",
  "rv-arb-risk-regime",
  "rv-arb-liquidity-pulse",
  "rv-arb-breadth-lite",
  "rv-why-moved",
  "rv-volume-anomaly",
  "rv-breakout-energy",
  "rv-hype-divergence",
  "rv-congress-trading",
  "rv-insider-cluster",
  "rv-analyst-stampede",
  "rv-smart-money",
  "rv-alpha-performance",
  "rv-earnings-reality",
  "rv-crypto-snapshot",
  "rv-sentiment-barometer",
  "rv-tech-signals",
  "rv-rvci-engine",
  "rv-alpha-radar"
];

const FEATURE_META = new Map((FEATURES || []).map((entry) => [entry.id, entry]));
const BLOCK_ID_MAP = new Map(
  BLOCK_ORDER.map((featureId, index) => [featureId, String(index + 1).padStart(2, "0")])
);

function normalizeValidator(raw) {
  if (!raw) return null;
  if (typeof raw === "string") {
    if (raw.startsWith("arrayMin:")) {
      return { type: "arrayMin", min: Number(raw.split(":")[1] || 0) };
    }
    return { type: raw };
  }
  if (typeof raw === "object" && raw.type) return raw;
  return null;
}

function makeDefaultFieldsContract(emptyPolicy, expectedMinItems) {
  const allowPreview = true;
  return [
    {
      key: "data",
      path: "data",
      required: emptyPolicy !== "CLIENT_ONLY",
      allowInPreviewEmpty: allowPreview,
      validator: { type: "nonEmpty" },
      reasonOnFail: "EMPTY_DATA",
      fixHint:
        "Endpoint produced empty data. Check: endpoint status/reason, mapper output, validator strictness, upstream auth."
    },
    {
      key: "status",
      path: "meta.status",
      required: true,
      validator: { type: "oneOf", values: ["LIVE", "STALE", "EMPTY"] },
      reasonOnFail: "NO_STATUS",
      fixHint: "Envelope mismatch. Ensure resilience wrapper returns meta.status."
    }
  ];
}

function toTitle(featureId) {
  if (!featureId) return "Unknown";
  return featureId
    .replace(/^rv-/, "")
    .split("-")
    .map((chunk) => chunk.charAt(0).toUpperCase() + chunk.slice(1))
    .join(" ");
}

function cleanTitle(rawTitle = "") {
  const value = String(rawTitle || "").trim();
  if (!value) return "Untitled";
  return value
    .replace(/^Block\s+[0-9]{1,2}\s*[-–—]\s*/i, "")
    .replace(/^Block\s+XX\s*[-–—]\s*/i, "")
    .replace(/^Hero\s*[-–—]\s*/i, "")
    .replace(/^Block\s+[-–—]\s*/i, "")
    .trim();
}

export function formatBlockTitle(block, includeDebug = false) {
  if (!block) return "Untitled";
  const title = cleanTitle(block.title || block.featureId || "");
  // Only include block number in debug mode
  if (includeDebug) {
    const id = String(block.id || "00").padStart(2, "0");
    return `Block ${id} — ${title}`;
  }
  return title;
}

const mergedRegistry = {
  ...CONTINUOUS_BLOCKS,
  ...EVENT_BLOCKS,
  ...LIVE_BLOCKS
};

function normalizeRegistry(registryList) {
  const list = Array.isArray(registryList) ? registryList.slice() : [];
  return list.map((entry, index) => ({
    ...entry,
    id: String(entry.id || index + 1).padStart(2, "0")
  }));
}

const normalizedRegistry = {};
let fallbackIndex = 0;
const registryList = [];

Object.entries(mergedRegistry).forEach(([featureId, entry]) => {
  if (!entry) return;
  const meta = FEATURE_META.get(featureId) || {};
  const resolvedId = BLOCK_ID_MAP.get(featureId) || String(BLOCK_ORDER.length + ++fallbackIndex).padStart(2, "0");
  const expectedMinItems = Number.isFinite(entry.expectedMinItems) ? entry.expectedMinItems : 0;
  const emptyPolicy =
    entry.emptyPolicy ||
    (entry.blockType === "CONTINUOUS"
      ? "NEVER_EMPTY"
      : entry.blockType === "LIVE"
        ? "STALE_OK"
        : "EMPTY_OK_WITH_CONTEXT");
  const defaultFieldsContract = makeDefaultFieldsContract(emptyPolicy, expectedMinItems);
  const fieldsContractSource =
    Array.isArray(entry.fieldsContract) ? entry.fieldsContract : Array.isArray(entry.fields) ? entry.fields : defaultFieldsContract;
  const fieldsContract = fieldsContractSource.map((field) => ({
    ...field,
    validator: normalizeValidator(field.validator)
  }));

  const normalizedEntry = {
    ...entry,
    id: entry.id || resolvedId,
    featureId,
    title: entry.title || meta.title || toTitle(featureId),
    api: entry.api ?? meta.api ?? null,
    apiPath: entry.api ? `/api/${entry.api}` : null,
    fieldsContract,
    fields: fieldsContract,
    fixHints: entry.fixHints || {},
    emptyPolicy
  };

  normalizedRegistry[featureId] = normalizedEntry;
  registryList.push(normalizedEntry);
});

export const BLOCK_REGISTRY = normalizedRegistry;
const orderedRegistryList = [
  ...BLOCK_ORDER.map((featureId) => normalizedRegistry[featureId]).filter(Boolean),
  ...registryList.filter((entry) => !BLOCK_ID_MAP.has(entry.featureId))
];
export const BLOCK_REGISTRY_LIST = normalizeRegistry(orderedRegistryList);
export function listBlockIds() {
  return BLOCK_REGISTRY_LIST.map((entry) => entry.id);
}
export { normalizeRegistry };

export const MIRROR_IDS = Object.values(BLOCK_REGISTRY).flatMap((entry) => entry.mirrorFiles);

function computeRegistryHash(list) {
  const payload = JSON.stringify(
    (list || []).map((entry) => ({
      id: entry.id,
      featureId: entry.featureId,
      apiPath: entry.apiPath
    }))
  );
  let hash = 0;
  for (let i = 0; i < payload.length; i += 1) {
    hash = (hash * 31 + payload.charCodeAt(i)) >>> 0;
  }
  return hash.toString(36).padStart(8, "0").slice(0, 8);
}

export const REGISTRY_HASH = computeRegistryHash(BLOCK_REGISTRY_LIST);
