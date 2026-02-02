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
if (typeof summary?.meta?.status !== 'string') {
  fail('meta.status missing');
}

const health = summary?.data?.health || {};
for (const key of ['platform', 'api', 'freshness', 'pipeline']) {
  const status = health?.[key]?.status;
  if (!['OK', 'INFO', 'WARNING', 'CRITICAL'].includes(status)) {
    fail(`health.${key}.status invalid: ${status}`);
  }
}

const truthChains = summary?.data?.truthChains;
if (!truthChains || typeof truthChains !== 'object') {
  fail('truthChains missing at data.truthChains');
}
const priceTruth = truthChains?.prices;
if (!priceTruth || !Array.isArray(priceTruth.steps)) {
  fail('priceTruth.steps missing');
}
const allowedPriceSteps = new Set([
  'P0_UI_START',
  'P1_UI_CALLS_API',
  'P2_API_RECEIVES_RAW',
  'P3_API_PARSES_VALIDATES',
  'P4_CANONICAL_FORMAT',
  'P5_STATIC_PERSIST',
  'P6_API_CONTRACT',
  'P7_UI_RENDERS'
]);
for (const step of priceTruth.steps) {
  if (!allowedPriceSteps.has(step.id)) {
    fail(`priceTruth step invalid: ${step.id}`);
  }
}
if (priceTruth.first_blocker_id && !allowedPriceSteps.has(priceTruth.first_blocker_id)) {
  fail(`priceTruth first_blocker invalid: ${priceTruth.first_blocker_id}`);
}

const priceStepMap = Object.fromEntries(priceTruth.steps.map((s) => [s.id, s.status]));
const p6 = priceStepMap.P6_API_CONTRACT;
const p7 = priceStepMap.P7_UI_RENDERS;
if (p6 === 'OK' && p7 === 'OK' && priceTruth.status === 'ERROR') {
  fail('priceTruth.status should not be ERROR when P6 and P7 are OK');
}
if (priceTruth.first_blocker_id && !['P6_API_CONTRACT', 'P7_UI_RENDERS'].includes(priceTruth.first_blocker_id)) {
  fail(`priceTruth first_blocker invalid for Prices chain: ${priceTruth.first_blocker_id}`);
}

const p6Step = priceTruth.steps.find((s) => s.id === 'P6_API_CONTRACT');
if (!p6Step?.evidence?.checked_path || p6Step.evidence.checked_path !== 'data.latest_bar') {
  fail('P6 evidence.checked_path must be data.latest_bar');
}
if (!Array.isArray(p6Step?.evidence?.required_fields)) {
  fail('P6 evidence.required_fields missing');
}
if (!p6Step?.evidence?.per_ticker || typeof p6Step.evidence.per_ticker !== 'object') {
  fail('P6 evidence.per_ticker missing');
}
const sample = p6Step.evidence.per_ticker.UBER;
if (!sample || !Array.isArray(sample.missing_fields)) {
  fail('P6 evidence.per_ticker.UBER missing_fields invalid');
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

const coverageMissing = summary?.data?.coverage?.missing;
if (Number.isFinite(coverageMissing) && coverageMissing > 50) {
  const msg = `Coverage degraded (${coverageMissing} missing)`;
  if (process.env.CI === 'true' || process.env.GITHUB_ACTIONS === 'true') {
    console.warn(`::warning::${msg}`);
  } else {
    console.warn(`WARN: ${msg}`);
  }
}

console.log('OK: truth summary contract');
