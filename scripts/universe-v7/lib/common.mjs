import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { stableHash, stableStringify } from './stable-json.mjs';

export const REPO_ROOT = process.cwd();

export function nowIso() {
  return new Date().toISOString();
}

export function utcDay() {
  return nowIso().slice(0, 10);
}

export async function ensureDir(dirPath) {
  await fsp.mkdir(dirPath, { recursive: true });
}

export async function pathExists(targetPath) {
  try {
    await fsp.access(targetPath, fs.constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

export async function readJson(filePath) {
  const raw = await fsp.readFile(filePath, 'utf8');
  return JSON.parse(raw);
}

export function readJsonSync(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

export async function writeJsonAtomic(filePath, payload) {
  await ensureDir(path.dirname(filePath));
  const tmpPath = `${filePath}.tmp`;
  await fsp.writeFile(tmpPath, JSON.stringify(payload, null, 2));
  await fsp.rename(tmpPath, filePath);
}

export async function appendLine(filePath, line) {
  await ensureDir(path.dirname(filePath));
  await fsp.appendFile(filePath, `${line}\n`);
}

export function sha256Buffer(buf) {
  return crypto.createHash('sha256').update(buf).digest('hex');
}

export async function sha256File(filePath) {
  const buf = await fsp.readFile(filePath);
  return sha256Buffer(buf);
}

export function normalizeTicker(value) {
  const ticker = String(value || '').trim().toUpperCase();
  if (!ticker) return null;
  return ticker;
}

export function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

export function toFinite(value, fallback = null) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

export function fail(message, code = 1, details = null) {
  const out = { status: 'FAIL', code, message, details, ts: nowIso() };
  process.stderr.write(`${JSON.stringify(out)}\n`);
  process.exit(code);
}

export function ok(message, details = null) {
  const out = { status: 'OK', message, details, ts: nowIso() };
  process.stdout.write(`${JSON.stringify(out)}\n`);
}

export function stableContentHash(payload) {
  return stableHash(payload);
}

export function stableContentString(payload) {
  return stableStringify(payload);
}

export async function walkFiles(rootDir, opts = {}) {
  const ignore = new Set(opts.ignore || []);
  const out = [];

  async function visit(dirPath) {
    const entries = await fsp.readdir(dirPath, { withFileTypes: true });
    for (const entry of entries) {
      const full = path.join(dirPath, entry.name);
      const rel = path.relative(REPO_ROOT, full);
      if (ignore.has(entry.name) || ignore.has(rel)) continue;
      if (entry.isDirectory()) {
        await visit(full);
        continue;
      }
      out.push({ full, rel });
    }
  }

  await visit(rootDir);
  return out;
}

export function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token.startsWith('--')) continue;
    const key = token.slice(2);
    const next = argv[i + 1];
    if (!next || next.startsWith('--')) {
      out[key] = true;
      continue;
    }
    out[key] = next;
    i += 1;
  }
  return out;
}
