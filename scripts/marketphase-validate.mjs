import fs from "fs/promises";
import path from "path";
import { LEGAL_TEXT } from "./marketphase-core.mjs";

const DATA_DIR = path.join("public", "data", "marketphase");

function isNumber(value) {
  return typeof value === "number" && !Number.isNaN(value);
}

function pushError(errors, message) {
  errors.push(message);
}

function validateSwingList(errors, list, label) {
  if (!Array.isArray(list)) {
    pushError(errors, `${label} must be an array.`);
    return;
  }
  list.forEach((item, idx) => {
    if (!item || typeof item !== "object") {
      pushError(errors, `${label}[${idx}] must be an object.`);
      return;
    }
    if (!isNumber(item.index)) pushError(errors, `${label}[${idx}].index missing.`);
    if (!item.date) pushError(errors, `${label}[${idx}].date missing.`);
    if (!isNumber(item.price)) pushError(errors, `${label}[${idx}].price missing.`);
    if (item.type !== "high" && item.type !== "low") {
      pushError(errors, `${label}[${idx}].type invalid.`);
    }
  });
}

function validateEnvelope(errors, payload, symbol) {
  if (!payload || typeof payload !== "object") {
    pushError(errors, `${symbol}: payload not object.`);
    return;
  }
  if (payload.feature !== "marketphase") {
    pushError(errors, `${symbol}: feature must be marketphase.`);
  }
  if (typeof payload.ok !== "boolean") {
    pushError(errors, `${symbol}: ok must be boolean.`);
  }

  const meta = payload.meta || {};
  if (!meta.symbol) pushError(errors, `${symbol}: meta.symbol missing.`);
  if (!meta.generatedAt) pushError(errors, `${symbol}: meta.generatedAt missing.`);
  if (!meta.status) pushError(errors, `${symbol}: meta.status missing.`);
  if (!meta.version) pushError(errors, `${symbol}: meta.version missing.`);
  if (!meta.legal || meta.legal !== LEGAL_TEXT) {
    pushError(errors, `${symbol}: meta.legal missing or mismatched.`);
  }

  const data = payload.data || {};
  if (!data.features || typeof data.features !== "object") {
    pushError(errors, `${symbol}: data.features missing.`);
  } else {
    if (!("RSI" in data.features)) pushError(errors, `${symbol}: features.RSI missing.`);
    if (!("MACDHist" in data.features)) pushError(errors, `${symbol}: features.MACDHist missing.`);
    if (!("ATR%" in data.features)) pushError(errors, `${symbol}: features.ATR% missing.`);
    if (!("SMA50" in data.features)) pushError(errors, `${symbol}: features.SMA50 missing.`);
    if (!("SMA200" in data.features)) pushError(errors, `${symbol}: features.SMA200 missing.`);
    if (!("SMATrend" in data.features)) pushError(errors, `${symbol}: features.SMATrend missing.`);
  }

  const swings = data.swings || {};
  validateSwingList(errors, swings.raw, `${symbol}: swings.raw`);
  validateSwingList(errors, swings.confirmed, `${symbol}: swings.confirmed`);

  const elliott = data.elliott || {};
  const completed = elliott.completedPattern || {};
  if (typeof completed.valid !== "boolean") {
    pushError(errors, `${symbol}: completedPattern.valid missing.`);
  }
  if (!completed.direction) pushError(errors, `${symbol}: completedPattern.direction missing.`);
  if (!isNumber(completed.confidence0_100)) {
    pushError(errors, `${symbol}: completedPattern.confidence0_100 missing.`);
  }
  if (!completed.rules || typeof completed.rules !== "object") {
    pushError(errors, `${symbol}: completedPattern.rules missing.`);
  }

  const developing = elliott.developingPattern || {};
  if (!developing.possibleWave) pushError(errors, `${symbol}: developingPattern.possibleWave missing.`);
  if (!isNumber(developing.confidence)) pushError(errors, `${symbol}: developingPattern.confidence missing.`);
  if (!developing.fibLevels || typeof developing.fibLevels !== "object") {
    pushError(errors, `${symbol}: developingPattern.fibLevels missing.`);
  }

  const uncertainty = elliott.uncertainty || {};
  if (typeof uncertainty.lastSwingConfirmed !== "boolean") {
    pushError(errors, `${symbol}: uncertainty.lastSwingConfirmed missing.`);
  }
  if (!isNumber(uncertainty.alternativeCounts)) {
    pushError(errors, `${symbol}: uncertainty.alternativeCounts missing.`);
  }
  if (!uncertainty.confidenceDecay || typeof uncertainty.confidenceDecay !== "object") {
    pushError(errors, `${symbol}: uncertainty.confidenceDecay missing.`);
  }

  const fib = data.fib || elliott.fib || {};
  if (!fib.ratios || typeof fib.ratios !== "object") {
    pushError(errors, `${symbol}: fib.ratios missing.`);
  }
  if (!isNumber(fib.conformanceScore)) {
    pushError(errors, `${symbol}: fib.conformanceScore missing.`);
  }

  if (!("multiTimeframeAgreement" in data)) {
    pushError(errors, `${symbol}: multiTimeframeAgreement missing.`);
  }
  if (!data.disclaimer || data.disclaimer !== LEGAL_TEXT) {
    pushError(errors, `${symbol}: data.disclaimer missing or mismatched.`);
  }
}

async function loadSymbols() {
  const envSymbols = process.env.SYMBOLS;
  if (envSymbols) {
    return envSymbols
      .split(",")
      .map((symbol) => symbol.trim().toUpperCase())
      .filter(Boolean);
  }
  const indexPath = path.join(DATA_DIR, "index.json");
  const raw = await fs.readFile(indexPath, "utf8");
  const payload = JSON.parse(raw);
  const symbols = payload?.data?.symbols || [];
  return symbols
    .map((entry) => entry.symbol)
    .filter(Boolean)
    .map((symbol) => symbol.toUpperCase());
}

async function main() {
  const symbols = await loadSymbols();
  if (!symbols.length) {
    throw new Error("No symbols found for validation.");
  }
  const errors = [];
  for (const symbol of symbols) {
    const filePath = path.join(DATA_DIR, `${symbol}.json`);
    const raw = await fs.readFile(filePath, "utf8");
    const payload = JSON.parse(raw);
    validateEnvelope(errors, payload, symbol);
  }

  if (errors.length) {
    console.error("MarketPhase validation failed:");
    errors.forEach((err) => console.error(`- ${err}`));
    process.exit(1);
  }
  console.log(`MarketPhase validation OK (${symbols.join(", ")})`);
}

main().catch((error) => {
  console.error("MarketPhase validation failed:", error.message || error);
  process.exit(1);
});
