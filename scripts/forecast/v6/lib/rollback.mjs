import path from 'node:path';
import { nowIso, readJson, writeJsonAtomic, hashDirectory } from './io.mjs';
import { readPublishedArtifactsForDate, buildPublishArtifacts, publishArtifactsAtomic } from './publish.mjs';

const POINTERS_REL = 'mirrors/forecast/last_good/pointers.json';

function pointersPath(repoRoot) {
  return path.join(repoRoot, POINTERS_REL);
}

function defaultPointers() {
  return {
    current_last_good: {
      date: null,
      artifacts_hash: null,
      set_at: null,
      reason: null,
      replaced_date: null
    },
    history: [],
    stats: {
      total_rollbacks_30d: 0,
      avg_duration_days: 0,
      longest_days: 0
    }
  };
}

export function readPointers(repoRoot) {
  return readJson(pointersPath(repoRoot), defaultPointers()) || defaultPointers();
}

function daysBetween(a, b) {
  const ms = Math.abs(new Date(a).getTime() - new Date(b).getTime());
  return Math.floor(ms / (24 * 60 * 60 * 1000));
}

function computeStats(history, nowDate) {
  const cutoff = new Date(`${nowDate}T00:00:00Z`);
  cutoff.setUTCDate(cutoff.getUTCDate() - 30);
  const rollbackRows = history.filter((row) => row.type === 'ROLLBACK' && new Date(`${row.at}Z`) >= cutoff);
  const durations = rollbackRows.map((row) => Number(row.duration_days || 0)).filter((n) => Number.isFinite(n));
  const total = rollbackRows.length;
  const avg = durations.length ? durations.reduce((a, b) => a + b, 0) / durations.length : 0;
  const longest = durations.length ? Math.max(...durations) : 0;
  return {
    total_rollbacks_30d: total,
    avg_duration_days: Number(avg.toFixed(2)),
    longest_days: longest
  };
}

export function writePointers(repoRoot, pointers) {
  writeJsonAtomic(pointersPath(repoRoot), pointers);
}

export function registerSuccessfulPublish({ repoRoot, asofDate, reason = 'SUCCESS' }) {
  const pointers = readPointers(repoRoot);
  const dir = path.join(repoRoot, 'public/data/forecast/v6/daily', asofDate);
  const artifactsHash = hashDirectory(dir).digest;
  const replaced = pointers.current_last_good?.date || null;

  pointers.current_last_good = {
    date: asofDate,
    artifacts_hash: artifactsHash,
    set_at: nowIso(),
    reason,
    replaced_date: replaced
  };

  pointers.history.push({
    type: 'SET_LAST_GOOD',
    at: nowIso(),
    date: asofDate,
    artifacts_hash: artifactsHash,
    reason,
    replaced_date: replaced
  });

  pointers.stats = computeStats(pointers.history, asofDate);
  writePointers(repoRoot, pointers);

  return {
    pointers,
    artifacts_hash: artifactsHash
  };
}

export function publishLastGoodOrFallback({
  repoRoot,
  asofDate,
  mode,
  policyHashes,
  barsManifestHash,
  outcomeRevision,
  reason,
  generatedAt,
  modelIds = []
}) {
  const pointers = readPointers(repoRoot);
  const lastGoodDate = pointers.current_last_good?.date || null;

  const maybe = lastGoodDate ? readPublishedArtifactsForDate({ repoRoot, date: lastGoodDate }) : null;

  let artifacts;
  let usedLastGood = null;

  if (maybe) {
    usedLastGood = lastGoodDate;
    artifacts = {
      'hotset.json': maybe['hotset.json'],
      'watchlist.json': maybe['watchlist.json'],
      'triggers.json': maybe['triggers.json'],
      'scorecard.json': maybe['scorecard.json'],
      'model_card.json': maybe['model_card.json'],
      'diagnostics_summary.json': maybe['diagnostics_summary.json']
    };

    for (const [name, doc] of Object.entries(artifacts)) {
      doc.meta = {
        ...(doc.meta || {}),
        asof_date: asofDate,
        mode,
        policy_hashes: policyHashes,
        model_ids: modelIds,
        bars_manifest_hash: barsManifestHash,
        outcome_revision: outcomeRevision,
        circuitOpen: true,
        reason,
        last_good_date_used: usedLastGood,
        generated_at: generatedAt
      };
      if (name === 'diagnostics_summary.json') {
        const baseChecks = doc.checks && typeof doc.checks === 'object' ? doc.checks : {};
        doc.checks = {
          dq: baseChecks.dq || {},
          monitoring: baseChecks.monitoring || {},
          schema: baseChecks.schema || {},
          secrecy: baseChecks.secrecy || {},
          ...baseChecks,
          rollback: {
            triggered: true,
            reason,
            source_date: usedLastGood
          }
        };
      }
    }
  } else {
    artifacts = buildPublishArtifacts({
      asofDate,
      mode,
      policyHashes,
      modelIds,
      barsManifestHash,
      outcomeRevision,
      circuitOpen: true,
      reason,
      lastGoodDateUsed: null,
      generatedAt,
      hotset: [],
      watchlist: [],
      triggers: [],
      scorecard: { status: 'degraded', reason },
      modelCard: { status: 'degraded', reason },
      diagnosticsSummary: {
        checks: {
          dq: {},
          monitoring: {},
          schema: {},
          secrecy: {},
          rollback: {
            triggered: true,
            reason,
            source_date: null
          }
        },
        data: {}
      }
    });
  }

  const publishResult = publishArtifactsAtomic({ repoRoot, asofDate, artifacts });

  const duration = lastGoodDate ? daysBetween(lastGoodDate, asofDate) : 0;
  pointers.history.push({
    type: 'ROLLBACK',
    at: nowIso(),
    requested_date: asofDate,
    source_date: usedLastGood,
    reason,
    duration_days: duration
  });
  pointers.stats = computeStats(pointers.history, asofDate);
  writePointers(repoRoot, pointers);

  const diagPath = path.join(repoRoot, 'mirrors/forecast/ledgers/diagnostics/rollback', `${asofDate}.json`);
  writeJsonAtomic(diagPath, {
    schema: 'forecast_rollback_v6',
    asof_date: asofDate,
    reason,
    source_date: usedLastGood,
    published_dir: publishResult.target_dir,
    generated_at: generatedAt
  });

  return {
    published: publishResult,
    last_good_date_used: usedLastGood,
    fallback_used: !usedLastGood
  };
}

export default {
  readPointers,
  writePointers,
  registerSuccessfulPublish,
  publishLastGoodOrFallback
};
