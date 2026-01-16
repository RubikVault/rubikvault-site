#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const REGISTRY_PATH = path.join(ROOT, "data", "feature-registry.json");

function fail(message) {
  console.error(message);
  process.exit(1);
}

function loadRegistry() {
  if (!fs.existsSync(REGISTRY_PATH)) {
    fail(`feature-registry missing at ${REGISTRY_PATH}`);
  }
  try {
    const raw = fs.readFileSync(REGISTRY_PATH, "utf8");
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      fail("feature-registry must be an array");
    }
    return parsed;
  } catch (error) {
    fail(`failed to read/parse feature-registry: ${error?.message || error}`);
  }
}

function validateEntry(entry, index) {
  const issues = [];
  if (entry.idx !== index) issues.push(`idx mismatch (expected ${index}, got ${entry.idx})`);
  if (!entry.id || typeof entry.id !== "string") issues.push("missing id");
  if (!entry.title || typeof entry.title !== "string") issues.push("missing title");
  if (entry.api !== null && typeof entry.api !== "string") issues.push("api must be string|null");
  if (typeof entry.enabled !== "boolean") issues.push("enabled must be boolean");
  if (!["cockpit", "feature"].includes(entry.kind)) issues.push("kind must be cockpit|feature");

  if (entry.api && !entry.api.startsWith("/api/")) {
    issues.push("api must start with /api/");
  }

  return issues;
}

function main() {
  const registry = loadRegistry();
  const expectedLength = 34;
  if (registry.length !== expectedLength) {
    fail(`registry length ${registry.length} !== ${expectedLength}`);
  }

  const ids = new Set();
  registry.forEach((entry, index) => {
    const issues = validateEntry(entry, index);
    if (ids.has(entry.id)) {
      issues.push(`duplicate id ${entry.id}`);
    }
    ids.add(entry.id);
    if (issues.length) {
      fail(`entry ${index} (${entry.id || "unknown"}): ${issues.join("; ")}`);
    }
  });

  console.log("feature-registry valid (34 entries, contiguous idx 0..33)");
}

main();
