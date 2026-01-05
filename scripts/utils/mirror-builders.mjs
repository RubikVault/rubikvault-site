import { redactNotes } from "./mirror-io.mjs";

export function buildBaseMirror({ mirrorId, mode, cadence, trust, sourceUpstream, whyUnique, items, context, missingSymbols, errors, notes, dataQuality, asOf }) {
  const now = new Date().toISOString();
  return {
    schemaVersion: "rv-mirror-v1",
    mirrorId,
    runId: now,
    updatedAt: now,
    asOf: asOf || now,
    mode,
    cadence,
    trust,
    source: "mirror",
    sourceUpstream: sourceUpstream || "unknown",
    dataQuality,
    delayMinutes: 0,
    missingSymbols: missingSymbols || [],
    errors: errors || [],
    notes: redactNotes(notes || []),
    whyUnique: whyUnique || "",
    context: context || {},
    items: items || []
  };
}

export function buildSystemHealth({ jobs, mirrors, selectedSymbols, skippedSymbols, overallStatus }) {
  const now = new Date().toISOString();
  return {
    schemaVersion: "1.0",
    mirrorId: "system-health",
    updatedAt: now,
    overallStatus: overallStatus || "OK",
    jobs,
    mirrors,
    alerts: [],
    selectedSymbols,
    skippedSymbols
  };
}

export function buildDigest({ highlights, signals, changes, sources }) {
  const now = new Date().toISOString();
  return {
    schemaVersion: "1.0",
    mirrorId: "daily-digest",
    updatedAt: now,
    highlights: highlights || [],
    actionableSignals: signals || [],
    changesVsYesterday: changes || [],
    sourcesUsed: sources || []
  };
}
