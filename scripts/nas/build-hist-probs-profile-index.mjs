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

const dir = getArg('--dir');
const output = getArg('--output');

if (!dir || !output) {
  process.stderr.write('Usage: node scripts/nas/build-hist-probs-profile-index.mjs --dir <dir> --output <file>\n');
  process.exit(2);
}

const resolvedDir = path.resolve(dir);
const resolvedOutput = path.resolve(output);
const excluded = new Set(['regime-daily.json', 'run-summary.json']);

let files = [];
try {
  files = (await fs.readdir(resolvedDir))
    .filter((name) => name.endsWith('.json') && !excluded.has(name))
    .sort();
} catch {
  files = [];
}

const payload = {
  schema_version: 'nas.hist-probs-profile-index.v1',
  generated_at: new Date().toISOString(),
  source_dir: resolvedDir,
  profile_file_count: files.length,
  combined_hash: crypto.createHash('sha256').update(files.join('\n')).digest('hex'),
  files,
};

await fs.mkdir(path.dirname(resolvedOutput), { recursive: true });
await fs.writeFile(resolvedOutput, JSON.stringify(payload, null, 2) + '\n', 'utf8');
process.stdout.write(`OK: ${resolvedOutput}\n`);
