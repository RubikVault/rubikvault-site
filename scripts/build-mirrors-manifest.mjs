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
  const id =
    json?.meta?.blockId ||
    json?.meta?.feature ||
    json?.meta?.id ||
    json?.mirrorId ||
    json?.feature ||
    file.replace(/\.json$/, "");
  const generatedAt =
    json?.generated_at ||
    json?.generatedAt ||
    json?.meta?.updatedAt ||
    json?.meta?.ts ||
    json?.updatedAt ||
    null;
  blocks.push({
    id,
    file: `mirrors/${file}`,
    schemaVersion: json?.schemaVersion || json?.schema || "unknown",
    optional: Boolean(json?.optional) || false,
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
