import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const META_PATH = path.join(ROOT, 'public/dashboard_v6_meta_data.json');
const V7_STATUS_PATH = path.join(ROOT, 'public/data/ui/dashboard-v7-status.json');
const DASHBOARD_PATH = path.join(ROOT, 'public/dashboard_v7.html');

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

describe('dashboard_v7 meta contract', () => {
  const meta = readJson(META_PATH);
  const v7Status = readJson(V7_STATUS_PATH);
  const html = fs.readFileSync(DASHBOARD_PATH, 'utf8');

  it('exports system steps and validation chain', () => {
    assert.ok(meta.system.steps && typeof meta.system.steps === 'object');
    assert.ok(Array.isArray(meta.system.web_validation_chain));
    assert.ok(Array.isArray(meta.system.tracked_step_ids));
    assert.ok(Object.prototype.hasOwnProperty.call(meta.system, 'stock_analyzer_universe_audit'));
  });

  it('exports operations runbook mirrors', () => {
    assert.ok(meta.operations.step_runbook && typeof meta.operations.step_runbook === 'object');
    assert.ok(Array.isArray(meta.operations.web_validation_chain));
    assert.ok(Object.prototype.hasOwnProperty.call(meta.operations, 'stock_analyzer_universe_audit'));
  });

  it('exports a dedicated V7 status artifact with provenance', () => {
    assert.equal(v7Status.schema_version, 'rv.dashboard_v7_status.v1');
    assert.equal(v7Status.generator_id, 'scripts/generate_meta_dashboard_data.mjs');
    assert.ok(typeof v7Status.run_id === 'string' || v7Status.run_id === null);
    assert.ok(typeof v7Status.target_market_date === 'string' || v7Status.target_market_date === null);
    assert.ok(typeof v7Status.artifact_hash === 'string' && v7Status.artifact_hash.length > 10);
    assert.ok(v7Status.system && typeof v7Status.system === 'object');
    assert.ok(Array.isArray(v7Status.blocking_reasons));
    assert.ok(Array.isArray(v7Status.advisory_reasons));
    assert.ok(Object.prototype.hasOwnProperty.call(v7Status.system, 'blocking_severity'));
    assert.ok(Object.prototype.hasOwnProperty.call(v7Status.system, 'advisory_severity'));
  });

  it('dashboard renders the new recovery sections', () => {
    assert.ok(html.includes('SSOT Recovery Runbook'));
    assert.ok(html.includes('Stock Analyzer Universe Audit'));
    assert.ok(html.includes('Ordered Recovery Plan'));
    assert.ok(html.includes('Web Validation Chain'));
    assert.ok(html.includes('recoveryRunbookContent'));
    assert.ok(html.includes('stockAnalyzerAuditContent'));
    assert.ok(html.includes('stockAnalyzerRecoveryContent'));
    assert.ok(html.includes('validationChainContent'));
    assert.ok(html.includes('/data/ui/dashboard-v7-status.json'));
  });
});
