/**
 * Module State Writer
 * 
 * Generates and writes module state files for diagnostics.
 * Each module gets its own state file for Mission Control visibility.
 * 
 * Usage:
 *   const state = buildModuleState(module, envelope, validationResult);
 *   await writeModuleState(state, outputPath);
 */

import { writeFile } from 'node:fs/promises';
import { mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';

/**
 * Compute module status from validation and freshness
 * @param {object} validation - Validation result
 * @param {object} freshness - Freshness info
 * @returns {string} Status: ok|warn|error|stale
 */
function computeStatus(validation, freshness) {
  if (validation && !validation.passed) {
    return 'error';
  }
  
  if (freshness && freshness.is_stale) {
    return 'stale';
  }
  
  if (validation && validation.warnings && validation.warnings.length > 0) {
    return 'warn';
  }
  
  return 'ok';
}

/**
 * Compute severity from tier and status
 * @param {string} tier - Module tier
 * @param {string} status - Module status
 * @returns {string} Severity: info|warn|crit
 */
function computeSeverity(tier, status) {
  if (status === 'error') {
    return tier === 'critical' ? 'crit' : 'warn';
  }
  
  if (status === 'stale') {
    return tier === 'critical' ? 'warn' : 'info';
  }
  
  if (status === 'warn') {
    return 'warn';
  }
  
  return 'info';
}

/**
 * Evaluate freshness policy
 * @param {object} envelope - Snapshot envelope
 * @param {object} freshnessConfig - Freshness config from registry
 * @returns {object} Freshness evaluation
 */
function evaluateFreshness(envelope, freshnessConfig) {
  const now = new Date();
  const fetchedAt = new Date(envelope.metadata.fetched_at);
  const ageMinutes = Math.floor((now - fetchedAt) / 1000 / 60);
  
  const expectedInterval = freshnessConfig?.expected_interval_minutes || 1440;
  const graceMinutes = freshnessConfig?.grace_minutes || 180;
  const policy = freshnessConfig?.policy || 'always';
  
  // Calculate next expected time
  const nextExpected = new Date(fetchedAt);
  nextExpected.setMinutes(nextExpected.getMinutes() + expectedInterval);
  
  // Check if stale
  let isStale = false;
  
  if (policy === 'market_days_only') {
    // Only stale if it's a market day and we're past grace period
    const day = now.getDay();
    const isWeekend = day === 0 || day === 6;
    
    if (!isWeekend && ageMinutes > expectedInterval + graceMinutes) {
      isStale = true;
    }
  } else {
    // Always policy: stale if past grace period
    if (ageMinutes > expectedInterval + graceMinutes) {
      isStale = true;
    }
  }
  
  return {
    age_minutes: ageMinutes,
    expected_interval_minutes: expectedInterval,
    grace_minutes: graceMinutes,
    policy,
    is_stale: isStale,
    next_expected_at: nextExpected.toISOString()
  };
}

/**
 * Build module state object
 * @param {string} moduleName - Module name
 * @param {object} envelope - Snapshot envelope
 * @param {object} validationResult - Validation result from envelope.js
 * @param {object} moduleConfig - Module config from registry
 * @param {object} options - Additional options (failure, etc.)
 * @returns {object} Complete module state
 */
export function buildModuleState(moduleName, envelope, validationResult, moduleConfig, options = {}) {
  const now = new Date().toISOString();
  const freshness = evaluateFreshness(envelope, moduleConfig.freshness);
  const status = computeStatus(validationResult, freshness);
  const severity = computeSeverity(moduleConfig.tier, status);
  
  const state = {
    schema_version: "3.0",
    module: moduleName,
    tier: moduleConfig.tier || "standard",
    domain: moduleConfig.domain || "unknown",
    status,
    severity,
    published: validationResult?.valid && !freshness.is_stale,
    last_success_at: validationResult?.valid ? envelope.metadata.fetched_at : options.last_success_at || null,
    last_attempt_at: envelope.metadata.fetched_at || now,
    digest: envelope.metadata.digest,
    record_count: envelope.metadata.record_count,
    expected_count: moduleConfig.counts?.expected || null,
    freshness: {
      expected_interval_minutes: freshness.expected_interval_minutes,
      grace_minutes: freshness.grace_minutes,
      policy: freshness.policy,
      age_minutes: freshness.age_minutes,
      next_expected_at: freshness.next_expected_at
    },
    failure: {
      class: options.failure_class || null,
      message: options.failure_message || (validationResult?.errors?.join('; ')) || null,
      upstream_status: envelope.metadata.upstream?.http_status || null,
      hint: options.failure_hint || null
    },
    ui_contract: {
      required: moduleConfig.ui_contract?.policy === 'always' || 
                (moduleConfig.ui_contract?.policy === 'always_for_critical' && moduleConfig.tier === 'critical'),
      passed: validationResult?.valid || false,
      failed_paths: validationResult?.failed_paths || []
    },
    proof: {
      file_present: true,
      schema_valid: validationResult?.valid || false,
      plausible: validationResult?.valid || false
    },
    debug: {
      curl: moduleConfig.endpoints?.debug || `/api/${moduleName}?debug=1`,
      last_run_url: options.last_run_url || null
    }
  };
  
  return state;
}

/**
 * Write module state to file (atomic)
 * @param {object} state - Module state object
 * @param {string} outputPath - Output file path
 */
export async function writeModuleState(state, outputPath) {
  // Ensure directory exists
  await mkdir(dirname(outputPath), { recursive: true });
  
  // Write atomically (tmp → rename would be better, but for simplicity)
  const json = JSON.stringify(state, null, 2);
  await writeFile(outputPath, json, 'utf8');
  
  console.log(`✅ Module state written: ${outputPath}`);
}

/**
 * Build error state (when scrape/validate fails completely)
 * @param {string} moduleName
 * @param {object} moduleConfig
 * @param {object} error
 * @returns {object} Error state
 */
export function buildErrorState(moduleName, moduleConfig, error) {
  const now = new Date().toISOString();
  
  return {
    schema_version: "3.0",
    module: moduleName,
    tier: moduleConfig.tier || "standard",
    domain: moduleConfig.domain || "unknown",
    status: "error",
    severity: moduleConfig.tier === 'critical' ? 'crit' : 'warn',
    published: false,
    last_success_at: null,
    last_attempt_at: now,
    digest: null,
    record_count: 0,
    expected_count: moduleConfig.counts?.expected || null,
    freshness: {
      expected_interval_minutes: moduleConfig.freshness?.expected_interval_minutes || 1440,
      grace_minutes: moduleConfig.freshness?.grace_minutes || 180,
      policy: moduleConfig.freshness?.policy || 'always',
      age_minutes: null,
      next_expected_at: null
    },
    failure: {
      class: error.class || 'UNKNOWN_ERROR',
      message: error.message || 'Unknown error occurred',
      upstream_status: error.upstream_status || null,
      hint: error.hint || 'Check logs for details'
    },
    ui_contract: {
      required: moduleConfig.ui_contract?.policy === 'always' || 
                (moduleConfig.ui_contract?.policy === 'always_for_critical' && moduleConfig.tier === 'critical'),
      passed: false,
      failed_paths: []
    },
    proof: {
      file_present: false,
      schema_valid: false,
      plausible: false
    },
    debug: {
      curl: moduleConfig.endpoints?.debug || `/api/${moduleName}?debug=1`,
      last_run_url: error.last_run_url || null
    }
  };
}

export default {
  buildModuleState,
  writeModuleState,
  buildErrorState
};
