#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = path.resolve(fileURLToPath(new URL('.', import.meta.url)), '../..');
const OUT_PATH = process.env.RV_MORNING_ACCEPTANCE_OUTPUT
  || path.join(REPO_ROOT, 'var/private/ops/morning-acceptance-latest.json');
const HOSTS = [
  { id: 'custom_domain', base_url: process.env.RV_PUBLIC_BASE_URL || 'https://rubikvault.com' },
  { id: 'pages_dev', base_url: process.env.RV_PAGES_DEV_BASE || 'https://rubikvault-site.pages.dev' },
];
const HISTORICAL_TICKERS = ['F', 'AAPL', 'HOOD'];
const ROGUE_PATTERNS = [
  'run-pipeline-master-supervisor.mjs',
  'run-dashboard-green-recovery.mjs',
  'run-hist-probs-turbo.mjs',
];
const LOCK_ROOTS = [
  process.env.NAS_LOCK_ROOT,
  process.env.RV_NAS_LOCK_ROOT,
  path.join(REPO_ROOT, 'runtime/locks'),
  path.join(REPO_ROOT, 'mirrors/ops/locks'),
].filter(Boolean);

function utcNow() {
  return new Date().toISOString();
}

function writeJsonAtomic(filePath, payload) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const tmp = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(payload, null, 2) + '\n');
  fs.renameSync(tmp, filePath);
}

function fetchJson(url) {
  const r = spawnSync('curl', ['-fsS', '--max-time', '25', '--connect-timeout', '10', url], {
    encoding: 'utf8',
    timeout: 35_000,
  });
  if (r.status !== 0) {
    return { ok: false, status: r.status ?? -1, error: (r.stderr || '').trim() || 'curl_failed' };
  }
  try {
    return { ok: true, json: JSON.parse(r.stdout || '{}') };
  } catch (error) {
    return { ok: false, status: -1, error: `invalid_json:${error.message}` };
  }
}

function targetDateOf(doc) {
  return doc?.target_market_date || doc?.target_date || null;
}

function summarizeHistorical(payload) {
  const data = payload?.data || payload;
  const bars = Array.isArray(data?.bars) ? data.bars : Array.isArray(payload?.bars) ? payload.bars : [];
  const provider = data?.provider || payload?.provider || payload?.meta?.provider || data?.meta?.provider || null;
  return {
    ok: payload?.ok === true || bars.length > 0,
    bars: bars.length,
    provider,
    failure_type: payload?.failure_type || data?.failure_type || payload?.meta?.failure_type || null,
  };
}

function listLocks() {
  const locks = [];
  for (const root of LOCK_ROOTS) {
    if (!fs.existsSync(root)) continue;
    const entries = fs.readdirSync(root, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isFile() && !entry.isSymbolicLink()) continue;
      if (!entry.name.endsWith('.lock')) continue;
      const full = path.join(root, entry.name);
      let stat = null;
      try { stat = fs.statSync(full); } catch {}
      locks.push({
        root,
        file: entry.name,
        path: full,
        mtime: stat?.mtime?.toISOString?.() || null,
        size_bytes: stat?.size ?? null,
      });
    }
  }
  return locks;
}

function findRogueProcesses() {
  const r = spawnSync('ps', ['-axo', 'pid=,command='], { encoding: 'utf8', timeout: 10_000 });
  if (r.status !== 0) return [{ ok: false, error: (r.stderr || '').trim() || 'ps_failed' }];
  return (r.stdout || '')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => ROGUE_PATTERNS.some((pattern) => line.includes(pattern)))
    .map((line) => {
      const [pid, ...rest] = line.split(/\s+/);
      return { pid: Number(pid), command: rest.join(' ') };
    });
}

const report = {
  schema: 'rv.morning_acceptance_report.v1',
  generated_at: utcNow(),
  hosts: {},
  historical: {},
  locks: listLocks(),
  rogue_processes: findRogueProcesses(),
};

for (const host of HOSTS) {
  const status = fetchJson(`${host.base_url}/data/public-status.json?rv=${Date.now()}`);
  const proof = fetchJson(`${host.base_url}/data/status/deploy-proof-latest.json?rv=${Date.now()}`);
  const statusJson = status.json || {};
  const proofJson = proof.json || {};
  report.hosts[host.id] = {
    base_url: host.base_url,
    public_status_ok: status.ok,
    deploy_proof_ok: proof.ok,
    target_market_date: targetDateOf(statusJson),
    proof_target_market_date: targetDateOf(proofJson),
    ui_green: statusJson.ui_green === true,
    release_ready: statusJson.release_ready === true,
    ui_renderable_ratio: Number(statusJson.stock_analyzer?.ui_renderable_ratio ?? NaN),
    decision_ready_ratio: Number(statusJson.stock_analyzer?.decision_ready_ratio ?? NaN),
    contract_violation_total: Number(statusJson.stock_analyzer?.ui_state_contract_violations ?? NaN),
    proof_mode: proofJson.proof_mode || null,
    proof_smokes_ok: proofJson.smokes_ok === true,
    proof_verified_at: proofJson.verified_at || null,
    proof_git_commit_sha: proofJson.git_commit_sha || null,
  };
  for (const ticker of HISTORICAL_TICKERS) {
    const key = `${host.id}:${ticker}`;
    const historical = fetchJson(`${host.base_url}/api/v2/stocks/${encodeURIComponent(ticker)}/historical?rv=${Date.now()}`);
    report.historical[key] = {
      host: host.id,
      ticker,
      fetch_ok: historical.ok,
      ...summarizeHistorical(historical.json || {}),
    };
  }
}

const hostValues = Object.values(report.hosts);
const historicalValues = Object.values(report.historical);
report.acceptance = {
  ok: hostValues.every((host) => host.public_status_ok
      && host.deploy_proof_ok
      && host.ui_green
      && host.release_ready
      && host.target_market_date
      && host.target_market_date === host.proof_target_market_date
      && host.ui_renderable_ratio >= 0.99
      && host.decision_ready_ratio >= 0.90
      && host.contract_violation_total === 0
      && host.proof_mode?.startsWith('post_deploy')
      && host.proof_smokes_ok
      && host.proof_verified_at
      && host.proof_git_commit_sha)
    && historicalValues.every((item) => item.fetch_ok && item.ok && item.bars >= 60 && item.provider !== 'page-core-minimal-history')
    && report.locks.length === 0
    && report.rogue_processes.length === 0,
  host_count: hostValues.length,
  historical_probe_count: historicalValues.length,
  lock_count: report.locks.length,
  rogue_process_count: report.rogue_processes.length,
};

writeJsonAtomic(OUT_PATH, report);
console.log(JSON.stringify({
  ok: report.acceptance.ok,
  output: path.relative(REPO_ROOT, OUT_PATH),
  hosts: report.acceptance.host_count,
  historical_probes: report.acceptance.historical_probe_count,
  locks: report.acceptance.lock_count,
  rogue_processes: report.acceptance.rogue_process_count,
}, null, 2));
process.exit(report.acceptance.ok ? 0 : 1);
