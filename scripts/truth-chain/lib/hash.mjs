import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

export function sha256Hex(input) {
  const hash = createHash('sha256');
  hash.update(input);
  return hash.digest('hex');
}

export function hashFile(filePath) {
  const buf = readFileSync(filePath);
  return sha256Hex(buf);
}
