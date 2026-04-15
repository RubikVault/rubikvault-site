import fs from 'node:fs';

function statMtimeIso(filePath) {
  if (!filePath) return null;
  try {
    return new Date(fs.statSync(filePath).mtimeMs).toISOString();
  } catch {
    return null;
  }
}

function firstFiniteNumber(...values) {
  for (const value of values) {
    const n = Number(value);
    if (Number.isFinite(n)) return n;
  }
  return null;
}

function firstBoolean(...values) {
  for (const value of values) {
    if (typeof value === 'boolean') return value;
    if (typeof value === 'string') {
      const normalized = value.trim().toLowerCase();
      if (normalized === 'true') return true;
      if (normalized === 'false') return false;
    }
  }
  return null;
}

function booleanSource(doc, stats, reconciliation) {
  if (typeof doc.noop_no_changed_packs === 'boolean' || typeof doc.noopNoChangedPacks === 'boolean') return 'top_level';
  if (typeof stats.noop_no_changed_packs === 'boolean' || typeof stats.noopNoChangedPacks === 'boolean') return 'stats';
  if (typeof reconciliation.noop_no_changed_packs === 'boolean' || typeof reconciliation.noopNoChangedPacks === 'boolean') return 'reconciliation';
  return null;
}

function numberSource(doc, stats, packSelection) {
  if (Number.isFinite(Number(doc.selected_packs_total)) || Number.isFinite(Number(doc.selectedPacksTotal))) return 'top_level';
  if (Number.isFinite(Number(stats.selected_packs_total)) || Number.isFinite(Number(stats.selectedPacksTotal))) return 'stats';
  if (Number.isFinite(Number(packSelection.selected_packs_total)) || Number.isFinite(Number(packSelection.selectedPacksTotal))) return 'pack_selection';
  return null;
}

function normalizeDate(value) {
  const iso = typeof value === 'string' ? value.slice(0, 10) : null;
  return iso && /^\d{4}-\d{2}-\d{2}$/.test(iso) ? iso : null;
}

export function normalizeQ1DeltaLatestSuccess(doc, { filePath = null } = {}) {
  if (!doc || typeof doc !== 'object') return null;
  const stats = doc.stats && typeof doc.stats === 'object' ? doc.stats : {};
  const reconciliation = doc.reconciliation && typeof doc.reconciliation === 'object' ? doc.reconciliation : {};
  const packSelection = doc.pack_selection && typeof doc.pack_selection === 'object' ? doc.pack_selection : {};
  const selectedPacksTotal = firstFiniteNumber(
    doc.selected_packs_total,
    doc.selectedPacksTotal,
    stats.selected_packs_total,
    stats.selectedPacksTotal,
    packSelection.selected_packs_total,
    packSelection.selectedPacksTotal
  );
  const noopNoChangedPacks = firstBoolean(
    doc.noop_no_changed_packs,
    doc.noopNoChangedPacks,
    stats.noop_no_changed_packs,
    stats.noopNoChangedPacks,
    reconciliation.noop_no_changed_packs,
    reconciliation.noopNoChangedPacks
  );
  const ingestDate = normalizeDate(
    doc.ingest_date
    || doc.target_market_date
    || doc.target_date
    || stats.ingest_date
    || reconciliation.ingest_date
    || null
  );
  const updatedAt = doc.updated_at || doc.completed_at || doc.generated_at || statMtimeIso(filePath);

  return {
    ...doc,
    raw: doc,
    updated_at: updatedAt,
    ingest_date: ingestDate,
    selected_packs_total: selectedPacksTotal,
    noop_no_changed_packs: noopNoChangedPacks,
    evidence_complete: Boolean(
      updatedAt
      && ingestDate
      && Number.isFinite(selectedPacksTotal)
      && typeof noopNoChangedPacks === 'boolean'
    ),
    evidence_sources: {
      selected_packs_total: numberSource(doc, stats, packSelection),
      noop_no_changed_packs: booleanSource(doc, stats, reconciliation),
    },
  };
}
