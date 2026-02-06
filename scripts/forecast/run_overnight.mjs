/**
 * RubikVault Forecast Overnight Orchestrator (MEM v1.2 / Runblock v3.4)
 *
 * Goals:
 * 1) Backfill EOD bars to last US trading day (resumable).
 * 2) Train per-ticker model artifacts + one global artifact (resumable).
 * 3) Generate forecast artifacts and run local contract validations.
 * 4) Emit morning-ready status, events, and summary evidence.
 *
 * Usage:
 *   node scripts/forecast/run_overnight.mjs
 *   node scripts/forecast/run_overnight.mjs --resume=false --phases=BARS
 *   node scripts/forecast/run_overnight.mjs --phases=BARS,TRAIN_TICKER --tickers=AAPL,MSFT
 */

import fs from 'node:fs';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { execFileSync, spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { writeJsonAtomic } from '../lib/fs-atomic.mjs';
import { computeDigest } from '../lib/digest.js';
import { isTradingDay, getPreviousTradingDay } from './trading_date.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../../');

const OPS_DIR = path.join(ROOT, 'mirrors/forecast/ops');
const CHECKPOINTS_DIR = path.join(OPS_DIR, 'checkpoints');
const BARS_CHECKPOINT_DIR = path.join(CHECKPOINTS_DIR, 'bars');
const TRAIN_CHECKPOINT_DIR = path.join(CHECKPOINTS_DIR, 'train');
const GLOBAL_CHECKPOINT_PATH = path.join(CHECKPOINTS_DIR, 'global.done');
const STATUS_PATH = path.join(OPS_DIR, 'overnight_status.json');
const SUMMARY_PATH = path.join(OPS_DIR, 'overnight_summary.md');
const EVENTS_PATH = path.join(OPS_DIR, 'overnight_events.ndjson');
const PREFLIGHT_EVIDENCE_PATH = path.join(OPS_DIR, 'preflight_evidence.json');
const LOCK_PATH = path.join(OPS_DIR, 'overnight.lock');

const UNIVERSE_PATH = path.join(ROOT, 'public/data/universe/all.json');
const BARS_DIR = path.join(ROOT, 'public/data/eod/bars');
const BARS_MANIFEST_PATH = path.join(BARS_DIR, 'manifest.json');

const TICKER_MODEL_DIR = path.join(ROOT, 'mirrors/forecast/models/per_ticker');
const GLOBAL_MODEL_PATH = path.join(ROOT, 'mirrors/forecast/models/global/current.json');
const POLICY_PATH = path.join(ROOT, 'policies/forecast.v3.json');

const FORECAST_LATEST_PATH = path.join(ROOT, 'public/data/forecast/latest.json');
const FORECAST_REGISTRY_PATH = path.join(ROOT, 'public/data/forecast/models/registry.json');

const DEFAULT_PHASES = ['BARS', 'TRAIN_TICKER', 'TRAIN_GLOBAL', 'FORECAST'];
const EODHD_BASE_URL = 'https://eodhd.com/api/eod';
const DEFAULT_FROM_DATE = '1996-01-01';
const HEARTBEAT_MS = 5 * 60 * 1000;
const MIN_DISK_GB = 5;
const MIN_INODES_FREE = 10_000;
const TRAIN_MIN_HISTORY_DAYS = 252;
const TRAIN_TIMEOUT_MS = 10 * 60 * 1000;
const RETRY_MAX = 5;

const DETERMINISTIC_ENV = {
  PYTHONHASHSEED: '0',
  OMP_NUM_THREADS: '1',
  MKL_NUM_THREADS: '1',
  OPENBLAS_NUM_THREADS: '1',
  CUDA_VISIBLE_DEVICES: ''
};

class RunError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = 'RunError';
    this.code = code;
    this.details = details;
  }
}

function nowIso() {
  return new Date().toISOString();
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parseBoolean(value, fallback) {
  if (value === undefined || value === null || value === '') return fallback;
  const normalized = String(value).trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
  return fallback;
}

function parseArgs(argv) {
  const options = {
    resume: true,
    force: false,
    phases: new Set(DEFAULT_PHASES),
    tickers: null,
    maxInflight: 3,
    ratePerSec: 2,
    bucketSize: 5
  };

  for (const rawArg of argv) {
    const arg = String(rawArg);
    if (arg === '--force') {
      options.force = true;
      continue;
    }
    if (arg === '--resume') {
      options.resume = true;
      continue;
    }
    if (arg === '--no-resume') {
      options.resume = false;
      continue;
    }
    if (arg.startsWith('--resume=')) {
      options.resume = parseBoolean(arg.split('=')[1], true);
      continue;
    }
    if (arg.startsWith('--phases=')) {
      const value = arg.split('=')[1] ?? '';
      const parsed = value
        .split(',')
        .map((v) => v.trim().toUpperCase())
        .filter(Boolean);
      if (parsed.length === 0) {
        throw new RunError('INVALID_ARGS', 'Empty --phases value');
      }
      const invalid = parsed.filter((p) => !DEFAULT_PHASES.includes(p));
      if (invalid.length > 0) {
        throw new RunError('INVALID_ARGS', `Unknown phase(s): ${invalid.join(', ')}`);
      }
      options.phases = new Set(parsed);
      continue;
    }
    if (arg.startsWith('--tickers=')) {
      const value = arg.split('=')[1] ?? '';
      const parsed = value
        .split(',')
        .map((v) => normalizeSymbol(v))
        .filter(Boolean);
      options.tickers = parsed.length > 0 ? parsed : null;
      continue;
    }
    if (arg.startsWith('--max-inflight=')) {
      const value = Number(arg.split('=')[1]);
      if (!Number.isFinite(value) || value < 1) {
        throw new RunError('INVALID_ARGS', `Invalid --max-inflight value: ${arg}`);
      }
      options.maxInflight = Math.floor(value);
      continue;
    }
    if (arg.startsWith('--rate=')) {
      const value = Number(arg.split('=')[1]);
      if (!Number.isFinite(value) || value <= 0) {
        throw new RunError('INVALID_ARGS', `Invalid --rate value: ${arg}`);
      }
      options.ratePerSec = value;
      continue;
    }
    if (arg.startsWith('--bucket-size=')) {
      const value = Number(arg.split('=')[1]);
      if (!Number.isFinite(value) || value < 1) {
        throw new RunError('INVALID_ARGS', `Invalid --bucket-size value: ${arg}`);
      }
      options.bucketSize = Math.floor(value);
      continue;
    }
    if (arg === '--help' || arg === '-h') {
      printHelp();
      process.exit(0);
    }

    throw new RunError('INVALID_ARGS', `Unknown argument: ${arg}`);
  }

  return options;
}

function printHelp() {
  console.log('Usage: node scripts/forecast/run_overnight.mjs [options]');
  console.log('');
  console.log('Options:');
  console.log('  --resume=true|false         Resume from checkpoints (default: true)');
  console.log('  --force                     Rebuild all symbols/stages');
  console.log('  --phases=BARS,TRAIN_TICKER,TRAIN_GLOBAL,FORECAST');
  console.log('  --tickers=AAPL,MSFT         Target subset for bars/ticker-training');
  console.log('  --max-inflight=3            EODHD request concurrency cap');
  console.log('  --rate=2                    EODHD token rate (requests per second)');
  console.log('  --bucket-size=5             EODHD token bucket size');
}

function normalizeSymbol(value) {
  if (value === undefined || value === null) return '';
  return String(value).trim().toUpperCase();
}

function parseUniverseSymbols(content) {
  const parsed = JSON.parse(content);
  if (!Array.isArray(parsed)) {
    throw new RunError('UNIVERSE_INVALID', 'Universe JSON must be an array');
  }

  const symbols = [];
  for (const item of parsed) {
    if (typeof item === 'string') {
      const sym = normalizeSymbol(item);
      if (sym) symbols.push(sym);
      continue;
    }
    if (item && typeof item === 'object') {
      const sym = normalizeSymbol(item.ticker ?? item.symbol);
      if (sym) symbols.push(sym);
    }
  }

  if (symbols.length === 0) {
    throw new RunError('UNIVERSE_EMPTY', 'Universe has no valid symbols');
  }

  return symbols;
}

function readJsonSafe(filePath, fallback = null) {
  try {
    if (!fs.existsSync(filePath)) return fallback;
    const raw = fs.readFileSync(filePath, 'utf8');
    if (!raw.trim()) return fallback;
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

function getNodeMajor(versionString) {
  const major = Number(String(versionString).split('.')[0]);
  return Number.isFinite(major) ? major : 0;
}

function getRequiredNodeMajor(packageJson) {
  const engineValue = packageJson?.engines?.node;
  if (typeof engineValue === 'string') {
    const gteMatch = engineValue.match(/>=\s*(\d+)/);
    if (gteMatch) return Number(gteMatch[1]);
    const directMatch = engineValue.match(/(\d+)/);
    if (directMatch) return Number(directMatch[1]);
  }
  return 18;
}

function runSync(command, args, options = {}) {
  return execFileSync(command, args, {
    cwd: ROOT,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    ...options
  }).trim();
}

function parseDfField(output, targetHeaderRegex, fallbackIndex = null) {
  const lines = output
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
  if (lines.length < 2) {
    throw new RunError('PREFLIGHT_DF_PARSE', 'Unexpected df output');
  }

  const headerTokens = lines[0].split(/\s+/);
  const dataTokens = lines[lines.length - 1].split(/\s+/);
  const index = headerTokens.findIndex((token) => targetHeaderRegex.test(token));
  const resolvedIndex = index >= 0 ? index : fallbackIndex;
  if (resolvedIndex === null || resolvedIndex === undefined || resolvedIndex < 0) {
    throw new RunError('PREFLIGHT_DF_PARSE', `Unable to locate df field ${targetHeaderRegex}`);
  }
  const value = Number(dataTokens[resolvedIndex]);
  if (!Number.isFinite(value)) {
    throw new RunError('PREFLIGHT_DF_PARSE', `Unable to parse df field at index ${resolvedIndex}`);
  }
  return value;
}

function getDiskAndInodeStats() {
  const dfSpace = runSync('df', ['-Pk', '.']);
  const availableKb = parseDfField(dfSpace, /^Available$/i, 3);
  const diskFreeGb = availableKb / (1024 * 1024);

  const dfInodes = runSync('df', ['-Pi', '.']);
  const inodesFree = parseDfField(dfInodes, /^IFree$/i, 3);

  return { diskFreeGb, inodesFree };
}

function sanitizeGitStatus(gitStatus) {
  const maxLines = 300;
  return String(gitStatus || '')
    .split('\n')
    .slice(0, maxLines)
    .join('\n');
}

function isPidAlive(pid) {
  if (!Number.isFinite(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    return err?.code === 'EPERM';
  }
}

async function writeTextAtomic(filePath, text) {
  const dir = path.dirname(filePath);
  await fsp.mkdir(dir, { recursive: true });
  const tmpPath = `${filePath}.tmp.${process.pid}.${Date.now()}`;
  await fsp.writeFile(tmpPath, text, 'utf8');
  await fsp.rename(tmpPath, filePath);
}

function checkpointName(symbol) {
  return `${normalizeSymbol(symbol)}.done`;
}

function toNyDateString(now = new Date()) {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  });
  const parts = formatter.formatToParts(now);
  const year = parts.find((p) => p.type === 'year')?.value;
  const month = parts.find((p) => p.type === 'month')?.value;
  const day = parts.find((p) => p.type === 'day')?.value;
  return `${year}-${month}-${day}`;
}

function getExpectedLastTradingDay(now = new Date()) {
  let candidate = toNyDateString(now);
  if (!isTradingDay(candidate)) {
    candidate = getPreviousTradingDay(candidate);
  }
  return candidate;
}

function addCalendarDays(dateStr, days) {
  const dt = new Date(`${dateStr}T12:00:00Z`);
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().slice(0, 10);
}

function normalizeBars(rawBars) {
  if (!Array.isArray(rawBars)) return [];
  const normalized = [];
  for (const bar of rawBars) {
    if (!bar || typeof bar !== 'object') continue;
    const date = String(bar.date ?? '').slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;
    const open = Number(bar.open);
    const high = Number(bar.high);
    const low = Number(bar.low);
    const close = Number(bar.close);
    const volume = Number(bar.volume ?? 0);
    if (![open, high, low, close].every(Number.isFinite)) continue;
    normalized.push({
      date,
      open,
      high,
      low,
      close,
      volume: Number.isFinite(volume) ? volume : 0
    });
  }
  normalized.sort((a, b) => a.date.localeCompare(b.date));
  return normalized;
}

function mergeBars(existingBars, incomingBars) {
  const byDate = new Map();
  for (const bar of existingBars) {
    byDate.set(bar.date, bar);
  }
  for (const bar of incomingBars) {
    byDate.set(bar.date, bar);
  }
  return Array.from(byDate.values()).sort((a, b) => a.date.localeCompare(b.date));
}

function inspectBarsFile(symbol) {
  const filePath = path.join(BARS_DIR, `${symbol}.json`);
  if (!fs.existsSync(filePath)) {
    return { symbol, filePath, exists: false, valid: false, bars: [], lastDate: null, state: 'MISSING' };
  }

  try {
    const content = fs.readFileSync(filePath, 'utf8');
    const parsed = JSON.parse(content);
    const normalized = normalizeBars(parsed);
    if (normalized.length === 0) {
      return {
        symbol,
        filePath,
        exists: true,
        valid: false,
        bars: [],
        lastDate: null,
        state: 'MISSING',
        error: 'empty_or_invalid'
      };
    }

    const lastDate = normalized[normalized.length - 1].date;
    return {
      symbol,
      filePath,
      exists: true,
      valid: true,
      bars: normalized,
      lastDate,
      state: 'UNKNOWN'
    };
  } catch (err) {
    return {
      symbol,
      filePath,
      exists: true,
      valid: false,
      bars: [],
      lastDate: null,
      state: 'MISSING',
      error: err?.message ?? 'parse_error'
    };
  }
}

function parseRetryAfterSeconds(retryAfterHeader) {
  if (!retryAfterHeader) return null;
  const direct = Number(retryAfterHeader);
  if (Number.isFinite(direct) && direct >= 0) return Math.round(direct);
  const dateMs = Date.parse(retryAfterHeader);
  if (!Number.isFinite(dateMs)) return null;
  const deltaMs = dateMs - Date.now();
  return Math.max(0, Math.round(deltaMs / 1000));
}

function toErrorClass(err, httpStatus = null) {
  if (httpStatus === 401 || httpStatus === 403) return 'AUTH';
  if (httpStatus === 429) return 'RATE_LIMIT';
  if (httpStatus && httpStatus >= 500) return 'UPSTREAM_5XX';
  const code = String(err?.code || '');
  if (code === 'ENOSPC' || code === 'EDQUOT') return 'DISK';
  if (code === 'ETIMEDOUT' || code === 'ECONNRESET' || code === 'ECONNREFUSED') return 'NETWORK';
  if (err?.name === 'AbortError') return 'TIMEOUT';
  return 'UNKNOWN';
}

function toEodSymbol(symbol) {
  return symbol.includes('.') ? symbol : `${symbol}.US`;
}

function pickRateHeaders(headers) {
  const keys = [
    'retry-after',
    'x-ratelimit-limit',
    'x-ratelimit-remaining',
    'x-ratelimit-reset',
    'ratelimit-limit',
    'ratelimit-remaining',
    'ratelimit-reset'
  ];
  const out = {};
  for (const key of keys) {
    const value = headers.get(key);
    if (value !== null) out[key] = value;
  }
  return out;
}

class TokenBucketLimiter {
  constructor({ maxInflight = 3, ratePerSec = 2, bucketSize = 5 } = {}) {
    this.maxInflight = maxInflight;
    this.ratePerSec = ratePerSec;
    this.bucketSize = bucketSize;
    this.tokens = bucketSize;
    this.inflight = 0;
    this.lastRefill = Date.now();
  }

  refillTokens() {
    const now = Date.now();
    const elapsedSec = (now - this.lastRefill) / 1000;
    if (elapsedSec <= 0) return;
    this.tokens = Math.min(this.bucketSize, this.tokens + elapsedSec * this.ratePerSec);
    this.lastRefill = now;
  }

  async acquire() {
    while (true) {
      this.refillTokens();
      if (this.inflight < this.maxInflight && this.tokens >= 1) {
        this.tokens -= 1;
        this.inflight += 1;
        return;
      }

      const waitForTokenMs = this.tokens >= 1
        ? 10
        : Math.ceil(((1 - this.tokens) / this.ratePerSec) * 1000);
      const waitForInflightMs = this.inflight < this.maxInflight ? 10 : 30;
      const sleepMs = Math.max(20, Math.min(250, Math.max(waitForTokenMs, waitForInflightMs)));
      await sleep(sleepMs);
    }
  }

  release() {
    this.inflight = Math.max(0, this.inflight - 1);
  }

  async schedule(task) {
    await this.acquire();
    try {
      return await task();
    } finally {
      this.release();
    }
  }
}

function createContext(options) {
  const runId = `${new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14)}_${process.pid}_${Math.random().toString(36).slice(2, 8)}`;

  return {
    options,
    runId,
    headSha: 'unknown',
    status: null,
    statusWriteQueue: Promise.resolve(),
    eventWriteQueue: Promise.resolve(),
    heartbeat: null,
    lockHeld: false,
    cleanupInstalled: false,
    expectedLastTradingDay: null,
    requestStats: {
      requests_total: 0,
      http_429_count: 0,
      http_5xx_count: 0,
      total_latency_ms: 0
    },
    preflightEvidence: {
      node_version: process.version,
      npm_version: null,
      head_sha: null,
      git_status_porcelain: '',
      disk_free_gb: null,
      inodes_free: null,
      universe_exists: false,
      universe_count_if_any: null,
      eodhd_key_present: false,
      eodhd_key_valid: false,
      last_http_status: null,
      retry_after_if_any: null
    },
    metrics: {
      bars: {
        done: 0,
        failed: 0,
        missing_resolved: 0,
        stale_resolved: 0,
        fresh_skipped: 0,
        resume_skipped: 0,
        failedTickers: []
      },
      trainTicker: {
        trained: 0,
        failed: 0,
        skipped_insufficient_history: 0,
        resume_skipped: 0,
        failedTickers: []
      },
      global: {
        success: false,
        skipped: false,
        reason: null
      },
      forecast: {
        latest_exists: false,
        latest_report_ref_exists: false,
        registry_valid: false,
        schemas_valid: false,
        determinism_valid: false,
        ui_ok: false,
        ui_attempts: 0
      }
    }
  };
}

function syncRequestStatsIntoStatus(ctx) {
  if (!ctx.status) return;
  const requests = ctx.requestStats.requests_total;
  const avg = requests > 0 ? ctx.requestStats.total_latency_ms / requests : 0;
  ctx.status.request_stats = {
    requests_total: requests,
    http_429_count: ctx.requestStats.http_429_count,
    http_5xx_count: ctx.requestStats.http_5xx_count,
    avg_latency_ms: Number(avg.toFixed(2))
  };
}

function queueStatusWrite(ctx) {
  if (!ctx.status) return Promise.resolve();
  syncRequestStatsIntoStatus(ctx);
  ctx.status.updated_at = nowIso();
  ctx.status.sequence_id = Number(ctx.status.sequence_id || 0) + 1;
  const snapshot = JSON.parse(JSON.stringify(ctx.status));
  ctx.statusWriteQueue = ctx.statusWriteQueue.then(() => writeJsonAtomic(STATUS_PATH, snapshot));
  return ctx.statusWriteQueue;
}

async function mutateStatus(ctx, mutator) {
  if (!ctx.status) return;
  mutator(ctx.status);
  await queueStatusWrite(ctx);
}

function queueEvent(ctx, event) {
  const payload = {
    ts: nowIso(),
    ...event
  };
  const line = `${JSON.stringify(payload)}\n`;
  ctx.eventWriteQueue = ctx.eventWriteQueue.then(async () => {
    await fsp.mkdir(path.dirname(EVENTS_PATH), { recursive: true });
    await fsp.appendFile(EVENTS_PATH, line, 'utf8');
  });
  return ctx.eventWriteQueue;
}

function addWarning(ctx, warning) {
  if (!ctx.status) return;
  ctx.status.warnings.push({
    ts: nowIso(),
    ...warning
  });
}

function addFailure(ctx, failure) {
  if (!ctx.status) return;
  ctx.status.failures.push({
    ts: nowIso(),
    ...failure
  });
}

function installCleanupHandlers(ctx) {
  if (ctx.cleanupInstalled) return;
  ctx.cleanupInstalled = true;

  const releaseLockSync = () => {
    if (!ctx.lockHeld) return;
    try {
      if (fs.existsSync(LOCK_PATH)) {
        fs.unlinkSync(LOCK_PATH);
      }
    } catch {
      // Ignore cleanup errors.
    } finally {
      ctx.lockHeld = false;
    }
  };

  process.on('exit', () => {
    if (ctx.heartbeat) {
      clearInterval(ctx.heartbeat);
      ctx.heartbeat = null;
    }
    releaseLockSync();
  });

  const signalHandler = (signal) => {
    if (ctx.heartbeat) {
      clearInterval(ctx.heartbeat);
      ctx.heartbeat = null;
    }
    releaseLockSync();
    process.exit(signal === 'SIGINT' ? 130 : 143);
  };

  process.once('SIGINT', () => signalHandler('SIGINT'));
  process.once('SIGTERM', () => signalHandler('SIGTERM'));
  process.once('SIGHUP', () => signalHandler('SIGHUP'));
}

async function releaseLock(ctx) {
  if (!ctx.lockHeld) return;
  try {
    await fsp.unlink(LOCK_PATH);
  } catch {
    // Ignore lock release errors.
  } finally {
    ctx.lockHeld = false;
  }
}

async function acquireLock(ctx) {
  await fsp.mkdir(path.dirname(LOCK_PATH), { recursive: true });

  if (fs.existsSync(LOCK_PATH)) {
    const currentLock = readJsonSafe(LOCK_PATH, null);
    const lockedPid = Number(currentLock?.pid);
    if (isPidAlive(lockedPid)) {
      throw new RunError('ALREADY_RUNNING', `Overnight run already active (pid=${lockedPid})`, {
        lock: currentLock
      });
    }
    try {
      await fsp.unlink(LOCK_PATH);
    } catch {
      // If lock cannot be removed we'll fail on create below.
    }
  }

  const payload = {
    pid: process.pid,
    started_at: nowIso(),
    host: os.hostname(),
    head_sha: ctx.headSha,
    run_id: ctx.runId
  };

  try {
    await fsp.writeFile(LOCK_PATH, `${JSON.stringify(payload, null, 2)}\n`, {
      encoding: 'utf8',
      flag: 'wx'
    });
  } catch (err) {
    if (err?.code === 'EEXIST') {
      throw new RunError('ALREADY_RUNNING', 'Overnight lock already exists');
    }
    throw err;
  }

  ctx.lockHeld = true;
  installCleanupHandlers(ctx);
}

function assertNodeVersion(packageJson) {
  const requiredMajor = getRequiredNodeMajor(packageJson);
  const currentMajor = getNodeMajor(process.versions.node);
  if (currentMajor < requiredMajor) {
    throw new RunError(
      'NODE_VERSION_UNSUPPORTED',
      `Node version ${process.versions.node} does not satisfy required >=${requiredMajor}`
    );
  }
}

async function testEodhdKey(ctx, apiKey) {
  const query = new URLSearchParams({
    api_token: apiKey,
    fmt: 'json',
    limit: '1'
  });
  const url = `${EODHD_BASE_URL}/AAPL.US?${query.toString()}`;

  const started = Date.now();
  let response;
  try {
    response = await fetch(url, { method: 'GET' });
  } catch (err) {
    throw new RunError('EODHD_KEY_TEST_FAILED', `EODHD test request failed: ${err?.message ?? 'unknown'}`);
  } finally {
    const latency = Date.now() - started;
    ctx.requestStats.requests_total += 1;
    ctx.requestStats.total_latency_ms += latency;
  }

  const status = response.status;
  ctx.preflightEvidence.last_http_status = status;

  const headers = pickRateHeaders(response.headers);
  if (headers['retry-after']) {
    ctx.preflightEvidence.retry_after_if_any = headers['retry-after'];
  }

  if (status === 401 || status === 403) {
    throw new RunError('INVALID_API_KEY', `EODHD key test returned HTTP ${status}`);
  }
  if (status === 429) {
    throw new RunError('RATE_LIMIT_ALREADY_HIT', `EODHD key test returned HTTP 429`, {
      retry_after: headers['retry-after'] ?? null,
      headers
    });
  }
  if (status !== 200) {
    throw new RunError('EODHD_KEY_TEST_FAILED', `EODHD key test returned HTTP ${status}`, {
      headers
    });
  }

  return headers;
}

async function writePreflightEvidence(ctx) {
  await writeJsonAtomic(PREFLIGHT_EVIDENCE_PATH, ctx.preflightEvidence);
}

async function runPreflight(ctx) {
  const preflightWarnings = [];

  try {
    const gitRoot = runSync('git', ['rev-parse', '--show-toplevel']);
    if (path.resolve(gitRoot) !== ROOT) {
      throw new RunError('PREFLIGHT_GIT_ROOT', `Git root mismatch: ${gitRoot} != ${ROOT}`);
    }

    const headSha = runSync('git', ['rev-parse', '--short', 'HEAD']);
    const gitStatus = runSync('git', ['status', '--porcelain']);
    const npmVersion = runSync('npm', ['-v']);

    ctx.headSha = headSha;
    ctx.preflightEvidence.head_sha = headSha;
    ctx.preflightEvidence.git_status_porcelain = sanitizeGitStatus(gitStatus);
    ctx.preflightEvidence.npm_version = npmVersion;

    if (gitStatus.trim()) {
      preflightWarnings.push({
        code: 'DIRTY_WORKTREE',
        message: 'Working tree is dirty; proceeding with warning'
      });
    }

    const packageJson = readJsonSafe(path.join(ROOT, 'package.json'), {});
    assertNodeVersion(packageJson);

    if (!fs.existsSync(UNIVERSE_PATH)) {
      ctx.preflightEvidence.universe_exists = false;
      throw new RunError('UNIVERSE_MISSING', `Universe file missing: ${UNIVERSE_PATH}`);
    }

    ctx.preflightEvidence.universe_exists = true;
    const universeContent = await fsp.readFile(UNIVERSE_PATH, 'utf8');
    const symbols = parseUniverseSymbols(universeContent);
    ctx.preflightEvidence.universe_count_if_any = symbols.length;

    const diskStats = getDiskAndInodeStats();
    ctx.preflightEvidence.disk_free_gb = Number(diskStats.diskFreeGb.toFixed(3));
    ctx.preflightEvidence.inodes_free = diskStats.inodesFree;

    if (diskStats.diskFreeGb < MIN_DISK_GB) {
      throw new RunError(
        'DISK_LOW',
        `Disk free below threshold (${diskStats.diskFreeGb.toFixed(2)} GB < ${MIN_DISK_GB} GB)`
      );
    }
    if (diskStats.inodesFree < MIN_INODES_FREE) {
      throw new RunError(
        'INODES_LOW',
        `Inodes free below threshold (${diskStats.inodesFree} < ${MIN_INODES_FREE})`
      );
    }

    const apiKey = process.env.EODHD_API_KEY;
    ctx.preflightEvidence.eodhd_key_present = Boolean(apiKey);
    if (!apiKey) {
      throw new RunError('MISSING_API_KEY', 'EODHD_API_KEY is not set');
    }

    const observedRateHeaders = await testEodhdKey(ctx, apiKey);
    ctx.preflightEvidence.eodhd_key_valid = true;

    await acquireLock(ctx);

    await fsp.mkdir(BARS_CHECKPOINT_DIR, { recursive: true });
    await fsp.mkdir(TRAIN_CHECKPOINT_DIR, { recursive: true });
    await fsp.mkdir(path.dirname(EVENTS_PATH), { recursive: true });

    ctx.status = {
      schema: 'rv_overnight_status_v1',
      run_id: ctx.runId,
      head_sha: ctx.headSha,
      started_at: nowIso(),
      updated_at: nowIso(),
      ended_at: null,
      sequence_id: 0,
      phase: 'PREFLIGHT_OK',
      universe_count: symbols.length,
      expected_last_trading_day: null,
      rate_limit: {
        observed_headers: observedRateHeaders
      },
      progress: {
        bars_done: 0,
        train_done: 0,
        global_done: false
      },
      ui_status: 'OK',
      warnings: [],
      failures: [],
      request_stats: {
        requests_total: 0,
        http_429_count: 0,
        http_5xx_count: 0,
        avg_latency_ms: 0
      }
    };

    for (const warning of preflightWarnings) {
      addWarning(ctx, warning);
    }
    await queueStatusWrite(ctx);

    ctx.heartbeat = setInterval(() => {
      queueStatusWrite(ctx).catch(() => {
        // Best effort heartbeat.
      });
    }, HEARTBEAT_MS);
    ctx.heartbeat.unref();

    await queueEvent(ctx, {
      event: 'PREFLIGHT_OK',
      run_id: ctx.runId,
      universe_count: symbols.length
    });

    return symbols;
  } catch (err) {
    await writePreflightEvidence(ctx);
    await releaseLock(ctx);
    throw err;
  }
}

async function fetchWithLimiter(ctx, limiter, url, timeoutMs = 30_000) {
  return limiter.schedule(async () => {
    const started = Date.now();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    let response = null;
    try {
      response = await fetch(url, { method: 'GET', signal: controller.signal });
      return response;
    } finally {
      clearTimeout(timer);
      const latencyMs = Date.now() - started;
      ctx.requestStats.requests_total += 1;
      ctx.requestStats.total_latency_ms += latencyMs;
      if (response?.status === 429) ctx.requestStats.http_429_count += 1;
      if (response?.status >= 500) ctx.requestStats.http_5xx_count += 1;
    }
  });
}

async function fetchBarsWithRetry(ctx, limiter, symbol, { mode, fromDate, toDate }) {
  let attempt = 0;
  let authFailures = 0;

  while (attempt <= RETRY_MAX) {
    const eodSymbol = toEodSymbol(symbol);
    const query = new URLSearchParams({
      api_token: process.env.EODHD_API_KEY || '',
      fmt: 'json',
      order: 'a'
    });
    if (fromDate) query.set('from', fromDate);
    if (toDate) query.set('to', toDate);

    const url = `${EODHD_BASE_URL}/${encodeURIComponent(eodSymbol)}?${query.toString()}`;
    const attemptStart = Date.now();
    attempt += 1;

    let response;
    try {
      response = await fetchWithLimiter(ctx, limiter, url);
    } catch (err) {
      const errClass = toErrorClass(err);
      if (attempt <= RETRY_MAX) {
        const backoffSec = Math.min(60, Math.pow(2, attempt));
        await sleep(backoffSec * 1000);
        continue;
      }
      throw new RunError('BARS_FETCH_NETWORK_FAILED', `Network error for ${symbol}`, {
        sym: symbol,
        stage: 'BARS',
        attempts: attempt,
        error_class: errClass
      });
    }

    const rateHeaders = pickRateHeaders(response.headers);
    if (Object.keys(rateHeaders).length > 0 && ctx.status) {
      ctx.status.rate_limit.observed_headers = {
        ...ctx.status.rate_limit.observed_headers,
        ...rateHeaders
      };
    }

    if (response.status === 200) {
      let payload;
      try {
        payload = await response.json();
      } catch (err) {
        throw new RunError('BARS_RESPONSE_PARSE_FAILED', `Failed to parse EODHD response for ${symbol}`, {
          sym: symbol,
          stage: 'BARS',
          attempts: attempt
        });
      }
      const bars = normalizeBars(payload);
      return {
        bars,
        attempts: attempt,
        ms: Date.now() - attemptStart,
        mode
      };
    }

    if (response.status === 401 || response.status === 403) {
      authFailures += 1;
      throw new RunError('AUTH_FAILURE', `Auth failure for ${symbol} (HTTP ${response.status})`, {
        sym: symbol,
        stage: 'BARS',
        attempts: attempt,
        http_status: response.status,
        auth_failures: authFailures
      });
    }

    if (response.status === 429) {
      const retryAfterSeconds = parseRetryAfterSeconds(response.headers.get('retry-after'));
      const backoff = retryAfterSeconds !== null
        ? Math.min(120, retryAfterSeconds)
        : Math.min(60, Math.pow(2, attempt));
      await sleep(backoff * 1000);
      continue;
    }

    if (response.status >= 500 && response.status <= 599) {
      if (attempt <= RETRY_MAX) {
        const backoffSec = Math.min(60, Math.pow(2, attempt));
        await sleep(backoffSec * 1000);
        continue;
      }
      throw new RunError('UPSTREAM_5XX', `EODHD returned HTTP ${response.status} for ${symbol}`, {
        sym: symbol,
        stage: 'BARS',
        attempts: attempt,
        http_status: response.status
      });
    }

    // Non-retryable status.
    throw new RunError('BARS_FETCH_FAILED', `EODHD returned HTTP ${response.status} for ${symbol}`, {
      sym: symbol,
      stage: 'BARS',
      attempts: attempt,
      http_status: response.status
    });
  }

  throw new RunError('BARS_FETCH_FAILED', `Exceeded retry budget for ${symbol}`, {
    sym: symbol,
    stage: 'BARS',
    attempts: RETRY_MAX
  });
}

async function runWithConcurrency(items, concurrency, workerFn) {
  if (items.length === 0) return;
  const queue = [...items];
  const workerCount = Math.max(1, Math.min(concurrency, items.length));
  const workers = [];

  for (let i = 0; i < workerCount; i += 1) {
    workers.push((async () => {
      while (queue.length > 0) {
        const item = queue.shift();
        if (!item) break;
        await workerFn(item);
      }
    })());
  }

  for (const worker of workers) {
    await worker;
  }
}

function classifyBarsState(inspected, expectedLastTradingDay) {
  if (!inspected.valid) return 'MISSING';
  if (!inspected.lastDate) return 'MISSING';
  if (inspected.lastDate < expectedLastTradingDay) return 'STALE';
  return 'FRESH';
}

async function runBarsPhase(ctx, symbols, expectedLastTradingDay, limiter) {
  await mutateStatus(ctx, (status) => {
    status.phase = 'BARS_RUNNING';
  });

  const manifest = readJsonSafe(BARS_MANIFEST_PATH, {
    updated_at: null,
    symbols: {},
    stats: { total: 0, success: 0, failures: 0 }
  });
  if (!manifest.symbols || typeof manifest.symbols !== 'object') {
    manifest.symbols = {};
  }
  if (!manifest.stats || typeof manifest.stats !== 'object') {
    manifest.stats = { total: 0, success: 0, failures: 0 };
  }

  const queue = [];
  let freshSkipped = 0;

  for (const symbol of symbols) {
    const inspected = inspectBarsFile(symbol);
    const state = classifyBarsState(inspected, expectedLastTradingDay);
    const checkpointPath = path.join(BARS_CHECKPOINT_DIR, checkpointName(symbol));
    const checkpointExists = fs.existsSync(checkpointPath);

    if (!ctx.options.force && ctx.options.resume && checkpointExists && state === 'FRESH') {
      freshSkipped += 1;
      ctx.metrics.bars.resume_skipped += 1;
      continue;
    }

    if (!ctx.options.force && state === 'FRESH') {
      freshSkipped += 1;
      continue;
    }

    const priority = state === 'MISSING' ? 0 : state === 'STALE' ? 1 : 2;
    queue.push({
      symbol,
      inspected,
      state,
      priority
    });
  }

  queue.sort((a, b) => a.priority - b.priority || a.symbol.localeCompare(b.symbol));
  ctx.metrics.bars.fresh_skipped += freshSkipped;

  let authFailureCount = 0;
  let diskIssueCount = 0;

  await runWithConcurrency(queue, ctx.options.maxInflight, async (item) => {
    const symbol = item.symbol;
    const checkpointPath = path.join(BARS_CHECKPOINT_DIR, checkpointName(symbol));

    const started = Date.now();
    let mode = 'full';
    let fromDate = DEFAULT_FROM_DATE;
    const inspectedNow = inspectBarsFile(symbol);
    const stateNow = classifyBarsState(inspectedNow, expectedLastTradingDay);

    if (!ctx.options.force && stateNow === 'STALE' && inspectedNow.lastDate) {
      mode = 'incremental';
      fromDate = addCalendarDays(inspectedNow.lastDate, 1);
    }
    if (!ctx.options.force && stateNow === 'MISSING') {
      mode = 'full';
      fromDate = DEFAULT_FROM_DATE;
    }
    if (ctx.options.force) {
      mode = 'full';
      fromDate = DEFAULT_FROM_DATE;
    }

    try {
      const fetchResult = await fetchBarsWithRetry(ctx, limiter, symbol, {
        mode,
        fromDate,
        toDate: expectedLastTradingDay
      });

      const existingBars = inspectedNow.valid ? inspectedNow.bars : [];
      const mergedBars = mode === 'incremental'
        ? mergeBars(existingBars, fetchResult.bars)
        : fetchResult.bars;

      if (!Array.isArray(mergedBars) || mergedBars.length === 0) {
        throw new RunError('BARS_EMPTY', `No bars returned for ${symbol}`, {
          sym: symbol,
          stage: 'BARS',
          attempts: fetchResult.attempts
        });
      }

      const lastDate = mergedBars[mergedBars.length - 1].date;
      if (lastDate < expectedLastTradingDay) {
        throw new RunError(
          'BARS_STILL_STALE',
          `Bars for ${symbol} remain stale (${lastDate} < ${expectedLastTradingDay})`,
          {
            sym: symbol,
            stage: 'BARS',
            attempts: fetchResult.attempts
          }
        );
      }

      const barsPath = path.join(BARS_DIR, `${symbol}.json`);
      await writeJsonAtomic(barsPath, mergedBars);

      manifest.symbols[symbol] = {
        count: mergedBars.length,
        last_date: lastDate,
        updated_at: nowIso()
      };
      manifest.updated_at = nowIso();

      if (item.state === 'MISSING') ctx.metrics.bars.missing_resolved += 1;
      if (item.state === 'STALE') ctx.metrics.bars.stale_resolved += 1;
      ctx.metrics.bars.done += 1;

      await writeJsonAtomic(checkpointPath, {
        schema: 'rv_checkpoint_v1',
        sym: symbol,
        stage: 'BARS',
        mode,
        last_date: lastDate,
        written_at: nowIso(),
        attempts: fetchResult.attempts
      });

      await mutateStatus(ctx, (status) => {
        status.progress.bars_done = ctx.metrics.bars.done;
      });

      await queueEvent(ctx, {
        event: 'BARS_OK',
        sym: symbol,
        last_date: lastDate,
        mode,
        ms: Date.now() - started
      });
    } catch (err) {
      const httpStatus = Number(err?.details?.http_status);
      const errorClass = toErrorClass(err, Number.isFinite(httpStatus) ? httpStatus : null);
      if (errorClass === 'AUTH') authFailureCount += 1;
      if (errorClass === 'DISK') diskIssueCount += 1;

      const failure = {
        sym: symbol,
        stage: 'BARS',
        http_status: Number.isFinite(httpStatus) ? httpStatus : null,
        error_class: errorClass,
        attempts: Number(err?.details?.attempts ?? 1),
        message: err?.message ?? 'bars_failure'
      };

      ctx.metrics.bars.failed += 1;
      if (ctx.metrics.bars.failedTickers.length < 1000) {
        ctx.metrics.bars.failedTickers.push(symbol);
      }

      addFailure(ctx, failure);
      await queueEvent(ctx, {
        event: 'BARS_FAIL',
        ...failure
      });
      await queueStatusWrite(ctx);

      if (authFailureCount >= 2) {
        throw new RunError('REPEATED_AUTH_FAILURE', 'Repeated auth failures while fetching bars');
      }
      if (diskIssueCount >= 1) {
        throw new RunError('DISK_WRITE_FAILURE', 'Disk issue encountered while writing bars');
      }
    }
  });

  manifest.stats.total = symbols.length;
  manifest.stats.success = ctx.metrics.bars.done;
  manifest.stats.failures = ctx.metrics.bars.failed;
  await writeJsonAtomic(BARS_MANIFEST_PATH, manifest);

  const attempted = ctx.metrics.bars.done + ctx.metrics.bars.failed;
  const failureRate = attempted > 0 ? ctx.metrics.bars.failed / attempted : 0;
  if (failureRate > 0.2) {
    throw new RunError(
      'BARS_FAILURE_RATE_TOO_HIGH',
      `Bars failure rate ${(failureRate * 100).toFixed(2)}% exceeded 20%`,
      { attempted, failed: ctx.metrics.bars.failed }
    );
  }

  await mutateStatus(ctx, (status) => {
    status.phase = 'BARS_DONE';
    status.bars = {
      missing_resolved: ctx.metrics.bars.missing_resolved,
      stale_resolved: ctx.metrics.bars.stale_resolved,
      fresh_skipped: ctx.metrics.bars.fresh_skipped,
      failures_count: ctx.metrics.bars.failed
    };
  });
}

function computeTickerTrainingStats(bars) {
  const closes = bars.map((b) => Number(b.close)).filter(Number.isFinite);
  if (closes.length < 2) {
    return {
      sample_count: closes.length,
      mean_return_1d: null,
      volatility_20d: null,
      up_day_ratio: null,
      momentum_20d: null
    };
  }

  const returns = [];
  for (let i = 1; i < closes.length; i += 1) {
    const prev = closes[i - 1];
    const next = closes[i];
    if (!Number.isFinite(prev) || prev === 0 || !Number.isFinite(next)) continue;
    returns.push((next - prev) / prev);
  }

  const mean = returns.length > 0
    ? returns.reduce((sum, value) => sum + value, 0) / returns.length
    : null;
  const variance = returns.length > 1
    ? returns.reduce((sum, value) => sum + Math.pow(value - mean, 2), 0) / (returns.length - 1)
    : null;
  const std = Number.isFinite(variance) ? Math.sqrt(variance) : null;
  const upDays = returns.filter((value) => value > 0).length;

  const momentum20 = closes.length >= 21
    ? (closes[closes.length - 1] - closes[closes.length - 21]) / closes[closes.length - 21]
    : null;

  return {
    sample_count: closes.length,
    mean_return_1d: Number.isFinite(mean) ? Number(mean.toFixed(8)) : null,
    volatility_20d: Number.isFinite(std) ? Number(std.toFixed(8)) : null,
    up_day_ratio: returns.length > 0 ? Number((upDays / returns.length).toFixed(6)) : null,
    momentum_20d: Number.isFinite(momentum20) ? Number(momentum20.toFixed(8)) : null
  };
}

function isTickerArtifactValid(symbol, policyHash) {
  const artifactPath = path.join(TICKER_MODEL_DIR, `${symbol}.json`);
  const artifact = readJsonSafe(artifactPath, null);
  if (!artifact || typeof artifact !== 'object') return false;
  if (artifact.schema !== 'rv_forecast_ticker_model_v1') return false;
  if (normalizeSymbol(artifact.symbol) !== normalizeSymbol(symbol)) return false;
  if (artifact.policy_hash !== policyHash) return false;
  if (!artifact?.bars?.last_date) return false;
  if (!artifact?.stats || typeof artifact.stats !== 'object') return false;
  return true;
}

async function withTimeout(promiseFactory, timeoutMs, timeoutErrorMessage) {
  let timer;
  try {
    return await Promise.race([
      promiseFactory(),
      new Promise((_, reject) => {
        timer = setTimeout(() => {
          reject(new RunError('TIMEOUT', timeoutErrorMessage));
        }, timeoutMs);
      })
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function runTickerTrainingPhase(ctx, symbols, policyHash) {
  await mutateStatus(ctx, (status) => {
    status.phase = 'TRAIN_TICKER_RUNNING';
  });

  await fsp.mkdir(TICKER_MODEL_DIR, { recursive: true });

  for (const symbol of symbols) {
    const checkpointPath = path.join(TRAIN_CHECKPOINT_DIR, checkpointName(symbol));
    const checkpointExists = fs.existsSync(checkpointPath);

    if (!ctx.options.force && ctx.options.resume && checkpointExists && isTickerArtifactValid(symbol, policyHash)) {
      ctx.metrics.trainTicker.resume_skipped += 1;
      continue;
    }

    const inspected = inspectBarsFile(symbol);
    if (!inspected.valid || inspected.bars.length < TRAIN_MIN_HISTORY_DAYS) {
      ctx.metrics.trainTicker.skipped_insufficient_history += 1;
      addWarning(ctx, {
        code: 'INSUFFICIENT_HISTORY',
        sym: symbol,
        stage: 'TRAIN_TICKER',
        bars_count: inspected.bars.length,
        min_required: TRAIN_MIN_HISTORY_DAYS
      });
      await queueStatusWrite(ctx);
      continue;
    }

    const started = Date.now();
    try {
      await withTimeout(async () => {
        const stats = computeTickerTrainingStats(inspected.bars);
        const artifact = {
          schema: 'rv_forecast_ticker_model_v1',
          symbol,
          policy_hash: policyHash,
          trained_at: nowIso(),
          trainer: {
            type: 'deterministic_baseline_stats',
            determinism_env: DETERMINISTIC_ENV
          },
          bars: {
            first_date: inspected.bars[0].date,
            last_date: inspected.bars[inspected.bars.length - 1].date,
            count: inspected.bars.length
          },
          stats
        };

        const artifactPath = path.join(TICKER_MODEL_DIR, `${symbol}.json`);
        await writeJsonAtomic(artifactPath, artifact);
        await writeJsonAtomic(checkpointPath, {
          schema: 'rv_checkpoint_v1',
          stage: 'TRAIN_TICKER',
          sym: symbol,
          policy_hash: policyHash,
          artifact_path: path.relative(ROOT, artifactPath),
          trained_at: artifact.trained_at,
          bars_last_date: artifact.bars.last_date
        });
      }, TRAIN_TIMEOUT_MS, `Ticker training timed out for ${symbol}`);

      ctx.metrics.trainTicker.trained += 1;
      await mutateStatus(ctx, (status) => {
        status.progress.train_done = ctx.metrics.trainTicker.trained;
      });
      await queueEvent(ctx, {
        event: 'TRAIN_TICKER_OK',
        sym: symbol,
        ms: Date.now() - started
      });
    } catch (err) {
      ctx.metrics.trainTicker.failed += 1;
      if (ctx.metrics.trainTicker.failedTickers.length < 1000) {
        ctx.metrics.trainTicker.failedTickers.push(symbol);
      }

      const failure = {
        sym: symbol,
        stage: 'TRAIN_TICKER',
        http_status: null,
        error_class: toErrorClass(err),
        attempts: 1,
        message: err?.message ?? 'train_ticker_failure'
      };

      addFailure(ctx, failure);
      await queueEvent(ctx, {
        event: 'TRAIN_TICKER_FAIL',
        ...failure
      });
      await queueStatusWrite(ctx);
    }
  }

  await mutateStatus(ctx, (status) => {
    status.phase = 'TRAIN_TICKER_DONE';
    status.training = {
      trained_count: ctx.metrics.trainTicker.trained,
      skipped_insufficient_history: ctx.metrics.trainTicker.skipped_insufficient_history,
      failures_count: ctx.metrics.trainTicker.failed
    };
  });
}

function computeGlobalInputDigest(symbols, policyHash) {
  const records = [];
  for (const symbol of symbols) {
    const artifactPath = path.join(TICKER_MODEL_DIR, `${symbol}.json`);
    const artifact = readJsonSafe(artifactPath, null);
    if (!artifact || artifact.policy_hash !== policyHash) continue;
    records.push({
      symbol,
      bars_last_date: artifact?.bars?.last_date ?? null,
      bars_count: artifact?.bars?.count ?? null,
      mean_return_1d: artifact?.stats?.mean_return_1d ?? null,
      volatility_20d: artifact?.stats?.volatility_20d ?? null
    });
  }
  records.sort((a, b) => a.symbol.localeCompare(b.symbol));
  return {
    inputDigest: computeDigest({
      policy_hash: policyHash,
      records
    }),
    records
  };
}

function isGlobalArtifactValid(policyHash, inputDigest) {
  const artifact = readJsonSafe(GLOBAL_MODEL_PATH, null);
  if (!artifact || typeof artifact !== 'object') return false;
  if (artifact.schema !== 'rv_forecast_global_model_v1') return false;
  if (artifact.policy_hash !== policyHash) return false;
  if (artifact.input_digest !== inputDigest) return false;
  return true;
}

async function runGlobalTrainingPhase(ctx, symbols, policyHash) {
  await mutateStatus(ctx, (status) => {
    status.phase = 'TRAIN_GLOBAL_RUNNING';
  });

  const { inputDigest, records } = computeGlobalInputDigest(symbols, policyHash);
  const checkpoint = readJsonSafe(GLOBAL_CHECKPOINT_PATH, null);
  const checkpointMatches = checkpoint?.input_digest === inputDigest && checkpoint?.policy_hash === policyHash;

  if (!ctx.options.force && ctx.options.resume && checkpointMatches && isGlobalArtifactValid(policyHash, inputDigest)) {
    ctx.metrics.global.success = true;
    ctx.metrics.global.skipped = true;
    ctx.metrics.global.reason = 'checkpoint_valid';
    await mutateStatus(ctx, (status) => {
      status.progress.global_done = true;
      status.phase = 'TRAIN_GLOBAL_DONE';
    });
    return;
  }

  try {
    await fsp.mkdir(path.dirname(GLOBAL_MODEL_PATH), { recursive: true });
    const validRecords = records.filter((rec) => Number.isFinite(rec.mean_return_1d) && Number.isFinite(rec.volatility_20d));
    const meanReturn = validRecords.length > 0
      ? validRecords.reduce((sum, rec) => sum + rec.mean_return_1d, 0) / validRecords.length
      : null;
    const meanVol = validRecords.length > 0
      ? validRecords.reduce((sum, rec) => sum + rec.volatility_20d, 0) / validRecords.length
      : null;

    const artifact = {
      schema: 'rv_forecast_global_model_v1',
      trained_at: nowIso(),
      policy_hash: policyHash,
      input_digest: inputDigest,
      trainer: {
        type: 'deterministic_aggregate_stats',
        determinism_env: DETERMINISTIC_ENV
      },
      universe: {
        ticker_count: records.length
      },
      stats: {
        mean_return_1d: Number.isFinite(meanReturn) ? Number(meanReturn.toFixed(8)) : null,
        mean_volatility_20d: Number.isFinite(meanVol) ? Number(meanVol.toFixed(8)) : null
      }
    };

    await writeJsonAtomic(GLOBAL_MODEL_PATH, artifact);
    await writeJsonAtomic(GLOBAL_CHECKPOINT_PATH, {
      schema: 'rv_checkpoint_v1',
      stage: 'TRAIN_GLOBAL',
      trained_at: artifact.trained_at,
      policy_hash: policyHash,
      input_digest: inputDigest,
      artifact_path: path.relative(ROOT, GLOBAL_MODEL_PATH)
    });

    ctx.metrics.global.success = true;
    await queueEvent(ctx, {
      event: 'TRAIN_GLOBAL_OK',
      ticker_count: records.length
    });

    await mutateStatus(ctx, (status) => {
      status.progress.global_done = true;
      status.phase = 'TRAIN_GLOBAL_DONE';
    });
  } catch (err) {
    ctx.metrics.global.success = false;
    ctx.metrics.global.reason = err?.message ?? 'global_training_failed';
    addFailure(ctx, {
      stage: 'TRAIN_GLOBAL',
      sym: null,
      http_status: null,
      error_class: toErrorClass(err),
      attempts: 1,
      message: err?.message ?? 'global_training_failed'
    });
    await queueEvent(ctx, {
      event: 'TRAIN_GLOBAL_FAIL',
      message: err?.message ?? 'global_training_failed'
    });
    await queueStatusWrite(ctx);
    await mutateStatus(ctx, (status) => {
      status.phase = 'TRAIN_GLOBAL_DONE';
      status.progress.global_done = false;
    });
  }
}

async function runCommand(command, args, { timeoutMs = 20 * 60 * 1000, env = {} } = {}) {
  return new Promise((resolve) => {
    const child = spawn(command, args, {
      cwd: ROOT,
      stdio: 'inherit',
      env: {
        ...process.env,
        ...DETERMINISTIC_ENV,
        ...env
      }
    });

    let finished = false;
    const timer = setTimeout(() => {
      if (finished) return;
      finished = true;
      child.kill('SIGTERM');
      resolve({
        ok: false,
        code: null,
        signal: 'SIGTERM',
        timedOut: true
      });
    }, timeoutMs);

    child.on('error', (err) => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      resolve({
        ok: false,
        code: null,
        signal: null,
        timedOut: false,
        error: err
      });
    });

    child.on('close', (code, signal) => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      resolve({
        ok: code === 0,
        code,
        signal,
        timedOut: false
      });
    });
  });
}

function validateLatestArtifacts() {
  const latestExists = fs.existsSync(FORECAST_LATEST_PATH);
  let latestReportExists = false;

  if (latestExists) {
    try {
      const latest = JSON.parse(fs.readFileSync(FORECAST_LATEST_PATH, 'utf8'));
      const reportRef = latest?.data?.latest_report_ref;
      if (typeof reportRef === 'string' && reportRef.trim()) {
        const reportPath = path.join(ROOT, reportRef);
        latestReportExists = fs.existsSync(reportPath);
      }
    } catch {
      latestReportExists = false;
    }
  }

  return {
    latestExists,
    latestReportExists
  };
}

async function runForecastPhase(ctx, expectedLastTradingDay) {
  await mutateStatus(ctx, (status) => {
    status.phase = 'FORECAST_RUNNING';
  });

  const dailyResult = await runCommand('node', ['scripts/forecast/run_daily.mjs', `--date=${expectedLastTradingDay}`], {
    timeoutMs: 30 * 60 * 1000
  });
  if (!dailyResult.ok) {
    throw new RunError('FORECAST_RUN_FAILED', 'Daily forecast pipeline failed');
  }

  const contractCheck = validateLatestArtifacts();
  ctx.metrics.forecast.latest_exists = contractCheck.latestExists;
  ctx.metrics.forecast.latest_report_ref_exists = contractCheck.latestReportExists;
  if (!contractCheck.latestExists || !contractCheck.latestReportExists) {
    throw new RunError('FORECAST_CONTRACT_FAILED', 'latest.json or referenced latest_report_ref is missing');
  }

  const schemaValidation = await runCommand('npm', ['run', '-s', 'validate:forecast-schemas']);
  ctx.metrics.forecast.schemas_valid = schemaValidation.ok;
  if (!schemaValidation.ok) {
    throw new RunError('VALIDATE_SCHEMAS_FAILED', 'validate:forecast-schemas failed');
  }

  const registryValidation = await runCommand('npm', ['run', '-s', 'validate:forecast-registry']);
  ctx.metrics.forecast.registry_valid = registryValidation.ok;
  if (!registryValidation.ok) {
    throw new RunError('VALIDATE_REGISTRY_FAILED', 'validate:forecast-registry failed');
  }

  const determinismValidation = await runCommand('npm', ['run', '-s', 'test:determinism']);
  ctx.metrics.forecast.determinism_valid = determinismValidation.ok;
  if (!determinismValidation.ok) {
    throw new RunError('DETERMINISM_FAILED', 'test:determinism failed');
  }

  let uiResult = { ok: false };
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    ctx.metrics.forecast.ui_attempts = attempt;
    uiResult = await runCommand('npm', ['run', '-s', 'test:forecast-ui'], {
      timeoutMs: 10 * 60 * 1000
    });
    if (uiResult.ok) {
      ctx.metrics.forecast.ui_ok = true;
      break;
    }
    if (attempt < 3) {
      await sleep(5_000);
    }
  }

  if (!uiResult.ok) {
    ctx.metrics.forecast.ui_ok = false;
    addWarning(ctx, {
      code: 'UI_SMOKE_DEGRADED',
      stage: 'FORECAST',
      message: 'test:forecast-ui failed after 3 attempts',
      next_action: 'npm run -s test:forecast-ui'
    });
    await mutateStatus(ctx, (status) => {
      status.ui_status = 'DEGRADED';
    });
  } else {
    await mutateStatus(ctx, (status) => {
      status.ui_status = 'OK';
    });
  }

  await mutateStatus(ctx, (status) => {
    status.phase = 'FORECAST_DONE';
    status.forecast = {
      latest_exists: ctx.metrics.forecast.latest_exists,
      latest_report_ref_exists: ctx.metrics.forecast.latest_report_ref_exists,
      registry_valid: ctx.metrics.forecast.registry_valid,
      schemas_valid: ctx.metrics.forecast.schemas_valid,
      determinism_valid: ctx.metrics.forecast.determinism_valid,
      ui_ok: ctx.metrics.forecast.ui_ok,
      ui_attempts: ctx.metrics.forecast.ui_attempts
    };
  });
}

function topN(values, limit = 20) {
  return values.slice(0, limit);
}

function buildSummaryMarkdown(ctx, verdict, startedAt, endedAt) {
  const durationMs = Date.parse(endedAt) - Date.parse(startedAt);
  const durationMinutes = Number.isFinite(durationMs) ? Math.max(0, Math.round(durationMs / 60000)) : null;

  const barsFailed = topN(ctx.metrics.bars.failedTickers, 20);
  const trainFailed = topN(ctx.metrics.trainTicker.failedTickers, 20);

  const latestExists = ctx.metrics.forecast.latest_exists;
  const latestRefExists = ctx.metrics.forecast.latest_report_ref_exists;
  const registryValid = ctx.metrics.forecast.registry_valid;
  const schemasValid = ctx.metrics.forecast.schemas_valid;
  const determinismValid = ctx.metrics.forecast.determinism_valid;
  const uiOk = ctx.metrics.forecast.ui_ok;

  const lines = [];
  lines.push('# Overnight Forecast Run Summary');
  lines.push('');
  lines.push(`- run_id: \`${ctx.runId}\``);
  lines.push(`- head_sha: \`${ctx.headSha}\``);
  lines.push(`- started_at: ${startedAt}`);
  lines.push(`- ended_at: ${endedAt}`);
  lines.push(`- duration_minutes: ${durationMinutes ?? 'n/a'}`);
  lines.push(`- universe_count: ${ctx.status?.universe_count ?? 0}`);
  lines.push('');

  lines.push('## Bars Backfill');
  lines.push(`- done: ${ctx.metrics.bars.done}`);
  lines.push(`- failed: ${ctx.metrics.bars.failed}`);
  lines.push(`- missing_resolved: ${ctx.metrics.bars.missing_resolved}`);
  lines.push(`- stale_resolved: ${ctx.metrics.bars.stale_resolved}`);
  lines.push(`- fresh_skipped: ${ctx.metrics.bars.fresh_skipped}`);
  lines.push(`- resume_skipped: ${ctx.metrics.bars.resume_skipped}`);
  lines.push(`- failed_tickers_top20: ${barsFailed.length > 0 ? barsFailed.join(', ') : 'none'}`);
  lines.push('');

  lines.push('## Training (Per-Ticker)');
  lines.push(`- trained: ${ctx.metrics.trainTicker.trained}`);
  lines.push(`- skipped_insufficient_history: ${ctx.metrics.trainTicker.skipped_insufficient_history}`);
  lines.push(`- failed: ${ctx.metrics.trainTicker.failed}`);
  lines.push(`- resume_skipped: ${ctx.metrics.trainTicker.resume_skipped}`);
  lines.push(`- failed_tickers_top20: ${trainFailed.length > 0 ? trainFailed.join(', ') : 'none'}`);
  lines.push('');

  lines.push('## Training (Global)');
  lines.push(`- success: ${ctx.metrics.global.success}`);
  lines.push(`- skipped: ${ctx.metrics.global.skipped}`);
  lines.push(`- reason: ${ctx.metrics.global.reason ?? 'n/a'}`);
  lines.push('');

  lines.push('## Forecast Artifacts');
  lines.push(`- latest.json exists: ${latestExists}`);
  lines.push(`- latest_report_ref exists: ${latestRefExists}`);
  lines.push(`- registry valid: ${registryValid}`);
  lines.push('');

  lines.push('## Test Results');
  lines.push(`- validate:forecast-schemas: ${schemasValid ? 'PASS' : 'FAIL'}`);
  lines.push(`- validate:forecast-registry: ${registryValid ? 'PASS' : 'FAIL'}`);
  lines.push(`- test:determinism: ${determinismValid ? 'PASS' : 'FAIL'}`);
  lines.push(`- test:forecast-ui: ${uiOk ? 'PASS' : 'FAIL'}`);
  lines.push('');

  lines.push('## Next Actions');
  if (barsFailed.length > 0) {
    lines.push(`- Rerun bars for failed tickers: \`node scripts/forecast/run_overnight.mjs --phases=BARS --tickers=${barsFailed.join(',')}\``);
  }
  if (trainFailed.length > 0) {
    lines.push(`- Rerun per-ticker training for failed tickers: \`node scripts/forecast/run_overnight.mjs --phases=TRAIN_TICKER --tickers=${trainFailed.join(',')}\``);
  }
  if (!ctx.metrics.global.success) {
    lines.push('- Rerun global training: `node scripts/forecast/run_overnight.mjs --phases=TRAIN_GLOBAL`');
  }
  if (!uiOk) {
    lines.push('- Rerun UI smoke only: `npm run -s test:forecast-ui`');
  }
  if (barsFailed.length === 0 && trainFailed.length === 0 && ctx.metrics.global.success && uiOk) {
    lines.push('- None. Run completed without actionable failures.');
  }
  lines.push('');
  lines.push(verdict);
  lines.push('');

  return lines.join('\n');
}

async function finalizeRun(ctx, { failed, failureReason = null } = {}) {
  const endedAt = nowIso();
  const startedAt = ctx.status?.started_at ?? endedAt;

  let verdict = '✅ DONE';
  if (failed) {
    verdict = '❌ FAILED';
  } else if ((ctx.status?.ui_status ?? 'OK') === 'DEGRADED') {
    verdict = '✅ DONE (UI DEGRADED)';
  }

  if (ctx.status) {
    ctx.status.phase = failed ? 'FAILED' : 'DONE';
    ctx.status.ended_at = endedAt;
    if (!ctx.status.ui_status) {
      ctx.status.ui_status = 'OK';
    }
    if (failureReason) {
      addFailure(ctx, {
        stage: 'RUN',
        sym: null,
        http_status: null,
        error_class: 'FATAL',
        attempts: 1,
        message: failureReason
      });
    }
    await queueStatusWrite(ctx);
  }

  const summary = buildSummaryMarkdown(ctx, verdict, startedAt, endedAt);
  await writeTextAtomic(SUMMARY_PATH, summary);

  await queueEvent(ctx, {
    event: failed ? 'RUN_FAILED' : 'RUN_DONE',
    verdict
  });
  await ctx.eventWriteQueue;
  await ctx.statusWriteQueue;

  return verdict;
}

function filterTargetSymbols(universeSymbols, requestedTickers) {
  if (!requestedTickers || requestedTickers.length === 0) {
    return [...universeSymbols];
  }
  const requested = new Set(requestedTickers.map((v) => normalizeSymbol(v)));
  return universeSymbols.filter((sym) => requested.has(sym));
}

function loadPolicyHash() {
  const policy = readJsonSafe(POLICY_PATH, null);
  if (!policy) {
    throw new RunError('POLICY_MISSING', `Policy not found or invalid: ${POLICY_PATH}`);
  }
  return computeDigest(policy);
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const ctx = createContext(options);
  const limiter = new TokenBucketLimiter({
    maxInflight: options.maxInflight,
    ratePerSec: options.ratePerSec,
    bucketSize: options.bucketSize
  });

  let preflightCompleted = false;
  let fatalError = null;
  let verdict = '❌ FAILED';

  try {
    const universeSymbols = await runPreflight(ctx);
    preflightCompleted = true;

    ctx.expectedLastTradingDay = getExpectedLastTradingDay(new Date());
    await mutateStatus(ctx, (status) => {
      status.expected_last_trading_day = ctx.expectedLastTradingDay;
    });

    const targetSymbols = filterTargetSymbols(universeSymbols, options.tickers);
    if (targetSymbols.length === 0) {
      throw new RunError('NO_TARGET_TICKERS', 'No symbols matched --tickers filter');
    }

    const policyHash = loadPolicyHash();

    if (options.phases.has('BARS')) {
      await runBarsPhase(ctx, targetSymbols, ctx.expectedLastTradingDay, limiter);
    }
    if (options.phases.has('TRAIN_TICKER')) {
      await runTickerTrainingPhase(ctx, targetSymbols, policyHash);
    }
    if (options.phases.has('TRAIN_GLOBAL')) {
      await runGlobalTrainingPhase(ctx, targetSymbols, policyHash);
    }
    if (options.phases.has('FORECAST')) {
      await runForecastPhase(ctx, ctx.expectedLastTradingDay);
    }

    verdict = await finalizeRun(ctx, { failed: false });
  } catch (err) {
    fatalError = err;
    if (preflightCompleted) {
      const reason = `${err?.code ?? 'ERR'}: ${err?.message ?? 'run_failed'}`;
      verdict = await finalizeRun(ctx, { failed: true, failureReason: reason });
    }
  } finally {
    if (ctx.heartbeat) {
      clearInterval(ctx.heartbeat);
      ctx.heartbeat = null;
    }
    await releaseLock(ctx);
  }

  if (fatalError) {
    if (!preflightCompleted) {
      console.error(`Preflight failed: ${fatalError?.code ?? 'ERR'} ${fatalError?.message ?? ''}`);
      console.error(`Preflight evidence: ${PREFLIGHT_EVIDENCE_PATH}`);
    } else {
      console.error(`Run failed: ${fatalError?.code ?? 'ERR'} ${fatalError?.message ?? ''}`);
      console.error(`Status: ${STATUS_PATH}`);
      console.error(`Summary: ${SUMMARY_PATH}`);
      console.error(verdict);
    }
    process.exit(1);
  }

  console.log(`Status: ${STATUS_PATH}`);
  console.log(`Summary: ${SUMMARY_PATH}`);
  console.log(verdict);
}

main().catch(async (err) => {
  console.error(`Fatal orchestrator error: ${err?.message ?? err}`);
  process.exit(1);
});

