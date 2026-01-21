/**
 * Provider State Management
 * 
 * Reads and writes provider-state.json (Mission Control v3.0)
 * Used by Finalizer to generate cockpit UI view.
 */

import { readFile, writeFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Load provider state from file
 * @param {string} baseDir - Base directory (default: project root)
 * @returns {Promise<object|null>} Provider state object or null if not found
 */
export async function loadProviderState(baseDir = process.cwd()) {
  const path = join(baseDir, 'public/data/provider-state.json');
  try {
    const content = await readFile(path, 'utf-8');
    return JSON.parse(content);
  } catch (err) {
    if (err.code === 'ENOENT') {
      return null;
    }
    throw err;
  }
}

/**
 * Generate provider state from manifest and module states
 * @param {object} manifest - Manifest object
 * @param {Map<string, object>} moduleStates - Map of module name -> module state
 * @param {object} options - Options
 * @returns {object} Provider state object
 */
export function generateProviderState(manifest, moduleStates = new Map(), options = {}) {
  const now = new Date().toISOString();
  const buildId = manifest?.build_id || manifest?.active_build_id || null;
  const manifestRef = manifest?.manifest_ref || buildId || null;
  
  // Analyze summary
  const modules = manifest.modules || {};
  const summary = manifest.summary || {};
  
  // Determine system status
  let systemStatus = 'ok';
  if (!summary.critical_ok) {
    systemStatus = 'crit';
  } else if (summary.error > 0 || summary.warn > 0) {
    systemStatus = summary.error > 0 ? 'crit' : 'warn';
  }

  // Collect top issues
  const topIssues = [];
  for (const [moduleName, module] of Object.entries(modules)) {
    if (module.status === 'error' || module.status === 'warn') {
      const state = moduleStates.get(moduleName) || {};
      const failure = state.failure || {};
      topIssues.push({
        module: moduleName,
        class: failure.class || 'UNKNOWN',
        severity: module.status === 'error' ? 'crit' : 'warn',
        hint: failure.hint || 'Check debug endpoint'
      });
    }
  }
  // Sort by severity
  topIssues.sort((a, b) => {
    const severityOrder = { crit: 0, warn: 1, info: 2 };
    return (severityOrder[a.severity] || 99) - (severityOrder[b.severity] || 99);
  });

  // Build module entries
  const moduleEntries = Object.entries(modules).map(([moduleName, module]) => {
    const state = moduleStates.get(moduleName) || {};
    const proof = state.proof || {};
    
    return {
      module: moduleName,
      tier: module.tier,
      domain: module.domain || 'unknown',
      status: module.status || 'unknown',
      severity: state.severity || 'info',
      published: module.published || false,
      digest: module.digest || null,
      freshness: module.freshness || {},
      proof_chain: {
        FILE: proof.file_present ? 'PASS' : 'FAIL',
        SCHEMA: proof.schema_valid ? 'PASS' : 'FAIL',
        FRESH: computeFreshnessStatus(module.freshness),
        PLAUS: proof.plausible ? 'PASS' : 'FAIL',
        UI: proof.ui_contract_passed !== undefined 
          ? (proof.ui_contract_passed ? 'PASS' : 'FAIL')
          : 'SKIP',
        DELIVERY: 'UNKNOWN' // On-demand probe only
      },
      delivery: {
        probed_at: null,
        status: 'UNKNOWN',
        served_from: module.cache?.preferred_source || 'ASSET',
        latency_ms: null
      },
      failure: state.failure || {
        class: null,
        message: null,
        hint: null
      },
      links: {
        debug: `/api/${moduleName}?debug=1`,
        snapshot: `/data/snapshots/${moduleName}/latest.json`,
        state: `/data/state/modules/${moduleName}.json`
      }
    };
  });

  return {
    schema_version: "3.0",
    generated_at: now,
    system: {
      status: systemStatus,
      build_id: buildId,
      manifest_ref: manifestRef,
      last_publish_at: manifest.published_at || now,
      critical_ok: summary.critical_ok !== false,
      top_issues: topIssues.slice(0, 10) // Top 10
    },
    modules: moduleEntries,
    help: {
      failure_classes_ref: "/data/failure-hints.json",
      playbook_ref: "/internal/health#playbook"
    }
  };
}

/**
 * Compute freshness status for proof chain
 * @param {object} freshness - Freshness metadata
 * @returns {string} PASS|WARN|FAIL
 */
function computeFreshnessStatus(freshness) {
  if (!freshness) return 'UNKNOWN';
  
  const age = freshness.age_minutes || 0;
  const expected = freshness.expected_interval_minutes || 1440;
  const grace = freshness.grace_minutes || 120;
  const threshold = expected + grace;
  
  if (age <= expected) return 'PASS';
  if (age <= threshold) return 'WARN';
  return 'FAIL';
}

/**
 * Write provider state to file (atomic)
 * @param {object} state - Provider state object
 * @param {string} baseDir - Base directory
 * @returns {Promise<void>}
 */
export async function writeProviderState(state, baseDir = process.cwd()) {
  const dir = join(baseDir, 'public/data');
  const tmpPath = join(dir, 'provider-state.json.tmp');
  const finalPath = join(dir, 'provider-state.json');
  
  const content = JSON.stringify(state, null, 2) + '\n';
  await writeFile(tmpPath, content, 'utf-8');
  
  // Atomic rename
  const { promises: fsPromises } = await import('node:fs');
  await fsPromises.rename(tmpPath, finalPath);
}
