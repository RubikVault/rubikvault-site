import crypto from 'node:crypto';

function sortObject(value) {
  if (Array.isArray(value)) {
    return value.map(sortObject);
  }
  if (value && typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype) {
    const out = {};
    for (const key of Object.keys(value).sort()) {
      out[key] = sortObject(value[key]);
    }
    return out;
  }
  return value;
}

export function stableStringify(value) {
  return JSON.stringify(sortObject(value));
}

export function stableHash(value) {
  return crypto.createHash('sha256').update(stableStringify(value)).digest('hex');
}
