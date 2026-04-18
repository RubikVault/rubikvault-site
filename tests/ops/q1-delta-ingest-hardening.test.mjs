import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { normalizeQ1DeltaLatestSuccess } from '../../scripts/lib/q1-delta-success.mjs';

const ROOT = path.resolve(new URL('../..', import.meta.url).pathname);

test('system status treats incomplete q1 latest_success evidence as a hard blocker', () => {
  const content = fs.readFileSync(path.join(ROOT, 'scripts/ops/build-system-status-report.mjs'), 'utf8');
  assert.match(content, /deltaEvidenceComplete/);
  assert.match(content, /expectedOperationalTargetDate/);
  assert.match(content, /deltaTargetMismatch/);
  assert.match(content, /latest_success\.json is incomplete/);
});

test('q1 latest_success normalization accepts nested stats/reconciliation evidence', () => {
  const normalized = normalizeQ1DeltaLatestSuccess({
    updated_at: '2026-04-12T12:55:19Z',
    ingest_date: '2026-04-10',
    stats: {
      selected_packs_total: 0,
    },
    reconciliation: {
      noop_no_changed_packs: true,
    },
  });
  assert.equal(normalized.evidence_complete, true);
  assert.equal(normalized.ingest_date, '2026-04-10');
  assert.equal(normalized.selected_packs_total, 0);
  assert.equal(normalized.noop_no_changed_packs, true);
  assert.equal(normalized.evidence_sources.selected_packs_total, 'stats');
  assert.equal(normalized.evidence_sources.noop_no_changed_packs, 'reconciliation');
});

test('dashboard recovery target selection is not pulled forward by q1 latest_success', () => {
  const content = fs.readFileSync(path.join(ROOT, 'scripts/ops/run-dashboard-green-recovery.mjs'), 'utf8');
  assert.match(content, /const targetMarketDate = requestedTargetDate \|\| marketSessionDate/);
  assert.doesNotMatch(content, /q1Success\?\.ingest_date/);
});

test('dashboard recovery gives q1 a longer stall budget and explicit blocker classes', () => {
  const content = fs.readFileSync(path.join(ROOT, 'scripts/ops/run-dashboard-green-recovery.mjs'), 'utf8');
  assert.match(content, /id: 'q1_delta_ingest'[\s\S]*stallMinutes: 90/);
  assert.match(content, /blocked_retryable/);
  assert.match(content, /blocked_terminal/);
  assert.match(content, /lead_blocker_step/);
  assert.match(content, /step_states/);
});

test('hist-probs recovery completion tolerates neutral no-data and inactive reclassifications', () => {
  const content = fs.readFileSync(path.join(ROOT, 'scripts/ops/run-dashboard-green-recovery.mjs'), 'utf8');
  assert.match(content, /histProbsNeutralizedErrors/);
  assert.match(content, /tickers_excluded_no_data/);
  assert.match(content, /tickers_excluded_inactive/);
  assert.match(content, /reclassify_no_data_count/);
  assert.match(content, /reclassify_inactive_count/);
});

test('q1 runner does not publish success before completion and protects full-scan cache state', () => {
  const content = fs.readFileSync(path.join(ROOT, 'scripts/quantlab/run_daily_delta_ingest_q1.py'), 'utf8');
  assert.match(content, /--force-pack-file/);
  assert.match(content, /def _load_force_packs/);
  assert.match(content, /def flatten_delta_rows_for_pack/);
  assert.match(content, /rows_by_class, per_pack_stats, filter_stats_total, emitted_latest_dates = flatten_delta_rows_for_pack/);
  assert.match(content, /state\["pack_selection"\]/);
  assert.match(content, /commit_cache=not bool\(args\.full_scan_packs\)/);
  assert.match(content, /resume_incomplete_full_scan/);
  assert.match(content, /state\["current_pack"\]/);
  assert.match(content, /completed_packs = \{p for p in completed_packs if p not in force\}/);
  assert.match(content, /def persist_latest_date_cache/);
  assert.match(content, /for aid, latest_date in emitted_latest_dates\.items\(\):/);
  assert.match(content, /latest_failure\.json/);
  assert.match(content, /if exit_code == 0:\n\s+if args\.full_scan_packs:/);
  assert.doesNotMatch(content, /latest_success\.json"\)\n\s+atomic_write_json\(latest_ptr[\s\S]*exit_code = 0/);
});
