import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const DATE = process.env.TRUTH_AUDIT_DATE || new Date().toISOString().slice(0, 10);
const AUDIT_DIR = path.join(ROOT, 'artifacts', 'truth-audit', DATE);
const RAW_DIR = path.join(AUDIT_DIR, 'raw');
const RUNTIME_DIR = path.join(AUDIT_DIR, 'runtime');

function getBaseUrl() {
  const base = process.env.BASE_URL;
  if (!base) {
    throw new Error('BASE_URL is required (e.g. BASE_URL="https://rubikvault.com")');
  }
  return base.replace(/\/+$/, '');
}

function ensureAuditDirs() {
  fs.mkdirSync(RAW_DIR, { recursive: true });
  fs.mkdirSync(RUNTIME_DIR, { recursive: true });
}

function writeRuntimeContext(extra = {}) {
  const context = {
    BASE_URL: getBaseUrl(),
    date: DATE,
    generated_at: new Date().toISOString(),
    ...extra
  };
  fs.writeFileSync(path.join(AUDIT_DIR, 'RUNTIME_CONTEXT.json'), JSON.stringify(context, null, 2));
}

export {
  ROOT,
  DATE,
  AUDIT_DIR,
  RAW_DIR,
  RUNTIME_DIR,
  getBaseUrl,
  ensureAuditDirs,
  writeRuntimeContext
};
