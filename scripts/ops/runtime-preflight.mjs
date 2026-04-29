#!/usr/bin/env node

import fs from 'node:fs';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execFileSync, spawn } from 'node:child_process';
import { readNodeVersion, resolveApprovedNodeBin } from './approved-node.mjs';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..', '..');
const OPS_DIR = path.join(ROOT, 'public', 'data', 'ops');
export const RUNTIME_PREFLIGHT_PATH = path.join(OPS_DIR, 'runtime-preflight-latest.json');
const DEFAULT_BASE_URL = 'http://127.0.0.1:8788';
const EXPECTED_NODE_MAJOR = 20;
const DEFAULT_TIMEOUT_MS = 8000;
const DEFAULT_MIN_FD_LIMIT = 8192;
const MIN_WRANGLER_MAJOR = 4;
const MIN_WRANGLER_MINOR = 71;
const MIN_WRANGLER_PATCH = 0;
const DEFAULT_CANARIES = [
  { ticker: 'AAPL', endpoint: '/api/v2/stocks/AAPL/summary' },
  { ticker: 'SPY', endpoint: '/api/v2/stocks/SPY/summary' },
];

function parseArgs(argv) {
  const defaultTimeoutMs = Math.max(1000, Number(process.env.RV_RUNTIME_PREFLIGHT_TIMEOUT_MS || DEFAULT_TIMEOUT_MS) || DEFAULT_TIMEOUT_MS);
  const defaultMinFdLimit = Math.max(0, Number(process.env.RV_RUNTIME_PREFLIGHT_MIN_FD_LIMIT || DEFAULT_MIN_FD_LIMIT) || DEFAULT_MIN_FD_LIMIT);
  const out = {
    baseUrl: DEFAULT_BASE_URL,
    mode: 'hard',
    ensureRuntime: false,
    timeoutMs: defaultTimeoutMs,
    minFdLimit: defaultMinFdLimit,
    canaries: DEFAULT_CANARIES,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--warn-only') out.mode = 'warn';
    else if (arg === '--ensure-runtime') out.ensureRuntime = true;
    else if (arg === '--no-canaries') out.canaries = [];
    else if (arg === '--base-url' && argv[i + 1]) out.baseUrl = argv[++i];
    else if (arg.startsWith('--base-url=')) out.baseUrl = arg.slice('--base-url='.length);
    else if (arg === '--mode' && argv[i + 1]) out.mode = argv[++i];
    else if (arg.startsWith('--mode=')) out.mode = arg.slice('--mode='.length);
    else if (arg === '--timeout-ms' && argv[i + 1]) out.timeoutMs = Number(argv[++i]) || out.timeoutMs;
    else if (arg.startsWith('--timeout-ms=')) out.timeoutMs = Number(arg.slice('--timeout-ms='.length)) || out.timeoutMs;
    else if (arg === '--min-fd-limit' && argv[i + 1]) out.minFdLimit = Number(argv[++i]) || out.minFdLimit;
    else if (arg.startsWith('--min-fd-limit=')) out.minFdLimit = Number(arg.slice('--min-fd-limit='.length)) || out.minFdLimit;
  }
  return out;
}

function normalizeHost(urlString) {
  try {
    return new URL(urlString).host;
  } catch {
    return urlString;
  }
}

function safeStat(filePath) {
  try {
    return fs.statSync(filePath);
  } catch {
    return null;
  }
}

function ensureDirSync(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function writeJsonAtomic(filePath, payload) {
  ensureDirSync(path.dirname(filePath));
  const tempPath = `${filePath}.tmp-${process.pid}`;
  fs.writeFileSync(tempPath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
  fs.renameSync(tempPath, filePath);
}

function parseSemver(raw) {
  if (!raw || typeof raw !== 'string') return null;
  const match = raw.trim().match(/(\d+)\.(\d+)\.(\d+)/);
  if (!match) return null;
  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
    raw: match[0],
  };
}

function semverLt(left, right) {
  if (!left || !right) return false;
  if (left.major !== right.major) return left.major < right.major;
  if (left.minor !== right.minor) return left.minor < right.minor;
  return left.patch < right.patch;
}

function findRepoWrangler() {
  const localBin = path.join(ROOT, 'node_modules', '.bin', 'wrangler');
  return safeStat(localBin)?.isFile() ? localBin : null;
}

function buildWranglerDevArgs(wranglerBin) {
  return [
    wranglerBin,
    'pages',
    'dev',
    'public',
    '--port',
    '8788',
    '--kv',
    'RV_KV',
    '--persist-to',
    '.wrangler/state',
    '--compatibility-date=2025-12-17',
  ];
}

function findWranglerCli(wranglerBin) {
  const directCli = path.join(ROOT, 'node_modules', 'wrangler', 'wrangler-dist', 'cli.js');
  if (safeStat(directCli)) return directCli;
  return wranglerBin;
}

function readWranglerVersion(wranglerBin, nodeBin) {
  if (!wranglerBin) return { ok: false, reason: 'repo_wrangler_missing', version: null, raw: null };
  if (!nodeBin) return { ok: false, reason: 'approved_node_missing', version: null, raw: null };
  try {
    const wranglerCli = findWranglerCli(wranglerBin);
    const raw = execFileSync(nodeBin, [wranglerCli, '--version'], {
      cwd: ROOT,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      maxBuffer: 1024 * 1024,
    }).trim();
    const version = parseSemver(raw);
    if (!version) return { ok: false, reason: 'wrangler_version_unparseable', version: null, raw };
    const minVersion = { major: MIN_WRANGLER_MAJOR, minor: MIN_WRANGLER_MINOR, patch: MIN_WRANGLER_PATCH };
    if (version.major !== MIN_WRANGLER_MAJOR || semverLt(version, minVersion)) {
      return { ok: false, reason: 'wrangler_version_unapproved', version, raw };
    }
    return { ok: true, version, raw, reason: null };
  } catch (error) {
    return {
      ok: false,
      reason: 'wrangler_version_read_failed',
      version: null,
      raw: String(error?.message || error),
    };
  }
}

function readFdLimit(minFdLimit = DEFAULT_MIN_FD_LIMIT) {
  const shells = [...new Set([
    process.env.SHELL,
    '/bin/zsh',
    '/bin/bash',
    '/bin/sh',
  ].filter((value) => value && safeStat(value)))];
  for (const shell of shells) {
    try {
      const raw = execFileSync(shell, ['-lc', 'ulimit -n'], {
        cwd: ROOT,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
      }).trim();
      const value = Number(raw);
      return {
        value,
        ok: Number.isFinite(value) && value >= minFdLimit,
        reason: Number.isFinite(value) && value >= minFdLimit ? null : 'fd_limit_too_low',
      };
    } catch {
      // Try the next available shell.
    }
  }
  return {
    value: null,
    ok: false,
    reason: 'fd_limit_read_failed',
    error: 'no_supported_shell_for_ulimit',
  };
}

async function findResourceForkFiles(rootDir, limit = 25) {
  const found = [];
  async function walk(dirPath) {
    if (found.length >= limit) return;
    let entries = [];
    try {
      entries = await fsp.readdir(dirPath, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (found.length >= limit) return;
      const fullPath = path.join(dirPath, entry.name);
      if (entry.name.startsWith('._')) {
        found.push(path.relative(ROOT, fullPath));
        continue;
      }
      if (entry.isDirectory()) await walk(fullPath);
    }
  }
  await walk(rootDir);
  return found;
}

async function fetchWithTimeout(url, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new Error(`timeout_after_${timeoutMs}ms`)), timeoutMs);
  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: { accept: 'application/json' },
      signal: controller.signal,
    });
    const text = await response.text();
    return { ok: response.ok, status: response.status, text };
  } catch (error) {
    return {
      ok: false,
      status: 0,
      error: String(error?.message || error),
    };
  } finally {
    clearTimeout(timer);
  }
}

export function classifyRuntimeFailure(message) {
  const text = String(message || '').toLowerCase();
  if (!text) return null;
  if (
    text.includes('econnreset') ||
    text.includes('econnrefused') ||
    text.includes('failed to connect') ||
    text.includes('timeout_after_') ||
    text.includes('networkerror') ||
    text.includes('socket hang up')
  ) {
    return text.includes('econnreset') || text.includes('socket hang up') ? 'runtime_unstable' : 'runtime_unavailable';
  }
  return null;
}

async function checkDiag(baseUrl, timeoutMs) {
  const diagUrl = `${baseUrl.replace(/\/$/, '')}/api/diag`;
  const result = await fetchWithTimeout(diagUrl, timeoutMs);
  if (!result.ok) {
    return {
      ok: false,
      url: diagUrl,
      status: result.status || 0,
      error: result.error || `http_${result.status}`,
      failure_class: classifyRuntimeFailure(result.error || result.status),
    };
  }
  try {
    return {
      ok: true,
      url: diagUrl,
      status: result.status,
      body: JSON.parse(result.text),
    };
  } catch (error) {
    return {
      ok: false,
      url: diagUrl,
      status: result.status,
      error: `diag_parse_failed:${String(error?.message || error)}`,
      failure_class: 'runtime_unstable',
    };
  }
}

async function checkCanaries(baseUrl, timeoutMs, canaries) {
  const results = [];
  for (const canary of canaries) {
    const url = `${baseUrl.replace(/\/$/, '')}${canary.endpoint}`;
    const result = await fetchWithTimeout(url, timeoutMs);
    if (!result.ok) {
      results.push({
        ticker: canary.ticker,
        endpoint: canary.endpoint,
        ok: false,
        status: result.status || 0,
        error: result.error || `http_${result.status}`,
        failure_class: classifyRuntimeFailure(result.error || result.status) || 'endpoint_contract_failed',
      });
      continue;
    }
    try {
      const body = JSON.parse(result.text);
      const bodyOk = body && typeof body === 'object' && Object.keys(body).length > 0;
      results.push({
        ticker: canary.ticker,
        endpoint: canary.endpoint,
        ok: bodyOk,
        status: result.status,
        failure_class: bodyOk ? null : 'endpoint_contract_failed',
        error: bodyOk ? null : 'empty_canary_response',
      });
    } catch (error) {
      results.push({
        ticker: canary.ticker,
        endpoint: canary.endpoint,
        ok: false,
        status: result.status,
        error: `canary_parse_failed:${String(error?.message || error)}`,
        failure_class: 'endpoint_contract_failed',
      });
    }
  }
  return results;
}

function isRepoWorkerdCommand(command) {
  const normalized = String(command || '');
  return normalized.includes(path.join(ROOT, 'node_modules', '@cloudflare', 'workerd-linux-64', 'bin', 'workerd'));
}

function isRepoWranglerCommand(command, wranglerBin = null) {
  const normalized = String(command || '');
  return Boolean(
    (wranglerBin && normalized.includes(wranglerBin))
    || normalized.includes(path.join(ROOT, 'node_modules', 'wrangler', 'wrangler-dist', 'cli.js'))
  );
}

function isRepoRuntimeCommand(command, wranglerBin = null) {
  return isRepoWorkerdCommand(command) || isRepoWranglerCommand(command, wranglerBin);
}

function findRuntimeProcesses(wranglerBin = null) {
  try {
    const raw = execFileSync('ps', ['-axo', 'pid=,ppid=,command='], {
      cwd: ROOT,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      maxBuffer: 1024 * 1024 * 8,
    });
    return raw
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        const match = line.match(/^(\d+)\s+(\d+)\s+(.*)$/);
        if (!match) return null;
        return { pid: Number(match[1]), ppid: Number(match[2]), command: match[3] };
      })
      .filter(Boolean)
      .filter(({ command }) => isRepoRuntimeCommand(command, wranglerBin))
      .slice(0, 25);
  } catch {
    return [];
  }
}

function assessRuntimeOwner(processes, wranglerBin, expectedNodeBin) {
  const runtimeProcesses = Array.isArray(processes) ? processes : [];
  const wranglerProcesses = runtimeProcesses.filter((entry) => isRepoWranglerCommand(entry?.command, wranglerBin));
  const wranglerProcess = wranglerProcesses.find((entry) => {
    const command = String(entry?.command || '');
    return !expectedNodeBin || command.startsWith(expectedNodeBin);
  }) || wranglerProcesses[0] || null;
  const wranglerPids = new Set(wranglerProcesses.map((entry) => Number(entry?.pid || 0)).filter((pid) => pid > 0));
  const staleProcesses = runtimeProcesses.filter((entry) => {
    if (!isRepoWorkerdCommand(entry?.command)) return false;
    const parentPid = Number(entry?.ppid || 0);
    return parentPid <= 1 || !wranglerPids.has(parentPid);
  });
  const reasons = [];
  if (!wranglerProcess) {
    reasons.push('runtime_owner_missing');
  } else {
    const command = String(wranglerProcess.command || '');
    if (wranglerBin && !command.includes(wranglerBin)) {
      reasons.push('runtime_owner_wrangler_mismatch');
    }
    if (expectedNodeBin && !command.startsWith(expectedNodeBin)) {
      reasons.push('runtime_owner_node_mismatch');
    }
  }
  if (staleProcesses.length > 0) {
    reasons.push('runtime_owner_stale_processes');
  }
  return {
    ok: reasons.length === 0,
    reasons,
    wrangler_pid: wranglerProcess?.pid || null,
    wrangler_command: wranglerProcess?.command || null,
    process_count: runtimeProcesses.length,
    stale_process_count: staleProcesses.length,
    stale_processes: staleProcesses,
    processes: runtimeProcesses,
  };
}

async function waitForRuntimeExit(deadlineMs = 8000) {
  const deadline = Date.now() + deadlineMs;
  let remaining = findRuntimeProcesses(findRepoWrangler());
  while (remaining.length > 0 && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 500));
    remaining = findRuntimeProcesses(findRepoWrangler());
  }
  return remaining;
}

async function stopRuntimeProcesses(processes) {
  const runtimeProcesses = Array.isArray(processes) ? processes : [];
  const uniquePids = Array.from(new Set(runtimeProcesses.map((entry) => Number(entry?.pid || 0)).filter((pid) => pid > 0)));
  for (const pid of uniquePids) {
    try {
      process.kill(pid, 'SIGTERM');
    } catch {}
  }
  let remaining = await waitForRuntimeExit(6000);
  if (remaining.length > 0) {
    for (const entry of remaining) {
      try {
        process.kill(Number(entry.pid), 'SIGKILL');
      } catch {}
    }
    remaining = await waitForRuntimeExit(3000);
  }
  return {
    attempted: uniquePids.length > 0,
    targeted_pids: uniquePids,
    remaining_processes: remaining,
    stopped: remaining.length === 0,
  };
}

async function waitForHealthyDiag(baseUrl, timeoutMs, maxWaitMs = 30000) {
  const deadline = Date.now() + maxWaitMs;
  let last = null;
  while (Date.now() < deadline) {
    last = await checkDiag(baseUrl, timeoutMs);
    if (last?.ok) return { ok: true, detail: last };
    await new Promise((resolve) => setTimeout(resolve, 1500));
  }
  return { ok: false, detail: last };
}

async function ensureRuntime(baseUrl, timeoutMs, approvedNodeBin) {
  const wranglerBin = findRepoWrangler();
  const initialDiag = await checkDiag(baseUrl, timeoutMs);
  const existingProcesses = findRuntimeProcesses(wranglerBin);
  const owner = assessRuntimeOwner(existingProcesses, wranglerBin, approvedNodeBin);
  if (initialDiag.ok) {
    if (owner.ok) {
      return {
        attempted: false,
        started: false,
        outcome: 'already_healthy',
        detail: initialDiag,
        process_count: existingProcesses.length,
        runtime_owner: owner,
      };
    }
    const stopResult = await stopRuntimeProcesses(existingProcesses);
    if (!stopResult.stopped) {
      return {
        attempted: true,
        started: false,
        outcome: 'existing_unapproved_unstoppable',
        detail: initialDiag,
        process_count: findRuntimeProcesses(wranglerBin).length,
        runtime_owner: owner,
        stop_result: stopResult,
      };
    }
  }
  if (existingProcesses.length > 0) {
    const stopResult = await stopRuntimeProcesses(existingProcesses);
    if (!stopResult.stopped) {
      return {
        attempted: true,
        started: false,
        outcome: owner.ok ? 'existing_unhealthy' : 'existing_unapproved',
        detail: initialDiag,
        process_count: findRuntimeProcesses(wranglerBin).length,
        processes: existingProcesses,
        runtime_owner: owner,
        stop_result: stopResult,
      };
    }
  }
  if (!wranglerBin) {
    return {
        attempted: false,
        started: false,
        outcome: 'repo_wrangler_missing',
        detail: initialDiag,
      process_count: findRuntimeProcesses(wranglerBin).length,
      runtime_owner: owner,
    };
  }
  const logDir = path.join(ROOT, 'logs', 'dashboard_v7');
  ensureDirSync(logDir);
  const out = fs.openSync(path.join(logDir, 'runtime-preflight.out.log'), 'a');
  const err = fs.openSync(path.join(logDir, 'runtime-preflight.err.log'), 'a');
  const child = spawn(approvedNodeBin, buildWranglerDevArgs(wranglerBin), {
    cwd: ROOT,
    env: { ...process.env, RV_REPO_ROOT: ROOT },
    detached: true,
    stdio: ['ignore', out, err],
  });
  fs.closeSync(out);
  fs.closeSync(err);
  child.unref();
  const waited = await waitForHealthyDiag(baseUrl, timeoutMs, 35000);
  return {
    attempted: true,
    started: waited.ok,
    outcome: waited.ok ? 'started' : 'start_failed',
    pid: child.pid,
    detail: waited.detail,
    process_count: findRuntimeProcesses(wranglerBin).length,
    runtime_owner: assessRuntimeOwner(findRuntimeProcesses(wranglerBin), wranglerBin, approvedNodeBin),
  };
}

export async function buildRuntimePreflight(options = {}) {
  const generatedAt = new Date().toISOString();
  const baseUrl = options.baseUrl || DEFAULT_BASE_URL;
  const timeoutMs = Math.max(1000, Number(options.timeoutMs || DEFAULT_TIMEOUT_MS) || DEFAULT_TIMEOUT_MS);
  const minFdLimit = Math.max(0, Number(options.minFdLimit || DEFAULT_MIN_FD_LIMIT) || DEFAULT_MIN_FD_LIMIT);
  let approvedNodeBin = null;
  try {
    approvedNodeBin = resolveApprovedNodeBin({ fallbackCurrent: true });
  } catch {}
  const nodeVersionRaw = readNodeVersion(approvedNodeBin) || process.versions.node;
  const nodeVersion = parseSemver(nodeVersionRaw);
  const nodeOk = Boolean(nodeVersion && nodeVersion.major === EXPECTED_NODE_MAJOR);
  const nodeReason = approvedNodeBin ? (nodeOk ? null : 'node_major_mismatch') : 'approved_node_missing';
  const wranglerBin = findRepoWrangler();
  const wrangler = readWranglerVersion(wranglerBin, approvedNodeBin || process.execPath);
  const fdLimit = readFdLimit(minFdLimit);
  const resourceForkFiles = await findResourceForkFiles(path.join(ROOT, 'functions'));
  const resourceForkOk = resourceForkFiles.length === 0;
  const ensureResult = options.ensureRuntime ? await ensureRuntime(baseUrl, timeoutMs, approvedNodeBin || process.execPath) : null;
  const runtimeProcesses = findRuntimeProcesses(wranglerBin);
  const runtimeOwner = assessRuntimeOwner(runtimeProcesses, wranglerBin, approvedNodeBin || process.execPath);
  const diag = ensureResult?.detail?.ok ? ensureResult.detail : await checkDiag(baseUrl, timeoutMs);
  const portOk = diag.ok;
  const canaries = await checkCanaries(baseUrl, timeoutMs, options.canaries || DEFAULT_CANARIES);
  const canaryOk = canaries.every((entry) => entry.ok);
  const failureReasons = [];
  if (nodeReason) failureReasons.push(nodeReason);
  if (wrangler.reason) failureReasons.push(wrangler.reason);
  if (!fdLimit.ok && fdLimit.reason) failureReasons.push(fdLimit.reason);
  if (!resourceForkOk) failureReasons.push('resource_fork_files_present');
  if (!runtimeOwner.ok) failureReasons.push(...runtimeOwner.reasons);
  if (!portOk) failureReasons.push(diag.failure_class || 'runtime_unavailable');
  if (!diag.ok && !failureReasons.includes('diag_unhealthy')) failureReasons.push('diag_unhealthy');
  if (!canaryOk) {
    const canaryFailure = canaries.find((entry) => !entry.ok);
    failureReasons.push(canaryFailure?.failure_class || 'canary_failed');
  }
  const compatible = nodeOk && wrangler.ok && fdLimit.ok && resourceForkOk;
  const runtimeOk = portOk && diag.ok && canaryOk;
  return {
    schema: 'runtime_preflight_v1',
    generated_at: generatedAt,
    host: os.hostname(),
    mode: options.mode || 'hard',
    base_url: baseUrl,
    timeout_ms: timeoutMs,
    min_fd_limit: minFdLimit,
    runtime_owner: {
      host: normalizeHost(baseUrl),
      ensure_runtime: Boolean(options.ensureRuntime),
      ok: runtimeOwner.ok,
      reasons: runtimeOwner.reasons,
      process_count: runtimeOwner.process_count,
      wrangler_pid: runtimeOwner.wrangler_pid,
      wrangler_command: runtimeOwner.wrangler_command,
      processes: runtimeProcesses,
      ensure_result: ensureResult,
    },
    node_version: nodeVersionRaw,
    node_ok: nodeOk,
    node_bin: approvedNodeBin,
    wrangler_version: wrangler.version?.raw || wrangler.raw || null,
    wrangler_ok: wrangler.ok,
    wrangler_bin: wranglerBin ? path.relative(ROOT, wranglerBin) : null,
    port_8788_ok: portOk,
    diag_ok: diag.ok,
    diag: diag,
    canary_ok: canaryOk,
    canaries,
    fd_limit: fdLimit.value,
    fd_limit_ok: fdLimit.ok,
    resource_fork_ok: resourceForkOk,
    resource_fork_examples: resourceForkFiles,
    compatible,
    ok: compatible && runtimeOk,
    failure_reasons: Array.from(new Set(failureReasons)),
  };
}

export function writeRuntimePreflight(payload, filePath = RUNTIME_PREFLIGHT_PATH) {
  writeJsonAtomic(filePath, payload);
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const payload = await buildRuntimePreflight(options);
  writeRuntimePreflight(payload);
  process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
  if (!payload.ok && options.mode !== 'warn') process.exit(78);
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : null;
if (invokedPath && invokedPath === path.resolve(new URL(import.meta.url).pathname)) {
  main().catch((error) => {
    const payload = {
      schema: 'runtime_preflight_v1',
      generated_at: new Date().toISOString(),
      host: os.hostname(),
      ok: false,
      compatible: false,
      failure_reasons: ['runtime_preflight_crashed'],
      error: String(error?.stack || error?.message || error),
    };
    try {
      writeRuntimePreflight(payload);
    } catch {}
    process.stderr.write(`${payload.error}\n`);
    process.exit(1);
  });
}
