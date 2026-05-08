#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import Ajv2020 from 'ajv/dist/2020.js';
import {
  HARD_VETO_CODES,
  PART_HARD_BYTES_GZIP,
  REASON_CODES_PATH,
  ROOT,
  UI_ROW_RAW_TARGET_BYTES,
  loadPolicyBundle,
  readJson,
  uniqueStrings,
} from './shared.mjs';

const SCHEMA_PATH = path.join(ROOT, 'schemas/decision-core/minimal-stock-decision-bundle.v1.schema.json');

export function validateDecisionCoreRoot(rootPath) {
  const manifest = readJson(path.join(rootPath, 'manifest.json'));
  const status = readJson(path.join(rootPath, 'status.json'));
  const schema = readJson(SCHEMA_PATH);
  const ajv = new Ajv2020({ allErrors: true, strict: false });
  const validate = ajv.compile(schema);
  const { reasonMap } = loadPolicyBundle();
  const errors = [];
  let rowCount = 0;
  let rowSizeMax = 0;
  let partSizeMax = 0;
  let buyWithoutDecisionGrade = 0;
  let buyWithoutEntryGuard = 0;
  let buyWithoutInvalidation = 0;
  let buyWithoutReasonCodes = 0;
  let buyWithTailRiskHighOrUnknown = 0;
  let buyWithEvProxyNotPositive = 0;
  let buyWithReliabilityLow = 0;
  let unknownReasonCodeCount = 0;
  let unknownBlockingReasonCodeCount = 0;
  let hardVetoWithoutUiMapping = 0;
  let legacyBuyFallbackCount = 0;

  const partsDir = path.join(rootPath, 'parts');
  for (const name of fs.readdirSync(partsDir).filter((n) => /^part-\d{3}\.ndjson\.gz$/.test(n)).sort()) {
    const filePath = path.join(partsDir, name);
    const partBytes = fs.statSync(filePath).size;
    partSizeMax = Math.max(partSizeMax, partBytes);
    if (partBytes > PART_HARD_BYTES_GZIP) errors.push(`part_size_hard_limit:${name}:${partBytes}`);
    const text = zlib.gunzipSync(fs.readFileSync(filePath)).toString('utf8');
    for (const line of text.split('\n')) {
      if (!line.trim()) continue;
      let row;
      try {
        row = JSON.parse(line);
      } catch {
        errors.push(`json_parse_failed:${name}`);
        continue;
      }
      rowCount += 1;
      const rowBytes = Buffer.byteLength(JSON.stringify(row), 'utf8');
      rowSizeMax = Math.max(rowSizeMax, rowBytes);
      if (rowBytes > UI_ROW_RAW_TARGET_BYTES * 4) errors.push(`row_hard_limit:${row?.meta?.asset_id}:${rowBytes}`);
      if (!validate(row)) errors.push(`schema:${row?.meta?.asset_id}:${ajv.errorsText(validate.errors)}`);
      const action = row?.decision?.primary_action;
      const reasons = uniqueStrings(row?.decision?.reason_codes || []);
      const unknownReasons = reasons.filter((code) => !reasonMap.has(code));
      unknownReasonCodeCount += unknownReasons.length;
      const unknownBlocking = unknownReasons.filter((code) => /BLOCK|VETO|STALE|RISK|MISSING|UNKNOWN|FAILED|LOW|HIGH/.test(code));
      unknownBlockingReasonCodeCount += unknownBlocking.length;
      for (const veto of row?.eligibility?.vetos || []) {
        if (!reasonMap.has(veto)) hardVetoWithoutUiMapping += 1;
      }
      if (action === 'BUY') {
        if (row?.eligibility?.decision_grade !== true) buyWithoutDecisionGrade += 1;
        if (row?.trade_guard?.max_entry_price == null) buyWithoutEntryGuard += 1;
        if (row?.trade_guard?.invalidation_level == null) buyWithoutInvalidation += 1;
        if (!reasons.length) buyWithoutReasonCodes += 1;
        if (row?.evidence_summary?.tail_risk_bucket === 'HIGH' || row?.evidence_summary?.tail_risk_bucket === 'UNKNOWN') buyWithTailRiskHighOrUnknown += 1;
        if (row?.evidence_summary?.ev_proxy_bucket !== 'positive') buyWithEvProxyNotPositive += 1;
        if (row?.decision?.analysis_reliability === 'LOW') buyWithReliabilityLow += 1;
        if ((row?.eligibility?.vetos || []).some((code) => HARD_VETO_CODES.has(code))) errors.push(`buy_with_hard_veto:${row?.meta?.asset_id}`);
        if (row?.eligibility?.eligibility_status !== 'ELIGIBLE') errors.push(`buy_not_eligible:${row?.meta?.asset_id}`);
        if (row?.meta?.asset_type === 'INDEX') errors.push(`index_public_buy:${row?.meta?.asset_id}`);
      }
      for (const horizon of ['short_term', 'mid_term', 'long_term']) {
        if ('wait_subtype' in (row?.horizons?.[horizon] || {})) errors.push(`wait_subtype_inside_horizon:${row?.meta?.asset_id}:${horizon}`);
      }
      if (row?.eligibility?.eligibility_status === 'NOT_DECISION_GRADE' && row?.decision?.primary_action === 'WAIT') errors.push(`ndg_mapped_to_wait:${row?.meta?.asset_id}`);
      if (row?.eligibility?.eligibility_status === 'INCUBATING' && row?.decision?.primary_action !== 'INCUBATING') errors.push(`incubating_action_invalid:${row?.meta?.asset_id}`);
    }
  }

  for (const [name, value] of Object.entries({
    buy_without_decision_grade: buyWithoutDecisionGrade,
    buy_without_entry_guard: buyWithoutEntryGuard,
    buy_without_invalidation: buyWithoutInvalidation,
    buy_without_reason_codes: buyWithoutReasonCodes,
    buy_with_tail_risk_high_or_unknown: buyWithTailRiskHighOrUnknown,
    buy_with_ev_proxy_not_positive: buyWithEvProxyNotPositive,
    buy_with_analysis_reliability_low: buyWithReliabilityLow,
    unknown_blocking_reason_code_count: unknownBlockingReasonCodeCount,
    hard_veto_without_ui_mapping: hardVetoWithoutUiMapping,
    legacy_buy_fallback_count: legacyBuyFallbackCount,
  })) {
    if (value > 0) errors.push(`${name}:${value}`);
  }

  return {
    ok: errors.length === 0,
    errors,
    manifest,
    status,
    row_count: rowCount,
    part_size_max_bytes: partSizeMax,
    row_size_max_bytes: rowSizeMax,
    counters: {
      buy_without_decision_grade: buyWithoutDecisionGrade,
      buy_without_entry_guard: buyWithoutEntryGuard,
      buy_without_invalidation: buyWithoutInvalidation,
      buy_without_reason_codes: buyWithoutReasonCodes,
      buy_with_tail_risk_high_or_unknown: buyWithTailRiskHighOrUnknown,
      buy_with_ev_proxy_not_positive: buyWithEvProxyNotPositive,
      buy_with_analysis_reliability_low: buyWithReliabilityLow,
      unknown_reason_code_count: unknownReasonCodeCount,
      unknown_blocking_reason_code_count: unknownBlockingReasonCodeCount,
      hard_veto_without_ui_mapping: hardVetoWithoutUiMapping,
      legacy_buy_fallback_count: legacyBuyFallbackCount,
    },
  };
}

function parseArgs(argv) {
  const get = (name) => {
    const found = argv.find((arg) => arg.startsWith(`--${name}=`));
    if (found) return found.split('=').slice(1).join('=');
    const index = argv.indexOf(`--${name}`);
    return index >= 0 ? argv[index + 1] || null : null;
  };
  return {
    root: path.resolve(ROOT, get('root') || 'public/data/decision-core/shadow'),
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const opts = parseArgs(process.argv.slice(2));
  const result = validateDecisionCoreRoot(opts.root);
  console.log(JSON.stringify(result, null, 2));
  if (!result.ok) process.exit(1);
}
