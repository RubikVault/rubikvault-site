import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const META_PATH = path.join(ROOT, 'public/dashboard_v6_meta_data.json');
const V7_STATUS_PATH = path.join(ROOT, 'public/data/ui/dashboard-v7-status.json');
const DASHBOARD_PATH = path.join(ROOT, 'public/dashboard_v7.html');
const GENERATOR_PATH = path.join(ROOT, 'scripts/generate_meta_dashboard_data.mjs');

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

describe('dashboard_v7 meta contract', () => {
  const meta = readJson(META_PATH);
  const v7Status = readJson(V7_STATUS_PATH);
  const html = fs.readFileSync(DASHBOARD_PATH, 'utf8');
  const generator = fs.readFileSync(GENERATOR_PATH, 'utf8');

  it('exports system steps and validation chain', () => {
    assert.ok(generator.includes('step_runbook'));
    assert.ok(generator.includes('web_validation_chain'));
    assert.ok(generator.includes('tracked_step_ids'));
    if (Object.prototype.hasOwnProperty.call(meta.system, 'steps')) {
      assert.ok(meta.system.steps == null || typeof meta.system.steps === 'object');
    }
    if (Object.prototype.hasOwnProperty.call(meta.system, 'web_validation_chain')) {
      assert.ok(Array.isArray(meta.system.web_validation_chain));
    }
    if (Object.prototype.hasOwnProperty.call(meta.system, 'tracked_step_ids')) {
      assert.ok(Array.isArray(meta.system.tracked_step_ids));
    }
    assert.ok(Object.prototype.hasOwnProperty.call(meta.system, 'stock_analyzer_universe_audit'));
  });

  it('exports operations runbook mirrors', () => {
    assert.ok(generator.includes('step_runbook'));
    assert.ok(generator.includes('final_integrity_seal'));
    if (Object.prototype.hasOwnProperty.call(meta.operations, 'step_runbook')) {
      assert.ok(meta.operations.step_runbook == null || typeof meta.operations.step_runbook === 'object');
    }
    if (Object.prototype.hasOwnProperty.call(meta.operations, 'web_validation_chain')) {
      assert.ok(Array.isArray(meta.operations.web_validation_chain));
    }
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
    assert.ok(generator.includes('runtime_preflight_ok'));
    assert.ok(generator.includes('runtime_preflight_ref'));
  });

  it('dashboard truth banner uses seal and realtime freshness sources', () => {
    assert.ok(html.includes('/data/ui/dashboard-v7-status.json'));
    assert.ok(html.includes('/data/ops/final-integrity-seal-latest.json'));
    assert.ok(html.includes('seal_fetch_status'));
    assert.ok(html.includes('status_file_stale'));
    assert.ok(html.includes('status_file_older_than_seal'));
    assert.ok(html.includes('worst_realtime_stale_days'));
    assert.ok(html.includes('m.data_asof || m.generated_at || data.generated_at'));
    assert.ok(html.includes('SEAL UNAVAILABLE'));
    assert.ok(html.includes('status file is older than the integrity seal'));
  });
});
