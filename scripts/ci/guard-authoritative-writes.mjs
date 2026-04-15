#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(new URL('..', import.meta.url).pathname, '..');
const TARGETS = [
  'public/data/ops/release-state-latest.json',
  'public/data/pipeline/runtime/latest.json',
  'public/data/pipeline/epoch.json',
  'public/data/ops/final-integrity-seal-latest.json',
];
const ALLOWED_FILES = new Set([
  'scripts/ops/run-pipeline-master-supervisor.mjs',
  'scripts/ops/build-pipeline-runtime-report.mjs',
  'scripts/ops/build-pipeline-epoch.mjs',
  'scripts/ops/final-integrity-seal.mjs',
  'scripts/ci/guard-authoritative-writes.mjs',
]);
const SCAN_DIRS = ['scripts', 'functions'];
const WRITE_PATTERNS = [
  'writeJsonAtomic(',
  'writeJson(',
  'writeFileSync(',
  'renameSync(',
  'copyFileSync(',
];

function walk(dirPath, files = []) {
  for (const entry of fs.readdirSync(dirPath, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === '.git') continue;
    const fullPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) walk(fullPath, files);
    else if (/\.(mjs|js|cjs|sh)$/i.test(entry.name)) files.push(fullPath);
  }
  return files;
}

function main() {
  const offenders = [];
  for (const dir of SCAN_DIRS) {
    const dirPath = path.join(ROOT, dir);
    if (!fs.existsSync(dirPath)) continue;
    for (const filePath of walk(dirPath)) {
      const relPath = path.relative(ROOT, filePath);
      if (ALLOWED_FILES.has(relPath) || relPath.startsWith('scripts/lib/pipeline_authority/')) continue;
      const text = fs.readFileSync(filePath, 'utf8');
      const lines = text.split('\n');
      if (!WRITE_PATTERNS.some((pattern) => text.includes(pattern))) continue;
      for (const target of TARGETS) {
        const symbols = new Set();
        for (const line of lines) {
          if (!line.includes(target)) continue;
          const constMatch = line.match(/^\s*const\s+([A-Za-z0-9_]+)\s*=/);
          if (constMatch) symbols.add(constMatch[1]);
          const pathKeyMatch = line.match(/^\s*([A-Za-z0-9_]+)\s*:\s*path\.join/);
          if (pathKeyMatch) symbols.add(`PATHS.${pathKeyMatch[1]}`);
        }
        const writeRefFound = lines.some((line) => (
          WRITE_PATTERNS.some((pattern) => line.includes(pattern))
          && (
            line.includes(target)
            || Array.from(symbols).some((symbol) => line.includes(symbol))
          )
        ));
        if (writeRefFound) {
          offenders.push({ file: relPath, target });
        }
      }
    }
  }

  if (offenders.length > 0) {
    console.error('Unauthorized authoritative write references found:');
    for (const offender of offenders) {
      console.error(` - ${offender.file} -> ${offender.target}`);
    }
    process.exit(1);
  }

  console.log('authorized_write_guard: ok');
}

main();
