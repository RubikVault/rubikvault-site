import { getOpsBase } from './env.config.mjs';
import { fetchWithContext } from './fetch-with-context.mjs';

const base = getOpsBase();
const summaryUrl = `${base}/api/mission-control/summary`;

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
const allowedMetaStatus = new Set(['ok', 'degraded', 'error']);
if (!allowedMetaStatus.has(String(summary?.meta?.status))) {
  fail(`meta.status invalid: ${summary?.meta?.status}`);
}

const health = summary?.data?.health || {};
for (const key of ['platform', 'api', 'prices', 'freshness', 'pipeline']) {
  const status = health?.[key]?.status;
  if (!['OK', 'INFO', 'WARNING', 'CRITICAL'].includes(status)) {
    fail(`health.${key}.status invalid: ${status}`);
  }
}

const owner = summary?.data?.owner;
if (!owner || typeof owner !== 'object') {
  fail('owner missing at data.owner');
}
if (typeof owner?.overall?.verdict !== 'string') {
  fail('owner.overall.verdict missing');
}
if (!Array.isArray(owner?.topIssues)) {
  fail('owner.topIssues missing or not array');
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

const ssot = summary?.data?.ssot;
if (!ssot || typeof ssot !== 'object') {
  fail('data.ssot missing');
}
if (!Array.isArray(ssot?.core?.api?.checks)) {
  fail('data.ssot.core.api.checks missing');
}
if (!Array.isArray(ssot?.core?.assets?.checks)) {
  fail('data.ssot.core.assets.checks missing');
}
if (!Array.isArray(ssot?.enhancers?.api?.checks)) {
  fail('data.ssot.enhancers.api.checks missing');
}
if (!Array.isArray(ssot?.enhancers?.assets?.checks)) {
  fail('data.ssot.enhancers.assets.checks missing');
}

const verdict = summary?.data?.verdict;
if (!verdict || typeof verdict !== 'object') {
  fail('data.verdict missing');
}
if (typeof verdict?.core?.status !== 'string') {
  fail('data.verdict.core.status missing');
}
if (typeof verdict?.enhancers?.status !== 'string') {
  fail('data.verdict.enhancers.status missing');
}

const p1Step = priceTruth?.steps?.find((s) => s.id === 'P1_UI_CALLS_API') || null;
const p7Step = priceTruth?.steps?.find((s) => s.id === 'P7_UI_RENDERS') || null;
if (runtime?.env === 'preview') {
  if (p1Step?.status === 'WARN' && String(p1Step?.detail || '').includes('Missing ui-path trace')) {
    fail('P1 should be INFO in preview when ui-path trace is missing');
  }
  if (p7Step?.status === 'WARN' && String(p7Step?.detail || '').includes('UI trace missing')) {
    fail('P7 should be INFO in preview when ui-path trace is missing');
  }
}

const deploy = summary?.data?.deploy || null;
if (deploy && (deploy.gitSha == null || deploy.buildTs == null)) {
  fail('deploy.gitSha/buildTs missing (build-info mapping)');
}

console.log('OK: truth summary contract (SSOT checks present)');
