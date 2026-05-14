#!/usr/bin/env node
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = path.resolve(fileURLToPath(new URL('../..', import.meta.url)));
const PUBLIC_BREAKOUT_ROOT = path.join(REPO_ROOT, 'public/data/breakout');
const DEFAULT_STATUS_PATH = path.join(PUBLIC_BREAKOUT_ROOT, 'status.json');
const DEFAULT_RUNTIME_ROOT = process.env.NAS_RUNTIME_ROOT
  || (process.env.OPS_ROOT ? path.join(process.env.OPS_ROOT, 'runtime') : '')
  || path.join(REPO_ROOT, 'runtime');
const DEFAULT_RUNTIME_STATUS_PATH = path.join(DEFAULT_RUNTIME_ROOT, 'breakout-v12/status.json');
const DEFAULT_LOCK_PATH = path.join(DEFAULT_RUNTIME_ROOT, 'breakout-v12/breakout_v12.lock');

function parseArgs(argv) {
  const args = {
    asOf: process.env.RV_TARGET_MARKET_DATE || process.env.TARGET_MARKET_DATE || '',
    maxAssets: process.env.RV_BREAKOUT_MAX_ASSETS || '',
    statusOut: process.env.RV_BREAKOUT_STATUS_OUT || DEFAULT_STATUS_PATH,
    runtimeStatusOut: process.env.RV_BREAKOUT_RUNTIME_STATUS_OUT || DEFAULT_RUNTIME_STATUS_PATH,
    lockPath: process.env.RV_BREAKOUT_V12_LOCK || DEFAULT_LOCK_PATH,
    pythonBin: process.env.RV_BREAKOUT_PYTHON_BIN || '',
    publicRoot: process.env.RV_BREAKOUT_PUBLIC_ROOT || PUBLIC_BREAKOUT_ROOT,
    allowLegacyFullCompute: process.env.RV_BREAKOUT_V12_LEGACY_FULL_COMPUTE === '1',
  };
  for (const arg of argv) {
    if (arg === '--allow-legacy-full-compute') args.allowLegacyFullCompute = true;
    else if (arg.startsWith('--as-of=')) args.asOf = arg.split('=')[1] || '';
    else if (arg.startsWith('--date=')) args.asOf = arg.split('=')[1] || '';
    else if (arg.startsWith('--max-assets=')) args.maxAssets = arg.split('=')[1] || '';
    else if (arg.startsWith('--status-out=')) args.statusOut = arg.split('=')[1] || '';
    else if (arg.startsWith('--runtime-status-out=')) args.runtimeStatusOut = arg.split('=')[1] || '';
    else if (arg.startsWith('--lock-path=')) args.lockPath = arg.split('=')[1] || '';
    else if (arg.startsWith('--python-bin=')) args.pythonBin = arg.split('=')[1] || '';
    else if (arg.startsWith('--public-root=')) args.publicRoot = arg.split('=')[1] || args.publicRoot;
  }
  args.publicRoot = path.resolve(args.publicRoot);
  return args;
}

function atomicWriteJson(filePath, payload) {
  if (!filePath) return;
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const tmp = path.join(path.dirname(filePath), `.${path.basename(filePath)}.${process.pid}.${crypto.randomUUID()}.tmp`);
  fs.writeFileSync(tmp, `${JSON.stringify(payload, null, 2)}\n`);
  fs.renameSync(tmp, filePath);
}

function writeStatuses(args, payload) {
  const status = {
    schema_version: 'breakout_v12_nightly_status_v1',
    generated_at: new Date().toISOString(),
    feature: 'breakout_v12',
    mode: 'nightly_safe',
    ...payload,
  };
  atomicWriteJson(args.statusOut, status);
  atomicWriteJson(args.runtimeStatusOut, status);
  return status;
}

function isPidRunning(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error?.code === 'EPERM';
  }
}

function checkLock(lockPath) {
  if (!lockPath || !fs.existsSync(lockPath)) {
    return { ok: true, path: lockPath || null, active: false };
  }
  try {
    const lock = JSON.parse(fs.readFileSync(lockPath, 'utf8'));
    const pid = Number.parseInt(lock.pid, 10);
    const active = isPidRunning(pid);
    return { ok: !active, path: lockPath, active, pid: Number.isFinite(pid) ? pid : null, lock };
  } catch (error) {
    return { ok: false, path: lockPath, active: true, error: String(error?.message || error) };
  }
}

function writeLock(lockPath, args) {
  if (!lockPath) return;
  atomicWriteJson(lockPath, {
    run_id: `breakout_v12_safe_${new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14)}`,
    pid: process.pid,
    started_at: new Date().toISOString(),
    mode: args.allowLegacyFullCompute ? 'legacy_full_compute_manual' : 'nightly_safe_degraded',
    as_of: args.asOf || null,
  });
}

function removeLock(lockPath) {
  if (!lockPath || !fs.existsSync(lockPath)) return;
  try {
    const lock = JSON.parse(fs.readFileSync(lockPath, 'utf8'));
    if (Number.parseInt(lock.pid, 10) === process.pid) fs.rmSync(lockPath, { force: true });
  } catch {
    fs.rmSync(lockPath, { force: true });
  }
}

function memAvailableMb() {
  try {
    const raw = fs.readFileSync('/proc/meminfo', 'utf8');
    const match = raw.match(/^MemAvailable:\s+(\d+)\s+kB/m);
    if (match) return Math.round(Number(match[1]) / 1024);
  } catch {
    // macOS/dev fallback below.
  }
  return Math.round(os.freemem() / 1024 / 1024);
}

function moduleCheck(pythonBin, modules) {
  const code = [
    'import importlib, json, sys',
    'mods = sys.argv[1:]',
    'missing = []',
    'for name in mods:',
    '    try:',
    '        importlib.import_module(name)',
    '    except Exception as exc:',
    '        missing.append({"module": name, "error": str(exc)})',
    'print(json.dumps({"ok": not missing, "missing": missing}))',
    'raise SystemExit(0 if not missing else 1)',
  ].join('\n');
  const res = spawnSync(pythonBin, ['-c', code, ...modules], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env },
  });
  let detail = {};
  try {
    detail = JSON.parse(String(res.stdout || '').trim() || '{}');
  } catch {
    detail = {};
  }
  return {
    ok: res.status === 0,
    python_bin: pythonBin,
    required_modules: modules,
    exit_status: res.status,
    error: res.error ? String(res.error.message || res.error) : String(res.stderr || '').trim(),
    ...detail,
  };
}

function candidatePythonBins(explicit) {
  if (explicit) return [explicit];
  return [
    process.env.RV_Q1_PYTHON_BIN,
    process.env.PYTHON,
    'python3',
  ].filter(Boolean);
}

function resolvePython(explicit) {
  const modules = ['polars', 'pyarrow', 'duckdb'];
  const attempts = [];
  for (const candidate of candidatePythonBins(explicit)) {
    const check = moduleCheck(candidate, modules);
    attempts.push(check);
    if (check.ok) return { ok: true, python_bin: candidate, modules, attempts };
    if (explicit) break;
  }
  return { ok: false, python_bin: explicit || candidatePythonBins('')[0] || 'python3', modules, attempts };
}

function basePayload(args, checks = {}) {
  return {
    as_of: args.asOf || null,
    latest_unchanged: true,
    artifacts: {
      latest_manifest: 'public/data/breakout/manifests/latest.json',
      last_good_manifest: 'public/data/breakout/manifests/last_good.json',
      status: path.relative(REPO_ROOT, args.statusOut).split(path.sep).join('/'),
      runtime_status: path.isAbsolute(args.runtimeStatusOut)
        ? args.runtimeStatusOut
        : path.relative(REPO_ROOT, args.runtimeStatusOut).split(path.sep).join('/'),
    },
    config: {
      legacy_full_compute_allowed: Boolean(args.allowLegacyFullCompute),
      min_free_memory_mb: Number.parseInt(process.env.RV_BREAKOUT_MIN_FREE_MB || '5000', 10),
      soft_rss_warn_mb: Number.parseInt(process.env.RV_BREAKOUT_SOFT_RSS_WARN_MB || '3500', 10),
      hard_rss_fail_mb: Number.parseInt(process.env.RV_BREAKOUT_HARD_RSS_FAIL_MB || '5000', 10),
      polars_max_threads: process.env.POLARS_MAX_THREADS || '2',
      duckdb_threads: process.env.DUCKDB_THREADS || '2',
      omp_num_threads: process.env.OMP_NUM_THREADS || '2',
    },
    checks,
  };
}

function latestPublishedForAsOf(asOf, publicRoot) {
  if (!asOf) return { ok: false, reason: 'as_of_missing' };
  const manifestPath = path.join(publicRoot, 'manifests/latest.json');
  try {
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    const top500 = manifest?.files?.top500 ? path.join(publicRoot, manifest.files.top500) : '';
    const requireFullState = process.env.RV_BREAKOUT_REQUIRE_FULL_STATE !== '0';
    const baseOk = manifest?.as_of === asOf
      && manifest?.validation?.publishable === true
      && Boolean(top500)
      && fs.existsSync(top500);
    const details = {
      full_state_required: requireFullState,
      full_state_contract: false,
      all_scored_exists: false,
      all_scored_count: 0,
      state_summary_exists: false,
      state_counts_ready: false,
      top500_count: 0,
      top500_state_fields_ready: false,
    };
    if (baseOk) {
      const topJson = JSON.parse(fs.readFileSync(top500, 'utf8'));
      details.top500_count = Array.isArray(topJson?.items) ? topJson.items.length : Number(topJson?.count || 0);
      const first = Array.isArray(topJson?.items) ? topJson.items[0] : null;
      details.top500_state_fields_ready = Boolean(first)
        && ['asset_id', 'display_ticker', 'breakout_status', 'legacy_state', 'support_zone', 'invalidation']
          .every((key) => Object.hasOwn(first, key));

      const allScoredPath = manifest?.files?.all_scored ? path.join(publicRoot, manifest.files.all_scored) : '';
      const stateSummaryPath = manifest?.files?.state_summary ? path.join(publicRoot, manifest.files.state_summary) : '';
      details.all_scored_exists = Boolean(allScoredPath && fs.existsSync(allScoredPath));
      details.state_summary_exists = Boolean(stateSummaryPath && fs.existsSync(stateSummaryPath));
      const allScored = details.all_scored_exists ? JSON.parse(fs.readFileSync(allScoredPath, 'utf8')) : null;
      const stateSummary = details.state_summary_exists ? JSON.parse(fs.readFileSync(stateSummaryPath, 'utf8')) : null;
      details.all_scored_count = Array.isArray(allScored?.items) ? allScored.items.length : Number(allScored?.count || 0);
      details.full_state_contract = stateSummary?.contract_mode === 'full_state_distribution'
        && stateSummary?.full_state_distribution_available === true
        && stateSummary?.candidate_rank_only !== true;
      details.state_counts_ready = ['SCANNED', 'SETUP', 'ARMED', 'TRIGGERED', 'CONFIRMED', 'FAILED']
        .every((key) => Number.isFinite(Number(stateSummary?.counts?.[key])));
    }
    const fullStateOk = details.top500_count === 500
      && details.top500_state_fields_ready
      && details.all_scored_count > 0
      && details.full_state_contract
      && details.state_counts_ready;
    const ok = baseOk && (!requireFullState || fullStateOk);
    return {
      ok,
      reason: ok ? 'already_promoted' : (baseOk && requireFullState ? 'latest_contract_not_full_state' : 'latest_not_matching'),
      manifest_path: manifestPath,
      as_of: manifest?.as_of || null,
      content_hash: manifest?.content_hash || null,
      top500_exists: Boolean(top500 && fs.existsSync(top500)),
      ...details,
      publishable: manifest?.validation?.publishable === true,
    };
  } catch (error) {
    return { ok: false, reason: 'latest_missing_or_invalid', manifest_path: manifestPath, error: String(error?.message || error) };
  }
}

function writeDegraded(args, reason, checks = {}, extra = {}) {
  const status = writeStatuses(args, {
    ...basePayload(args, checks),
    status: 'degraded',
    reason,
    ...extra,
  });
  console.log(`BREAKOUT_V12_DEGRADED reason=${reason} latest_unchanged=true`);
  return status;
}

function runLegacyFullCompute(args, pythonBin) {
  const childArgs = ['scripts/breakout/run-breakout-pipeline.mjs'];
  if (args.asOf) childArgs.push(`--as-of=${args.asOf}`);
  if (args.maxAssets) childArgs.push(`--max-assets=${args.maxAssets}`);
  if (process.env.RV_BREAKOUT_SCOPE_FILE) childArgs.push(`--scope-file=${process.env.RV_BREAKOUT_SCOPE_FILE}`);
  const env = {
    ...process.env,
    RV_BREAKOUT_PYTHON_BIN: pythonBin,
    POLARS_MAX_THREADS: process.env.POLARS_MAX_THREADS || '2',
    OMP_NUM_THREADS: process.env.OMP_NUM_THREADS || '2',
    DUCKDB_THREADS: process.env.DUCKDB_THREADS || '2',
  };
  return spawnSync(process.execPath, childArgs, {
    cwd: REPO_ROOT,
    stdio: 'inherit',
    env,
  });
}

function runIncrementalCatchup(args, pythonBin) {
  const childArgs = ['scripts/breakout-v12/catchup-daily.mjs'];
  if (args.asOf) childArgs.push(`--as-of=${args.asOf}`);
  if (process.env.QUANT_ROOT) childArgs.push(`--quant-root=${process.env.QUANT_ROOT}`);
  if (process.env.RV_BREAKOUT_DAILY_DELTA_ROOT) childArgs.push(`--daily-delta-root=${process.env.RV_BREAKOUT_DAILY_DELTA_ROOT}`);
  if (process.env.RV_BREAKOUT_Q1_DELTA_MANIFEST) childArgs.push(`--delta-manifest=${process.env.RV_BREAKOUT_Q1_DELTA_MANIFEST}`);
  if (process.env.RV_BREAKOUT_LAST_GOOD_ROOT) childArgs.push(`--last-good-root=${process.env.RV_BREAKOUT_LAST_GOOD_ROOT}`);
  childArgs.push(`--public-root=${args.publicRoot}`);
  if (process.env.RV_BREAKOUT_BUCKET_COUNT) childArgs.push(`--bucket-count=${process.env.RV_BREAKOUT_BUCKET_COUNT}`);
  if (process.env.RV_BREAKOUT_TAIL_BARS) childArgs.push(`--tail-bars=${process.env.RV_BREAKOUT_TAIL_BARS}`);
  childArgs.push(`--python-bin=${pythonBin}`);
  const env = {
    ...process.env,
    RV_BREAKOUT_PYTHON_BIN: pythonBin,
    POLARS_MAX_THREADS: process.env.POLARS_MAX_THREADS || '2',
    OMP_NUM_THREADS: process.env.OMP_NUM_THREADS || '2',
    DUCKDB_THREADS: process.env.DUCKDB_THREADS || '2',
  };
  return spawnSync(process.execPath, childArgs, {
    cwd: REPO_ROOT,
    stdio: 'inherit',
    env,
  });
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  try {
    if (process.env.RV_BREAKOUT_V12_DISABLED === '1') {
      writeDegraded(args, 'disabled_by_env');
      return 0;
    }

    const lock = checkLock(args.lockPath);
    if (!lock.ok) {
      writeDegraded(args, 'lock_conflict', { lock });
      return 0;
    }

    const dependency = resolvePython(args.pythonBin);
    if (!dependency.ok) {
      writeDegraded(args, 'dependency_missing', { lock, dependency });
      return 0;
    }

    const availableMb = memAvailableMb();
    const minFreeMb = Number.parseInt(process.env.RV_BREAKOUT_MIN_FREE_MB || '5000', 10);
    const memory = { ok: availableMb >= minFreeMb, available_mb: availableMb, min_free_mb: minFreeMb };
    if (!memory.ok) {
      writeDegraded(args, 'memory_guard', { lock, dependency, memory });
      return 0;
    }

    const latest = latestPublishedForAsOf(args.asOf, args.publicRoot);
    if (latest.ok) {
      writeStatuses(args, {
        ...basePayload(args, { lock, dependency, memory, latest }),
        status: 'ok',
        reason: 'already_promoted',
        latest_unchanged: true,
      });
      console.log('BREAKOUT_V12_SAFE_OK reason=already_promoted latest_unchanged=true');
      return 0;
    }

    if (process.env.RV_BREAKOUT_V12_INCREMENTAL_ENABLED !== '0') {
      const incremental = runIncrementalCatchup(args, dependency.python_bin);
      if (incremental.status === 0) {
        writeStatuses(args, {
          ...basePayload(args, { lock, dependency, memory }),
          status: 'ok',
          reason: 'incremental_daily_promoted',
          latest_unchanged: false,
        });
        console.log('BREAKOUT_V12_SAFE_OK reason=incremental_daily_promoted latest_unchanged=false');
        return 0;
      }
      if (!args.allowLegacyFullCompute) {
        writeDegraded(args, 'incremental_daily_failed', { lock, dependency, memory }, {
          child_exit_status: incremental.status,
          child_signal: incremental.signal || null,
        });
        return 0;
      }
    }

    if (!args.allowLegacyFullCompute) {
      writeDegraded(args, 'legacy_full_compute_disabled_until_incremental_ready', { lock, dependency, memory });
      return 0;
    }

    writeLock(args.lockPath, args);
    try {
      const result = runLegacyFullCompute(args, dependency.python_bin);
      if (result.status !== 0) {
        writeDegraded(args, 'legacy_full_compute_failed', { lock, dependency, memory }, {
          child_exit_status: result.status,
          child_signal: result.signal || null,
        });
        return 0;
      }
      writeStatuses(args, {
        ...basePayload(args, { lock, dependency, memory }),
        status: 'ok',
        reason: 'legacy_full_compute_published',
        latest_unchanged: false,
      });
      console.log('BREAKOUT_V12_SAFE_OK reason=legacy_full_compute_published latest_unchanged=false');
      return 0;
    } finally {
      removeLock(args.lockPath);
    }
  } catch (error) {
    try {
      writeDegraded(args, 'safe_wrapper_exception', {}, { error: String(error?.stack || error?.message || error) });
    } catch (writeError) {
      console.error(`BREAKOUT_V12_SAFE_WRAPPER_EXCEPTION ${String(error?.message || error)}`);
      console.error(`BREAKOUT_V12_STATUS_WRITE_FAILED ${String(writeError?.message || writeError)}`);
    }
    return 0;
  }
}

process.exitCode = main();
