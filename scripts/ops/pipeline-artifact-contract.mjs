import fs from 'node:fs';
import path from 'node:path';
import { loadJsonArtifact } from '../lib/pipeline_authority/artifacts/typed-loader.mjs';
import {
  AUTHORITATIVE_RELEASE_STATE_SCHEMAS,
  LEGACY_RELEASE_STATE_SCHEMAS,
} from '../lib/pipeline_authority/config/schema-versions.mjs';
import { recordLegacyArtifactRead } from '../lib/pipeline_authority/state/metrics.mjs';
import { assertAuthorizedAuthoritativeWrite } from '../lib/pipeline_authority/artifacts/write-guard.mjs';

export function readJson(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return null;
  }
}

export function readJsonTyped(filePath, options = {}) {
  return loadJsonArtifact(filePath, options);
}

export function writeJsonAtomic(filePath, payload) {
  assertAuthorizedAuthoritativeWrite(filePath);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const tmp = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(tmp, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
  fs.renameSync(tmp, filePath);
}

export function normalizeDate(value) {
  const iso = typeof value === 'string' ? value.slice(0, 10) : null;
  return iso && /^\d{4}-\d{2}-\d{2}$/.test(iso) ? iso : null;
}

export function isAuthoritativeReleaseState(doc) {
  return AUTHORITATIVE_RELEASE_STATE_SCHEMAS.has(String(doc?.schema || ''));
}

export function isLegacyReleaseState(doc) {
  return LEGACY_RELEASE_STATE_SCHEMAS.has(String(doc?.schema || ''));
}

export function resolveReleaseTargetMarketDate(doc, { trackLegacyRead = false, readerId = null } = {}) {
  if (!doc || typeof doc !== 'object') return null;
  if (isLegacyReleaseState(doc)) {
    if (trackLegacyRead) {
      recordLegacyArtifactRead({
        reader_id: readerId || 'unknown',
        artifact: 'release-state-latest.json',
        schema: doc.schema,
        reason: 'legacy_release_state_ignored',
      });
    }
    return null;
  }
  return normalizeDate(doc?.target_market_date || (isAuthoritativeReleaseState(doc) ? null : doc?.target_date) || null);
}

export function uniq(values) {
  return Array.from(new Set((Array.isArray(values) ? values : []).filter(Boolean)));
}

export function collectUpstreamRunIds(...docs) {
  const values = [];
  for (const doc of docs) {
    if (!doc || typeof doc !== 'object') continue;
    if (typeof doc.run_id === 'string' && doc.run_id.trim()) values.push(doc.run_id.trim());
    if (Array.isArray(doc.upstream_run_ids)) {
      for (const value of doc.upstream_run_ids) {
        if (typeof value === 'string' && value.trim()) values.push(value.trim());
      }
    }
  }
  // Remove failed run IDs (not relevant in a successful provenance trail)
  // and cap to last 20 to prevent unbounded growth across many days.
  const deduped = uniq(values).filter((id) => !id.startsWith('publish_chain_failed_'));
  return deduped.slice(-20);
}

export function buildArtifactEnvelope({
  producer,
  runId,
  targetMarketDate,
  upstreamRunIds = [],
  generatedAt = new Date().toISOString(),
} = {}) {
  return {
    run_id: runId || null,
    target_market_date: normalizeDate(targetMarketDate) || null,
    generated_at: generatedAt,
    producer: producer || null,
    upstream_run_ids: uniq(upstreamRunIds),
  };
}

function extractTargetDate(doc) {
  if (doc?.schema && /^rv_release_state_v/i.test(String(doc.schema))) {
    return resolveReleaseTargetMarketDate(doc);
  }
  // Only canonical field — no legacy target_date fallback for non-release-state artifacts
  return normalizeDate(
    doc?.target_market_date
    || doc?.summary?.target_market_date
    || doc?.metadata?.target_market_date
    || null
  );
}

function extractRunId(doc) {
  const value = typeof doc?.run_id === 'string' ? doc.run_id.trim() : null;
  return value || null;
}

export function moduleAllowsAheadOfTarget(stepId) {
  // These modules run on or after the target date (their output_asof may be today's date)
  return ['market_data_refresh', 'q1_delta_ingest', 'forecast_daily', 'snapshot'].includes(String(stepId || '').trim());
}

// Single source of truth for QuantLab canonical label lag tolerance (20 trading days ≈ 28 calendar days)
// Matches CANONICAL_LABEL_WINDOW = 20 in build-system-status-report.mjs
export const QUANTLAB_CANONICAL_LAG_TOLERANCE_TRADING_DAYS = 20;

export function moduleAllowsCanonicalLag(stepId) {
  return ['quantlab_daily_report'].includes(String(stepId || '').trim());
}

export function isModuleTargetCompatible(stepId, asOf, targetMarketDate) {
  const moduleDate = normalizeDate(asOf);
  const expectedDate = normalizeDate(targetMarketDate);
  if (!moduleDate || !expectedDate) return true;
  if (moduleAllowsAheadOfTarget(stepId)) return moduleDate >= expectedDate;
  if (moduleAllowsCanonicalLag(stepId)) {
    // Conservative calendar-day approximation: 20 trading days ≈ 28 calendar days
    const lagCalendarDays = (new Date(expectedDate) - new Date(moduleDate)) / 86400000;
    return lagCalendarDays >= 0 && lagCalendarDays <= 28;
  }
  return moduleDate === expectedDate;
}

export function validateControlPlaneConsistency({ system = null, release = null, runtime = null, epoch = null, recovery = null } = {}) {
  const targetPairs = [
    ['system', extractTargetDate(system)],
    ['release', extractTargetDate(release)],
    ['runtime', extractTargetDate(runtime)],
    ['epoch', extractTargetDate(epoch)],
  ].filter(([, value]) => value);
  const distinctTargets = uniq(targetPairs.map(([, value]) => value));
  const targetMarketDate = distinctTargets[0] || null;
  const targetMismatches = distinctTargets.length > 1
    ? targetPairs.map(([source, value]) => ({ source, target_market_date: value }))
    : [];

  const runPairs = [
    ['system', extractRunId(system)],
    ['release', extractRunId(release)],
    ['runtime', extractRunId(runtime)],
    ['epoch', extractRunId(epoch)],
  ].filter(([, value]) => value);
  const distinctRuns = uniq(runPairs.map(([, value]) => value));
  const runId = distinctRuns[0] || null;
  const runIdMismatches = distinctRuns.length > 1
    ? runPairs.map(([source, value]) => ({ source, run_id: value }))
    : [];

  const blockingReasons = [];
  if (targetMismatches.length > 0) {
    blockingReasons.push({
      id: 'target_market_date_mismatch',
      severity: 'critical',
      details: targetMismatches,
    });
  }
  if (runIdMismatches.length > 0) {
    blockingReasons.push({
      id: 'run_id_mismatch',
      severity: 'critical',
      details: runIdMismatches,
    });
  }
  if (runtime?.pipeline_consistency?.ok === false) {
    blockingReasons.push({
      id: 'runtime_pipeline_consistency_failed',
      severity: 'critical',
      details: runtime.pipeline_consistency,
    });
  }
  if (epoch?.pipeline_ok === false && Array.isArray(epoch?.blocking_gaps) && epoch.blocking_gaps.length > 0) {
    blockingReasons.push({
      id: 'epoch_blocking_gaps',
      severity: 'critical',
      details: epoch.blocking_gaps,
    });
  }
  const moduleDateMismatches = targetMarketDate && epoch?.modules
    ? Object.entries(epoch.modules)
      .filter(([id, module]) => normalizeDate(module?.as_of) && !isModuleTargetCompatible(id, module?.as_of, targetMarketDate))
      .map(([id, module]) => ({ id, as_of: normalizeDate(module?.as_of), expected_target_market_date: targetMarketDate }))
    : [];
  const moduleRunIdNulls = epoch?.modules
    ? Object.entries(epoch.modules)
      .filter(([, module]) => !String(module?.run_id || '').trim())
      .map(([id]) => ({ id, run_id: null }))
    : [];
  if (moduleDateMismatches.length > 0) {
    blockingReasons.push({
      id: 'epoch_module_target_mismatch',
      severity: 'critical',
      details: moduleDateMismatches,
    });
  }
  if (moduleRunIdNulls.length > 0) {
    blockingReasons.push({
      id: 'epoch_module_run_id_null',
      severity: 'critical',
      details: moduleRunIdNulls,
    });
  }
  if (release?.ui_green === true && Array.isArray(release?.blockers) && release.blockers.length > 0) {
    blockingReasons.push({
      id: 'impossible_state_release_green_with_blockers',
      severity: 'critical',
      details: release.blockers,
    });
  }
  if (release?.ui_green === true && release?.full_universe_validated !== true) {
    blockingReasons.push({
      id: 'impossible_state_release_green_without_full_universe_validation',
      severity: 'critical',
      details: {
        ui_green: release?.ui_green,
        full_universe_validated: release?.full_universe_validated ?? null,
      },
    });
  }
  if (release?.ui_green === true && release?.allowed_launchd_only !== true) {
    blockingReasons.push({
      id: 'impossible_state_release_green_with_launchd_violation',
      severity: 'critical',
      details: {
        ui_green: release?.ui_green,
        allowed_launchd_only: release?.allowed_launchd_only ?? null,
      },
    });
  }

  return {
    ok: blockingReasons.length === 0,
    run_id: runId,
    target_market_date: targetMarketDate,
    target_mismatches: targetMismatches,
    run_id_mismatches: runIdMismatches,
    observational_sources: {
      recovery: {
        run_id: extractRunId(recovery),
        target_market_date: extractTargetDate(recovery),
      },
    },
    blocking_reasons: blockingReasons,
  };
}
