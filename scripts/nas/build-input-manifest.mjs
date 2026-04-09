#!/usr/bin/env node

import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';

const args = process.argv.slice(2);

function getArg(name, fallback = null) {
  const idx = args.indexOf(name);
  if (idx === -1) return fallback;
  return args[idx + 1] ?? fallback;
}

const root = path.resolve(getArg('--root', process.cwd()));
const pathsFile = getArg('--paths-file');
const output = getArg('--output');
const stage = getArg('--stage', null);
const runId = getArg('--run-id', null);

if (!pathsFile || !output) {
  process.stderr.write('Usage: node scripts/nas/build-input-manifest.mjs --root <dir> --paths-file <file> --output <file>\n');
  process.exit(2);
}

async function readList(filePath) {
  const raw = await fs.readFile(filePath, 'utf8');
  return raw
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#'));
}

async function statSafe(filePath) {
  try {
    return await fs.stat(filePath);
  } catch {
    return null;
  }
}

async function sha256File(filePath) {
  const buf = await fs.readFile(filePath);
  return crypto.createHash('sha256').update(buf).digest('hex');
}

async function walkFiles(absPath) {
  const stat = await fs.stat(absPath);
  if (stat.isFile()) return [absPath];
  const out = [];
  const stack = [absPath];
  while (stack.length) {
    const current = stack.pop();
    const entries = await fs.readdir(current, { withFileTypes: true });
    for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
      const next = path.join(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(next);
      } else if (entry.isFile()) {
        out.push(next);
      }
    }
  }
  return out.sort();
}

const relPaths = await readList(path.resolve(pathsFile));
const files = [];
const missing = [];

for (const rel of relPaths) {
  const abs = path.join(root, rel);
  const stat = await statSafe(abs);
  if (!stat) {
    missing.push(rel);
    continue;
  }
  const expanded = await walkFiles(abs);
  for (const file of expanded) {
    const relFile = path.relative(root, file).split(path.sep).join('/');
    const fileStat = await fs.stat(file);
    files.push({
      path: relFile,
      size_bytes: fileStat.size,
      sha256: await sha256File(file)
    });
  }
}

files.sort((a, b) => a.path.localeCompare(b.path));
const combinedHash = crypto
  .createHash('sha256')
  .update(files.map((entry) => `${entry.path}\0${entry.size_bytes}\0${entry.sha256}`).join('\n'))
  .digest('hex');

const payload = {
  schema_version: 'nas.input-manifest.v1',
  generated_at: new Date().toISOString(),
  stage,
  run_id: runId,
  file_count: files.length,
  total_bytes: files.reduce((sum, entry) => sum + entry.size_bytes, 0),
  combined_hash: combinedHash,
  missing,
  files
};

await fs.mkdir(path.dirname(path.resolve(output)), { recursive: true });
await fs.writeFile(path.resolve(output), JSON.stringify(payload, null, 2) + '\n', 'utf8');
process.stdout.write(`OK: ${path.resolve(output)}\n`);
