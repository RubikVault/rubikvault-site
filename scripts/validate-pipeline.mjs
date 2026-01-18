import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(new URL("..", import.meta.url).pathname);
const PUBLIC_DATA = path.join(ROOT, "public", "data");
const MAX_PUBLIC_BYTES = 200 * 1024;

function listFiles(dir, extFilter) {
  const results = [];
  const stack = [dir];
  while (stack.length) {
    const current = stack.pop();
    if (!fs.existsSync(current)) continue;
    const entries = fs.readdirSync(current, { withFileTypes: true });
    entries.forEach((entry) => {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(full);
      } else if (!extFilter || extFilter.some((ext) => full.endsWith(ext))) {
        results.push(full);
      }
    });
  }
  return results;
}

function fileContains(filePath, pattern) {
  const raw = fs.readFileSync(filePath, "utf8");
  return pattern.test(raw);
}

function assert(condition, message, errors) {
  if (!condition) errors.push(message);
}

function main() {
  const errors = [];

  const providerFiles = listFiles(path.join(ROOT, "scripts", "providers"), [".js", ".mjs"]);
  providerFiles.forEach((filePath) => {
    if (fileContains(filePath, /public\/data/i)) {
      errors.push(`Provider script writes to public/data: ${filePath}`);
    }
  });

  const publicFiles = listFiles(path.join(ROOT, "public"), [".js", ".html", "internal-dashboard"]);
  const apiFetchPattern = /fetch\([^)]*\/api\//;
  publicFiles.forEach((filePath) => {
    if (apiFetchPattern.test(fs.readFileSync(filePath, "utf8"))) {
      errors.push(`Public file fetches /api: ${filePath}`);
    }
  });

  const buildSnapshotPath = path.join(ROOT, "scripts", "build-snapshots.mjs");
  if (fs.existsSync(buildSnapshotPath)) {
    assert(!fileContains(buildSnapshotPath, /fetch\(/), "build-snapshots must not call fetch()", errors);
  }

  const middlewarePath = path.join(ROOT, "functions", "api", "_middleware.js");
  if (fs.existsSync(middlewarePath)) {
    assert(fileContains(middlewarePath, /mapApiToStaticPath/), "middleware must map /api to /data", errors);
  }

  const systemHealthPath = path.join(PUBLIC_DATA, "system-health.json");
  if (!fs.existsSync(systemHealthPath)) {
    errors.push("public/data/system-health.json missing");
  }

  const runReportPath = path.join(PUBLIC_DATA, "run-report.json");
  if (fs.existsSync(runReportPath)) {
    errors.push("public/data/run-report.json should not be public");
  }

  const publicJsonFiles = listFiles(PUBLIC_DATA, [".json"]);
  const sensitivePatterns = [
    /\/Users\/[^/]+/i,
    /\/home\/[^/]+/i,
    new RegExp("[A-Za-z]:\\\\Us" + "ers\\\\[^\\\\]+", "i"),
    /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/i,
    /\b[A-Za-z0-9-]+\.local\b/i,
    /\b[A-Za-z0-9-]+\.lan\b/i,
    /\b[A-Za-z0-9-]+\.internal\b/i
  ];
  publicJsonFiles.forEach((filePath) => {
    let raw = "";
    try {
      raw = fs.readFileSync(filePath, "utf8");
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
    } catch (error) {
      errors.push(`public data invalid json: ${filePath}`);
      return;
    }
    const byteSize = Buffer.byteLength(raw, "utf8");
    if (byteSize > MAX_PUBLIC_BYTES) {
      errors.push(`public data too large (${byteSize} bytes): ${filePath}`);
    }
    for (const pattern of sensitivePatterns) {
      if (pattern.test(raw)) {
        errors.push(`public data contains sensitive pattern ${pattern}: ${filePath}`);
        break;
      }
    }
  });

  if (errors.length) {
    console.error("Pipeline guardrails failed:\n" + errors.map((e) => `- ${e}`).join("\n"));
    process.exit(1);
  }
  console.log("Pipeline guardrails OK");
}

main();



// RV_V3_SPLIT_BRAIN_GATES
// Hard gates to prevent split-brain:
// 1) providers must not write public/data
// 2) public UI/dashboard must not fetch /api
// 3) build-snapshots must not do network
// 4) functions/api must not call external providers
// 5) public/data snapshots must include required v3 meta fields (best-effort checks)
import path from "node:path";

function die(msg) {
  console.error("::error::" + msg);
  process.exit(1);
}

function rgLike(pattern, dir) {
  const out = [];
  const stack = [dir];
  while (stack.length) {
    const d = stack.pop();
    let ents = [];
    try { ents = fs.readdirSync(d, { withFileTypes: true }); } catch { continue; }
    for (const e of ents) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) {
        if (e.name === "node_modules" || e.name === ".git") continue;
        stack.push(p);
      } else {
        try {
          const t = fs.readFileSync(p, "utf-8");
          if (pattern.test(t)) out.push(p);
        } catch {}
      }
    }
  }
  return out;
}

// (1) providers writing public/data
{
  const hits = rgLike(/public\/data\//g, "scripts/providers");
  if (hits.length) die("providers must not touch public/data/* (found in: " + hits.slice(0,10).join(", ") + ")");
}

// (2) UI fetching /api (public surface)
{
  const hits = rgLike(/fetch\(\s*["']\/api\//g, "public");
  if (hits.length) die("public UI must not fetch /api/* (found in: " + hits.slice(0,10).join(", ") + ")");
}

// (3) build-snapshots doing network
{
  const t = fs.readFileSync("scripts/build-snapshots.mjs", "utf-8");
  if (/(fetch\(|https?:\/\/|node:net|node:dns|curl\s)/.test(t)) die("build-snapshots.mjs must not do network calls");
}

// (4) functions/api calling externals
{
  const hits = rgLike(/https?:\/\/|fetch\(/g, "functions/api");
  const bad = hits.filter(p => !/\/_middleware\.js$/.test(p));
  if (bad.length) die("functions/api must serve static snapshots only (found external patterns in: " + bad.slice(0,10).join(", ") + ")");
}

// (5) required v3 meta fields (best-effort on key files)
{
  const must = [
    "public/data/system-health.json",
    "public/data/provider-state.json",
    "public/data/usage-report.json",
    "public/data/error-summary.json",
    "public/data/run-report.json",
  ];
  for (const f of must) {
    if (!fs.existsSync(f)) die("missing required public snapshot: " + f);
    const txt = fs.readFileSync(f, "utf-8");
    if (!/\"meta\"\s*:\s*\{/.test(txt)) die("missing meta object in: " + f);
    if (!/freshness/.test(txt)) die("missing meta.freshness in: " + f);
    if (!/validation/.test(txt)) die("missing meta.validation in: " + f);
    if (!/schedule/.test(txt)) die("missing meta.schedule in: " + f);
  }
}

