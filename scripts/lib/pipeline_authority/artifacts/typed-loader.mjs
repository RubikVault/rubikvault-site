import crypto from 'node:crypto';
import fs from 'node:fs';

export const TYPED_ARTIFACT_STATUS = Object.freeze({
  OK: 'OK',
  MISSING: 'MISSING',
  EMPTY: 'EMPTY',
  CORRUPT_JSON: 'CORRUPT_JSON',
  SCHEMA_MISMATCH: 'SCHEMA_MISMATCH',
  SCHEMA_VERSION_MISMATCH: 'SCHEMA_VERSION_MISMATCH',
  IO_ERROR: 'IO_ERROR',
  STALE: 'STALE',
  CHECKSUM_MISMATCH: 'CHECKSUM_MISMATCH',
  PARTIAL_WRITE_LEGACY: 'PARTIAL_WRITE_LEGACY',
});

function sha256(text) {
  return crypto.createHash('sha256').update(text).digest('hex');
}

export function loadJsonArtifact(filePath, {
  expectedSchemas = null,
  staleBeforeIso = null,
  expectedSha256 = null,
} = {}) {
  let stat = null;
  let text = null;
  try {
    stat = fs.statSync(filePath);
    text = fs.readFileSync(filePath, 'utf8');
  } catch (error) {
    if (error?.code === 'ENOENT') {
      return { ok: false, status: TYPED_ARTIFACT_STATUS.MISSING, file_path: filePath, error: 'missing' };
    }
    return { ok: false, status: TYPED_ARTIFACT_STATUS.IO_ERROR, file_path: filePath, error: String(error?.message || error) };
  }
  if (!String(text || '').trim()) {
    return { ok: false, status: TYPED_ARTIFACT_STATUS.EMPTY, file_path: filePath };
  }
  let value;
  try {
    value = JSON.parse(text);
  } catch (error) {
    return {
      ok: false,
      status: String(text).includes('.tmp') ? TYPED_ARTIFACT_STATUS.PARTIAL_WRITE_LEGACY : TYPED_ARTIFACT_STATUS.CORRUPT_JSON,
      file_path: filePath,
      error: String(error?.message || error),
    };
  }
  const digest = sha256(text);
  if (expectedSha256 && digest !== expectedSha256) {
    return { ok: false, status: TYPED_ARTIFACT_STATUS.CHECKSUM_MISMATCH, file_path: filePath, value, sha256: digest };
  }
  if (Array.isArray(expectedSchemas) && expectedSchemas.length > 0) {
    const schema = typeof value?.schema === 'string' ? value.schema : null;
    if (!schema) {
      return { ok: false, status: TYPED_ARTIFACT_STATUS.SCHEMA_MISMATCH, file_path: filePath, value, sha256: digest };
    }
    if (!expectedSchemas.includes(schema)) {
      return { ok: false, status: TYPED_ARTIFACT_STATUS.SCHEMA_VERSION_MISMATCH, file_path: filePath, value, sha256: digest };
    }
  }
  if (staleBeforeIso && stat?.mtimeMs < new Date(staleBeforeIso).getTime()) {
    return { ok: false, status: TYPED_ARTIFACT_STATUS.STALE, file_path: filePath, value, sha256: digest };
  }
  return {
    ok: true,
    status: TYPED_ARTIFACT_STATUS.OK,
    file_path: filePath,
    value,
    sha256: digest,
    mtime_iso: stat ? new Date(stat.mtimeMs).toISOString() : null,
  };
}
