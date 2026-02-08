import fs from 'node:fs/promises';
import path from 'node:path';

const ROOT = process.cwd();
const filePath = path.join(ROOT, 'public', 'data', 'snapshots', 'build-info', 'latest.json');

function fail(message) {
  throw new Error(message);
}

let raw;
try {
  raw = await fs.readFile(filePath, 'utf8');
} catch (error) {
  if (error && error.code === 'ENOENT') {
    process.stdout.write('SKIP: build-info artifact missing in generated-only checkout\n');
    process.exit(0);
  }
  throw error;
}
const doc = JSON.parse(raw);

if (doc?.schema_version !== '3.0') {
  fail(`build-info schema_version expected 3.0, got ${doc?.schema_version}`);
}
if (!doc?.metadata || typeof doc.metadata !== 'object') {
  fail('build-info metadata missing');
}
if (doc.metadata.module !== 'build-info') {
  fail(`build-info metadata.module expected build-info, got ${doc.metadata.module}`);
}
if (!doc.metadata.validation || doc.metadata.validation.passed !== true) {
  fail('build-info metadata.validation.passed must be true');
}
if (doc?.meta?.version !== '3.0') {
  fail(`build-info meta.version expected 3.0, got ${doc?.meta?.version}`);
}
if (doc?.meta?.provider !== 'build') {
  fail(`build-info meta.provider expected build, got ${doc?.meta?.provider}`);
}
if (!doc.data || typeof doc.data !== 'object') {
  fail('build-info data must be an object');
}
const entry = doc.data;
if (!entry || typeof entry !== 'object') {
  fail('build-info data[0] missing');
}
if (entry.commitSha == null || entry.generatedAt == null) {
  fail('build-info data must include commitSha and generatedAt');
}

process.stdout.write('OK: build-info artifact\n');
