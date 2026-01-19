/**
 * Envelope Library - v3.0 Snapshot Envelope
 * 
 * Provides:
 * - Envelope builder (wrap data with metadata)
 * - Envelope validator (schema validation)
 * - Contract checker (UI contract, plausibility)
 * 
 * Usage:
 *   const envelope = buildEnvelope(data, metadata);
 *   const valid = validateEnvelope(envelope, registry);
 */

import { computeSnapshotDigest } from './digest.js';

/**
 * Build v3.0 snapshot envelope
 * Supports two call styles for backward compatibility:
 * 1. buildEnvelope(data, metadata) - New style (two params)
 * 2. buildEnvelope({ module, data, ... }) - Legacy style (single object)
 * 
 * @param {array|object} dataOrOptions - Data array OR options object
 * @param {object} metadata - Metadata fields (only for new style)
 * @returns {object} Complete envelope
 */
export function buildEnvelope(dataOrOptions, metadata) {
  const now = new Date().toISOString();
  
  // Detect call style
  let data, meta;
  if (metadata === undefined && typeof dataOrOptions === 'object' && !Array.isArray(dataOrOptions) && dataOrOptions.data) {
    // Legacy style: buildEnvelope({ module, data, ... })
    meta = dataOrOptions;
    data = meta.data;
  } else {
    // New style: buildEnvelope(data, metadata)
    data = dataOrOptions;
    meta = metadata || {};
  }
  
  const envelope = {
    schema_version: "3.0",
    metadata: {
      module: meta.module || "unknown",
      tier: meta.tier || "standard",
      domain: meta.domain || "unknown",
      source: meta.source || "unknown",
      fetched_at: (meta.fetchedAt instanceof Date ? meta.fetchedAt.toISOString() : meta.fetched_at) || now,
      published_at: (meta.publishedAt instanceof Date ? meta.publishedAt.toISOString() : meta.published_at) || now,
      digest: null, // Will be computed below
      record_count: Array.isArray(data) ? data.length : 0,
      expected_count: meta.expected_count || null,
      validation: {
        passed: meta.validation?.passed ?? true,
        dropped_records: meta.validation?.dropped_records ?? 0,
        drop_ratio: meta.validation?.drop_ratio ?? 0,
        checks: meta.validation?.checks ?? [],
        warnings: meta.validation?.warnings ?? []
      },
      freshness: {
        expected_interval_minutes: meta.freshness?.expected_interval_minutes || 1440,
        grace_minutes: meta.freshness?.grace_minutes || 180,
        policy: meta.freshness?.policy || "always",
        age_minutes: meta.freshness?.age_minutes || 0,
        next_expected_at: meta.freshness?.next_expected_at || null
      },
      upstream: {
        http_status: meta.upstream?.http_status || null,
        latency_ms: meta.upstream?.latency_ms || null,
        rate_limit_remaining: meta.upstream?.rate_limit_remaining || null,
        retry_count: meta.upstream?.retry_count || 0
      }
    },
    data: Array.isArray(data) ? data : [data],
    error: meta.error || null
  };
  
  // Compute digest
  envelope.metadata.digest = computeSnapshotDigest(envelope);
  
  return envelope;
}

/**
 * Validate envelope schema (v3.0)
 * @param {object} envelope - Envelope to validate
 * @returns {object} { valid: boolean, errors: string[] }
 */
export function validateEnvelopeSchema(envelope) {
  const errors = [];
  
  // Required top-level fields
  if (!envelope.schema_version) errors.push("Missing schema_version");
  if (envelope.schema_version !== "3.0") errors.push(`Invalid schema_version: ${envelope.schema_version}, expected 3.0`);
  if (!envelope.metadata) errors.push("Missing metadata");
  if (!Array.isArray(envelope.data)) errors.push("data must be an array");
  
  // Required metadata fields
  if (envelope.metadata) {
    const m = envelope.metadata;
    if (!m.module) errors.push("Missing metadata.module");
    if (!m.tier) errors.push("Missing metadata.tier");
    if (!m.source) errors.push("Missing metadata.source");
    if (!m.fetched_at) errors.push("Missing metadata.fetched_at");
    if (!m.digest) errors.push("Missing metadata.digest");
    
    // Validate timestamps
    if (m.fetched_at) {
      try {
        const fetchedDate = new Date(m.fetched_at);
        if (isNaN(fetchedDate.getTime())) {
          errors.push("Invalid fetched_at timestamp");
        }
      } catch (e) {
        errors.push(`Invalid fetched_at: ${e.message}`);
      }
    }
    
    // Validation object required
    if (!m.validation) {
      errors.push("Missing metadata.validation");
    } else {
      if (typeof m.validation.passed !== 'boolean') {
        errors.push("validation.passed must be boolean");
      }
    }
  }
  
  return {
    valid: errors.length === 0,
    errors
  };
}

/**
 * Evaluate JSONPath-like path on object
 * @param {object} obj - Object to evaluate
 * @param {string} path - Path like "$.data[0].close"
 * @returns {array} Array of values found
 */
function evaluatePath(obj, path) {
  // Simple JSONPath evaluator
  // Handles: $.data[0].field, $.data[*].field
  
  const parts = path.replace(/^\$\./, '').split('.');
  let current = [obj];
  
  for (const part of parts) {
    const next = [];
    
    for (const item of current) {
      if (!item) continue;
      
      // Handle array indexing: field[0] or field[*]
      const match = part.match(/^(\w+)(?:\[(\d+|\*)\])?$/);
      if (!match) continue;
      
      const [, key, index] = match;
      const value = item[key];
      
      if (index === '*' && Array.isArray(value)) {
        next.push(...value);
      } else if (index !== undefined && Array.isArray(value)) {
        const idx = parseInt(index, 10);
        if (value[idx] !== undefined) {
          next.push(value[idx]);
        }
      } else {
        next.push(value);
      }
    }
    
    current = next;
  }
  
  return current.filter(v => v !== undefined);
}

/**
 * Check plausibility rules
 * @param {object} envelope - Envelope to check
 * @param {array} rules - Plausibility rules from registry
 * @returns {object} { passed: boolean, errors: string[] }
 */
export function checkPlausibility(envelope, rules) {
  if (!rules || rules.length === 0) {
    return { passed: true, errors: [] };
  }
  
  const errors = [];
  
  for (const rule of rules) {
    const values = evaluatePath(envelope, rule.path);
    
    for (const value of values) {
      // Check for null/undefined
      if (value === null || value === undefined) {
        if (!rule.allow_null) {
          errors.push(`Plausibility fail: ${rule.path} is null/undefined`);
        }
        continue;
      }
      
      // Check min/max
      const num = parseFloat(value);
      if (isNaN(num)) {
        errors.push(`Plausibility fail: ${rule.path} is NaN (${value})`);
        continue;
      }
      
      if (rule.min !== undefined && num < rule.min) {
        errors.push(`Plausibility fail: ${rule.path} = ${num} < min ${rule.min}`);
      }
      
      if (rule.max !== undefined && num > rule.max) {
        errors.push(`Plausibility fail: ${rule.path} = ${num} > max ${rule.max}`);
      }
    }
  }
  
  return {
    passed: errors.length === 0,
    errors
  };
}

/**
 * Check UI contract (required paths exist)
 * @param {object} envelope - Envelope to check
 * @param {array} requiredPaths - Required JSONPath expressions
 * @returns {object} { passed: boolean, failed_paths: string[] }
 */
export function checkUIContract(envelope, requiredPaths) {
  if (!requiredPaths || requiredPaths.length === 0) {
    return { passed: true, failed_paths: [] };
  }
  
  const failedPaths = [];
  
  for (const path of requiredPaths) {
    const values = evaluatePath(envelope, path);
    
    if (values.length === 0) {
      failedPaths.push(path);
    } else {
      // Check that values are not null/undefined/empty
      const hasValidValue = values.some(v => {
        if (v === null || v === undefined) return false;
        if (typeof v === 'string' && v.trim() === '') return false;
        if (typeof v === 'number' && isNaN(v)) return false;
        return true;
      });
      
      if (!hasValidValue) {
        failedPaths.push(path);
      }
    }
  }
  
  return {
    passed: failedPaths.length === 0,
    failed_paths: failedPaths
  };
}

/**
 * Validate envelope against registry config
 * @param {object} envelope - Envelope to validate
 * @param {object} moduleConfig - Module config from registry
 * @returns {object} { valid: boolean, errors: string[], warnings: string[] }
 */
export function validateEnvelope(envelope, moduleConfig) {
  const errors = [];
  const warnings = [];
  
  // 1. Schema validation
  const schemaResult = validateEnvelopeSchema(envelope);
  if (!schemaResult.valid) {
    errors.push(...schemaResult.errors);
    return { valid: false, errors, warnings };
  }
  
  // 2. Count validation
  const recordCount = envelope.metadata.record_count;
  if (moduleConfig.counts) {
    const { expected, min, max } = moduleConfig.counts;
    
    if (expected && recordCount !== expected) {
      warnings.push(`Record count ${recordCount} != expected ${expected}`);
    }
    
    if (min && recordCount < min) {
      errors.push(`Record count ${recordCount} < min ${min}`);
    }
    
    if (max && recordCount > max) {
      errors.push(`Record count ${recordCount} > max ${max}`);
    }
  }
  
  // 3. Plausibility rules
  if (moduleConfig.plausibility_rules) {
    const plausResult = checkPlausibility(envelope, moduleConfig.plausibility_rules);
    if (!plausResult.passed) {
      errors.push(...plausResult.errors);
    }
  }
  
  // 4. UI Contract
  if (moduleConfig.ui_contract && moduleConfig.ui_contract.required_paths) {
    const uiResult = checkUIContract(envelope, moduleConfig.ui_contract.required_paths);
    if (!uiResult.passed) {
      const policy = moduleConfig.ui_contract.policy;
      
      if (policy === 'always' || (policy === 'always_for_critical' && moduleConfig.tier === 'critical')) {
        errors.push(`UI Contract failed: ${uiResult.failed_paths.join(', ')}`);
      } else {
        warnings.push(`UI Contract failed: ${uiResult.failed_paths.join(', ')}`);
      }
    }
  }
  
  return {
    valid: errors.length === 0,
    errors,
    warnings
  };
}

/**
 * Compute freshness metadata
 * @param {object} envelope - Envelope with metadata.fetched_at
 * @param {object} freshnessConfig - Freshness config from registry
 * @returns {void} (mutates envelope.metadata.freshness)
 */
export function computeFreshness(envelope, freshnessConfig) {
  if (!envelope || !envelope.metadata) return;
  
  const config = freshnessConfig || {};
  const fetchedAt = new Date(envelope.metadata.fetched_at);
  const now = new Date();
  const ageMinutes = Math.floor((now - fetchedAt) / 1000 / 60);
  
  const expectedIntervalMinutes = config.expected_interval_minutes || 1440;
  const graceMinutes = config.grace_minutes || 180;
  const policy = config.policy || "always";
  
  // Calculate next expected update time
  const nextExpectedAt = new Date(fetchedAt.getTime() + expectedIntervalMinutes * 60 * 1000);
  
  envelope.metadata.freshness = {
    expected_interval_minutes: expectedIntervalMinutes,
    grace_minutes: graceMinutes,
    policy,
    age_minutes: ageMinutes,
    next_expected_at: nextExpectedAt.toISOString()
  };
}

export default {
  buildEnvelope,
  validateEnvelopeSchema,
  validateEnvelope,
  checkPlausibility,
  checkUIContract,
  computeFreshness
};
