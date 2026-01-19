/**
 * Audit Log System
 * 
 * Records system events (PUBLISH, BLOCK, STATE_CHANGE) for observability.
 * Rolling window of last 50 events.
 * 
 * Events are stored in: public/data/state/audit/latest.json
 */

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { existsSync } from 'node:fs';

const MAX_EVENTS = 50;

/**
 * Event types
 */
export const EventType = {
  PUBLISH: 'PUBLISH',
  BLOCK: 'BLOCK',
  STATE_CHANGE: 'STATE_CHANGE',
  VALIDATION_FAIL: 'VALIDATION_FAIL',
  INTEGRITY_FAIL: 'INTEGRITY_FAIL',
  CRITICAL_FAIL: 'CRITICAL_FAIL'
};

/**
 * Load audit log
 * 
 * @param {string} baseDir - Base directory (project root)
 * @returns {Promise<object>} Audit log with events array
 */
export async function loadAuditLog(baseDir = process.cwd()) {
  const auditPath = join(baseDir, 'public/data/state/audit/latest.json');
  
  try {
    const content = await readFile(auditPath, 'utf-8');
    return JSON.parse(content);
  } catch (err) {
    if (err.code === 'ENOENT') {
      // Create empty audit log
      return {
        schema_version: '3.0',
        generated_at: new Date().toISOString(),
        events: []
      };
    }
    throw err;
  }
}

/**
 * Append event to audit log
 * 
 * @param {object} event - Event to append
 * @param {string} baseDir - Base directory (project root)
 * @returns {Promise<void>}
 */
export async function appendAuditEvent(event, baseDir = process.cwd()) {
  const auditLog = await loadAuditLog(baseDir);
  
  // Add timestamp if not present
  if (!event.ts) {
    event.ts = new Date().toISOString();
  }
  
  // Prepend new event (most recent first)
  auditLog.events.unshift(event);
  
  // Keep only last MAX_EVENTS
  if (auditLog.events.length > MAX_EVENTS) {
    auditLog.events = auditLog.events.slice(0, MAX_EVENTS);
  }
  
  // Update generated_at
  auditLog.generated_at = new Date().toISOString();
  
  // Write back
  await writeAuditLog(auditLog, baseDir);
}

/**
 * Write audit log
 * 
 * @param {object} auditLog - Audit log to write
 * @param {string} baseDir - Base directory (project root)
 * @returns {Promise<void>}
 */
export async function writeAuditLog(auditLog, baseDir = process.cwd()) {
  const auditPath = join(baseDir, 'public/data/state/audit/latest.json');
  const auditDir = dirname(auditPath);
  
  // Ensure directory exists
  if (!existsSync(auditDir)) {
    await mkdir(auditDir, { recursive: true });
  }
  
  await writeFile(auditPath, JSON.stringify(auditLog, null, 2), 'utf-8');
}

/**
 * Create a PUBLISH event
 * 
 * @param {object} params - Event parameters
 * @returns {object} Event object
 */
export function createPublishEvent({ buildId, modulesPublished, modulesFailed, critical_ok }) {
  return {
    event: EventType.PUBLISH,
    build_id: buildId,
    modules_published: modulesPublished,
    modules_failed: modulesFailed,
    critical_ok,
    details: {
      published_count: modulesPublished.length,
      failed_count: modulesFailed.length
    }
  };
}

/**
 * Create a BLOCK event (publish blocked)
 * 
 * @param {object} params - Event parameters
 * @returns {object} Event object
 */
export function createBlockEvent({ reason, criticalModule, failureClass }) {
  return {
    event: EventType.BLOCK,
    reason,
    module: criticalModule || null,
    failure_class: failureClass || null,
    details: {
      note: 'Publish blocked due to critical module failure'
    }
  };
}

/**
 * Create a STATE_CHANGE event
 * 
 * @param {object} params - Event parameters
 * @returns {object} Event object
 */
export function createStateChangeEvent({ module, from, to, failureClass }) {
  return {
    event: EventType.STATE_CHANGE,
    module,
    from,
    to,
    failure_class: failureClass || null,
    details: {}
  };
}

/**
 * Create a VALIDATION_FAIL event
 * 
 * @param {object} params - Event parameters
 * @returns {object} Event object
 */
export function createValidationFailEvent({ module, checks, dropped_records }) {
  return {
    event: EventType.VALIDATION_FAIL,
    module,
    details: {
      checks,
      dropped_records
    }
  };
}

/**
 * Create an INTEGRITY_FAIL event
 * 
 * @param {object} params - Event parameters
 * @returns {object} Event object
 */
export function createIntegrityFailEvent({ errors }) {
  return {
    event: EventType.INTEGRITY_FAIL,
    details: {
      errors
    }
  };
}

/**
 * Get audit statistics
 * 
 * @param {object} auditLog - Audit log
 * @returns {object} Statistics
 */
export function getAuditStats(auditLog) {
  const events = auditLog.events || [];
  
  const stats = {
    total_events: events.length,
    by_type: {},
    recent_publishes: 0,
    recent_blocks: 0,
    most_common_failure: null
  };
  
  // Count by type
  for (const event of events) {
    stats.by_type[event.event] = (stats.by_type[event.event] || 0) + 1;
  }
  
  // Recent events (last 10)
  const recentEvents = events.slice(0, 10);
  stats.recent_publishes = recentEvents.filter(e => e.event === EventType.PUBLISH).length;
  stats.recent_blocks = recentEvents.filter(e => e.event === EventType.BLOCK).length;
  
  // Most common failure class
  const failureClasses = {};
  for (const event of events) {
    if (event.failure_class) {
      failureClasses[event.failure_class] = (failureClasses[event.failure_class] || 0) + 1;
    }
  }
  
  if (Object.keys(failureClasses).length > 0) {
    stats.most_common_failure = Object.entries(failureClasses)
      .sort((a, b) => b[1] - a[1])[0][0];
  }
  
  return stats;
}
