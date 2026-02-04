import fs from 'node:fs/promises';
import path from 'node:path';

const ROOT = process.cwd();
const filePath = path.join(ROOT, 'public', 'data', 'snapshots', 'build-info', 'latest.json');

function fail(message) {
  throw new Error(message);
}

const raw = await fs.readFile(filePath, 'utf8');
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
if (!Array.isArray(doc.data) || doc.data.length === 0) {
  fail('build-info data must be a non-empty array');
}
const entry = doc.data[0];
if (!entry || typeof entry !== 'object') {
  fail('build-info data[0] missing');
}
if (entry.git_sha == null || entry.build_time_utc == null) {
  fail('build-info data[0] must include git_sha and build_time_utc');
}

process.stdout.write('OK: build-info artifact\n');
