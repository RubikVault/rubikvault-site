import fs from 'node:fs';
import path from 'node:path';

export const PUBLIC_SSOT_REL_DIR = 'public/data/universe/v7/ssot';
export const MIRROR_SSOT_REL_DIR = 'mirrors/universe-v7/ssot';

export function publicSsotRel(fileName) {
  return `${PUBLIC_SSOT_REL_DIR}/${fileName}`;
}

export function mirrorSsotRel(fileName) {
  return `${MIRROR_SSOT_REL_DIR}/${fileName}`;
}

export function publicSsotPath(repoRoot, fileName) {
  return path.join(repoRoot, PUBLIC_SSOT_REL_DIR, fileName);
}

export function mirrorSsotPath(repoRoot, fileName) {
  return path.join(repoRoot, MIRROR_SSOT_REL_DIR, fileName);
}

export function resolveSsotPath(repoRoot, fileName, { preferMirror = true } = {}) {
  const mirrorPath = mirrorSsotPath(repoRoot, fileName);
  const publicPath = publicSsotPath(repoRoot, fileName);
  if (preferMirror && fs.existsSync(mirrorPath)) return mirrorPath;
  return publicPath;
}
