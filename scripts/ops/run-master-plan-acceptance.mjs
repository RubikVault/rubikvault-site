#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(fileURLToPath(new URL('.', import.meta.url)), '../..');
const OUT_PATH = process.env.RV_MASTER_ACCEPTANCE_OUTPUT
  || path.join(ROOT, 'var/private/ops/master-plan-acceptance-latest.json');
const REQUIRED_STOCK_RATE = Number(process.env.RV_MASTER_ACCEPTANCE_MIN_STOCK_RATE || '0.99');
const HOSTS = [
  { id: 'custom_domain', base_url: process.env.RV_PUBLIC_BASE_URL || 'https://rubikvault.com' },
  { id: 'pages_dev', base_url: process.env.RV_PAGES_DEV_BASE || 'https://rubikvault-site.pages.dev' },
];

function currentGitSha() {
  const res = spawnSync('git', ['rev-parse', 'HEAD'], { cwd: ROOT, encoding: 'utf8', timeout: 10_000 });
  if (res.status !== 0) {
    throw new Error(`git_sha_unavailable:${(res.stderr || '').trim() || res.status}`);
  }
  return String(res.stdout || '').trim();
}

function writeJsonAtomic(filePath, payload) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const tmp = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(tmp, `${JSON.stringify(payload, null, 2)}\n`);
  fs.renameSync(tmp, filePath);
}

function runStep(id, command, args, options = {}) {
  const started = new Date().toISOString();
  const res = spawnSync(command, args, {
    cwd: ROOT,
    encoding: 'utf8',
    timeout: options.timeoutMs || 180_000,
    env: { ...process.env, ...(options.env || {}) },
  });
  const step = {
    id,
    command: [command, ...args].join(' '),
    ok: res.status === 0,
    exit_code: res.status,
    signal: res.signal || null,
    started_at: started,
    finished_at: new Date().toISOString(),
    stdout_tail: (res.stdout || '').split('\n').slice(-20).join('\n').trim(),
    stderr_tail: (res.stderr || '').split('\n').slice(-20).join('\n').trim(),
  };
  if (!step.ok) {
    throw Object.assign(new Error(`master_acceptance_step_failed:${id}`), { step });
  }
  return step;
}

async function fetchJson(baseUrl, route) {
  const url = new URL(route, `${baseUrl.replace(/\/+$/, '')}/`);
  url.searchParams.set('rv_master_acceptance', `${Date.now()}-${Math.random().toString(16).slice(2)}`);
  const response = await fetch(url, { headers: { accept: 'application/json' } });
  const text = await response.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    return { ok: false, url: url.toString(), status: response.status, failure_type: 'invalid_json', text_bytes: Buffer.byteLength(text) };
  }
  return { ok: response.ok, url: url.toString(), status: response.status, json, text_bytes: Buffer.byteLength(text) };
}

function buyRows(doc) {
  const data = doc?.data || doc;
  const rows = [];
  for (const group of ['stocks', 'etfs']) {
    for (const horizon of ['short', 'medium', 'long']) {
      const items = data?.[group]?.[horizon];
      if (Array.isArray(items)) rows.push(...items);
    }
  }
  return rows;
}

function summarizeBuySnapshot(doc) {
  const rows = buyRows(doc);
  return {
    rows: rows.length,
    stale_rows: rows.filter((row) => Array.isArray(row?.stale_flags) && row.stale_flags.length > 0).length,
    with_evidence: rows.filter((row) => row?.reasons && row?.module_contributions && row?.decision_as_of && row?.price_basis).length,
    confidences: [...new Set(rows.map((row) => row?.confidence).filter(Boolean))].sort(),
  };
}

function requireProof(proof) {
  return Boolean(
    proof?.git_commit_sha
    && proof?.deploy_id
    && proof?.deploy_url
    && proof?.target_market_date
    && proof?.bundle_hash
    && proof?.custom_domain_smoke
    && proof?.pages_dev_smoke
    && proof?.verified_at
    && proof?.smokes_ok === true
  );
}

const report = {
  schema: 'rv.master_plan_acceptance.v1',
  generated_at: new Date().toISOString(),
  expected_git_commit_sha: currentGitSha(),
  required_stock_rate: REQUIRED_STOCK_RATE,
  hosts: {},
  steps: [],
  checks: [],
};

try {
  report.steps.push(runStep('dirty_scope', 'npm', ['run', 'ops:dirty-scope']));
  report.steps.push(runStep('workstream_tracker_strict', 'node', ['scripts/ops/check-master-workstream-tracker.mjs', '--require-all-green']));
  report.steps.push(runStep('morning_acceptance', 'npm', ['run', 'ops:morning-acceptance'], { timeoutMs: 240_000 }));

  for (const host of HOSTS) {
    const suffix = host.id === 'custom_domain' ? 'custom' : 'pages';
    report.steps.push(runStep(`market_audit_${host.id}`, 'node', [
      'scripts/ops/audit-market-hub-integrity.mjs',
      '--base-url', host.base_url,
      '--strict-legacy-latest',
      '--output', `tmp/master-plan-market-${suffix}.json`,
    ], { timeoutMs: 240_000 }));
    report.steps.push(runStep(`stock_ui_audit_${host.id}`, 'node', [
      'scripts/ops/audit-stock-analyzer-ui-integrity.mjs',
      '--base-url', host.base_url,
      '--gate=ui_renderable',
      '--min-pass-rate', String(REQUIRED_STOCK_RATE),
      '--min-operational-rate', String(REQUIRED_STOCK_RATE),
      '--output', `tmp/master-plan-stock-ui-${suffix}.json`,
    ], { timeoutMs: 300_000 }));
    report.steps.push(runStep(`ops_tests_${host.id}`, 'npm', ['run', 'test:ops'], {
      timeoutMs: 300_000,
      env: { OPS_BASE: host.base_url },
    }));

    const [proofRes, buyRes] = await Promise.all([
      fetchJson(host.base_url, '/data/status/deploy-proof-latest.json'),
      fetchJson(host.base_url, '/data/snapshots/best-setups-v4.json'),
    ]);
    const proof = proofRes.json || {};
    const buySummary = summarizeBuySnapshot(buyRes.json || {});
    const hostCheck = {
      base_url: host.base_url,
      deploy_proof_ok: proofRes.ok
        && requireProof(proof)
        && proof.git_commit_sha === report.expected_git_commit_sha,
      deploy_id: proof.deploy_id || null,
      deploy_url: proof.deploy_url || null,
      target_market_date: proof.target_market_date || null,
      git_commit_sha: proof.git_commit_sha || null,
      bundle_hash: proof.bundle_hash || null,
      smokes_ok: proof.smokes_ok === true,
      buy_snapshot_ok: buyRes.ok && buySummary.rows > 0 && buySummary.stale_rows === 0 && buySummary.with_evidence === buySummary.rows,
      buy_summary: buySummary,
    };
    report.hosts[host.id] = hostCheck;
    report.checks.push({ id: `deploy_proof_${host.id}`, ok: hostCheck.deploy_proof_ok });
    report.checks.push({ id: `buy_snapshot_${host.id}`, ok: hostCheck.buy_snapshot_ok, ...buySummary });
  }

  const targetDates = [...new Set(Object.values(report.hosts).map((host) => host.target_market_date).filter(Boolean))];
  report.checks.push({
    id: 'dual_host_target_date_match',
    ok: targetDates.length === 1,
    target_dates: targetDates,
  });

  report.ok = report.steps.every((step) => step.ok) && report.checks.every((check) => check.ok);
} catch (error) {
  if (error.step) report.steps.push(error.step);
  report.ok = false;
  report.error = error.message || String(error);
}

writeJsonAtomic(OUT_PATH, report);
console.log(JSON.stringify({
  ok: report.ok,
  output: path.relative(ROOT, OUT_PATH),
  steps: report.steps.length,
  checks: report.checks.length,
}, null, 2));

if (!report.ok) process.exit(1);
