#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const ROOT = path.resolve(new URL('..', import.meta.url).pathname, '..');
const RESOLVER = path.join(ROOT, 'scripts', 'ops', 'resolve-node20-bin.sh');

let cachedNodeBin = null;
const cachedVersions = new Map();

function safeStat(filePath) {
  try {
    return fs.statSync(filePath);
  } catch {
    return null;
  }
}

export function readNodeVersion(nodeBin) {
  if (!nodeBin) return null;
  if (cachedVersions.has(nodeBin)) return cachedVersions.get(nodeBin);
  try {
    const raw = execFileSync(nodeBin, ['-p', 'process.versions.node'], {
      cwd: ROOT,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    }).trim();
    cachedVersions.set(nodeBin, raw || null);
    return raw || null;
  } catch {
    cachedVersions.set(nodeBin, null);
    return null;
  }
}

export function resolveApprovedNodeBin({ fallbackCurrent = true } = {}) {
  if (cachedNodeBin) return cachedNodeBin;
  if (fallbackCurrent && String(process.versions.node || '').split('.')[0] === '20') {
    cachedNodeBin = process.execPath;
    return cachedNodeBin;
  }
  if (safeStat(RESOLVER)?.isFile()) {
    try {
      const resolved = execFileSync('/bin/bash', [RESOLVER], {
        cwd: ROOT,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
      }).trim();
      if (resolved) {
        cachedNodeBin = resolved;
        return cachedNodeBin;
      }
    } catch {}
  }
  if (fallbackCurrent) {
    cachedNodeBin = process.execPath;
    return cachedNodeBin;
  }
  throw new Error('approved_node_missing');
}
