#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";

function safeExec(cmd) {
  try {
    return execSync(cmd, { encoding: "utf8" }).trim();
  } catch {
    return null;
  }
}

const root = process.cwd();
const mirrorsDir = path.join(root, "mirrors");
if (!fs.existsSync(mirrorsDir)) {
  console.warn("mirrors not found; nothing to build");
  process.exit(0);
}

const files = fs
  .readdirSync(mirrorsDir)
  .filter((file) => file.endsWith(".json") && file !== "manifest.json");

const blocks = [];
files.forEach((file) => {
  const fullPath = path.join(mirrorsDir, file);
  let json;
  try {
    json = JSON.parse(fs.readFileSync(fullPath, "utf8"));
  } catch (error) {
    console.warn(`Skipping invalid mirror ${file}: ${error.message}`);
    return;
  }
  const raw = json && json.meta && json.raw ? json.raw : json;
  const id =
    raw?.meta?.blockId ||
    raw?.meta?.feature ||
    raw?.meta?.id ||
    raw?.mirrorId ||
    raw?.feature ||
    file.replace(/\.json$/, "");
  const generatedAt =
    raw?.generated_at ||
    raw?.generatedAt ||
    raw?.meta?.updatedAt ||
    raw?.meta?.ts ||
    raw?.updatedAt ||
    null;
  blocks.push({
    id,
    file: `mirrors/${file}`,
    schemaVersion: raw?.schemaVersion || raw?.schema || "unknown",
    optional: Boolean(raw?.optional) || false,
    generatedAt: generatedAt && typeof generatedAt === "string" ? generatedAt : null
  });
});

blocks.sort((a, b) => String(a.id).toLowerCase().localeCompare(String(b.id).toLowerCase()));

const manifest = {
  version: "1.0",
  generated_at: new Date().toISOString(),
  commit: safeExec("git rev-parse HEAD"),
  blocks
};

fs.writeFileSync(path.join(mirrorsDir, "manifest.json"), JSON.stringify(manifest, null, 2));
console.log("Wrote mirrors/manifest.json");
