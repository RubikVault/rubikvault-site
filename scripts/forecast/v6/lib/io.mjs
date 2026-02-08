import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { sha256Buffer } from './hashing.mjs';

export function nowIso() {
  return process.env.FORECAST_V6_FIXED_NOW || new Date().toISOString();
}

export function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

export function ensureFileDir(filePath) {
  ensureDir(path.dirname(filePath));
}

export function fileExists(filePath) {
  return fs.existsSync(filePath);
}

export function readJson(filePath, fallback = null) {
  if (!fs.existsSync(filePath)) return fallback;
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return fallback;
  }
}

export function readText(filePath, fallback = '') {
  if (!fs.existsSync(filePath)) return fallback;
  return fs.readFileSync(filePath, 'utf8');
}

export function writeTextAtomic(filePath, content) {
  ensureFileDir(filePath);
  const tmpPath = `${filePath}.tmp.${process.pid}.${Date.now()}`;
  fs.writeFileSync(tmpPath, content);
  fs.renameSync(tmpPath, filePath);
}

export function writeJsonAtomic(filePath, value) {
  writeTextAtomic(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

export function readNdjson(filePath) {
  if (!fs.existsSync(filePath)) return [];
  const raw = fs.readFileSync(filePath);
  const text = filePath.endsWith('.gz') ? zlib.gunzipSync(raw).toString('utf8') : raw.toString('utf8');
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

export function writeNdjsonAtomic(filePath, rows) {
  const lines = rows.map((row) => JSON.stringify(row)).join('\n');
  writeTextAtomic(filePath, lines ? `${lines}\n` : '');
}

export function appendNdjsonUnique(filePath, rows, keyField) {
  if (!rows.length) return { appended: 0, total: 0 };
  const existing = readNdjson(filePath);
  const seen = new Set(existing.map((row) => row?.[keyField]).filter(Boolean));
  const nextRows = rows.filter((row) => {
    const key = row?.[keyField];
    if (!key) return true;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  const all = [...existing, ...nextRows];
  writeNdjsonAtomic(filePath, all);
  return { appended: nextRows.length, total: all.length };
}

export function copyFileAtomic(srcPath, dstPath) {
  ensureFileDir(dstPath);
  const tmpPath = `${dstPath}.tmp.${process.pid}.${Date.now()}`;
  fs.copyFileSync(srcPath, tmpPath);
  fs.renameSync(tmpPath, dstPath);
}

export function copyDirRecursive(srcDir, dstDir) {
  ensureDir(dstDir);
  for (const entry of fs.readdirSync(srcDir, { withFileTypes: true })) {
    const srcPath = path.join(srcDir, entry.name);
    const dstPath = path.join(dstDir, entry.name);
    if (entry.isDirectory()) {
      copyDirRecursive(srcPath, dstPath);
    } else {
      copyFileAtomic(srcPath, dstPath);
    }
  }
}

export function atomicPublishDir(sourceTmpDir, targetDir) {
  const parent = path.dirname(targetDir);
  ensureDir(parent);
  const staging = `${targetDir}.staging.${process.pid}.${Date.now()}`;
  fs.renameSync(sourceTmpDir, staging);
  if (fs.existsSync(targetDir)) {
    fs.rmSync(targetDir, { recursive: true, force: true });
  }
  fs.renameSync(staging, targetDir);
}

export function createTempDir(baseDir, prefix = '.tmp') {
  ensureDir(baseDir);
  const tmpDir = path.join(baseDir, `${prefix}.${process.pid}.${Date.now()}`);
  ensureDir(tmpDir);
  return tmpDir;
}

export function listFilesRecursive(rootDir) {
  if (!fs.existsSync(rootDir)) return [];
  const files = [];
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const abs = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(abs);
      } else {
        files.push(abs);
      }
    }
  };
  walk(rootDir);
  return files.sort();
}

export function hashDirectory(rootDir) {
  const files = listFilesRecursive(rootDir);
  const parts = files.map((file) => {
    const rel = path.relative(rootDir, file).replace(/\\/g, '/');
    const buf = fs.readFileSync(file);
    return { rel, hash: sha256Buffer(buf) };
  });
  return {
    files: parts,
    digest: sha256Buffer(Buffer.from(parts.map((p) => `${p.rel}:${p.hash}`).join('\n'), 'utf8'))
  };
}

export function writeJsonLinesGz(filePath, rows) {
  const lines = rows.map((row) => JSON.stringify(row)).join('\n');
  ensureFileDir(filePath);
  const tmpPath = `${filePath}.tmp.${process.pid}.${Date.now()}`;
  fs.writeFileSync(tmpPath, zlib.gzipSync(Buffer.from(lines ? `${lines}\n` : '', 'utf8')));
  fs.renameSync(tmpPath, filePath);
}

export function readJsonLinesGz(filePath) {
  if (!fs.existsSync(filePath)) return [];
  const payload = zlib.gunzipSync(fs.readFileSync(filePath)).toString('utf8');
  return payload
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}
