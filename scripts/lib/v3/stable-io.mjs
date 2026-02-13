import fs from "node:fs/promises";
import path from "node:path";

export function stableSort(array, comparator) {
  return array
    .map((item, idx) => ({ item, idx }))
    .sort((a, b) => {
      const c = comparator(a.item, b.item);
      if (c !== 0) return c;
      return a.idx - b.idx;
    })
    .map((entry) => entry.item);
}

function sortKeys(value) {
  if (Array.isArray(value)) {
    return value.map(sortKeys);
  }
  if (value && typeof value === "object") {
    const out = {};
    for (const key of Object.keys(value).sort((a, b) => a.localeCompare(b))) {
      out[key] = sortKeys(value[key]);
    }
    return out;
  }
  return value;
}

export function stableStringify(value, spacing = 2) {
  return `${JSON.stringify(sortKeys(value), null, spacing)}\n`;
}

export async function ensureDir(dirPath) {
  await fs.mkdir(dirPath, { recursive: true });
}

export async function writeTextAtomic(filePath, text) {
  const dir = path.dirname(filePath);
  await ensureDir(dir);
  const tmp = `${filePath}.tmp-${process.pid}-${Date.now()}`;
  await fs.writeFile(tmp, text, "utf8");
  await fs.rename(tmp, filePath);
}

export async function writeJsonAtomic(filePath, doc) {
  await writeTextAtomic(filePath, stableStringify(doc));
}

export async function readJson(filePath, fallback = null) {
  try {
    const raw = await fs.readFile(filePath, "utf8");
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

export async function readNdjson(filePath) {
  const raw = await fs.readFile(filePath, "utf8");
  return raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

export async function writeNdjsonAtomic(filePath, rows) {
  const body = rows.map((row) => JSON.stringify(sortKeys(row))).join("\n") + "\n";
  await writeTextAtomic(filePath, body);
}
