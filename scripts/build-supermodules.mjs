#!/usr/bin/env node
/**
 * build-supermodules.mjs
 *
 * Orchestrator for Super-Module data generation.
 * ADDITIVE-ONLY: reads existing v3 data artifacts, produces new outputs
 * under public/data/supermodules/. Does NOT modify any existing files.
 *
 * Usage:
 *   node scripts/build-supermodules.mjs                    # all modules (offline)
 *   node scripts/build-supermodules.mjs --module risk_resilience
 *   node scripts/build-supermodules.mjs --module macro_os
 *   node scripts/build-supermodules.mjs --module fundamental_truth  # needs EODHD_API_KEY
 *   node scripts/build-supermodules.mjs --dry-run           # validate only, no writes
 *   node scripts/build-supermodules.mjs --limit 50          # process max N tickers
 */

import fs from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import path from 'node:path';
import { createGunzip } from 'node:zlib';
import { createInterface } from 'node:readline';
import { createRunContext } from './lib/v3/run-context.mjs';
import { writeJsonArtifact, createManifest, writeManifest, enforceBuildLimits, hashObject } from './lib/v3/artifact-writer.mjs';

// ── Config ──────────────────────────────────────────────────────────
const ROOT = path.resolve(new URL('..', import.meta.url).pathname);
const SERIES_DIR = path.join(ROOT, 'public/data/v3/series/adjusted');
const MACRO_HUB_PATH = path.join(ROOT, 'mirrors/macro-hub.json');
const MACRO_HUB_SNAPSHOT_PATH = path.join(ROOT, 'public/data/snapshots/macro-hub.json'); // alternative
const OUTPUT_DIR = 'public/data/supermodules';
const SCHEMA = 'rv.supermodules.v1';
const MAX_TICKERS_DEFAULT = 2500;
const FUNDAMENTALS_BATCH_DELAY_MS = 200; // rate limit protection

// ── Arg parsing ─────────────────────────────────────────────────────
const args = process.argv.slice(2);
const moduleFilter = args.includes('--module') ? args[args.indexOf('--module') + 1] : null;
const dryRun = args.includes('--dry-run');
const tickerLimit = args.includes('--limit') ? Number(args[args.indexOf('--limit') + 1]) : MAX_TICKERS_DEFAULT;

// ── Helpers ─────────────────────────────────────────────────────────
async function readJsonSafe(filePath) {
    try {
        const raw = await fs.readFile(filePath, 'utf8');
        return JSON.parse(raw);
    } catch {
        return null;
    }
}

async function readNdjsonGz(filePath) {
    const rows = [];
    try {
        const stream = createReadStream(filePath).pipe(createGunzip());
        const rl = createInterface({ input: stream, crlfDelay: Infinity });
        for await (const line of rl) {
            if (line.trim()) {
                try { rows.push(JSON.parse(line)); } catch { /* skip malformed */ }
            }
        }
    } catch {
        // file not found or corrupt
    }
    return rows;
}

async function discoverTickers() {
    const files = await fs.readdir(SERIES_DIR).catch(() => []);
    return files
        .filter((f) => f.startsWith('US__') && f.endsWith('.ndjson.gz'))
        .map((f) => f.replace('US__', '').replace('.ndjson.gz', ''))
        .slice(0, tickerLimit);
}

function log(msg) {
    console.log(`[supermodules] ${msg}`);
}

// ── Module: Risk & Resilience ───────────────────────────────────────
async function buildRiskResilience(tickers, runContext) {
    log(`Risk & Resilience: processing ${tickers.length} tickers...`);
    const { computeRiskResilience } = await import('./supermodules/compute-risk-resilience.mjs');

    const universe = [];
    let loaded = 0;
    let skipped = 0;

    for (const ticker of tickers) {
        const filePath = path.join(SERIES_DIR, `US__${ticker}.ndjson.gz`);
        const rows = await readNdjsonGz(filePath);
        if (rows.length < 50) {
            skipped++;
            continue;
        }

        const bars = rows.map((r) => ({
            date: r.trading_date || r.date,
            close: Number(r.adjusted_close ?? r.close),
            high: Number(r.high ?? r.close),
            low: Number(r.low ?? r.close),
            volume: Number(r.volume ?? 0),
        })).filter((b) => b.date && Number.isFinite(b.close));

        universe.push({ symbol: ticker, bars });
        loaded++;
    }

    log(`Risk & Resilience: loaded ${loaded} tickers, skipped ${skipped}`);
    const results = computeRiskResilience(universe);
    const valid = results.filter((r) => r.scores !== null);

    // Sort by risk score (highest risk first)
    valid.sort((a, b) => (b.scores?.risk_score ?? 0) - (a.scores?.risk_score ?? 0));

    const doc = {
        module: 'risk_resilience',
        schema_version: SCHEMA,
        generated_at: runContext.generatedAt,
        run_id: runContext.runId,
        commit: runContext.commit,
        universe_stats: {
            total_tickers: tickers.length,
            processed: loaded,
            skipped,
            with_scores: valid.length,
        },
        rows: valid,
    };

    return doc;
}

// ── Module: Macro OS ────────────────────────────────────────────────
async function buildMacroOS(runContext) {
    log('Macro OS: loading macro-hub snapshot...');
    const { computeMacroOS } = await import('./supermodules/compute-macro-os.mjs');

    // Try multiple locations for macro-hub data
    let macroSnapshot = await readJsonSafe(MACRO_HUB_PATH);
    if (!macroSnapshot) macroSnapshot = await readJsonSafe(MACRO_HUB_SNAPSHOT_PATH);
    if (!macroSnapshot) {
        log('Macro OS: ⚠️ No macro-hub snapshot found, producing empty module');
        return {
            module: 'macro_os',
            schema_version: SCHEMA,
            generated_at: runContext.generatedAt,
            run_id: runContext.runId,
            commit: runContext.commit,
            universe_stats: { source: 'none' },
            data: null,
            _status: 'NO_SOURCE_DATA',
        };
    }

    log(`Macro OS: snapshot found with ${Object.keys(macroSnapshot.data || {}).length} metrics`);
    const result = computeMacroOS(macroSnapshot);

    const doc = {
        module: 'macro_os',
        schema_version: SCHEMA,
        generated_at: runContext.generatedAt,
        run_id: runContext.runId,
        commit: runContext.commit,
        universe_stats: {
            source: macroSnapshot.meta?.run_id || 'macro-hub',
            source_generated_at: macroSnapshot.meta?.generated_at || macroSnapshot.generated_at || null,
        },
        data: result,
    };

    return doc;
}

// ── Module: Fundamental Truth ───────────────────────────────────────
async function buildFundamentalTruth(tickers, runContext) {
    const apiKey = String(process.env.EODHD_API_KEY || '').trim();
    if (!apiKey) {
        log('Fundamental Truth: provider credentials not set, skipping');
        return {
            module: 'fundamental_truth',
            schema_version: SCHEMA,
            generated_at: runContext.generatedAt,
            run_id: runContext.runId,
            commit: runContext.commit,
            universe_stats: { reason: 'DATA_UNAVAILABLE' },
            rows: [],
            _status: 'DATA_UNAVAILABLE',
        };
    }

    log(`Fundamental Truth: fetching fundamentals for ${tickers.length} tickers...`);
    const { fetchFundamentals } = await import('./universe-v7/ingestor/eodhd-client.mjs');
    const { computeFundamentalTruth } = await import('./supermodules/compute-fundamental-truth.mjs');

    const results = [];
    let fetched = 0;
    let errors = 0;
    const { setTimeout: sleep } = await import('node:timers/promises');

    for (const ticker of tickers) {
        try {
            const response = await fetchFundamentals(ticker, 'US');
            if (response.data) {
                const computed = computeFundamentalTruth(ticker, response.data);
                results.push(computed);
                fetched++;
            } else {
                results.push({ symbol: ticker, scores: null, flags: ['NO_DATA'], meta: {} });
            }
        } catch (err) {
            errors++;
            if (err?.fatal || err?.dailyLimit) {
                log(`Fundamental Truth: ❌ Fatal error at ${ticker}: ${err.message} — stopping`);
                break;
            }
            log(`Fundamental Truth: ⚠️ ${ticker}: ${err.message}`);
            results.push({ symbol: ticker, scores: null, flags: ['FETCH_ERROR'], meta: { error: err.message } });
        }

        // Rate limit protection
        if (fetched % 5 === 0 && fetched > 0) await sleep(FUNDAMENTALS_BATCH_DELAY_MS);
    }

    const valid = results.filter((r) => r.scores !== null);
    // Sort by fundamental score (highest first)
    valid.sort((a, b) => (b.scores?.fundamental_score ?? 0) - (a.scores?.fundamental_score ?? 0));

    log(`Fundamental Truth: fetched ${fetched}, errors ${errors}, scored ${valid.length}`);

    const doc = {
        module: 'fundamental_truth',
        schema_version: SCHEMA,
        generated_at: runContext.generatedAt,
        run_id: runContext.runId,
        commit: runContext.commit,
        universe_stats: {
            total_tickers: tickers.length,
            fetched,
            errors,
            with_scores: valid.length,
        },
        rows: valid,
    };

    return doc;
}

// ── Write Module Output ─────────────────────────────────────────────
async function writeModuleOutput(rootDir, moduleName, doc) {
    const hash = hashObject(doc).slice(0, 12);
    const relPath = `${OUTPUT_DIR}/${moduleName}.${hash}.json`;
    const artifact = await writeJsonArtifact(rootDir, relPath, doc);
    log(`  → wrote ${relPath} (${artifact.bytes} bytes, sha256: ${artifact.sha256.slice(0, 12)}…)`);
    return artifact;
}

// ── Main ────────────────────────────────────────────────────────────
async function main() {
    const startTime = Date.now();
    log('=== Super-Module Build Start ===');

    const runContext = createRunContext({ rootDir: ROOT });
    log(`Run ID: ${runContext.runId}`);
    log(`Commit: ${runContext.commit}`);
    log(`Dry run: ${dryRun}`);
    log(`Module filter: ${moduleFilter || 'ALL'}`);
    log(`Ticker limit: ${tickerLimit}`);

    // Ensure output directory exists
    const absOutputDir = path.join(ROOT, OUTPUT_DIR);
    await fs.mkdir(absOutputDir, { recursive: true });

    const tickers = await discoverTickers();
    log(`Discovered ${tickers.length} tickers in v3/series/adjusted`);

    const artifacts = [];
    const moduleStatus = {};

    // ── Risk & Resilience ──
    if (!moduleFilter || moduleFilter === 'risk_resilience') {
        try {
            const doc = await buildRiskResilience(tickers, runContext);
            if (!dryRun) {
                const artifact = await writeModuleOutput(ROOT, 'risk-resilience', doc);
                artifacts.push(artifact);
            }
            moduleStatus.risk_resilience = { status: 'OK', rows: doc.rows?.length || 0 };
            log(`✅ Risk & Resilience: ${doc.rows?.length || 0} rows`);
        } catch (err) {
            moduleStatus.risk_resilience = { status: 'ERROR', message: err.message };
            log(`❌ Risk & Resilience failed: ${err.message}`);
        }
    }

    // ── Macro OS ──
    if (!moduleFilter || moduleFilter === 'macro_os') {
        try {
            const doc = await buildMacroOS(runContext);
            if (!dryRun) {
                const artifact = await writeModuleOutput(ROOT, 'macro-os', doc);
                artifacts.push(artifact);
            }
            moduleStatus.macro_os = {
                status: doc._status || 'OK',
                metrics: doc.data?.meta?.total_metrics || 0,
                regime: doc.data?.regime?.current || 'UNKNOWN',
            };
            log(`✅ Macro OS: regime=${doc.data?.regime?.current || 'N/A'}`);
        } catch (err) {
            moduleStatus.macro_os = { status: 'ERROR', message: err.message };
            log(`❌ Macro OS failed: ${err.message}`);
        }
    }

    // ── Fundamental Truth ──
    if (!moduleFilter || moduleFilter === 'fundamental_truth') {
        try {
            // Limit fundamentals to smaller batch (API calls)
            const ftLimit = Math.min(tickers.length, 200);
            const ftTickers = tickers.slice(0, ftLimit);
            const doc = await buildFundamentalTruth(ftTickers, runContext);
            if (!dryRun) {
                const artifact = await writeModuleOutput(ROOT, 'fundamental-truth', doc);
                artifacts.push(artifact);
            }
            moduleStatus.fundamental_truth = {
                status: doc._status || 'OK',
                rows: doc.rows?.length || 0,
            };
            log(`✅ Fundamental Truth: ${doc.rows?.length || 0} rows`);
        } catch (err) {
            moduleStatus.fundamental_truth = { status: 'ERROR', message: err.message };
            log(`❌ Fundamental Truth failed: ${err.message}`);
        }
    }

    // ── Write Manifest ──
    if (!dryRun && artifacts.length > 0) {
        const manifestDoc = createManifest({
            schema: SCHEMA,
            runContext,
            quality: {
                status: Object.values(moduleStatus).every((m) => m.status === 'OK') ? 'green' : 'degraded',
                modules: moduleStatus,
            },
            lineage: {
                series_dir: 'public/data/v3/series/adjusted',
                macro_hub: 'mirrors/macro-hub.json',
            },
            artifacts,
        });

        await writeManifest(ROOT, `${OUTPUT_DIR}/manifest.supermodules.json`, manifestDoc);
        log(`✅ Manifest written with ${artifacts.length} artifacts`);

        // Build limits check
        await enforceBuildLimits(ROOT, OUTPUT_DIR, {
            limits: { max_file_count_per_publish_folder: 50, max_artifact_size_bytes: 52428800 },
        });
    }

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    log(`=== Super-Module Build Complete (${elapsed}s) ===`);
    log(`Modules: ${JSON.stringify(moduleStatus)}`);

    // Exit with error if ALL modules failed
    const allFailed = Object.values(moduleStatus).every((m) => m.status === 'ERROR');
    if (allFailed && Object.keys(moduleStatus).length > 0) {
        process.exit(1);
    }
}

main().catch((err) => {
    console.error('[supermodules] FATAL:', err);
    process.exit(1);
});
