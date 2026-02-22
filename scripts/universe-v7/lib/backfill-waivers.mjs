import path from 'node:path';
import fs from 'node:fs/promises';

export const DEFAULT_BACKFILL_WAIVER_PATH = 'mirrors/universe-v7/state/backfill_waivers.json';

function normalizeCid(value) {
  const txt = String(value || '').trim().toUpperCase();
  return txt || null;
}

function normalizeScopeList(value) {
  if (Array.isArray(value)) return value.map((x) => String(x || '').trim().toLowerCase()).filter(Boolean);
  if (typeof value === 'string') return [value.trim().toLowerCase()].filter(Boolean);
  return [];
}

export async function loadBackfillWaivers({
  repoRoot = process.cwd(),
  cfg = null,
  typeFilter = null
} = {}) {
  const configuredPath = process.env.RV_V7_BACKFILL_WAIVER_PATH
    || cfg?.backfill?.waiver_path
    || DEFAULT_BACKFILL_WAIVER_PATH;
  const absPath = path.isAbsolute(configuredPath) ? configuredPath : path.join(repoRoot, configuredPath);

  let rawDoc = null;
  try {
    rawDoc = JSON.parse(await fs.readFile(absPath, 'utf8'));
  } catch {
    return {
      path: absPath,
      exists: false,
      ids: new Set(),
      entries: []
    };
  }

  const wantedType = typeFilter ? String(typeFilter).trim().toUpperCase() : null;
  const items = Array.isArray(rawDoc?.waivers)
    ? rawDoc.waivers
    : Array.isArray(rawDoc)
      ? rawDoc
      : [];

  const entries = [];
  const ids = new Set();
  for (const item of items) {
    const cid = normalizeCid(item?.canonical_id || item?.cid || item?.id);
    if (!cid) continue;
    if (item?.active === false) continue;
    const itemType = String(item?.type_norm || '').trim().toUpperCase() || null;
    if (wantedType && itemType && itemType !== wantedType) continue;
    const scopes = normalizeScopeList(item?.scopes || item?.scope);
    const entry = {
      canonical_id: cid,
      type_norm: itemType,
      reason: item?.reason ? String(item.reason) : null,
      scopes
    };
    entries.push(entry);
    ids.add(cid);
  }

  return {
    path: absPath,
    exists: true,
    ids,
    entries
  };
}

