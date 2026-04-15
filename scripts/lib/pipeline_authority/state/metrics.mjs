import fs from 'node:fs';
import path from 'node:path';
import { resolveRuntimeConfig } from '../config/runtime-config.mjs';
import { AUTHORITY_SCHEMA_VERSIONS } from '../config/schema-versions.mjs';

function readMetricsDoc(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return {
      schema: AUTHORITY_SCHEMA_VERSIONS.metrics,
      updated_at: null,
      counters: {},
      daily: {},
      last_events: [],
    };
  }
}

function writeMetricsDoc(filePath, payload) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const tmp = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(tmp, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
  fs.renameSync(tmp, filePath);
}

export function incrementAuthorityMetric(metricName, context = {}) {
  const config = resolveRuntimeConfig({ ensureRuntimeDirs: true });
  const doc = readMetricsDoc(config.metricsPath);
  const recordedAt = new Date().toISOString();
  const dayId = recordedAt.slice(0, 10);
  doc.updated_at = recordedAt;
  doc.counters[metricName] = Number(doc.counters[metricName] || 0) + 1;
  doc.daily[dayId] ||= {};
  doc.daily[dayId][metricName] = Number(doc.daily[dayId][metricName] || 0) + 1;
  doc.last_events = [
    {
      metric: metricName,
      recorded_at: recordedAt,
      ...context,
    },
    ...(Array.isArray(doc.last_events) ? doc.last_events : []),
  ].slice(0, 50);
  writeMetricsDoc(config.metricsPath, doc);
  return doc;
}

export function readAuthorityMetrics() {
  const config = resolveRuntimeConfig({ ensureRuntimeDirs: true });
  return readMetricsDoc(config.metricsPath);
}

export function recordLegacyShadowWrite(context = {}) {
  return incrementAuthorityMetric('legacy_shadow_write_total', context);
}

export function recordLegacyArtifactRead(context = {}) {
  return incrementAuthorityMetric('legacy_artifact_read_total', context);
}
