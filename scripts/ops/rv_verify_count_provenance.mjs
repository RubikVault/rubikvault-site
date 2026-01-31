import { getOpsBase } from './env.config.mjs';
import { fetchWithContext } from './fetch-with-context.mjs';

function fail(message, context) {
  const err = new Error(message);
  err.context = context;
  throw err;
}

function toNumberOrNull(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function pickBases(args) {
  if (args.length) return args;
  try {
    return [getOpsBase()];
  } catch (err) {
    throw new Error('Missing base URL. Provide as args or set OPS_BASE/RV_BASE/BASE_URL/BASE.');
  }
}

async function fetchJson(url, name) {
  const res = await fetchWithContext(url, {}, { name });
  return res.json();
}

async function verifyBase(base) {
  const summaryUrl = `${base}/api/mission-control/summary`;
  const latestUrl = `${base}/data/pipeline/nasdaq100.latest.json`;

  const [summary, latest] = await Promise.all([
    fetchJson(summaryUrl, 'mission-control-summary'),
    fetchJson(latestUrl, 'pipeline-latest')
  ]);

  const latestCounts = latest?.counts || {};
  const summaryCounts = summary?.data?.pipeline?.counts || {};
  const summaryLatest = summary?.data?.pipeline?.latest?.counts || {};
  const countSources = summary?.data?.pipeline?.countSources || {};

  for (const key of ['expected', 'fetched', 'validated', 'computed', 'static_ready']) {
    if (latestCounts[key] == null) continue;
    if (summaryLatest[key] == null) {
      fail(`summary.data.pipeline.latest.counts.${key} missing`, { base, latestCounts, summaryLatest });
    }
  }

  for (const key of ['fetched', 'validated']) {
    const latestVal = toNumberOrNull(summaryLatest[key]);
    if (latestVal == null) continue;

    const summaryVal = toNumberOrNull(summaryCounts[key]);
    if (summaryVal == null) {
      fail(`summary.data.pipeline.counts.${key} missing`, {
        base,
        latestCounts,
        summaryCounts,
        summaryLatest,
        countSources
      });
    }
    if (summaryVal !== latestVal) {
      fail(`summary.data.pipeline.counts.${key} mismatch: ${summaryVal} vs ${latestVal}`, {
        base,
        latestCounts,
        summaryCounts,
        summaryLatest,
        countSources
      });
    }
    if (countSources?.[key]?.used !== 'latest') {
      fail(`countSources.${key}.used is not "latest"`, {
        base,
        latestCounts,
        summaryCounts,
        summaryLatest,
        countSources
      });
    }
  }

  console.log(`OK: count provenance ${base}`);
}

const bases = pickBases(process.argv.slice(2));
try {
  for (const base of bases) {
    await verifyBase(base);
  }
} catch (err) {
  console.error('FAIL:', err?.message || err);
  if (err?.context) {
    console.error(JSON.stringify(err.context, null, 2));
  }
  process.exit(1);
}
