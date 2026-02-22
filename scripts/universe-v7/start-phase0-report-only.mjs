#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import { execSync, spawnSync } from 'node:child_process';

const REPO_ROOT = process.cwd();

const FORECAST_PACK_COVERAGE_PATH = path.join(REPO_ROOT, 'public/data/universe/v7/reports/forecast_pack_coverage.json');
const MISSING_WHERE_REPORT_PATH = path.join(REPO_ROOT, 'public/data/universe/v7/reports/forecast_missing_in_pack_found_elsewhere_report.json');
const COMPLETION_GATE_PATH = path.join(REPO_ROOT, 'public/data/universe/v7/reports/stocks_history_completion_gate.json');
const FEATURE_REPORT_PATH = path.join(REPO_ROOT, 'public/data/universe/v7/ssot/feature_stock_universe_report.json');
const PARITY_REPORT_PATH = path.join(REPO_ROOT, 'public/data/universe/v7/reports/feature_universe_parity_report.json');
const SCI_SNAPSHOT_PATH = path.join(REPO_ROOT, 'public/data/snapshots/stock-analysis.json');

const REVALIDATION_PATH = path.join(REPO_ROOT, 'mirrors/universe-v7/revalidation/revalidation_snapshot.json');
const SYSTEM_STATUS_LATEST_PATH = path.join(REPO_ROOT, 'mirrors/system/run_status/latest.json');

function nowIso() {
  return new Date().toISOString();
}

function todayDate() {
  return new Date().toISOString().slice(0, 10);
}

function compactStamp() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}_${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}`;
}

async function readJson(filePath, fallback = null) {
  try {
    const raw = await fs.readFile(filePath, 'utf8');
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

async function writeJsonAtomic(filePath, payload) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  const tmp = `${filePath}.tmp`;
  await fs.writeFile(tmp, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
  await fs.rename(tmp, filePath);
}

function countSyntheticInScientific(doc) {
  const out = {
    total_entries: 0,
    synthetic_count: 0,
    data_unavailable_count: 0
  };
  if (!doc || typeof doc !== 'object') return out;
  for (const [key, value] of Object.entries(doc)) {
    if (String(key).startsWith('_')) continue;
    out.total_entries += 1;
    const ds = String(value?.data_source || value?.metadata?.data_source || '').toLowerCase();
    if (ds === 'synthetic' || ds === 'synthetic_demo') out.synthetic_count += 1;
    if (String(value?.status || '').toUpperCase() === 'DATA_UNAVAILABLE') out.data_unavailable_count += 1;
  }
  return out;
}

function safeGet(obj, pathList, fallback = null) {
  let cur = obj;
  for (const key of pathList) {
    if (!cur || typeof cur !== 'object' || !(key in cur)) return fallback;
    cur = cur[key];
  }
  return cur ?? fallback;
}

function maybeRefreshTrulyMissingReport() {
  const script = path.join(REPO_ROOT, 'scripts/universe-v7/check-missing-in-pack-found-elsewhere.mjs');
  const res = spawnSync('node', [script], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe']
  });
  return {
    ok: res.status === 0,
    code: res.status ?? 1,
    stdout: (res.stdout || '').trim(),
    stderr: (res.stderr || '').trim()
  };
}

async function main() {
  const startedAt = nowIso();
  let gitSha = null;
  try {
    gitSha = execSync('git rev-parse --short HEAD', { cwd: REPO_ROOT, stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
  } catch {}
  const runId = `phase0_${compactStamp()}_${gitSha || 'nogit'}`;

  const refresh = maybeRefreshTrulyMissingReport();

  const [
    packCoverage,
    missingWhere,
    completionGate,
    featureReport,
    parityReport,
    scientificSnapshot
  ] = await Promise.all([
    readJson(FORECAST_PACK_COVERAGE_PATH, {}),
    readJson(MISSING_WHERE_REPORT_PATH, {}),
    readJson(COMPLETION_GATE_PATH, {}),
    readJson(FEATURE_REPORT_PATH, {}),
    readJson(PARITY_REPORT_PATH, {}),
    readJson(SCI_SNAPSHOT_PATH, {})
  ]);

  const resolvedMissingInPack = Number(safeGet(packCoverage, ['pack_match', 'resolved_missing_in_pack'], null));
  const trulyMissing = Number(safeGet(missingWhere, ['results', 'truly_missing_total'], null));
  const foundElsewhere = Number(safeGet(missingWhere, ['results', 'found_elsewhere_total'], null));
  const synthetic = countSyntheticInScientific(scientificSnapshot);

  const featureCounts = safeGet(featureReport, ['counts'], {}) || {};
  const parityLive = safeGet(parityReport, ['live_coverage'], {}) || {};
  const effectiveSnapshot = safeGet(completionGate, ['effective_snapshot'], {}) || {};

  const revalidation = {
    schema: 'rv_v7_revalidation_snapshot_v1',
    ts: nowIso(),
    run_id: runId,
    git_sha: gitSha,
    pipeline_version: 'v2_phase0_report_only',
    refresh_missing_in_pack_found_elsewhere: refresh,
    coverage: {
      resolved_missing_in_pack_count: Number.isFinite(resolvedMissingInPack) ? resolvedMissingInPack : null,
      truly_missing_count: Number.isFinite(trulyMissing) ? trulyMissing : null,
      found_elsewhere_count: Number.isFinite(foundElsewhere) ? foundElsewhere : null,
      stocks_total_effective: Number(effectiveSnapshot?.stocks_total ?? null),
      stocks_with_bars_effective: Number(effectiveSnapshot?.stocks_with_bars ?? null),
      stocks_remaining_effective: Number(effectiveSnapshot?.stocks_remaining ?? null)
    },
    synthetic: {
      snapshot_path: 'public/data/snapshots/stock-analysis.json',
      synthetic_count_in_stock_analysis_snapshot: synthetic.synthetic_count,
      scientific_entries_total: synthetic.total_entries,
      scientific_data_unavailable_count: synthetic.data_unavailable_count
    },
    dropouts: {
      dropouts_by_feature: {
        scientific: Number(featureCounts.scientific_effective ?? null),
        forecast: Number(featureCounts.forecast_effective ?? null),
        marketphase: Number(featureCounts.marketphase_effective ?? null),
        elliott: Number(featureCounts.elliott_effective ?? null)
      },
      top_reasons_by_feature: null
    },
    resolver: {
      ambiguous_symbol_count: null,
      symbol_not_found_count: null
    },
    forecast: {
      folds_manifest_present: false,
      outcomes_present_count: null,
      forecast_count: Number(parityLive.forecast_count ?? null)
    },
    quant: {
      leakage_detections_count: null,
      clean_bars_consumption_ok: null
    },
    artifacts: {
      forecast_pack_coverage: path.relative(REPO_ROOT, FORECAST_PACK_COVERAGE_PATH),
      forecast_missing_in_pack_found_elsewhere: path.relative(REPO_ROOT, MISSING_WHERE_REPORT_PATH),
      stocks_history_completion_gate: path.relative(REPO_ROOT, COMPLETION_GATE_PATH),
      feature_stock_universe_report: path.relative(REPO_ROOT, FEATURE_REPORT_PATH),
      feature_universe_parity_report: path.relative(REPO_ROOT, PARITY_REPORT_PATH)
    }
  };

  await writeJsonAtomic(REVALIDATION_PATH, revalidation);

  const gateRows = [
    {
      gate_name: 'pointer_pack_integrity',
      mode: 'report',
      ok: Number.isFinite(resolvedMissingInPack) ? resolvedMissingInPack === 0 : false,
      value: Number.isFinite(resolvedMissingInPack) ? resolvedMissingInPack : null,
      threshold: 0,
      unit: 'count'
    },
    {
      gate_name: 'history_completeness_truly_missing',
      mode: 'report',
      ok: Number.isFinite(trulyMissing) ? trulyMissing === 0 : false,
      value: Number.isFinite(trulyMissing) ? trulyMissing : null,
      threshold: 0,
      unit: 'count'
    },
    {
      gate_name: 'synthetic_in_prod_snapshot',
      mode: 'report',
      ok: synthetic.synthetic_count === 0,
      value: synthetic.synthetic_count,
      threshold: 0,
      unit: 'count'
    }
  ];

  const systemStatus = {
    schema: 'rv_system_run_status_v1',
    run_id: runId,
    ts: nowIso(),
    git_sha: gitSha,
    kind: 'phase0_report_only',
    status: 'OK',
    reason_codes: [],
    stage_results: [
      {
        stage_name: 'refresh_truly_missing_report',
        ok: refresh.ok,
        reason_codes: refresh.ok ? [] : ['TRULY_MISSING_REPORT_REFRESH_FAILED'],
        counts: null,
        artifacts_written: refresh.ok ? [path.relative(REPO_ROOT, MISSING_WHERE_REPORT_PATH)] : []
      },
      {
        stage_name: 'write_revalidation_snapshot',
        ok: true,
        reason_codes: [],
        counts: {
          truly_missing: Number.isFinite(trulyMissing) ? trulyMissing : null,
          resolved_missing_in_pack: Number.isFinite(resolvedMissingInPack) ? resolvedMissingInPack : null,
          synthetic_count: synthetic.synthetic_count
        },
        artifacts_written: [path.relative(REPO_ROOT, REVALIDATION_PATH)]
      }
    ],
    gates: gateRows,
    notes: [
      'Phase 0 report-only snapshot; no enforcement',
      'Dual coverage gates are visible but not blocking'
    ],
    artifacts_written: [path.relative(REPO_ROOT, SYSTEM_STATUS_LATEST_PATH)],
    started_at: startedAt,
    finished_at: nowIso()
  };

  await writeJsonAtomic(SYSTEM_STATUS_LATEST_PATH, systemStatus);
  await writeJsonAtomic(
    path.join(REPO_ROOT, 'mirrors/system/run_status/history', `${todayDate()}.json`),
    systemStatus
  );

  process.stdout.write(`${JSON.stringify({
    ok: true,
    run_id: runId,
    revalidation_snapshot: path.relative(REPO_ROOT, REVALIDATION_PATH),
    system_status_latest: path.relative(REPO_ROOT, SYSTEM_STATUS_LATEST_PATH),
    gates: gateRows.map((g) => ({ gate_name: g.gate_name, mode: g.mode, ok: g.ok, value: g.value }))
  })}\n`);
}

main().catch((error) => {
  process.stderr.write(`${JSON.stringify({ ok: false, reason: error?.message || 'phase0_report_only_failed' })}\n`);
  process.exit(1);
});
