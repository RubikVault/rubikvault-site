const HEALTH_STATUSES = new Set(['OK', 'INFO', 'WARNING', 'CRITICAL']);

function isObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value);
}

function isString(value) {
  return typeof value === 'string' && value.length > 0;
}

function isNumber(value) {
  return typeof value === 'number' && Number.isFinite(value);
}

export function validateHealthProfiles(doc) {
  const errors = [];
  if (!isObject(doc)) {
    errors.push('profiles: not an object');
    return { valid: false, errors };
  }
  if (!isString(doc.version)) errors.push('version missing');
  if (!isString(doc.updatedAt)) errors.push('updatedAt missing');
  const profiles = doc.profiles;
  if (!isObject(profiles)) {
    errors.push('profiles missing');
    return { valid: false, errors };
  }
  for (const key of ['production', 'preview']) {
    const profile = profiles[key];
    if (!isObject(profile)) {
      errors.push(`profiles.${key} missing`);
      continue;
    }
    const expected = profile.expected;
    if (!isObject(expected)) {
      errors.push(`profiles.${key}.expected missing`);
    } else {
      for (const k of ['scheduler', 'kv', 'pipeline']) {
        if (typeof expected[k] !== 'boolean') {
          errors.push(`profiles.${key}.expected.${k} must be boolean`);
        }
      }
    }
    if (profile.prices_static_required !== undefined && typeof profile.prices_static_required !== 'boolean') {
      errors.push(`profiles.${key}.prices_static_required must be boolean`);
    }
    if (profile.not_expected_status && !HEALTH_STATUSES.has(profile.not_expected_status)) {
      errors.push(`profiles.${key}.not_expected_status invalid`);
    }
  }
  return { valid: errors.length === 0, errors };
}

export function validateThresholds(doc) {
  const errors = [];
  if (!isObject(doc)) {
    errors.push('thresholds: not an object');
    return { valid: false, errors };
  }
  if (!isString(doc.version)) errors.push('version missing');
  if (!isString(doc.updatedAt)) errors.push('updatedAt missing');
  for (const key of ['production', 'preview']) {
    const profile = doc[key];
    if (!isObject(profile)) {
      errors.push(`thresholds.${key} missing`);
      continue;
    }
    if (!isNumber(profile.freshness_warn_hours)) {
      errors.push(`thresholds.${key}.freshness_warn_hours missing`);
    }
    if (profile.freshness_crit_hours !== null && profile.freshness_crit_hours !== undefined && !isNumber(profile.freshness_crit_hours)) {
      errors.push(`thresholds.${key}.freshness_crit_hours invalid`);
    }
  }
  return { valid: errors.length === 0, errors };
}

export function validateSourceMap(doc) {
  const errors = [];
  if (!isObject(doc)) {
    errors.push('source-map: not an object');
    return { valid: false, errors };
  }
  if (!isString(doc.version)) errors.push('version missing');
  if (!isString(doc.updatedAt)) errors.push('updatedAt missing');
  if (!Array.isArray(doc.entries)) {
    errors.push('entries missing');
    return { valid: false, errors };
  }
  doc.entries.forEach((entry, idx) => {
    if (!isObject(entry)) {
      errors.push(`entries[${idx}] not an object`);
      return;
    }
    if (!isString(entry.id)) errors.push(`entries[${idx}].id missing`);
    if (!Array.isArray(entry.sources)) errors.push(`entries[${idx}].sources missing`);
  });
  return { valid: errors.length === 0, errors };
}

export function validatePipelineArtifact(doc) {
  const errors = [];
  if (!isObject(doc)) {
    errors.push('pipeline: not an object');
    return { valid: false, errors };
  }
  if (!('expected' in doc)) errors.push('expected missing');
  if (!('count' in doc)) errors.push('count missing');
  if (!Array.isArray(doc.missing)) errors.push('missing array missing');
  return { valid: errors.length === 0, errors };
}

export function validateSnapshot(doc) {
  const errors = [];
  if (!isObject(doc)) {
    errors.push('snapshot: not an object');
    return { valid: false, errors };
  }
  if (!isString(doc.schema_version)) errors.push('schema_version missing');
  if (!isObject(doc.metadata)) {
    errors.push('metadata missing');
    return { valid: false, errors };
  }
  const meta = doc.metadata;
  if (!isString(meta.module)) errors.push('metadata.module missing');
  if (!isString(meta.fetched_at)) errors.push('metadata.fetched_at missing');
  if (!isString(meta.published_at)) errors.push('metadata.published_at missing');
  if (typeof meta.record_count !== 'number') errors.push('metadata.record_count missing');
  if (!Array.isArray(doc.data)) errors.push('data array missing');
  if (!isObject(doc.meta)) {
    errors.push('meta missing');
  } else {
    if (!(doc.meta.asOf === null || isString(doc.meta.asOf))) errors.push('meta.asOf missing');
    if (!isString(doc.meta.kind)) errors.push('meta.kind missing');
    if (typeof doc.meta.expectedCount !== 'number') errors.push('meta.expectedCount missing');
    if (!isString(doc.meta.universe)) errors.push('meta.universe missing');
  }
  return { valid: errors.length === 0, errors };
}

export function trimErrors(errors, max = 8) {
  if (!Array.isArray(errors)) return [];
  return errors.slice(0, max);
}
