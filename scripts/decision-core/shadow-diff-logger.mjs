#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { ROOT, readJsonMaybe, uniqueStrings, writeJsonAtomic } from './shared.mjs';
import { validateDecisionCoreRoot } from './validate-decision-bundles.mjs';

export function classifyCriticalDiff({ legacyAction, coreAction, mappedAction, buyInvariantMismatch = false, unknownBlockingChangedAction = false }) {
  const legacy = String(legacyAction || '').toUpperCase();
  const core = String(coreAction || '').toUpperCase();
  const mapped = String(mappedAction || core || '').toUpperCase();
  if (buyInvariantMismatch || unknownBlockingChangedAction) return 'critical';
  if (mapped && core && mapped !== core) return 'critical';
  if (!legacy) return core === 'BUY' ? 'critical' : 'non_critical';
  if (legacy === 'BUY' && core !== 'BUY') return 'critical';
  if (legacy !== 'BUY' && core === 'BUY') return 'critical';
  return 'non_critical';
}

function readCoreRows(rootPath) {
  const out = new Map();
  const dir = path.join(rootPath, 'parts');
  if (!fs.existsSync(dir)) return out;
  for (const name of fs.readdirSync(dir)) {
    if (!name.endsWith('.ndjson.gz')) continue;
    const text = zlib.gunzipSync(fs.readFileSync(path.join(dir, name))).toString('utf8');
    for (const line of text.split('\n')) {
      if (!line.trim()) continue;
      const row = JSON.parse(line);
      out.set(row.meta.asset_id, row);
    }
  }
  return out;
}

function readLegacyRows() {
  const latest = readJsonMaybe(path.join(ROOT, 'public/data/decisions/latest.json'));
  const snap = latest?.snapshot_path ? path.join(ROOT, 'public', latest.snapshot_path.replace(/^\/+/, '')) : null;
  const out = new Map();
  if (!snap || !fs.existsSync(snap)) return out;
  for (const name of fs.readdirSync(snap)) {
    if (!name.endsWith('.ndjson.gz')) continue;
    const text = zlib.gunzipSync(fs.readFileSync(path.join(snap, name))).toString('utf8');
    for (const line of text.split('\n')) {
      if (!line.trim()) continue;
      try {
        const row = JSON.parse(line);
        if (row?.canonical_id) out.set(String(row.canonical_id).toUpperCase(), row);
      } catch {
        // ignored
      }
    }
  }
  return out;
}

function bump(map, key) {
  const clean = String(key || 'UNKNOWN').toUpperCase();
  map[clean] = (map[clean] || 0) + 1;
}

function firstReason(core) {
  const vetos = uniqueStrings(core?.eligibility?.vetos || []);
  const reasons = uniqueStrings(core?.decision?.reason_codes || []);
  return core?.decision?.main_blocker
    || vetos[0]
    || reasons[0]
    || core?.decision?.wait_subtype
    || core?.eligibility?.eligibility_status
    || 'UNKNOWN';
}

const SAFETY_DOWNGRADE_REASONS = new Set([
  'TAIL_RISK_UNKNOWN',
  'TAIL_RISK_HIGH',
  'WAIT_RISK_BLOCKER',
  'PRICE_BELOW_MIN',
  'DOLLAR_VOLUME_TOO_LOW',
  'LIQUIDITY_SCORE_TOO_LOW',
  'SPREAD_PROXY_TOO_HIGH',
  'EV_PROXY_NOT_POSITIVE',
  'EV_PROXY_UNAVAILABLE',
  'COST_PROXY_HIGH',
  'COST_PROXY_UNAVAILABLE',
  'WAIT_LOW_RANK',
  'WAIT_LOW_EVIDENCE',
  'SUSPICIOUS_ADJUSTED_DATA',
  'SUSPECT_SPLIT',
  'CRITICAL_DATA_GAP',
  'STALE_PRICE',
  'HALTED_RECENTLY',
]);

function isLegacyBuySafetyDowngrade({ legacyAction, coreAction, core }) {
  const legacy = String(legacyAction || '').toUpperCase();
  const action = String(coreAction || '').toUpperCase();
  if (legacy !== 'BUY' || action === 'BUY') return false;
  const reasonSet = new Set([
    firstReason(core),
    ...(core?.decision?.reason_codes || []),
    ...(core?.eligibility?.vetos || []),
  ].map((item) => String(item || '').toUpperCase()));
  for (const reason of reasonSet) {
    if (SAFETY_DOWNGRADE_REASONS.has(reason)) return true;
  }
  return false;
}

function diffBucket({ legacyAction, coreAction, mappedAction, core, status }) {
  const legacy = String(legacyAction || 'MISSING').toUpperCase();
  const action = String(coreAction || 'UNKNOWN').toUpperCase();
  const mapped = String(mappedAction || action).toUpperCase();
  if (mapped !== action) return `mapped_action_mismatch:${action}->${mapped}`;
  if (!legacyAction && action === 'BUY') return 'core_buy_legacy_missing';
  if (!legacyAction) return 'legacy_missing_non_buy';
  if (legacy === action) return 'same_action';
  if (legacy === 'BUY' && action !== 'BUY') {
    const blocker = firstReason(core);
    if (action === 'UNAVAILABLE' || action === 'INCUBATING') return `legacy_buy_core_${action.toLowerCase()}:${blocker}`;
    return `legacy_buy_core_${action.toLowerCase()}:${blocker}`;
  }
  if (legacy !== 'BUY' && action === 'BUY') return `core_buy_legacy_${legacy.toLowerCase()}`;
  if (legacy === 'AVOID' || action === 'AVOID') return `avoid_mismatch:${legacy}->${action}`;
  return status === 'critical' ? `critical_other:${legacy}->${action}` : `non_critical:${legacy}->${action}`;
}

export function buildShadowDiffSummary(rootPath = path.join(ROOT, 'public/data/decision-core/shadow')) {
  const validation = validateDecisionCoreRoot(rootPath);
  const coreRows = readCoreRows(rootPath);
  const legacyRows = readLegacyRows();
  let diffCount = 0;
  let criticalDiffCount = 0;
  const action_matrix = {};
  const core_action_counts = {};
  const legacy_action_counts = {};
  const critical_buckets = {};
  const non_critical_buckets = {};
  const critical_samples = [];
  const legacy_buy_downgrade_reasons = {};
  const legacy_buy_safety_downgrade_reasons = {};
  const core_buy_new_reasons = {};
  let safetyDowngradeCount = 0;
  for (const [assetId, core] of coreRows.entries()) {
    const legacy = legacyRows.get(assetId);
    const legacyAction = String(legacy?.verdict || 'MISSING').toUpperCase();
    const coreAction = String(core?.decision?.primary_action || 'UNKNOWN').toUpperCase();
    let status = classifyCriticalDiff({
      legacyAction,
      coreAction,
      mappedAction: coreAction,
    });
    const safetyDowngrade = isLegacyBuySafetyDowngrade({ legacyAction, coreAction, core });
    if (status === 'critical' && safetyDowngrade) status = 'non_critical';
    bump(legacy_action_counts, legacyAction);
    bump(core_action_counts, coreAction);
    bump(action_matrix, `${legacyAction}->${coreAction}`);
    if (legacy && legacyAction !== coreAction) diffCount += 1;
    const bucket = diffBucket({ legacyAction: legacy?.verdict, coreAction, mappedAction: coreAction, core, status });
    if (status === 'critical') {
      criticalDiffCount += 1;
      bump(critical_buckets, bucket);
      if (legacyAction === 'BUY' && coreAction !== 'BUY') bump(legacy_buy_downgrade_reasons, firstReason(core));
      if (legacyAction !== 'BUY' && coreAction === 'BUY') bump(core_buy_new_reasons, firstReason(core));
      if (critical_samples.length < 80) {
        critical_samples.push({
          asset_id: assetId,
          legacy_action: legacyAction,
          core_action: coreAction,
          bucket,
          eligibility_status: core?.eligibility?.eligibility_status || null,
          decision_grade: core?.eligibility?.decision_grade ?? null,
          main_blocker: core?.decision?.main_blocker || null,
          wait_subtype: core?.decision?.wait_subtype || null,
          ev_proxy_bucket: core?.evidence_summary?.ev_proxy_bucket || null,
          tail_risk_bucket: core?.evidence_summary?.tail_risk_bucket || null,
          reason_codes: uniqueStrings(core?.decision?.reason_codes || []).slice(0, 5),
          vetos: uniqueStrings(core?.eligibility?.vetos || []).slice(0, 5),
        });
      }
    } else {
      bump(non_critical_buckets, bucket);
      if (safetyDowngrade) {
        safetyDowngradeCount += 1;
        bump(legacy_buy_safety_downgrade_reasons, firstReason(core));
      }
    }
  }
  const criticalDiffRate = coreRows.size ? criticalDiffCount / coreRows.size : 0;
  const status = readJsonMaybe(path.join(rootPath, 'status.json')) || {};
  return {
    as_of_date: status.target_market_date || null,
    bundle_errors: validation.ok ? 0 : validation.errors.length,
    schema_errors: validation.errors.filter((e) => String(e).startsWith('schema:')).length,
    ...validation.counters,
    legacy_buy_bundle_unavailable: legacyRows.size === 0 ? 1 : 0,
    as_of_mismatches: 0,
    critical_diff_rate: criticalDiffRate,
    zero_buy_cause: status.zero_buy_cause || null,
    part_size_max_bytes: validation.part_size_max_bytes,
    row_size_max_bytes: validation.row_size_max_bytes,
    decision_grade_rate: status.decision_grade_rate || 0,
    buy_rate: status.total_assets ? status.buy_count / status.total_assets : 0,
    wait_rate: status.total_assets ? status.wait_count / status.total_assets : 0,
    unavailable_rate: status.total_assets ? status.unavailable_count / status.total_assets : 0,
    incubating_rate: status.total_assets ? status.incubating_count / status.total_assets : 0,
    diff_count: diffCount,
    critical_diff_count: criticalDiffCount,
    action_matrix,
    core_action_counts,
    legacy_action_counts,
    critical_buckets,
    non_critical_buckets,
    legacy_buy_downgrade_reasons,
    legacy_buy_safety_downgrade_count: safetyDowngradeCount,
    legacy_buy_safety_downgrade_reasons,
    core_buy_new_reasons,
    critical_samples,
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const summary = buildShadowDiffSummary();
  writeJsonAtomic(path.join(ROOT, 'public/data/decision-core/shadow-diff-latest.json'), summary);
  console.log(JSON.stringify(summary, null, 2));
  if (summary.bundle_errors > 0 || summary.schema_errors > 0) process.exit(1);
}
