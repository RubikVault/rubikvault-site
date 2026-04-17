import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { writeJsonDurableAtomicSync } from '../lib/durable-atomic-write.mjs';

const ROOT = path.resolve(new URL('.', import.meta.url).pathname, '../..');
const AUDIT_PATH = path.join(ROOT, 'public/data/ops/prod-runtime-guard-audit-latest.json');

function nowIso() {
  return new Date().toISOString();
}

function appendAuditEvent(event) {
  const payload = {
    schema: 'rv.prod_runtime_guard_audit.v1',
    generated_at: nowIso(),
    host: os.hostname(),
    platform: process.platform,
    events: [event],
  };
  try {
    writeJsonDurableAtomicSync(AUDIT_PATH, payload);
  } catch {
    // Guard audit must not mask the original runtime decision.
  }
}

export function assertProductionRuntime({
  job = 'unknown',
  allowLocalTruthWrite = false,
  env = process.env,
  platform = process.platform,
  exitOnFailure = false,
} = {}) {
  const mode = String(env.RV_MODE || env.NODE_ENV || '').toLowerCase();
  const productionMode = mode === 'production';
  const maintenanceMode = mode === 'maintenance';
  const runtime = String(env.RV_PRODUCTION_RUNTIME || '').toLowerCase();
  const nasRequired = env.RV_REQUIRE_NAS_FOR_RELEASE === '1';
  const localTruthOverride = env.RV_ALLOW_LOCAL_TRUTH_WRITE === '1' || allowLocalTruthWrite === true;
  const failures = [];
  const warnings = [];

  if (productionMode) {
    if (platform !== 'linux') failures.push('mac_prod_blocked');
    if (runtime !== 'nas') failures.push('nas_required_unmet');
    if (!nasRequired) failures.push('nas_required_unmet');
  }

  if (maintenanceMode && platform === 'darwin' && localTruthOverride) {
    warnings.push('local_truth_write_override');
    appendAuditEvent({
      kind: 'override',
      job,
      mode,
      platform,
      runtime,
      generated_at: nowIso(),
      reason: 'RV_ALLOW_LOCAL_TRUTH_WRITE',
    });
  }

  const result = {
    ok: failures.length === 0,
    mode: productionMode ? 'production' : maintenanceMode ? 'maintenance' : (mode || 'development'),
    job,
    platform,
    runtime,
    nas_required_for_release: nasRequired,
    failures,
    warnings,
  };

  if (!result.ok && exitOnFailure) {
    console.error(`[RV prod guard] ${job} blocked: ${failures.join(', ')}`);
    process.exitCode = 78;
    throw Object.assign(new Error(`RV_PROD_RUNTIME_BLOCKED:${failures.join(',')}`), { result });
  }
  return result;
}

export function assertMayWriteProductionTruth(options = {}) {
  const result = assertProductionRuntime(options);
  const mode = result.mode;
  const localTruthOverride = process.env.RV_ALLOW_LOCAL_TRUTH_WRITE === '1' || options.allowLocalTruthWrite === true;
  if (mode === 'maintenance' && process.platform === 'darwin' && !localTruthOverride) {
    return {
      ...result,
      ok: false,
      failures: [...result.failures, 'mac_prod_blocked'],
    };
  }
  return result;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const job = process.argv.find((arg) => arg.startsWith('--job='))?.split('=')[1] || 'manual';
  const result = assertProductionRuntime({ job });
  if (!result.ok) process.exitCode = 78;
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}
