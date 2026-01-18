import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(new URL("..", import.meta.url).pathname);

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

  if (errors.length) {
    console.error("Pipeline guardrails failed:\n" + errors.map((e) => `- ${e}`).join("\n"));
    process.exit(1);
  }
  console.log("Pipeline guardrails OK");
}

main();
