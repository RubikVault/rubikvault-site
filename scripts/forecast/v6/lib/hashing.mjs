import fs from 'node:fs';
import crypto from 'node:crypto';

function canonicalize(value) {
  if (value === null) return 'null';
  if (value === undefined) return 'undefined';
  if (Array.isArray(value)) {
    return `[${value.map((item) => canonicalize(item)).join(',')}]`;
  }
  if (typeof value === 'object') {
    const keys = Object.keys(value).sort();
    const pairs = keys.map((key) => `${JSON.stringify(key)}:${canonicalize(value[key])}`);
    return `{${pairs.join(',')}}`;
  }
  if (typeof value === 'string') {
    return JSON.stringify(value);
  }
  return String(value);
}

export function sha256Text(text) {
  const hash = crypto.createHash('sha256').update(text, 'utf8').digest('hex');
  return `sha256:${hash}`;
}

export function sha256Json(value) {
  return sha256Text(canonicalize(value));
}

export function sha256Buffer(buffer) {
  const hash = crypto.createHash('sha256').update(buffer).digest('hex');
  return `sha256:${hash}`;
}

export function hashFile(filePath) {
  const buf = fs.readFileSync(filePath);
  return sha256Buffer(buf);
}

export function hashFiles(paths) {
  const out = {};
  for (const p of [...paths].sort()) {
    out[p] = hashFile(p);
  }
  return out;
}

export function stableSortRows(rows, keys = ['symbol', 'date']) {
  const copy = [...rows];
  copy.sort((a, b) => {
    for (const key of keys) {
      const av = a?.[key] ?? '';
      const bv = b?.[key] ?? '';
      if (av < bv) return -1;
      if (av > bv) return 1;
    }
    return 0;
  });
  return copy;
}

export function canonicalJsonString(value) {
  return canonicalize(value);
}

export function hashPolicyObject(policy) {
  const clone = { ...policy };
  delete clone.policy_hash;
  return sha256Json(clone);
}
