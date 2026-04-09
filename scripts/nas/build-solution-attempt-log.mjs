#!/usr/bin/env node

import fs from 'node:fs/promises';
import path from 'node:path';

const ROOT = process.cwd();
const VARIANT_CATALOG_PATH = path.join(ROOT, 'docs', 'ops', 'nas-variant-catalog.md');
const OPEN_PROBES_PATH = path.join(ROOT, 'tmp', 'nas-benchmarks', 'nas-open-probes-latest.json');
const NIGHT_WATCH_PATH = path.join(ROOT, 'tmp', 'nas-benchmarks', 'nas-night-watch-latest.json');
const OUT_JSON = path.join(ROOT, 'tmp', 'nas-benchmarks', 'nas-solution-attempt-log-latest.json');
const OUT_MD = path.join(ROOT, 'docs', 'ops', 'nas-solution-attempt-log.md');

const SECTION_PROBE_MAP = {
  'API Fetch / Market Data': ['refresh_history_sample'],
  'History Refresh': ['refresh_history_sample'],
  Fundamentals: ['fundamentals_sample'],
  'Q1 Delta Ingest': ['q1_delta_ingest_smoke', 'q1_delta_preflight'],
  'QuantLab Integration': ['quantlab_v4_daily_report', 'quantlab_boundary_audit'],
  'Learning Cycle': ['daily_learning_cycle', 'runtime_control_probe'],
  best_setups_v4: ['best_setups_v4_smoke'],
  'UI Rendering': ['ui_contract_probe'],
  'UI Audit / Browser Tests': ['universe_audit_sample', 'ui_contract_probe'],
  'md0 / Root-FS / Scheduler': [],
  'Cross-Cutting Variants': [],
};

async function readJson(filePath) {
  try {
    return JSON.parse(await fs.readFile(filePath, 'utf8'));
  } catch {
    return null;
  }
}

async function readText(filePath) {
  try {
    return await fs.readFile(filePath, 'utf8');
  } catch {
    return '';
  }
}

function compact(text, max = 180) {
  const value = String(text || '').replace(/\s+/g, ' ').trim();
  if (!value) return '';
  return value.length > max ? `${value.slice(0, max - 1)}…` : value;
}

function parseVariantCatalog(raw) {
  const lines = raw.split('\n');
  const sections = [];
  let current = null;
  let collectingEvidence = false;
  for (const line of lines) {
    const sectionMatch = line.match(/^##\s+(P\d+)\s+(.+)$/);
    if (sectionMatch) {
      if (current) sections.push(current);
      current = {
        id: sectionMatch[1],
        label: sectionMatch[2].trim(),
        variants: [],
        current_live_evidence: [],
      };
      collectingEvidence = false;
      continue;
    }
    if (line.match(/^##\s+Cross-Cutting Variants$/)) {
      if (current) sections.push(current);
      current = {
        id: 'X',
        label: 'Cross-Cutting Variants',
        variants: [],
        current_live_evidence: [],
      };
      collectingEvidence = false;
      continue;
    }
    if (!current) continue;
    if (line.trim() === 'Current live evidence:') {
      collectingEvidence = true;
      continue;
    }
    const variantMatch = line.match(/^- `([^`]+)` — `([^`]+)`$/);
    if (variantMatch) {
      current.variants.push({ id: variantMatch[1], catalog_status: variantMatch[2] });
      collectingEvidence = false;
      continue;
    }
    const evidenceMatch = line.match(/^- `([^`]+)`$/);
    if (collectingEvidence && evidenceMatch) {
      current.current_live_evidence.push(evidenceMatch[1]);
    }
  }
  if (current) sections.push(current);
  return sections;
}

function summarizeProbe(probe) {
  if (!probe) {
    return {
      status: 'not_found',
      note: 'Kein aktueller Probe-Report vorhanden.',
    };
  }
  if (probe.successes > 0 && probe.failures === 0) {
    return {
      status: 'verified_success',
      note: `${probe.successes}/${probe.total_runs} erfolgreich; letzter Lauf ok.`,
    };
  }
  if (probe.successes > 0 && probe.failures > 0) {
    return {
      status: 'mixed_results',
      note: `${probe.successes}/${probe.total_runs} erfolgreich, ${probe.failures} fehlgeschlagen; letzter Grund: ${compact(probe.latest_status_reason || probe.latest_stderr_tail || 'n/a')}`,
    };
  }
  if (probe.failures > 0) {
    return {
      status: 'verified_failure',
      note: `${probe.failures}/${probe.total_runs} fehlgeschlagen; letzter Grund: ${compact(probe.latest_status_reason || probe.latest_stderr_tail || 'n/a')}`,
    };
  }
  return {
    status: 'not_yet_tested',
    note: 'Noch keine Probe-Evidenz vorhanden.',
  };
}

function mergeStatuses(statuses) {
  if (!statuses.length) return 'not_yet_tested';
  if (statuses.includes('verified_success') && statuses.every((status) => status === 'verified_success')) return 'verified_success';
  if (statuses.includes('verified_success')) return 'mixed_results';
  if (statuses.includes('mixed_results')) return 'mixed_results';
  if (statuses.includes('verified_failure')) return 'verified_failure';
  return 'not_yet_tested';
}

const [variantCatalogRaw, openProbes, nightWatch] = await Promise.all([
  readText(VARIANT_CATALOG_PATH),
  readJson(OPEN_PROBES_PATH),
  readJson(NIGHT_WATCH_PATH),
]);

const sections = parseVariantCatalog(variantCatalogRaw);
const probeMap = new Map((openProbes?.probes || []).map((probe) => [probe.probe_id, probe]));
const blockers = new Set(nightWatch?.blockers || []);

const reportSections = sections.map((section) => {
  const probeIds = SECTION_PROBE_MAP[section.label] || [];
  const probeSummaries = probeIds.map((probeId) => ({ probe_id: probeId, ...summarizeProbe(probeMap.get(probeId)) }));
  let sectionStatus = mergeStatuses(probeSummaries.map((probe) => probe.status));
  let sectionNote = probeSummaries.map((probe) => `${probe.probe_id}: ${probe.note}`).join(' | ');

  if (section.label === 'md0 / Root-FS / Scheduler') {
    sectionStatus = nightWatch?.latest_system_audit ? 'mixed_results' : 'not_yet_tested';
    sectionNote = blockers.size
      ? `Systemaudit vorhanden, aber Blocker bleiben: ${Array.from(blockers).join(', ')}`
      : 'Systemaudit vorhanden, aktuell ohne harte Blocker im letzten Snapshot.';
  }

  if (section.label === 'Cross-Cutting Variants') {
    sectionStatus = 'mixed_results';
    sectionNote = 'Querschnittsvarianten werden derzeit indirekt über Reports, Contracts und Watcher-Evidenz abgedeckt.';
  }

  const variants = section.variants.map((variant) => {
    let current_status = 'not_yet_tested';
    let note = 'Noch nicht als eigener NAS-Test umgesetzt.';

    if (variant.catalog_status === 'manual_or_external') {
      current_status = 'manual_or_external';
      note = 'Nicht im autonomen NAS-Probe-Pfad; braucht Admin, Hardware oder externen Worker.';
    } else if (variant.catalog_status === 'queued_design') {
      current_status = 'not_yet_tested';
      note = 'Noch nicht implementiert; aktuell nur als Backlog-Variante erfasst.';
    } else {
      current_status = sectionStatus;
      note = sectionNote || 'Durch aktuelle Reports/Probes abgedeckt.';
    }

    return {
      ...variant,
      current_status,
      note,
    };
  });

  return {
    ...section,
    probe_ids: probeIds,
    section_status: sectionStatus,
    section_note: sectionNote,
    variants,
  };
});

const allVariants = reportSections.flatMap((section) => section.variants);
const summary = {
  total_variants: allVariants.length,
  verified_success: allVariants.filter((variant) => variant.current_status === 'verified_success').length,
  mixed_results: allVariants.filter((variant) => variant.current_status === 'mixed_results').length,
  verified_failure: allVariants.filter((variant) => variant.current_status === 'verified_failure').length,
  not_yet_tested: allVariants.filter((variant) => variant.current_status === 'not_yet_tested').length,
  manual_or_external: allVariants.filter((variant) => variant.current_status === 'manual_or_external').length,
};

const doc = {
  schema_version: 'nas.solution.attempt.log.v1',
  generated_at: new Date().toISOString(),
  summary,
  sections: reportSections,
};

const lines = [
  '# NAS Solution Attempt Log',
  '',
  `Generated at: ${doc.generated_at}`,
  '',
  '## Summary',
  '',
  `- total_variants: ${summary.total_variants}`,
  `- verified_success: ${summary.verified_success}`,
  `- mixed_results: ${summary.mixed_results}`,
  `- verified_failure: ${summary.verified_failure}`,
  `- not_yet_tested: ${summary.not_yet_tested}`,
  `- manual_or_external: ${summary.manual_or_external}`,
  '',
  '## Per-Variant Outcome Log',
  '',
  'Jede Lösungsoption bleibt hier sichtbar, inklusive aktuellem Stand und kurzem Grund, warum sie erfolgreich war, nur teilweise trägt oder bisher scheiterte.',
  '',
];

for (const section of reportSections) {
  lines.push(`## ${section.id} ${section.label}`);
  lines.push('');
  lines.push(`- Section status: ${section.section_status}`);
  lines.push(`- Current evidence: ${section.probe_ids.length ? section.probe_ids.map((probeId) => `\`${probeId}\``).join(', ') : 'report-only / blocker-only'}`);
  lines.push(`- Current note: ${section.section_note || 'n/a'}`);
  lines.push('');
  lines.push('| Variant | Catalog status | Current evidence status | Current note |');
  lines.push('|---|---|---|---|');
  for (const variant of section.variants) {
    lines.push(`| ${variant.id} | ${variant.catalog_status} | ${variant.current_status} | ${compact(variant.note, 220)} |`);
  }
  lines.push('');
}

await fs.mkdir(path.dirname(OUT_JSON), { recursive: true });
await fs.writeFile(OUT_JSON, JSON.stringify(doc, null, 2) + '\n', 'utf8');
await fs.writeFile(OUT_MD, lines.join('\n') + '\n', 'utf8');
process.stdout.write(`${OUT_JSON}\n${OUT_MD}\n`);
