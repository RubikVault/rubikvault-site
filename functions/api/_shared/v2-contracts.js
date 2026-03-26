/**
 * V2 contract validators.
 * Follows the same { valid: boolean, errors: string[] } pattern as contracts.js.
 */

import { validateStockLayers } from './contracts.js';

const VALID_STATUSES = new Set(['fresh', 'stale', 'pending', 'error', 'closed']);

function isObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value);
}

function isString(value) {
  return typeof value === 'string' && value.length > 0;
}

function validateV2Envelope(doc, errors) {
  if (!isObject(doc)) {
    errors.push('response: not an object');
    return false;
  }
  if (typeof doc.ok !== 'boolean') errors.push('ok: must be boolean');
  if (!('data' in doc)) errors.push('data: missing');
  if (!('error' in doc)) errors.push('error: missing');
  if (!isObject(doc.meta)) {
    errors.push('meta: missing or not an object');
    return false;
  }
  if (!VALID_STATUSES.has(doc.meta.status)) {
    errors.push('meta.status: invalid value "' + doc.meta.status + '"');
  }

  // ok:true must have data, ok:false must have error
  if (doc.ok === true && doc.data == null) {
    errors.push('ok is true but data is null');
  }
  if (doc.ok === false && doc.error == null) {
    errors.push('ok is false but error is null');
  }

  // Validate error shape if present
  if (doc.error != null) {
    if (!isObject(doc.error)) {
      errors.push('error: must be object or null');
    } else {
      if (!isString(doc.error.code)) errors.push('error.code: missing');
      if (!isString(doc.error.message)) errors.push('error.message: missing');
    }
  }

  return errors.length === 0;
}

/**
 * Validate a V2 summary response.
 */
export function validateV2Summary(doc) {
  const errors = [];
  if (!validateV2Envelope(doc, errors)) {
    return { valid: false, errors };
  }

  if (doc.ok && isObject(doc.data)) {
    if (!isString(doc.data.ticker)) errors.push('data.ticker: missing or empty');

    // Validate states/decision/explanation if present (reuse existing validator)
    if (doc.data.states && doc.data.decision && doc.data.explanation) {
      const layerResult = validateStockLayers({
        states: doc.data.states,
        decision: doc.data.decision,
        explanation: doc.data.explanation,
      });
      if (!layerResult.valid) {
        errors.push(...layerResult.errors.map((e) => 'layers.' + e));
      }
    }
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Validate a V2 historical response.
 */
export function validateV2Historical(doc) {
  const errors = [];
  if (!validateV2Envelope(doc, errors)) {
    return { valid: false, errors };
  }

  if (doc.ok && isObject(doc.data)) {
    if (!isString(doc.data.ticker)) errors.push('data.ticker: missing or empty');
    if (!Array.isArray(doc.data.bars)) {
      errors.push('data.bars: must be an array');
    } else {
      const now = new Date();
      for (let i = 0; i < doc.data.bars.length; i++) {
        const bar = doc.data.bars[i];
        if (!isObject(bar)) {
          errors.push(`data.bars[${i}]: not an object`);
          continue;
        }
        if (!isString(bar.date)) {
          errors.push(`data.bars[${i}].date: missing`);
        } else {
          const barDate = new Date(bar.date);
          if (barDate > now) {
            errors.push(`data.bars[${i}].date: future date "${bar.date}"`);
          }
        }
      }
    }
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Validate a V2 governance response.
 */
export function validateV2Governance(doc) {
  const errors = [];
  if (!validateV2Envelope(doc, errors)) {
    return { valid: false, errors };
  }

  if (doc.ok && isObject(doc.data)) {
    if (!isString(doc.data.ticker)) errors.push('data.ticker: missing or empty');
  }

  return { valid: errors.length === 0, errors };
}
