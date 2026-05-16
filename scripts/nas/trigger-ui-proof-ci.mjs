#!/usr/bin/env node
/**
 * P.2 NAS trigger for the GHA-side UI proof runner.
 *
 * Why: NAS Synology DSM lacks libatk-1.0.so.0 so Playwright cannot run there.
 * Instead of warn-defaulting the gate, this script dispatches the
 * `.github/workflows/ui-proof.yml` workflow on GitHub Actions, polls until
 * completion, downloads the result artifact, and writes a contract-shaped
 * envelope (`rv.ui_proof_result.v1`) under `public/data/ops/`. The
 * release-gate consumes that file as the hard browser-validation gate.
 *
 * Env vars (sourced from `scripts/nas/nas-env.sh` in production):
 *   GITHUB_TOKEN        — fine-grained PAT with Actions:write + Contents:read,
 *                         stored OUTSIDE the repo (see `nas-env.sh` instructions).
 *   GITHUB_OWNER        — repo owner (default: RubikVault)
 *   GITHUB_REPO         — repo name (default: rubikvault-site)
 *   GITHUB_WORKFLOW     — workflow file (default: ui-proof.yml)
 *
 * CLI args:
 *   --base-url            (required) Preview or MAIN URL to validate.
 *   --sample              (required) release20 | regional100 | random200.
 *   --environment         (required) preview | main.
 *   --expected-commit     (optional) Git SHA the runner must see.
 *   --target-market-date  (optional) Yesterday's EODHD EOD date.
 *   --run-id              (optional) Caller-supplied id, echoed in the result.
 *   --output              (optional) Path to write the v1 envelope.
 *                                    Default: public/data/ops/ui-proof-<sample>-<env>-latest.json
 *   --poll-interval-sec   (default 30)
 *   --max-wait-sec        (default 1800)
 *
 * Exit codes (mirrors stock-analyzer-ui-random50-proof.mjs semantics):
 *   0 = ok
 *   1 = proof reports failed (UI rendered bad)
 *   2 = runner_failed (GHA infrastructure issue, missing token, timeout)
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

function cliValue(name, fallback = null) {
  const prefix = `--${name}=`;
  const found = process.argv.find((arg) => arg.startsWith(prefix));
  if (found) return found.slice(prefix.length);
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] || fallback : fallback;
}

const BASE_URL = cliValue('base-url');
const SAMPLE = cliValue('sample', 'release20');
const ENVIRONMENT = cliValue('environment', 'preview');
const EXPECTED_COMMIT = cliValue('expected-commit', '') || '';
const TARGET_MARKET_DATE = cliValue('target-market-date', '') || '';
const RUN_ID = cliValue('run-id') || `nas-${process.pid}-${Date.now()}`;
const POLL_INTERVAL_SEC = Number(cliValue('poll-interval-sec') || 30);
const MAX_WAIT_SEC = Number(cliValue('max-wait-sec') || 1800);
const MAX_FAILURES = cliValue('max-failures', '10') || '10';

const GITHUB_OWNER = process.env.GITHUB_OWNER || 'RubikVault';
const GITHUB_REPO = process.env.GITHUB_REPO || 'rubikvault-site';
const GITHUB_WORKFLOW = process.env.GITHUB_WORKFLOW || 'ui-proof.yml';
const TOKEN_RAW = process.env.GITHUB_TOKEN || readTokenFromFile();

const OUTPUT_PATH = path.resolve(
  ROOT,
  cliValue('output') || `public/data/ops/ui-proof-${SAMPLE}-${ENVIRONMENT}-latest.json`,
);

function readTokenFromFile() {
  const candidate = process.env.RV_GITHUB_TOKEN_PATH || '';
  if (!candidate) return '';
  try {
    return fs.readFileSync(candidate, 'utf8').trim();
  } catch (_e) {
    return '';
  }
}

function writeJsonAtomic(filePath, doc) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const tmp = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(tmp, `${JSON.stringify(doc, null, 2)}\n`, 'utf8');
  fs.renameSync(tmp, filePath);
}

function buildRunnerFailedEnvelope(reason, extra = {}) {
  return {
    schema: 'rv.ui_proof_result.v1',
    run_id: RUN_ID,
    expected_commit: EXPECTED_COMMIT || null,
    observed_commit: null,
    base_url: BASE_URL || null,
    environment: ENVIRONMENT === 'main' ? 'main' : 'preview',
    deployment_id: null,
    target_market_date: TARGET_MARKET_DATE || null,
    page_core_snapshot: null,
    sample: SAMPLE,
    sample_set_id: null,
    required: 0,
    completed: 0,
    total: 0,
    ok: 0,
    failed: 0,
    status: 'runner_failed',
    console_errors: 0,
    network_errors: 0,
    failures: [],
    allowed_degraded: 0,
    runner_failure_reason: reason,
    generated_at: new Date().toISOString(),
    ci_provider: 'github_actions',
    ...extra,
  };
}

async function ghFetch(url, init = {}) {
  const res = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${TOKEN_RAW}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      ...(init.headers || {}),
    },
  });
  return res;
}

async function dispatchWorkflow() {
  const url = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/actions/workflows/${GITHUB_WORKFLOW}/dispatches`;
  const ref = process.env.GITHUB_REF || 'main';
  const body = {
    ref,
    inputs: {
      base_url: BASE_URL,
      sample: SAMPLE,
      environment: ENVIRONMENT,
      expected_commit: EXPECTED_COMMIT,
      target_market_date: TARGET_MARKET_DATE,
      run_id_label: RUN_ID,
      max_failures: String(MAX_FAILURES),
    },
  };
  const res = await ghFetch(url, { method: 'POST', body: JSON.stringify(body), headers: { 'Content-Type': 'application/json' } });
  if (res.status !== 204) {
    const text = await res.text().catch(() => '');
    throw new Error(`workflow_dispatch_failed status=${res.status} body=${text.slice(0, 240)}`);
  }
}

async function findRunByLabel() {
  // Latest workflow runs are returned newest first. We match against the
  // run_id_label we passed as input via the run's name (GitHub doesn't surface
  // dispatch inputs in the runs list, so we fall back to the most recent
  // dispatched run within the last 5 minutes).
  const since = new Date(Date.now() - 5 * 60 * 1000).toISOString();
  const url = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/actions/workflows/${GITHUB_WORKFLOW}/runs?event=workflow_dispatch&created=%3E${encodeURIComponent(since)}`;
  for (let attempt = 0; attempt < 6; attempt++) {
    const res = await ghFetch(url);
    if (!res.ok) {
      await sleep(2000);
      continue;
    }
    const doc = await res.json();
    const runs = Array.isArray(doc.workflow_runs) ? doc.workflow_runs : [];
    if (runs.length) return runs[0];
    await sleep(5000);
  }
  return null;
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function waitForRun(runId) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < MAX_WAIT_SEC * 1000) {
    const res = await ghFetch(`https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/actions/runs/${runId}`);
    if (res.ok) {
      const doc = await res.json();
      if (doc.status === 'completed') return doc;
    }
    await sleep(POLL_INTERVAL_SEC * 1000);
  }
  return null;
}

async function downloadArtifact(runId) {
  const listRes = await ghFetch(`https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/actions/runs/${runId}/artifacts`);
  if (!listRes.ok) return null;
  const list = await listRes.json();
  const artifact = (list.artifacts || []).find((a) => a.name.startsWith('ui-proof-'));
  if (!artifact) return null;
  const zipRes = await ghFetch(artifact.archive_download_url, { redirect: 'follow' });
  if (!zipRes.ok) return null;
  const buf = Buffer.from(await zipRes.arrayBuffer());
  // GitHub artifact is a zip with one JSON inside. We do a minimal extract.
  const { Readable } = await import('node:stream');
  const { promises: streamPromises } = await import('node:stream');
  const unzipper = await import('node:zlib');
  // Use a tiny POSIX-zip parser via shelling out to `unzip` when available;
  // simpler still: write zip to tmp and shell-out.
  const tmpZip = path.join(ROOT, `var/private/ops/ui-proof-${Date.now()}.zip`);
  const tmpDir = path.join(ROOT, `var/private/ops/ui-proof-${Date.now()}-extracted`);
  fs.mkdirSync(path.dirname(tmpZip), { recursive: true });
  fs.writeFileSync(tmpZip, buf);
  fs.mkdirSync(tmpDir, { recursive: true });
  const { spawnSync } = await import('node:child_process');
  const unzipResult = spawnSync('unzip', ['-o', tmpZip, '-d', tmpDir], { encoding: 'utf8' });
  if (unzipResult.status !== 0) {
    return null;
  }
  const files = fs.readdirSync(tmpDir).filter((name) => name.endsWith('.json'));
  if (!files.length) return null;
  const data = JSON.parse(fs.readFileSync(path.join(tmpDir, files[0]), 'utf8'));
  // Cleanup
  try { fs.unlinkSync(tmpZip); } catch (_e) { /* noop */ }
  try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (_e) { /* noop */ }
  return data;
}

async function main() {
  if (!BASE_URL) {
    writeJsonAtomic(OUTPUT_PATH, buildRunnerFailedEnvelope('missing_base_url'));
    process.exit(2);
  }
  if (!TOKEN_RAW) {
    writeJsonAtomic(OUTPUT_PATH, buildRunnerFailedEnvelope('missing_github_token'));
    process.exit(2);
  }
  try {
    await dispatchWorkflow();
  } catch (error) {
    writeJsonAtomic(OUTPUT_PATH, buildRunnerFailedEnvelope('workflow_dispatch_failed', { error: String(error?.message || error) }));
    process.exit(2);
  }
  // Give GitHub a moment to register the dispatch before polling for the run.
  await sleep(5000);
  const run = await findRunByLabel();
  if (!run) {
    writeJsonAtomic(OUTPUT_PATH, buildRunnerFailedEnvelope('workflow_run_not_found'));
    process.exit(2);
  }
  const completed = await waitForRun(run.id);
  if (!completed) {
    writeJsonAtomic(OUTPUT_PATH, buildRunnerFailedEnvelope('workflow_poll_timeout', { run_id: run.id }));
    process.exit(2);
  }
  const artifact = await downloadArtifact(run.id);
  if (!artifact) {
    writeJsonAtomic(OUTPUT_PATH, buildRunnerFailedEnvelope('artifact_download_failed', { run_id: run.id, conclusion: completed.conclusion }));
    process.exit(2);
  }
  // Persist either the contract envelope directly or the wrapped report.
  const envelope = artifact.ui_proof_result || artifact;
  // Inject GitHub run id so downstream consumers can trace back.
  envelope.ci_provider = 'github_actions';
  envelope.ci_run_id = String(run.id);
  envelope.ci_conclusion = completed.conclusion;
  writeJsonAtomic(OUTPUT_PATH, envelope);
  if (envelope.status === 'ok') {
    process.exit(0);
  }
  if (envelope.status === 'runner_failed') {
    process.exit(2);
  }
  process.exit(1);
}

main().catch((error) => {
  writeJsonAtomic(OUTPUT_PATH, buildRunnerFailedEnvelope('unhandled_exception', { error: String(error?.message || error) }));
  console.error(error?.stack || error?.message || String(error));
  process.exit(2);
});
