#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(fileURLToPath(new URL('.', import.meta.url)), '../..');
const DEFAULT_PATHS_FILE = path.join(ROOT, 'scripts/nas/inputs/release-truth-chain.paths');
const DEFAULT_MANIFEST = path.join(ROOT, 'scripts/nas/release-truth-chain.manifest.json');

function arg(name, fallback = null) {
  const prefix = `--${name}=`;
  const inline = process.argv.find((item) => item.startsWith(prefix));
  if (inline) return inline.slice(prefix.length);
  const idx = process.argv.indexOf(`--${name}`);
  return idx >= 0 ? process.argv[idx + 1] || fallback : fallback;
}

const options = {
  root: path.resolve(arg('root', ROOT)),
  pathsFile: path.resolve(arg('paths-file', DEFAULT_PATHS_FILE)),
  manifest: path.resolve(arg('manifest', DEFAULT_MANIFEST)),
  write: process.argv.includes('--write'),
};

function sha256File(filePath) {
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

function gitHead(root) {
  try {
    return execFileSync('/usr/bin/git', ['rev-parse', 'HEAD'], {
      cwd: root,
      encoding: 'utf8',
      timeout: 5000,
    }).trim();
  } catch {
    return null;
  }
}

function readPathList(filePath) {
  return fs.readFileSync(filePath, 'utf8')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#'));
}

function buildManifest() {
  const paths = readPathList(options.pathsFile);
  const files = [];
  const missing = [];
  for (const rel of paths) {
    const abs = path.join(options.root, rel);
    if (!fs.existsSync(abs)) {
      missing.push(rel);
      continue;
    }
    const stat = fs.statSync(abs);
    if (!stat.isFile()) {
      missing.push(rel);
      continue;
    }
    files.push({
      path: rel,
      size_bytes: stat.size,
      sha256: sha256File(abs),
    });
  }
  files.sort((a, b) => a.path.localeCompare(b.path));
  const combinedHash = crypto
    .createHash('sha256')
    .update(files.map((entry) => `${entry.path}\0${entry.size_bytes}\0${entry.sha256}`).join('\n'))
    .digest('hex');
  return {
    schema: 'rv.nas.release_truth_chain_code_manifest.v1',
    generated_at: new Date().toISOString(),
    git_head: gitHead(options.root),
    paths_file: path.relative(options.root, options.pathsFile).split(path.sep).join('/'),
    file_count: files.length,
    combined_hash: combinedHash,
    missing,
    files,
  };
}

function writeManifest(doc) {
  fs.mkdirSync(path.dirname(options.manifest), { recursive: true });
  fs.writeFileSync(options.manifest, `${JSON.stringify(doc, null, 2)}\n`, 'utf8');
}

function compare(expected, actual) {
  const failures = [];
  const expectedFiles = new Map((expected.files || []).map((entry) => [entry.path, entry]));
  const actualFiles = new Map((actual.files || []).map((entry) => [entry.path, entry]));
  if (actual.missing?.length) {
    failures.push(...actual.missing.map((rel) => `missing:${rel}`));
  }
  for (const [rel, expectedEntry] of expectedFiles.entries()) {
    const actualEntry = actualFiles.get(rel);
    if (!actualEntry) {
      failures.push(`missing:${rel}`);
      continue;
    }
    if (actualEntry.sha256 !== expectedEntry.sha256) {
      failures.push(`sha256_mismatch:${rel}:expected=${expectedEntry.sha256}:actual=${actualEntry.sha256}`);
    }
    if (actualEntry.size_bytes !== expectedEntry.size_bytes) {
      failures.push(`size_mismatch:${rel}:expected=${expectedEntry.size_bytes}:actual=${actualEntry.size_bytes}`);
    }
  }
  for (const rel of actualFiles.keys()) {
    if (!expectedFiles.has(rel)) failures.push(`unexpected:${rel}`);
  }
  if (actual.combined_hash !== expected.combined_hash) {
    failures.push(`combined_hash_mismatch:expected=${expected.combined_hash}:actual=${actual.combined_hash}`);
  }
  return failures;
}

const actual = buildManifest();

if (options.write) {
  writeManifest(actual);
  process.stdout.write(`code_manifest_written=${path.relative(options.root, options.manifest)} combined_hash=${actual.combined_hash}\n`);
  process.exit(0);
}

if (!fs.existsSync(options.manifest)) {
  process.stderr.write(`code_manifest_missing=${options.manifest}\n`);
  process.exit(1);
}

const expected = JSON.parse(fs.readFileSync(options.manifest, 'utf8'));
const failures = compare(expected, actual);
if (failures.length > 0) {
  process.stderr.write(`code_manifest_mismatch count=${failures.length}\n${failures.slice(0, 20).join('\n')}\n`);
  process.exit(1);
}

process.stdout.write(`code_manifest_ok combined_hash=${actual.combined_hash} files=${actual.file_count}\n`);
