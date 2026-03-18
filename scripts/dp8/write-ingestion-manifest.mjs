#!/usr/bin/env node
/**
 * Ingestion Manifest Writer
 *
 * After all DP8 builders run, writes a unified manifest documenting:
 * - What was fetched, from where, when
 * - What is fresh vs stale vs missing
 * - Which artifacts are current-good vs last-good
 *
 * This is the canonical "state of data" truth for the market hub pipeline.
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { createRunContext } from '../lib/v3/run-context.mjs';
import { writeJsonArtifact } from '../lib/v3/artifact-writer.mjs';
import { validateArtifacts } from '../lib/v3/artifact-contract.mjs';
import { ALL_MARKET_CONTRACTS } from '../lib/v3/market-hub-contracts.mjs';

async function readJsonSafe(filePath, fallback) {
  try { return JSON.parse(await fs.readFile(filePath, 'utf8')); }
  catch { return fallback; }
}

async function main() {
  const runContext = createRunContext();
  const rootDir = runContext.rootDir;

  // Validate all market hub artifacts
  const { summary, results } = await validateArtifacts(rootDir, ALL_MARKET_CONTRACTS);

  // Read meta from each artifact for lineage
  const artifactStates = [];
  for (const r of results) {
    artifactStates.push({
      path: r.path,
      state: r.state,
      data_date: r.dataDate,
      stale_days: r.staleDays,
      used_fallback: r.usedFallback,
      fallback_path: r.fallbackPath,
      errors: r.errors,
      generated_at: r.doc?.meta?.generated_at || null,
      schema_version: r.doc?.meta?.schema_version || null,
      etf_sources: r.doc?.meta?.etf_sources || null,
      symbols_available: r.doc?.meta?.symbols_available || null,
      cards_built: r.doc?.meta?.cards_built || null,
    });
  }

  const manifest = {
    schema: 'rv.ingestion-manifest.v1',
    generated_at: runContext.generatedAt,
    run_id: runContext.runId,
    commit: runContext.commit,
    summary: {
      ...summary,
      pipeline_healthy: summary.all_usable && summary.missing === 0,
      data_date: results.find((r) => r.dataDate)?.dataDate || null,
    },
    artifacts: artifactStates,
  };

  await writeJsonArtifact(rootDir, 'public/data/v3/derived/market/ingestion-manifest.json', manifest);

  // ─── NDJSON History (append-only, one line per run) ───
  const historyPath = path.join(rootDir, 'public/data/v3/system/ops-history.ndjson');
  const historyLine = JSON.stringify({
    ts: runContext.generatedAt,
    run_id: runContext.runId,
    commit: runContext.commit?.slice(0, 8) || null,
    fresh: summary.fresh,
    stale_warning: summary.stale_warning || 0,
    stale_degraded: summary.stale_degraded || 0,
    missing: summary.missing,
    invalid: summary.invalid,
    fallbacks: summary.fallbacks_used,
    healthy: manifest.summary.pipeline_healthy,
    data_date: manifest.summary.data_date,
  });
  try {
    await fs.appendFile(historyPath, historyLine + '\n', 'utf8');
  } catch {
    // First run — create parent dir
    await fs.mkdir(path.dirname(historyPath), { recursive: true });
    await fs.writeFile(historyPath, historyLine + '\n', 'utf8');
  }

  // ─── Ops Grid Entry (central SSOT for pipeline health) ───
  const opsGridPath = path.join(rootDir, 'public/data/v3/system/ops-grid.json');
  let opsGrid = await readJsonSafe(opsGridPath, { schema: 'rv.ops-grid.v1', pipelines: {} });
  opsGrid.pipelines = opsGrid.pipelines || {};
  opsGrid.pipelines['dp8-market-hub'] = {
    last_run: runContext.generatedAt,
    run_id: runContext.runId,
    healthy: manifest.summary.pipeline_healthy,
    fresh: summary.fresh,
    total: summary.total,
    fallbacks: summary.fallbacks_used,
    data_date: manifest.summary.data_date,
    stale_warning: summary.stale_warning || 0,
    stale_degraded: summary.stale_degraded || 0,
  };
  opsGrid.updated_at = runContext.generatedAt;
  await fs.writeFile(opsGridPath, JSON.stringify(opsGrid, null, 2), 'utf8').catch(() => {});

  // ─── GitHub Actions Summary (GITHUB_STEP_SUMMARY) ───
  const summaryFile = process.env.GITHUB_STEP_SUMMARY;
  if (summaryFile) {
    const statusIcon = manifest.summary.pipeline_healthy ? '✅' : '⚠️';
    const rows = artifactStates.map((a) => {
      const stateEmoji = a.state === 'FRESH' ? '🟢' : a.state === 'STALE_WARNING' ? '🟡' : a.state === 'STALE_DEGRADED' ? '🟠' : a.state === 'MISSING' ? '🔴' : '⚪';
      return `| ${a.path.split('/').pop()} | ${stateEmoji} ${a.state} | ${a.data_date || '—'} | ${a.stale_days ?? '—'}d | ${a.used_fallback ? 'Yes' : 'No'} |`;
    }).join('\n');
    const md = `## ${statusIcon} Market Hub Pipeline Status\n\n| Artifact | State | Data Date | Stale | Fallback |\n|----------|-------|-----------|-------|----------|\n${rows}\n\n**Summary:** ${summary.fresh}/${summary.total} fresh, ${summary.fallbacks_used} fallbacks used\n`;
    try {
      await fs.appendFile(summaryFile, md, 'utf8');
    } catch { /* not in CI */ }
  }

  console.log(`Ingestion manifest: ${summary.fresh}/${summary.total} fresh, ${summary.fallbacks_used} fallbacks, healthy=${manifest.summary.pipeline_healthy}`);

  // Exit non-zero only if nothing is usable
  if (!summary.all_usable) {
    console.error('INGESTION_MANIFEST: some artifacts completely unusable');
    process.exitCode = 1;
  }
}

main().catch((e) => {
  console.error(`INGESTION_MANIFEST_FAILED: ${e.message}`);
  process.exitCode = 1;
});
