import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(new URL("..", import.meta.url).pathname);
const PUBLIC_DATA = path.join(ROOT, "public", "data");
const SNAPSHOT_DIR = path.join(PUBLIC_DATA, "snapshots");
const MAX_PUBLIC_BYTES = 200 * 1024;

const SENSITIVE_PATTERNS = [
  /\/Users\/[^/]+/i,
  /\/home\/[^/]+/i,
  new RegExp("[A-Za-z]:\\\\Us" + "ers\\\\[^\\\\]+", "i"),
  /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/i,
  /\b[A-Za-z0-9-]+\.local\b/i,
  /\b[A-Za-z0-9-]+\.lan\b/i,
  /\b[A-Za-z0-9-]+\.internal\b/i
];

function listFiles(dir, exts = null) {
  const results = [];
  const stack = [dir];
  while (stack.length) {
    const current = stack.pop();
    if (!fs.existsSync(current)) continue;
    const entries = fs.readdirSync(current, { withFileTypes: true });
    for (const entry of entries) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === "node_modules" || entry.name === ".git") continue;
        stack.push(full);
      } else if (!exts || exts.some((ext) => full.endsWith(ext))) {
        results.push(full);
      }
    }
  }
  return results;
}

function readText(filePath) {
  return fs.readFileSync(filePath, "utf8");
}

function safeJson(filePath, errors) {
  let raw = "";
  try {
    raw = readText(filePath);
  } catch {
    errors.push(`public data unreadable: ${filePath}`);
    return null;
  }
  if (!raw.trim()) {
    errors.push(`public data empty: ${filePath}`);
    return null;
  }
  if (/<!doctype|<html/i.test(raw)) {
    errors.push(`public data is html: ${filePath}`);
    return null;
  }
  try {
    return JSON.parse(raw);
  } catch {
    errors.push(`public data invalid json: ${filePath}`);
    return null;
  }
}

function ensureMetaFields(payload, filePath, errors) {
  if (!payload || typeof payload !== "object") {
    errors.push(`missing meta object in: ${filePath}`);
    return;
  }
  const meta = payload.meta;
  if (!meta || typeof meta !== "object") {
    errors.push(`missing meta object in: ${filePath}`);
    return;
  }
  if (!meta.freshness) errors.push(`missing meta.freshness in: ${filePath}`);
  if (!meta.validation) errors.push(`missing meta.validation in: ${filePath}`);
  if (!meta.schedule) errors.push(`missing meta.schedule in: ${filePath}`);
  if (!meta.runId) errors.push(`missing meta.runId in: ${filePath}`);
}

function main() {
  const errors = [];

  // Gate A: providers must not write public/data
  const providerFiles = listFiles(path.join(ROOT, "scripts", "providers"), [".js", ".mjs"]);
  providerFiles.forEach((filePath) => {
    if (/public\/data/i.test(readText(filePath))) {
      errors.push(`Provider script writes to public/data: ${filePath}`);
    }
  });

  // Gate B: public UI must not fetch /api
  const publicFiles = listFiles(path.join(ROOT, "public"));
  const apiFetchPattern = /fetch\([^)]*["'`]\/api\//;
  publicFiles.forEach((filePath) => {
    const text = readText(filePath);
    if (apiFetchPattern.test(text)) {
      errors.push(`Public file fetches /api: ${filePath}`);
    }
  });

  // Gate C: build-snapshots must not do network calls
  const buildSnapshotPath = path.join(ROOT, "scripts", "build-snapshots.mjs");
  if (fs.existsSync(buildSnapshotPath)) {
    const text = readText(buildSnapshotPath);
    if (/(fetch\(|https?:\/\/|node:https|node:net|node:dns|undici|axios|got)/.test(text)) {
      errors.push("build-snapshots.mjs must not do network calls");
    }
  }

  // Gate D: functions/api must be static-only (no external URLs)
  const apiFiles = listFiles(path.join(ROOT, "functions", "api"), [".js", ".mjs"]);
  apiFiles.forEach((filePath) => {
    const text = readText(filePath);
    if (/https?:\/\//i.test(text)) {
      errors.push(`functions/api contains external URL: ${filePath}`);
    }
    if (/(undici|axios|got)/.test(text)) {
      errors.push(`functions/api contains external client lib: ${filePath}`);
    }
  });

  // Gate E: snapshot meta contract
  const snapshotFiles = listFiles(SNAPSHOT_DIR, [".json"]);
  snapshotFiles.forEach((filePath) => {
    const payload = safeJson(filePath, errors);
    if (!payload) return;
    ensureMetaFields(payload, filePath, errors);
  });

  const coreDebugFiles = [
    path.join(PUBLIC_DATA, "system-health.json"),
    path.join(PUBLIC_DATA, "provider-state.json"),
    path.join(PUBLIC_DATA, "usage-report.json"),
    path.join(PUBLIC_DATA, "error-summary.json")
  ];
  coreDebugFiles.forEach((filePath) => {
    if (!fs.existsSync(filePath)) {
      errors.push(`public data missing: ${filePath}`);
      return;
    }
    const payload = safeJson(filePath, errors);
    if (!payload) return;
    ensureMetaFields(payload, filePath, errors);
  });

  // Gate F: bundle/render-plan sanity
  const registryPath = path.join(ROOT, "public", "features", "feature-registry.json");
  let registryFeatures = [];
  if (fs.existsSync(registryPath)) {
    try {
      const reg = JSON.parse(readText(registryPath));
      registryFeatures = Array.isArray(reg.features) ? reg.features : [];
    } catch {
      errors.push("feature-registry.json invalid");
    }
  }

  const bundlePath = path.join(PUBLIC_DATA, "bundle.json");
  const renderPlanPath = path.join(PUBLIC_DATA, "render-plan.json");
  const bundlePayload = fs.existsSync(bundlePath) ? safeJson(bundlePath, errors) : null;
  const renderPayload = fs.existsSync(renderPlanPath) ? safeJson(renderPlanPath, errors) : null;

  if (!bundlePayload) errors.push("public/data/bundle.json missing");
  if (!renderPayload) errors.push("public/data/render-plan.json missing");

  if (bundlePayload && renderPayload) {
    const bundleBlocks = Array.isArray(bundlePayload.blocks) ? bundlePayload.blocks : [];
    const renderBlocks = Array.isArray(renderPayload.blocks) ? renderPayload.blocks : [];
    if (registryFeatures.length > 0 && bundleBlocks.length === 0) {
      errors.push("bundle.json blocks empty while registry has features");
    }
    if (bundleBlocks.length !== renderBlocks.length) {
      errors.push("bundle.json blocks length != render-plan.json blocks length");
    }
    const bundleDate = Date.parse(bundlePayload.generatedAt || "");
    const renderDate = Date.parse(renderPayload.generatedAt || "");
    if (!Number.isFinite(bundleDate) || new Date(bundleDate).getFullYear() < 2000) {
      errors.push("bundle.json generatedAt invalid");
    }
    if (!Number.isFinite(renderDate) || new Date(renderDate).getFullYear() < 2000) {
      errors.push("render-plan.json generatedAt invalid");
    }
  }

  const registryHasRvci = registryFeatures.some((feature) => feature?.id === "rvci-engine");
  const renderHasRvci = renderPayload
    ? Array.isArray(renderPayload.blocks) && renderPayload.blocks.some((block) => block?.id === "rvci-engine")
    : false;
  if (registryHasRvci || renderHasRvci) {
    const rvciPath = path.join(SNAPSHOT_DIR, "rvci-engine.json");
    const rvciLatestPath = path.join(PUBLIC_DATA, "rvci_latest.json");
    if (!fs.existsSync(rvciPath)) {
      if (!fs.existsSync(rvciLatestPath)) {
        errors.push("rvci-engine snapshot missing and rvci_latest.json missing");
      }
    } else {
      const payload = safeJson(rvciPath, errors);
      if (payload) ensureMetaFields(payload, rvciPath, errors);
    }
  }

  // Public data hygiene
  const publicJsonFiles = listFiles(PUBLIC_DATA, [".json"]);
  publicJsonFiles.forEach((filePath) => {
    let raw = "";
    try {
      raw = readText(filePath);
    } catch {
      errors.push(`public data unreadable: ${filePath}`);
      return;
    }
    if (!raw.trim()) {
      errors.push(`public data empty: ${filePath}`);
      return;
    }
    if (/<!doctype|<html/i.test(raw)) {
      errors.push(`public data is html: ${filePath}`);
      return;
    }
    try {
      JSON.parse(raw);
    } catch {
      errors.push(`public data invalid json: ${filePath}`);
      return;
    }
    const byteSize = Buffer.byteLength(raw, "utf8");
    if (byteSize > MAX_PUBLIC_BYTES) {
      errors.push(`public data too large (${byteSize} bytes): ${filePath}`);
    }
    for (const pattern of SENSITIVE_PATTERNS) {
      if (pattern.test(raw)) {
        errors.push(`public data contains sensitive pattern ${pattern}: ${filePath}`);
        break;
      }
    }
  });

  // Run-report must stay internal
  const runReportPath = path.join(PUBLIC_DATA, "run-report.json");
  if (fs.existsSync(runReportPath)) {
    errors.push("public/data/run-report.json should not be public");
  }

  if (errors.length) {
    console.error("Pipeline guardrails failed:\n" + errors.map((e) => `- ${e}`).join("\n"));
    process.exit(1);
  }
  console.log("Pipeline guardrails OK");
}

main();
