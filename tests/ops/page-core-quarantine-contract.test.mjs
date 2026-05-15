import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import Ajv2020 from 'ajv/dist/2020.js';

const ROOT = path.resolve(new URL('../..', import.meta.url).pathname);

function sampleQuarantineRow() {
  return {
    ok: false,
    schema_version: 'rv.page_core.v1',
    run_id: 'page-core-quarantine-2026-05-14',
    snapshot_id: 'page-quarantine-2026-05-14',
    canonical_asset_id: 'AS:TEST',
    display_ticker: 'TEST',
    provider_ticker: 'TEST',
    target_market_date: '2026-05-14',
    latest_bar_date: null,
    stats_date: null,
    price_source: null,
    key_levels_ready: false,
    core_status: 'degraded',
    ui_banner_state: 'degraded',
    primary_blocker: 'oversized_row_quarantined',
    freshness: {
      status: 'stale',
      as_of: '2026-05-14',
      generated_at: '2026-05-15T00:00:00.000Z',
      stale_after: '2026-05-15T00:00:00.000Z',
    },
    identity: {
      name: 'TEST',
      country: null,
      exchange: 'AS',
      sector: null,
      industry: null,
      asset_class: 'STOCK',
    },
    summary_min: {
      last_close: null,
      daily_change_pct: null,
      daily_change_abs: null,
      market_cap: null,
      decision_verdict: 'DEGRADED',
      decision_confidence_bucket: 'unknown',
      learning_status: 'UNKNOWN',
      quality_status: 'DEGRADED',
      governance_status: 'DEGRADED',
      oversized_quarantined: true,
    },
    governance_summary: {
      status: 'DEGRADED',
      evaluation_role: null,
      learning_gate_status: 'unknown',
      blocking_reasons: ['oversized_row_quarantined'],
      warnings: ['oversized_row_quarantined'],
      oversized_quarantined: true,
    },
    coverage: {
      bars: null,
      derived_daily: false,
      governance: false,
      fundamentals: false,
      forecast: false,
      ui_renderable: false,
    },
    module_links: {
      historical: null,
      fundamentals: null,
      forecast: null,
      quote: null,
    },
    meta: {
      source: 'page_core_bundle',
      render_contract: 'typed_degraded_quarantine',
      warnings: ['oversized_row_quarantined'],
      asset_type: 'STOCK',
      region: 'EU',
      oversized_quarantined: true,
    },
    status_contract: {
      strict_blocking_reasons: ['oversized_row_quarantined'],
      historical_profile_status: 'unavailable',
      model_coverage_status: 'unavailable',
      stock_detail_view_status: 'degraded',
      banner_state: 'degraded',
      strict_operational: false,
    },
    market_stats_min: { stats: {}, oversized_quarantined: true },
    decision_core_min: null,
    historical_profile_summary: { availability: { status: 'oversized_quarantined' } },
    model_coverage: { status: 'unavailable', oversized_quarantined: true },
    breakout_summary: null,
  };
}

test('page-core oversized quarantine placeholder satisfies page-core v1 schema under hard cap', () => {
  const schema = JSON.parse(fs.readFileSync(path.join(ROOT, 'schemas/stock-analyzer/page-core.v1.schema.json'), 'utf8'));
  const ajv = new Ajv2020({ strict: false, allErrors: true });
  const validate = ajv.compile(schema);
  const row = sampleQuarantineRow();

  assert.equal(validate(row), true, JSON.stringify(validate.errors, null, 2));
  assert.ok(Buffer.byteLength(JSON.stringify(row), 'utf8') < 6 * 1024);
});

test('page-core builder exposes typed degraded quarantine reason', () => {
  const src = fs.readFileSync(path.join(ROOT, 'scripts/ops/build-page-core-bundle.mjs'), 'utf8');
  assert.match(src, /typed_degraded_quarantine/);
  assert.match(src, /oversized_row_quarantined/);
  assert.match(src, /minimal_bytes/);
});
