import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";

const ROOT = path.resolve(new URL("../..", import.meta.url).pathname);
const PUBLIC_MIRRORS = path.join(ROOT, "public", "mirrors");
const MIRRORS = path.join(ROOT, "mirrors");
const SNAPSHOT_DIR = path.join(ROOT, "public", "data", "snapshots");
const REGISTRY_PATH = path.join(ROOT, "public", "features", "feature-registry.json");
const RENDER_PLAN_PATH = path.join(ROOT, "public", "data", "render-plan.json");

function listJsonFiles(dir) {
  const results = [];
  if (!fs.existsSync(dir)) return results;
  const stack = [dir];
  while (stack.length) {
    const current = stack.pop();
    const entries = fs.readdirSync(current, { withFileTypes: true });
    for (const entry of entries) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(full);
      } else if (entry.name.endsWith(".json")) {
        results.push(full);
      }
    }
  }
  return results;
}

function readJson(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return null;
  }
}

function isBotName(name) {
  return /bot|github-actions|actions/i.test(String(name || ""));
}

function gitSafe(command) {
  try {
    return execSync(command, { stdio: ["ignore", "pipe", "ignore"] }).toString().trim();
  } catch {
    return "";
  }
}

function getChangedFiles() {
  const baseRef = process.env.GITHUB_BASE_REF;
  if (baseRef) {
    const diff = gitSafe(`git diff --name-only origin/${baseRef}...HEAD`);
    if (diff) return diff.split("\n").filter(Boolean);
  }
  const fallback = gitSafe("git diff --name-only HEAD~1..HEAD");
  if (fallback) return fallback.split("\n").filter(Boolean);
  return [];
}

function main() {
  const errors = [];

  const publicMirrorFiles = listJsonFiles(PUBLIC_MIRRORS);
  const mirrorFiles = listJsonFiles(MIRRORS);

  if (publicMirrorFiles.length) {
    errors.push("public/mirrors contains json files (SSOT violation)");
  }
  if (publicMirrorFiles.length && mirrorFiles.length) {
    errors.push("split-brain detected: mirrors/ and public/mirrors both contain json");
  }

  const registry = readJson(REGISTRY_PATH);
  const features = Array.isArray(registry?.features) ? registry.features : [];
  const featureById = new Map(features.map((entry) => [entry.id, entry]));

  features.forEach((feature) => {
    const mirrorPath = feature?.mirrorPath;
    if (!mirrorPath || typeof mirrorPath !== "string") return;
    if (mirrorPath.startsWith("public/mirrors/")) {
      errors.push(`mirrorPath uses public/mirrors: ${feature.id}`);
      return;
    }
    if (mirrorPath.startsWith("mirrors/")) {
      const expected = path.join(ROOT, mirrorPath);
      if (!fs.existsSync(expected)) {
        const legacy = path.join(ROOT, "public", mirrorPath);
        if (fs.existsSync(legacy)) {
          errors.push(`mirrorPath points to mirrors but file only exists in public/mirrors: ${mirrorPath}`);
        }
      }
    }
  });

  const renderPlan = readJson(RENDER_PLAN_PATH);
  const renderBlocks = Array.isArray(renderPlan?.blocks) ? renderPlan.blocks : [];
  renderBlocks.forEach((block) => {
    const feature = featureById.get(block.id);
    const mirrorPath = feature?.mirrorPath;
    if (!mirrorPath || !mirrorPath.startsWith("mirrors/")) return;
    const mirrorFile = path.join(ROOT, mirrorPath);
    if (!fs.existsSync(mirrorFile)) {
      errors.push(`render-plan block missing mirror: ${block.id} -> ${mirrorPath}`);
    }
  });

  const changedFiles = getChangedFiles();
  if (changedFiles.length) {
    const actor = process.env.GITHUB_ACTOR || "";
    const message = gitSafe("git log -1 --pretty=%s");
    const author = gitSafe("git log -1 --pretty=%an");
    const allowSnapshots = /\[bot-snapshots\]/i.test(message);
    const isBot = allowSnapshots || isBotName(actor) || isBotName(author);
    if (!isBot) {
      const touched = changedFiles.filter(
        (file) => file.startsWith("public/data/snapshots/") || file.startsWith("mirrors/")
      );
      if (touched.length) {
        errors.push(`human commit touches snapshots/mirrors: ${touched.join(", ")}`);
      }
    }
  }

  if (errors.length) {
    console.error("ssot-guard failed:");
    errors.forEach((err) => console.error(`- ${err}`));
    process.exit(1);
  }

  console.log("ssot-guard ok");
}

main();
