import { getOpsBase } from './env.config.mjs';
import { fetchWithContext } from './fetch-with-context.mjs';

const base = getOpsBase();
const latestUrl = `${base}/data/pipeline/nasdaq100.latest.json`;
const truthUrl = `${base}/data/pipeline/nasdaq100.pipeline-truth.json`;

const latestRes = await fetchWithContext(latestUrl, {}, { name: 'pipeline-latest' });
const truthRes = await fetchWithContext(truthUrl, {}, { name: 'pipeline-truth' });

const latest = await latestRes.json();
const truth = await truthRes.json();

const counts = latest?.counts || {};
const expected = Number(counts.expected);
const fetched = Number(counts.fetched);
const validated = Number(counts.validated);
const computed = Number(counts.computed);
const staticReady = Number(counts.static_ready);

if (!Number.isFinite(expected) || expected !== 100) {
  throw new Error(`expected count must be 100, got ${counts.expected}`);
}
if (!Number.isFinite(fetched) || fetched <= 0) {
  throw new Error(`fetched must be > 0, got ${counts.fetched}`);
}
if (!Number.isFinite(validated) || validated <= 0) {
  throw new Error(`validated must be > 0, got ${counts.validated}`);
}

const firstBlockerId = truth?.first_blocker_id || truth?.first_blocker?.id;
if (typeof firstBlockerId !== 'string' || firstBlockerId.trim().length === 0) {
  throw new Error('truth.first_blocker_id must be a non-empty string');
}

const freshnessKeys = ['savedAt', 'publishedAt', 'asOf', 'timestamp'];
const now = Date.now();
for (const key of freshnessKeys) {
  if (Object.prototype.hasOwnProperty.call(latest, key) && latest[key] != null) {
    const value = latest[key];
    const num = Number(value);
    if (!Number.isFinite(num)) {
      throw new Error(`latest.${key} must be a finite number, got ${value}`);
    }
    const cutoff = now - (48 * 60 * 60 * 1000);
    if (num < cutoff) {
      throw new Error(`latest.${key} is older than 48h (${num})`);
    }
  }
}

console.log(
  `OK ops-artifacts: expected=${expected} fetched=${fetched} validated=${validated} computed=${Number.isFinite(computed) ? computed : '—'} static_ready=${Number.isFinite(staticReady) ? staticReady : '—'} first_blocker_id=${firstBlockerId}`
);

