/**
 * Artifact Contract — Unified Producer/Consumer validation
 *
 * Replaces ad-hoc "test -s file" checks with a structured contract:
 *   EXISTS → VALID → TIMED → FRESH → usable
 *
 * Supports last-known-good fallback when current artifact is unusable.
 */

import fs from 'node:fs/promises';
import path from 'node:path';

// ─── Contract States ───────────────────────────────────────────────────────

export const ArtifactState = Object.freeze({
  MISSING: 'MISSING',
  INVALID: 'INVALID',
  UNTIMED: 'UNTIMED',
  STALE_DEGRADED: 'STALE_DEGRADED',
  STALE_WARNING: 'STALE_WARNING',
  FRESH: 'FRESH',
});

// ─── Trading-Day Awareness ────────────────────────────────────────────────

/**
 * Count actual trading days between two dates (excludes weekends).
 * For US markets; does not account for holidays (good enough for staleness).
 */
function tradingDaysBetween(fromDateStr, toDateStr) {
  const from = new Date(`${fromDateStr}T00:00:00Z`);
  const to = new Date(`${toDateStr}T00:00:00Z`);
  if (isNaN(from) || isNaN(to) || to <= from) return 0;
  let count = 0;
  const d = new Date(from);
  d.setUTCDate(d.getUTCDate() + 1);
  while (d <= to) {
    const day = d.getUTCDay();
    if (day !== 0 && day !== 6) count++;
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return count;
}

/**
 * Is today a trading day? (weekday check, no holiday calendar)
 */
function isTradingDay(dateStr) {
  const d = new Date(`${dateStr || new Date().toISOString().slice(0, 10)}T12:00:00Z`);
  const day = d.getUTCDay();
  return day !== 0 && day !== 6;
}

// ─── Core Validation ───────────────────────────────────────────────────────

/**
 * Validate an artifact against its contract.
 *
 * @param {string} rootDir - Repository root
 * @param {Object} contract - Contract definition
 * @param {string} contract.path - Relative path to artifact
 * @param {Function} [contract.validate] - Returns { valid, errors } for parsed doc
 * @param {string} [contract.dateField] - JSON path to data date (dot-separated, e.g. "meta.data_date")
 * @param {number} [contract.maxStaleDays] - Max calendar days before STALE_WARNING (default: 3)
 * @param {number} [contract.maxDegradedDays] - Max calendar days before STALE_DEGRADED (default: 7)
 * @param {number} [contract.maxFallbackDays] - Max age of LKG before it's also rejected (default: 14)
 * @param {boolean} [contract.tradingDayAware] - Use trading days instead of calendar days (default: false)
 * @param {number} [contract.minBytes] - Minimum file size (default: 10)
 * @param {string} [contract.lastGoodPath] - Relative path to last-known-good copy
 * @param {string} [contract.expectedHash] - SHA256 hash to verify integrity (optional)
 * @returns {Promise<ArtifactResult>}
 */
export async function validateArtifact(rootDir, contract) {
  const absPath = path.join(rootDir, contract.path);
  const result = {
    path: contract.path,
    state: ArtifactState.MISSING,
    errors: [],
    warnings: [],
    dataDate: null,
    staleDays: null,
    tradingDaysStale: null,
    usedFallback: false,
    fallbackPath: null,
    doc: null,
  };

  // 1. EXISTS
  let raw;
  try {
    const stat = await fs.stat(absPath);
    const minBytes = contract.minBytes ?? 10;
    if (stat.size < minBytes) {
      result.errors.push(`File too small: ${stat.size} < ${minBytes} bytes`);
      return await tryFallback(rootDir, contract, result);
    }
    raw = await fs.readFile(absPath, 'utf8');
  } catch {
    result.errors.push(`File not found: ${contract.path}`);
    return await tryFallback(rootDir, contract, result);
  }

  // 2. INTEGRITY (optional hash check)
  if (contract.expectedHash) {
    const { createHash } = await import('node:crypto');
    const actual = createHash('sha256').update(raw).digest('hex');
    if (actual !== contract.expectedHash) {
      result.state = ArtifactState.INVALID;
      result.errors.push(`Integrity check failed: expected ${contract.expectedHash.slice(0, 12)}…, got ${actual.slice(0, 12)}…`);
      return await tryFallback(rootDir, contract, result);
    }
  }

  // 3. VALID (parseable + schema)
  let doc;
  try {
    doc = JSON.parse(raw);
  } catch (e) {
    result.state = ArtifactState.INVALID;
    result.errors.push(`JSON parse error: ${e.message}`);
    return await tryFallback(rootDir, contract, result);
  }

  if (typeof contract.validate === 'function') {
    const validation = contract.validate(doc);
    if (!validation.valid) {
      result.state = ArtifactState.INVALID;
      result.errors.push(...(validation.errors || ['Validation failed']));
      return await tryFallback(rootDir, contract, result);
    }
  }

  result.doc = doc;

  // 4. TIMED (has a data date)
  if (contract.dateField) {
    const dateVal = getNestedField(doc, contract.dateField);
    if (!dateVal || typeof dateVal !== 'string' || !/^\d{4}-\d{2}-\d{2}/.test(dateVal)) {
      result.state = ArtifactState.UNTIMED;
      result.errors.push(`Missing or invalid date field: ${contract.dateField}`);
      // UNTIMED is usable but with a warning — don't fallback
      return result;
    }
    result.dataDate = dateVal.slice(0, 10);
  }

  // 5. FRESHNESS — graduated: FRESH → STALE_WARNING → STALE_DEGRADED
  if (result.dataDate) {
    const todayStr = new Date().toISOString().slice(0, 10);
    const dataTs = new Date(`${result.dataDate}T00:00:00Z`).getTime();
    const nowTs = Date.now();
    result.staleDays = Math.max(0, Math.round((nowTs - dataTs) / 86400000));

    // Trading-day-aware staleness (excludes weekends)
    if (contract.tradingDayAware) {
      result.tradingDaysStale = tradingDaysBetween(result.dataDate, todayStr);
    }

    const effectiveStaleDays = contract.tradingDayAware
      ? (result.tradingDaysStale ?? result.staleDays)
      : result.staleDays;

    const warnThreshold = contract.maxStaleDays ?? 3;
    const degradedThreshold = contract.maxDegradedDays ?? 7;

    if (effectiveStaleDays > degradedThreshold) {
      result.state = ArtifactState.STALE_DEGRADED;
      result.errors.push(`Data is ${effectiveStaleDays}${contract.tradingDayAware ? ' trading' : ''} days old (degraded threshold: ${degradedThreshold}d)`);
      return await tryFallback(rootDir, contract, result);
    }
    if (effectiveStaleDays > warnThreshold) {
      result.state = ArtifactState.STALE_WARNING;
      result.warnings.push(`Data is ${effectiveStaleDays}${contract.tradingDayAware ? ' trading' : ''} days old (warn threshold: ${warnThreshold}d)`);
      // STALE_WARNING is usable — do NOT fallback, just warn
      return result;
    }
  }

  result.state = ArtifactState.FRESH;
  return result;
}

// ─── Last-Known-Good Fallback ──────────────────────────────────────────────

async function tryFallback(rootDir, contract, result) {
  if (!contract.lastGoodPath) return result;

  const fallbackAbs = path.join(rootDir, contract.lastGoodPath);
  try {
    const raw = await fs.readFile(fallbackAbs, 'utf8');
    const doc = JSON.parse(raw);

    // Check fallback freshness — reject if too old
    if (contract.dateField) {
      const dateVal = getNestedField(doc, contract.dateField);
      if (dateVal && typeof dateVal === 'string') {
        const fbDate = dateVal.slice(0, 10);
        const todayStr = new Date().toISOString().slice(0, 10);
        const fbStaleDays = contract.tradingDayAware
          ? tradingDaysBetween(fbDate, todayStr)
          : Math.max(0, Math.round((Date.now() - new Date(`${fbDate}T00:00:00Z`).getTime()) / 86400000));
        const maxFallback = contract.maxFallbackDays ?? 14;
        if (fbStaleDays > maxFallback) {
          result.errors.push(`Fallback too old: ${fbStaleDays}d > max ${maxFallback}d (${contract.lastGoodPath})`);
          return result;
        }
        result.dataDate = fbDate;
        result.staleDays = fbStaleDays;
      }
    }

    result.doc = doc;
    result.usedFallback = true;
    result.fallbackPath = contract.lastGoodPath;
    console.log(`[artifact-contract] FALLBACK used for ${contract.path} → ${contract.lastGoodPath}`);
  } catch {
    result.errors.push(`Fallback also unavailable: ${contract.lastGoodPath}`);
  }

  return result;
}

// ─── Promote to Last-Known-Good ────────────────────────────────────────────

/**
 * After a successful build, promote current artifact to last-known-good.
 * Validates the artifact is valid JSON before promoting (never promote garbage).
 */
export async function promoteToLastGood(rootDir, artifactRelPath, lastGoodRelPath) {
  const src = path.join(rootDir, artifactRelPath);
  const dest = path.join(rootDir, lastGoodRelPath);
  try {
    const raw = await fs.readFile(src, 'utf8');
    // Integrity gate: must be parseable JSON
    JSON.parse(raw);
    await fs.mkdir(path.dirname(dest), { recursive: true });
    await fs.writeFile(dest, raw, 'utf8');
    console.log(`[artifact-contract] Promoted ${artifactRelPath} → ${lastGoodRelPath}`);
  } catch (e) {
    console.error(`[artifact-contract] Promote failed: ${e.message}`);
  }
}

// ─── Exported Utilities ──────────────────────────────────────────────────

export { tradingDaysBetween, isTradingDay };

// ─── Batch Validation ──────────────────────────────────────────────────────

/**
 * Validate multiple artifacts. Returns summary + individual results.
 * Consumer can decide per-artifact whether to proceed or abort.
 *
 * @param {string} rootDir
 * @param {Object[]} contracts
 * @param {Object} [opts]
 * @param {boolean} [opts.failOnAnyMissing] - Hard-fail if any artifact is MISSING (default: false)
 * @returns {Promise<BatchResult>}
 */
export async function validateArtifacts(rootDir, contracts, opts = {}) {
  const results = await Promise.all(
    contracts.map((c) => validateArtifact(rootDir, c))
  );

  const summary = {
    total: results.length,
    fresh: results.filter((r) => r.state === ArtifactState.FRESH).length,
    stale_warning: results.filter((r) => r.state === ArtifactState.STALE_WARNING).length,
    stale_degraded: results.filter((r) => r.state === ArtifactState.STALE_DEGRADED).length,
    missing: results.filter((r) => r.state === ArtifactState.MISSING).length,
    invalid: results.filter((r) => r.state === ArtifactState.INVALID).length,
    untimed: results.filter((r) => r.state === ArtifactState.UNTIMED).length,
    fallbacks_used: results.filter((r) => r.usedFallback).length,
    all_usable: results.every((r) => r.doc !== null),
  };

  if (opts.failOnAnyMissing && summary.missing > 0) {
    const missingPaths = results.filter((r) => r.state === ArtifactState.MISSING).map((r) => r.path);
    throw new Error(`ARTIFACT_CONTRACT_VIOLATION: missing=[${missingPaths.join(', ')}]`);
  }

  return { summary, results };
}

// ─── Helpers ───────────────────────────────────────────────────────────────

function getNestedField(obj, dotPath) {
  return dotPath.split('.').reduce((o, k) => (o && typeof o === 'object' ? o[k] : undefined), obj);
}
