#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const SRC = path.join(ROOT, "feature-registry.json");
const DEST = path.join(ROOT, "public", "feature-registry.json");

function fail(message) {
  process.stderr.write(`${message}\n`);
  process.exit(1);
}

if (!fs.existsSync(SRC)) {
  fail(`Missing feature registry: ${SRC}`);
}

fs.mkdirSync(path.dirname(DEST), { recursive: true });
fs.copyFileSync(SRC, DEST);
process.stdout.write(`Copied feature registry: ${SRC} -> ${DEST}\n`);
