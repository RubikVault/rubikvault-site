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
  "rv-alpha-radar"
];

const FEATURE_META = new Map((FEATURES || []).map((entry) => [entry.id, entry]));
const BLOCK_ID_MAP = new Map(
  BLOCK_ORDER.map((featureId, index) => [featureId, String(index + 1).padStart(2, "0")])
);

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

export function formatBlockTitle(block) {
  if (!block) return "Block -- — Untitled";
  const id = String(block.id || "00").padStart(2, "0");
  const title = cleanTitle(block.title || block.featureId || "");
  return `Block ${id} — ${title}`;
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
  const defaultFields = [
    {
      key: "data",
      path: "data",
      kind: "object",
      validator: "nonEmpty",
      reasonOnFail: "empty_data",
      fixHint:
        "Endpoint liefert EMPTY/QUALITY_FAIL → prüfe upstream/validator/mapper; in Preview erst seed in Prod erzeugen.",
      required: expectedMinItems > 0
    }
  ];

  const normalizedEntry = {
    ...entry,
    id: entry.id || resolvedId,
    featureId,
    title: entry.title || meta.title || toTitle(featureId),
    api: entry.api ?? meta.api ?? null,
    apiPath: entry.api ? `/api/${entry.api}` : null,
    fields: Array.isArray(entry.fields) ? entry.fields : defaultFields,
    fixHints: entry.fixHints || {}
  };

  if (!normalizedEntry.emptyPolicy) {
    normalizedEntry.emptyPolicy =
      normalizedEntry.blockType === "CONTINUOUS"
        ? "NEVER_EMPTY"
        : normalizedEntry.blockType === "LIVE"
          ? "STALE_OK"
          : "EMPTY_OK_WITH_CONTEXT";
  }

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
