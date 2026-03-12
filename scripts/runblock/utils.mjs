import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export function getRepoRoot() {
  return fileURLToPath(new URL('../..', import.meta.url));
}

export function parseArgs(argv = process.argv.slice(2)) {
  const args = {};
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith('--')) continue;
    const key = token.slice(2).replace(/-/g, '_');
    const next = argv[index + 1];
    if (!next || next.startsWith('--')) {
      args[key] = true;
      continue;
    }
    args[key] = next;
    index += 1;
  }
  return args;
}

export async function fileExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

export async function ensureDir(dirPath) {
  await fs.mkdir(dirPath, { recursive: true });
}

export async function readJson(filePath) {
  const raw = await fs.readFile(filePath, 'utf-8');
  return JSON.parse(raw);
}

export async function writeJson(filePath, value) {
  await ensureDir(path.dirname(filePath));
  await fs.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf-8');
}

export async function writeJsonAndJs(basePathWithoutExt, globalName, value) {
  await writeJson(`${basePathWithoutExt}.json`, value);
  await ensureDir(path.dirname(basePathWithoutExt));
  await fs.writeFile(
    `${basePathWithoutExt}.js`,
    `window.${globalName} = ${JSON.stringify(value, null, 2)};\n`,
    'utf-8'
  );
}

export async function listFilesRecursive(rootDir) {
  const entries = await fs.readdir(rootDir, { withFileTypes: true });
  const results = [];
  for (const entry of entries) {
    const fullPath = path.join(rootDir, entry.name);
    if (entry.isDirectory()) {
      results.push(...await listFilesRecursive(fullPath));
    } else {
      results.push(fullPath);
    }
  }
  return results;
}

export async function findLatestFile(rootDir, matcher = () => true) {
  if (!await fileExists(rootDir)) return null;
  const files = await listFilesRecursive(rootDir);
  const filtered = files.filter(matcher);
  if (!filtered.length) return null;

  const withStats = await Promise.all(
    filtered.map(async (filePath) => ({
      filePath,
      stats: await fs.stat(filePath),
    }))
  );

  withStats.sort((left, right) => right.stats.mtimeMs - left.stats.mtimeMs);
  return withStats[0].filePath;
}

export function printJsonOrTable(payload, jsonMode = false) {
  if (jsonMode) {
    process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
    return;
  }

  for (const [key, value] of Object.entries(payload)) {
    if (value && typeof value === 'object') {
      process.stdout.write(`${key}: ${JSON.stringify(value)}\n`);
    } else {
      process.stdout.write(`${key}: ${String(value)}\n`);
    }
  }
}
