import { getOpsBase } from './env.config.mjs';
import { fetchWithContext } from './fetch-with-context.mjs';

const base = getOpsBase();
const summaryUrl = `${base}/api/mission-control/summary`;
const latestUrl = `${base}/data/pipeline/nasdaq100.latest.json`;

function fail(msg) {
  throw new Error(msg);
}

const summaryRes = await fetchWithContext(summaryUrl, {}, { name: 'mission-control-summary' });
const summary = await summaryRes.json();

if (summary?.schema_version !== '3.0') {
  fail(`schema_version mismatch: ${summary?.schema_version}`);
}
if (summary?.meta?.asOf === '—') {
  fail('meta.asOf must not be "—"');
}

const health = summary?.data?.health || {};
for (const key of ['platform', 'api', 'freshness', 'pipeline']) {
  const status = health?.[key]?.status;
  if (!['OK', 'INFO', 'WARNING', 'CRITICAL'].includes(status)) {
    fail(`health.${key}.status invalid: ${status}`);
  }
}

const runtime = summary?.data?.runtime || {};
if (runtime?.schedulerExpected === false && health?.pipeline?.status === 'CRITICAL') {
  fail('preview pipeline should not be CRITICAL solely due to cron absence');
}

const latestRes = await fetchWithContext(latestUrl, {}, { name: 'pipeline-latest' });
const latest = await latestRes.json();
const latestCounts = latest?.counts || {};
const summaryCounts = summary?.data?.pipeline?.counts || {};
for (const key of ['expected', 'fetched', 'validated', 'computed', 'static_ready']) {
  if (latestCounts[key] != null) {
    if (summaryCounts[key] == null) {
      fail(`summary pipeline counts.${key} missing`);
    }
    if (Number(summaryCounts[key]) !== Number(latestCounts[key])) {
      fail(`summary counts.${key} mismatch: ${summaryCounts[key]} vs ${latestCounts[key]}`);
    }
  }
}

console.log('OK: truth summary contract');

