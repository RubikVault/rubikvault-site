#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { deriveLearningGate } from '../../functions/api/_shared/learning-gate.mjs';
import { buildArtifactEnvelope, collectUpstreamRunIds } from './pipeline-artifact-contract.mjs';

const ROOT = process.cwd();
const LEARNING_REPORT = path.join(ROOT, 'public/data/reports/learning-report-latest.json');
const POLICY_PATH = path.join(ROOT, 'policies/best-setups.v1.json');
const OUTPUT_PATH = path.join(ROOT, 'public/data/runtime/stock-analyzer-control.json');

function readJson(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return null;
  }
}

function ensureDir(filePath) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
}

function writeJsonAtomic(filePath, payload) {
  ensureDir(filePath);
  const tmpPath = `${filePath}.${process.pid}.tmp`;
  fs.writeFileSync(tmpPath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
  fs.renameSync(tmpPath, filePath);
}

const report = readJson(LEARNING_REPORT);
const policy = readJson(POLICY_PATH);
const stockAnalyzer = report?.features?.stock_analyzer || {};
const generatedAt = new Date().toISOString();
const learningGate = deriveLearningGate({
  learning_status: stockAnalyzer.learning_status || report?.best_setups_policy?.learning_status_current || policy?.learning_status?.default || 'BOOTSTRAP',
  safety_switch: stockAnalyzer.safety_switch || null,
  minimum_n_status: stockAnalyzer.minimum_n_status || null,
  policy,
  default_status: policy?.learning_status?.default || null,
});

const control = {
  schema: 'rv.stock_analyzer_control.v1',
  ...buildArtifactEnvelope({
    producer: 'scripts/ops/build-stock-analyzer-control.mjs',
    runId: report?.run_id || `learning-${report?.date || new Date().toISOString().slice(0, 10)}`,
    targetMarketDate: report?.target_market_date || report?.date || null,
    upstreamRunIds: collectUpstreamRunIds(report),
    generatedAt,
  }),
  source_report_generated_at: report?.generated_at || null,
  source_report_date: report?.date || null,
  learning_status: stockAnalyzer.learning_status || report?.best_setups_policy?.learning_status_current || policy?.learning_status?.default || 'BOOTSTRAP',
  safety_switch: stockAnalyzer.safety_switch || null,
  minimum_n_status: stockAnalyzer.minimum_n_status || null,
  learning_gate: learningGate,
  false_positive_classes_30d: stockAnalyzer.false_positive_classes_30d || {},
  policy: policy ? {
    schema_version: policy.schema_version || null,
    system_version: policy.system?.version || null,
    learning_status_default: policy.learning_status?.default || null,
    cost_model_version: policy.cost_model_version || null,
    meta_labeler_rule_version: policy.meta_labeler_rule_version || null,
  } : null,
};

writeJsonAtomic(OUTPUT_PATH, control);
console.log(`STOCK_ANALYZER_CONTROL_OK ${OUTPUT_PATH}`);
