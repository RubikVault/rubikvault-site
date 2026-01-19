/**
 * Build ID Generator
 * 
 * Generates time-based, deterministic Build IDs for the Mission Control v3.0 system.
 * Format: YYYYMMDDTHHMMSSZ_<short_sha>
 * 
 * Purpose:
 * - Unique identifier for each build/publish
 * - Sortable by time (lexicographic)
 * - Traceable back to Git commit
 * - Debug-friendly (human-readable timestamp)
 * 
 * Usage:
 *   import { generateBuildId, parseBuildId } from './build-id.js';
 *   const buildId = generateBuildId();
 *   const info = parseBuildId(buildId);
 */

import { execSync } from 'node:child_process';

/**
 * Generate a time-based Build ID
 * 
 * @param {Date} [timestamp] - Optional timestamp (defaults to now)
 * @param {string} [gitSha] - Optional Git SHA (auto-detected if not provided)
 * @returns {string} Build ID in format: YYYYMMDDTHHMMSSZ_abcdef
 */
export function generateBuildId(timestamp = new Date(), gitSha = null) {
  // Format timestamp as YYYYMMDDTHHMMSSZ
  const year = timestamp.getUTCFullYear();
  const month = String(timestamp.getUTCMonth() + 1).padStart(2, '0');
  const day = String(timestamp.getUTCDate()).padStart(2, '0');
  const hour = String(timestamp.getUTCHours()).padStart(2, '0');
  const minute = String(timestamp.getUTCMinutes()).padStart(2, '0');
  const second = String(timestamp.getUTCSeconds()).padStart(2, '0');
  
  const timeStr = `${year}${month}${day}T${hour}${minute}${second}Z`;
  
  // Get Git SHA (short)
  let shortSha = gitSha;
  if (!shortSha) {
    try {
      shortSha = execSync('git rev-parse --short=7 HEAD', { 
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'ignore'] // Suppress stderr
      }).trim();
    } catch (err) {
      // Fallback if not in Git repo or Git not available
      shortSha = 'unknown';
    }
  }
  
  return `${timeStr}_${shortSha}`;
}

/**
 * Parse a Build ID back into its components
 * 
 * @param {string} buildId - Build ID to parse
 * @returns {{ timestamp: Date, gitSha: string, isValid: boolean }}
 */
export function parseBuildId(buildId) {
  const parts = buildId.split('_');
  if (parts.length !== 2) {
    return { timestamp: null, gitSha: null, isValid: false };
  }
  
  const [timeStr, gitSha] = parts;
  
  // Parse YYYYMMDDTHHMMSSZ
  const match = timeStr.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/);
  if (!match) {
    return { timestamp: null, gitSha, isValid: false };
  }
  
  const [, year, month, day, hour, minute, second] = match;
  const timestamp = new Date(Date.UTC(
    parseInt(year, 10),
    parseInt(month, 10) - 1,
    parseInt(day, 10),
    parseInt(hour, 10),
    parseInt(minute, 10),
    parseInt(second, 10)
  ));
  
  return {
    timestamp,
    gitSha,
    isValid: !isNaN(timestamp.getTime())
  };
}

/**
 * Get current Build ID from environment or generate new
 * 
 * Priority:
 * 1. BUILD_ID env var (set by CI)
 * 2. Generate from current time + Git SHA
 * 
 * @returns {string} Build ID
 */
export function getCurrentBuildId() {
  if (process.env.BUILD_ID) {
    return process.env.BUILD_ID;
  }
  
  return generateBuildId();
}

/**
 * Validate that a Build ID is well-formed
 * 
 * @param {string} buildId - Build ID to validate
 * @returns {boolean}
 */
export function isValidBuildId(buildId) {
  if (typeof buildId !== 'string') return false;
  const parsed = parseBuildId(buildId);
  return parsed.isValid;
}

/**
 * Compare two Build IDs (for sorting)
 * 
 * @param {string} a - First Build ID
 * @param {string} b - Second Build ID
 * @returns {number} -1 if a < b, 0 if equal, 1 if a > b
 */
export function compareBuildIds(a, b) {
  // Lexicographic sort (time-based IDs are sortable as strings)
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
}

/**
 * Get age in minutes for a Build ID
 * 
 * @param {string} buildId - Build ID
 * @param {Date} [now] - Current time (defaults to now)
 * @returns {number|null} Age in minutes, or null if invalid
 */
export function getBuildIdAge(buildId, now = new Date()) {
  const parsed = parseBuildId(buildId);
  if (!parsed.isValid) return null;
  
  const ageMs = now.getTime() - parsed.timestamp.getTime();
  return Math.floor(ageMs / (60 * 1000));
}
