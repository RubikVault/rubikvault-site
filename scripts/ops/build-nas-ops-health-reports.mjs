#!/usr/bin/env node
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import zlib from 'node:zlib';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const OPS_DIR = path.join(ROOT, 'public/data/ops');
const REPORTS_DIR = path.join(ROOT, 'public/data/reports');
const RUNTIME_ROOT = process.env.NAS_NIGHT_PIPELINE_ROOT || path.join(ROOT, 'runtime/night-pipeline');

function readJson(relOrAbs) {
  const filePath = path.isAbsolute(relOrAbs) ? relOrAbs : path.join(ROOT, relOrAbs);
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return null;
  }
}

function writeJsonAtomic(relPath, doc) {
  const filePath = path.join(ROOT, relPath);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const tmp = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(tmp, `${JSON.stringify(doc, null, 2)}\n`, 'utf8');
  fs.renameSync(tmp, filePath);
}

function isoNow() {
  return new Date().toISOString();
}

function dateOnly(value) {
  const s = String(value || '').slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
}

function targetFrom(...docs) {
  for (const doc of docs) {
    const target = dateOnly(
      doc?.target_market_date
      || doc?.manifest?.target_market_date
      || doc?.data?.target_market_date
      || doc?.summary?.target_market_date
      || doc?.meta?.data_asof
      || doc?.meta?.decision_bundle?.target_market_date
    );
    if (target) return target;
  }
  return null;
}

function generatedAt(doc) {
  return doc?.generated_at || doc?.updated_at || doc?.finished_at || doc?.started_at || null;
}

function ageHours(value) {
  const ms = Date.parse(value || '');
  if (!Number.isFinite(ms)) return null;
  return Math.max(0, (Date.now() - ms) / 36e5);
}

function listJsonFiles(dir) {
  try {
    return fs.readdirSync(dir, { withFileTypes: true })
      .filter((entry) => entry.isFile() && entry.name.endsWith('.json'))
      .map((entry) => path.join(dir, entry.name));
  } catch {
    return [];
  }
}

function dfKb(target = ROOT) {
  const res = spawnSync('df', ['-Pk', target], { encoding: 'utf8' });
  if (res.status !== 0) return null;
  const line = res.stdout.trim().split('\n').at(-1);
  const cols = line?.split(/\s+/) || [];
  if (cols.length < 6) return null;
  return {
    filesystem: cols[0],
    total_kb: Number(cols[1]),
    used_kb: Number(cols[2]),
    available_kb: Number(cols[3]),
    capacity: cols[4],
    mount: cols.slice(5).join(' '),
  };
}

function safeStatus(ok, degraded = false) {
  if (ok) return degraded ? 'DEGRADED' : 'OK';
  return 'FAILED';
}

function pipelineLatest() {
  return readJson(path.join(RUNTIME_ROOT, 'latest.json'))
    || readJson('public/data/pipeline/runtime/latest.json')
    || null;
}

function stageForStep(step) {
  const s = String(step || '');
  if (['safe_code_sync', 'code_manifest_guard', 'lock_policy_report', 'provider_health_preflight', 'runtime_preflight'].includes(s)) return '00-preflight';
  if (['market_data_refresh', 'q1_delta_ingest', 'q1_delta_proof_report'].includes(s)) return '10-fetch';
  if (['quantlab_daily_report', 'forecast_daily', 'breakout_v12', 'scientific_summary', 'build_fundamentals'].includes(s)) return '20-features';
  if (s.startsWith('hist_probs') || ['decision_core_shadow', 'decision_core_outcome_bootstrap', 'snapshot'].includes(s)) return '30-decision-core';
  if (s === 'best_setups_core') return '40-best-setups';
  if (['page_core_bundle', 'public_history_shards', 'generate_meta_dashboard_data'].includes(s)) return '50-page-core';
  if (['classifier_audit', 'stock_ui_integrity_audit', 'page_core_smoke', 'stock_analyzer_universe_audit', 'ui_field_truth_report'].includes(s)) return '60-audit';
  if (['final_integrity_seal', 'build_deploy_bundle', 'pre_deploy_smoke', 'wrangler_deploy'].includes(s)) return '70-deploy';
  return '99-report';
}

function buildStageHealth() {
  const latest = pipelineLatest();
  const completed = new Set(latest?.completed_steps || []);
  const current = latest?.current_step || null;
  const failed = latest?.failed_step || null;
  const steps = [
    'safe_code_sync', 'code_manifest_guard', 'lock_policy_report', 'build_global_scope', 'provider_health_preflight',
    'market_data_refresh', 'q1_delta_ingest', 'q1_delta_proof_report',
    'build_fundamentals', 'quantlab_daily_report', 'breakout_v12', 'scientific_summary', 'forecast_daily',
    'hist_probs', 'hist_probs_catchup', 'hist_probs_v2_shadow', 'decision_core_shadow', 'decision_core_outcome_bootstrap', 'snapshot',
    'page_core_bundle', 'best_setups_core', 'classifier_audit', 'public_history_shards', 'learning_daily',
    'decision_module_scorecard', 'data_freshness_report', 'system_status_report', 'resource_budget_report',
    'pipeline_epoch', 'generate_meta_dashboard_data', 'signal_performance_report', 'final_integrity_seal', 'build_deploy_bundle',
    'pre_deploy_smoke', 'wrangler_deploy',
  ];
  const stages = {};
  for (const step of steps) {
    const stage = stageForStep(step);
    stages[stage] ||= { total: 0, completed: 0, failed_steps: [], current_steps: [] };
    stages[stage].total += 1;
    if (completed.has(step)) stages[stage].completed += 1;
    if (failed === step) stages[stage].failed_steps.push(step);
    if (current === step) stages[stage].current_steps.push(step);
  }
  for (const stage of Object.values(stages)) {
    stage.status = stage.failed_steps.length ? 'FAILED' : stage.current_steps.length ? 'RUNNING' : stage.completed === stage.total ? 'OK' : 'PENDING';
  }
  const status = failed ? 'FAILED' : latest?.last_status === 'completed' ? 'OK' : latest?.last_status === 'running' ? 'RUNNING' : 'DEGRADED';
  return {
    schema: 'rv.nas_stage_health.v1',
    generated_at: isoNow(),
    status,
    target_market_date: dateOnly(latest?.target_market_date),
    run_id: latest?.campaign_stamp || null,
    lane: latest?.evaluation_lane || null,
    current_step: current,
    failed_step: failed,
    completed_steps: completed.size,
    stages,
  };
}

function buildWatchdog() {
  const latest = pipelineLatest();
  const lastSeen = latest?.updated_at || latest?.finished_at || latest?.started_at || null;
  const lastAge = ageHours(lastSeen);
  const active = latest?.last_status === 'running';
  return {
    schema: 'rv.night_pipeline_watchdog.v1',
    generated_at: isoNow(),
    status: active ? 'RUNNING' : lastAge == null ? 'DEGRADED' : lastAge > 26 ? 'FAILED' : 'OK',
    target_market_date: dateOnly(latest?.target_market_date),
    last_seen_at: lastSeen,
    last_seen_age_hours: lastAge == null ? null : Number(lastAge.toFixed(2)),
    active,
    failed_step: latest?.failed_step || null,
    note: active ? 'Pipeline currently running.' : 'No active night pipeline process detected.',
  };
}

function buildScheduler() {
  const wrapper = fs.readFileSync(path.join(ROOT, 'scripts/nas/run-nightly-full-pipeline-if-no-backfill.sh'), 'utf8');
  const tueSat = /\[\[\s*"\$dow"\s*-ge\s*2\s*&&\s*"\$dow"\s*-le\s*6\s*\]\]/.test(wrapper);
  const eodDetection = fs.existsSync(path.join(ROOT, 'scripts/nas/detect-new-eod-bars.mjs'));
  return {
    schema: 'rv.nas_scheduler.v1',
    generated_at: isoNow(),
    status: tueSat && eodDetection ? 'OK' : 'FAILED',
    schedule_policy: tueSat ? 'trading_eod_tue_sat_v1' : 'unknown_or_legacy',
    authoritative_gate: 'scripts/nas/run-nightly-full-pipeline-if-no-backfill.sh',
    dynamic_freshness_gate_present: eodDetection,
    monday_allowed: false,
    saturday_allowed: tueSat,
    force_env: 'RV_FORCE_NIGHTLY_RUN',
  };
}

function buildCronHealth() {
  const latest = pipelineLatest();
  const updated = latest?.updated_at || latest?.finished_at || latest?.started_at || null;
  const hours = ageHours(updated);
  const stale = hours == null || hours > 26;
  return {
    schema: 'rv.nas_cron_health.v1',
    generated_at: isoNow(),
    status: stale ? 'DEGRADED' : 'OK',
    target_market_date: dateOnly(latest?.target_market_date),
    last_pipeline_update_at: updated,
    last_pipeline_update_age_hours: hours == null ? null : Number(hours.toFixed(2)),
    threshold_hours: 26,
    stale,
    old_pipeline_master_active: false,
  };
}

function buildDiskHealth() {
  const disk = dfKb(ROOT);
  const freeGb = disk?.available_kb == null ? null : disk.available_kb / 1024 / 1024;
  const status = freeGb == null ? 'DEGRADED' : freeGb < 10 ? 'FAILED' : freeGb < 25 ? 'DEGRADED' : 'OK';
  return {
    schema: 'rv.nas_disk_health.v1',
    generated_at: isoNow(),
    status,
    free_gb: freeGb == null ? null : Number(freeGb.toFixed(2)),
    warn_below_gb: 25,
    abort_below_gb: 10,
    mount: disk?.mount || null,
    capacity: disk?.capacity || null,
    storage_governor_action: status === 'FAILED' ? 'abort_pipeline' : status === 'DEGRADED' ? 'warn_and_trim_known_runtime_artifacts' : 'none',
  };
}

function loadEnvFile(filePath) {
  const out = {};
  try {
    for (const raw of fs.readFileSync(filePath, 'utf8').split(/\r?\n/)) {
      const line = raw.trim();
      if (!line || line.startsWith('#') || !line.includes('=')) continue;
      const idx = line.indexOf('=');
      out[line.slice(0, idx).trim()] = line.slice(idx + 1).trim().replace(/^['"]|['"]$/g, '');
    }
  } catch {}
  return out;
}

async function buildEodhdBudget() {
  const envFile = process.env.RV_EODHD_ENV_FILE || path.join(ROOT, '.env.local');
  const env = loadEnvFile(envFile);
  const token = process.env.EODHD_API_TOKEN || process.env.EODHD_API_KEY || env.EODHD_API_TOKEN || env.EODHD_API_KEY || '';
  const base = {
    schema: 'rv.eodhd_budget.v1',
    generated_at: isoNow(),
    status: 'DEGRADED',
    budget_guard_ok: false,
    abort_threshold_used_pct: 80,
    token_present: Boolean(token),
  };
  if (!token) return { ...base, reason: 'missing_eodhd_token_in_runtime_env' };
  try {
    const url = `https://eodhd.com/api/user?api_token=${encodeURIComponent(token)}&fmt=json`;
    const res = await fetch(url, { headers: { accept: 'application/json' } });
    if (!res.ok) throw new Error(`HTTP_${res.status}`);
    const d = await res.json();
    const used = Number(d.apiRequests || 0);
    const limit = Number(d.dailyRateLimit || 0);
    const usedPct = limit > 0 ? used / limit * 100 : null;
    return {
      ...base,
      status: usedPct == null ? 'DEGRADED' : usedPct > 80 ? 'FAILED' : 'OK',
      budget_guard_ok: usedPct != null && usedPct <= 80,
      api_requests_date: d.apiRequestsDate || null,
      api_requests_used: used,
      daily_rate_limit: limit,
      extra_limit: Number(d.extraLimit || 0),
      used_pct: usedPct == null ? null : Number(usedPct.toFixed(2)),
    };
  } catch (error) {
    return { ...base, status: 'DEGRADED', reason: 'eodhd_budget_probe_failed', error: String(error?.message || error).slice(0, 160) };
  }
}

function walkFiles(dir) {
  const out = [];
  function walk(current) {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) walk(full);
      else out.push(full);
    }
  }
  try { walk(dir); } catch {}
  return out;
}

function buildCloudflareBundlePreflight() {
  const distRoot = path.join(ROOT, 'dist/pages-prod');
  const files = walkFiles(distRoot);
  const max = files.reduce((acc, file) => {
    const size = fs.statSync(file).size;
    return size > acc.size ? { file: path.relative(distRoot, file), size } : acc;
  }, { file: null, size: 0 });
  const maxBytes = 24 * 1024 * 1024;
  const privacy = spawnSync(process.execPath, ['scripts/ops/privacy-gate.mjs', '--dist', distRoot], { cwd: ROOT, encoding: 'utf8' });
  const ok = fs.existsSync(distRoot) && max.size < maxBytes && privacy.status === 0;
  return {
    schema: 'rv.cloudflare_bundle_preflight.v1',
    generated_at: isoNow(),
    status: ok ? 'OK' : 'FAILED',
    dist_present: fs.existsSync(distRoot),
    max_file: max.file,
    max_file_bytes: max.size,
    max_file_limit_bytes: maxBytes,
    file_count: files.length,
    privacy_gate_ok: privacy.status === 0,
    privacy_gate_excerpt: String(privacy.stderr || privacy.stdout || '').slice(0, 500) || null,
  };
}

function buildStaleData() {
  const publicStatus = readJson('public/data/public-status.json');
  const pageCore = readJson('public/data/page-core/latest.json');
  const dcManifest = readJson('public/data/decision-core/core/manifest.json');
  const bestSetups = readJson('public/data/snapshots/best-setups-v4.json');
  const scorecard = readJson('public/data/status/decision-module-scorecard-latest.json');
  const dashboard = readJson('public/data/ui/dashboard-v7-status.json');
  const expected = targetFrom(publicStatus, pageCore, dcManifest, bestSetups);
  const inputs = {
    public_status: targetFrom(publicStatus),
    page_core: targetFrom(pageCore),
    decision_core: targetFrom(dcManifest),
    best_setups: targetFrom(bestSetups),
    module_scorecards: targetFrom(scorecard),
    dashboard_data: targetFrom(dashboard),
  };
  const stale = Object.entries(inputs)
    .filter(([, value]) => value && expected && value !== expected)
    .map(([id, value]) => ({ id, target_market_date: value, expected }));
  const actionableIds = new Set(['public_status', 'page_core', 'decision_core', 'best_setups', 'dashboard_data']);
  const actionableStale = stale.filter((row) => actionableIds.has(row.id));
  return {
    schema: 'rv.stale_data_detector.v1',
    generated_at: isoNow(),
    status: actionableStale.length ? 'FAILED' : stale.length ? 'DEGRADED' : 'OK',
    target_market_date: expected,
    stale_inputs: stale,
    actionable_stale_inputs: actionableStale,
    inputs,
    stale_actionable_buy_forbidden: true,
  };
}

function gzipLines(filePath) {
  try {
    return zlib.gunzipSync(fs.readFileSync(filePath)).toString('utf8').split(/\n+/).filter(Boolean);
  } catch {
    return [];
  }
}

function buildReasonCodeDrift() {
  const registry = readJson('public/data/decision-core/reason-codes/latest.json');
  const codes = new Set((registry?.codes || []).map((row) => row.code).filter(Boolean));
  const emitted = new Set();
  const partsDir = path.join(ROOT, 'public/data/decision-core/core/parts');
  for (const file of fs.existsSync(partsDir) ? fs.readdirSync(partsDir).filter((name) => name.endsWith('.ndjson.gz')).map((name) => path.join(partsDir, name)) : []) {
    for (const line of gzipLines(file)) {
      try {
        const row = JSON.parse(line);
        for (const code of row?.decision?.reason_codes || []) emitted.add(code);
        for (const veto of row?.eligibility?.vetos || []) emitted.add(veto);
        for (const warning of row?.eligibility?.warnings || []) emitted.add(warning);
      } catch {}
    }
  }
  const unknown = [...emitted].filter((code) => !codes.has(code)).sort();
  const demoting = unknown.filter((code) => /BLOCK|VETO|STALE|RISK|MISSING|UNKNOWN|FAILED|LOW|HIGH/.test(code));
  return {
    schema: 'rv.reason_code_registry_drift.v1',
    generated_at: isoNow(),
    status: demoting.length ? 'FAILED' : unknown.length ? 'DEGRADED' : 'OK',
    registry_codes: codes.size,
    emitted_codes: emitted.size,
    unknown_codes: unknown,
    unknown_blocking_or_demoting_codes: demoting,
  };
}

async function probeUrl(id, url) {
  const started = Date.now();
  try {
    const res = await fetch(url, { method: 'HEAD' });
    return { id, ok: res.ok, status_code: res.status, latency_ms: Date.now() - started };
  } catch (error) {
    return { id, ok: false, error: String(error?.message || error).slice(0, 160), latency_ms: Date.now() - started };
  }
}

async function buildConnectivity() {
  const probes = await Promise.all([
    probeUrl('github', 'https://github.com'),
    probeUrl('cloudflare', 'https://api.cloudflare.com/client/v4/user/tokens/verify'),
    probeUrl('eodhd', 'https://eodhd.com'),
  ]);
  const required = probes.filter((row) => ['github', 'cloudflare', 'eodhd'].includes(row.id));
  const ok = required.every((row) => row.ok || (row.status_code != null && row.status_code < 500));
  return {
    schema: 'rv.connectivity_health.v1',
    generated_at: isoNow(),
    status: ok ? 'OK' : 'DEGRADED',
    probes,
    optional_tailscale_peer_checked: false,
  };
}

async function main() {
  fs.mkdirSync(OPS_DIR, { recursive: true });
  fs.mkdirSync(REPORTS_DIR, { recursive: true });

  const docs = {
    'public/data/ops/nas-stage-health-latest.json': buildStageHealth(),
    'public/data/ops/night-pipeline-watchdog-latest.json': buildWatchdog(),
    'public/data/ops/nas-scheduler-latest.json': buildScheduler(),
    'public/data/ops/nas-cron-health-latest.json': buildCronHealth(),
    'public/data/ops/nas-disk-health-latest.json': buildDiskHealth(),
    'public/data/ops/eodhd-budget-latest.json': await buildEodhdBudget(),
    'public/data/ops/cloudflare-bundle-preflight-latest.json': buildCloudflareBundlePreflight(),
    'public/data/ops/stale-data-latest.json': buildStaleData(),
    'public/data/ops/reason-code-registry-drift-latest.json': buildReasonCodeDrift(),
    'public/data/ops/connectivity-health-latest.json': await buildConnectivity(),
  };

  for (const [rel, doc] of Object.entries(docs)) writeJsonAtomic(rel, doc);

  const failed = Object.entries(docs).filter(([, doc]) => doc.status === 'FAILED').map(([rel]) => rel);
  const degraded = Object.entries(docs).filter(([, doc]) => doc.status === 'DEGRADED').map(([rel]) => rel);
  const summary = {
    schema: 'rv.nas_ops_health_summary.v1',
    generated_at: isoNow(),
    status: failed.length ? 'FAILED' : degraded.length ? 'DEGRADED' : 'OK',
    reports: Object.fromEntries(Object.entries(docs).map(([rel, doc]) => [path.basename(rel, '.json'), doc.status])),
    failed,
    degraded,
  };
  writeJsonAtomic('public/data/ops/nas-ops-health-summary-latest.json', summary);
  console.log(JSON.stringify({ status: summary.status, failed: failed.length, degraded: degraded.length }));
  if (failed.length) process.exitCode = 1;
}

main().catch((error) => {
  console.error(String(error?.stack || error));
  process.exitCode = 1;
});
