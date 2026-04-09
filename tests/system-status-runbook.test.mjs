import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import {
  STOCK_ANALYZER_WEB_VALIDATION_CHAIN,
  SYSTEM_STATUS_DOC_REF,
  SYSTEM_STATUS_STEP_CONTRACTS,
} from '../scripts/ops/system-status-ssot.mjs';

const ROOT = process.cwd();
const STATUS_PATH = path.join(ROOT, 'public/data/reports/system-status-latest.json');
const RUNBOOK_PATH = path.join(ROOT, 'docs/ops/runbook.md');
const README_PATH = path.join(ROOT, 'README.md');

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

describe('system status SSOT registry', () => {
  it('defines runbook fields for every tracked step', () => {
    for (const [id, contract] of Object.entries(SYSTEM_STATUS_STEP_CONTRACTS)) {
      assert.ok(contract.run_command, `${id} missing run_command`);
      assert.ok(Array.isArray(contract.verify_commands), `${id} missing verify_commands`);
      assert.ok(Array.isArray(contract.outputs), `${id} missing outputs`);
      assert.ok(Array.isArray(contract.ui_surfaces), `${id} missing ui_surfaces`);
    }
  });

  it('defines a web validation chain', () => {
    assert.ok(STOCK_ANALYZER_WEB_VALIDATION_CHAIN.length >= 6);
    for (const stage of STOCK_ANALYZER_WEB_VALIDATION_CHAIN) {
      assert.ok(stage.label);
      assert.ok(stage.check_command);
      assert.ok(stage.fix_command);
      assert.ok(stage.success_signal);
    }
  });
});

describe('system-status-latest contract', () => {
  const doc = readJson(STATUS_PATH);

  it('publishes SSOT metadata', () => {
    assert.equal(doc.ssot.doc_ref, SYSTEM_STATUS_DOC_REF);
    assert.ok(Array.isArray(doc.ssot.tracked_step_ids));
    assert.ok(Array.isArray(doc.ssot.web_validation_chain));
  });

  it('every tracked step has an attached runbook', () => {
    for (const id of doc.ssot.tracked_step_ids) {
      const step = doc.steps[id];
      assert.ok(step, `missing step ${id}`);
      assert.ok(step.runbook, `missing runbook for ${id}`);
      assert.ok(step.runbook.run_command, `missing run command for ${id}`);
      assert.ok(Array.isArray(step.runbook.verify_commands), `missing verify commands for ${id}`);
    }
  });
});

describe('repo docs point to the central operational workflow', () => {
  const runbook = fs.readFileSync(RUNBOOK_PATH, 'utf8');
  const readme = fs.readFileSync(README_PATH, 'utf8');

  it('runbook includes full-green workflow, logs, and restart sections', () => {
    assert.ok(runbook.includes('Always-Green Operator Workflow'));
    assert.ok(runbook.includes('Logs, Reports, Status Files'));
    assert.ok(runbook.includes('Restart Matrix'));
    assert.ok(runbook.includes('Stock Analyzer universe audit'));
  });

  it('readme points to the central runbook and universe audit', () => {
    assert.ok(readme.includes('docs/ops/runbook.md'));
    assert.ok(readme.includes('stock-analyzer-universe-audit-latest.json'));
  });
});
