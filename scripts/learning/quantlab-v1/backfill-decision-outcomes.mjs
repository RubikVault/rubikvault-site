#!/usr/bin/env node
/**
 * QuantLab V1 — Backfill Decision Outcomes
 * Reconstructs historical DecisionRecords from existing learning artifacts.
 * Run: node scripts/learning/quantlab-v1/backfill-decision-outcomes.mjs [--dry-run]
 */
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { appendDecision, readDecisions } from '../../../functions/api/_shared/quantlab-v1/decision-ledger.mjs';
import { appendOutcome, readOutcomes } from '../../../functions/api/_shared/quantlab-v1/outcome-ledger.mjs';
import { hashSnapshot } from '../../../functions/api/_shared/quantlab-v1/snapshot-integrity.mjs';

const ROOT = process.cwd();
const DRY_RUN = process.argv.includes('--dry-run');
const PRED_DIR = path.join(ROOT, 'mirrors/learning/predictions');
const OUTCOME_DIR = path.join(ROOT, 'mirrors/learning/outcomes');
const OUTCOME_FILES = fs.existsSync(OUTCOME_DIR)
  ? listFilesRecursive(OUTCOME_DIR).filter(f => f.endsWith('.json') || f.endsWith('.ndjson'))
  : [];

const HORIZON_MAP = { '1d': 'short', '5d': 'medium', '20d': 'long' };

async function main() {
  const existingIds = new Set(readDecisions().map(d => d.decision_id));
  const existingOutcomeIds = new Set(readOutcomes().map(o => o.decision_id));
  const outcomeIndex = buildOutcomeIndex();
  let created = 0;
  let skipped = 0;
  let outcomesCreated = 0;
  let outcomeDuplicatesSkipped = 0;
  let errors = 0;

  // Scan prediction files
  if (!fs.existsSync(PRED_DIR)) {
    process.stdout.write(JSON.stringify({ error: 'No predictions directory found', path: PRED_DIR }) + '\n');
    return;
  }

  const predFiles = listFilesRecursive(PRED_DIR).filter(f => f.endsWith('.json') || f.endsWith('.ndjson'));

  for (const file of predFiles) {
    try {
      const content = fs.readFileSync(file, 'utf8');

      // Handle both JSON and NDJSON
      const records = file.endsWith('.ndjson')
        ? content.split('\n').filter(Boolean).map(l => JSON.parse(l))
        : [JSON.parse(content)].flat();

      for (const rec of records) {
        if (!rec.ticker && !rec.symbol) continue;

        const symbol = (rec.ticker || rec.symbol).toUpperCase();
        const horizon = HORIZON_MAP[rec.horizon] || 'medium';
        const asof = rec.trading_date || rec.as_of || rec.date;
        if (!asof) continue;

        // Create deterministic ID to avoid duplicates
        const deterministicId = createHash('md5')
          .update(`${symbol}-${horizon}-${asof}-${rec.run_id || 'none'}`)
          .digest('hex');

        if (existingIds.has(deterministicId)) {
          skipped++;
          continue;
        }

        const pUp = Number(rec.p_up);
        const verdict = Number.isFinite(pUp)
          ? (pUp > 0.6 ? 'BUY' : pUp < 0.4 ? 'SELL' : 'WAIT')
          : 'WAIT';

        const decision = {
          decision_id: deterministicId,
          symbol,
          asset_class: isETF(symbol) ? 'etf' : 'stock',
          horizon,
          asof,
          pipeline_version: 'backfill-v1',
          policy_version: rec.policy_version || 'unknown',
          weights_version: 'default-prior',
          code_ref: 'backfill',
          input_snapshot_id: rec.run_id || deterministicId,
          input_snapshot_hash: hashSnapshot(rec),
          contracts: [{
            source: 'forecast',
            symbol,
            horizon,
            asof,
            correlation_id: deterministicId,
            direction_score: Number.isFinite(pUp) ? (pUp - 0.5) * 2 : 0,
            prob_up: Number.isFinite(pUp) ? pUp : null,
            prob_down: Number.isFinite(pUp) ? 1 - pUp : null,
            confidence: Number(rec.conf) || 0.5,
            evidence_quality: { freshness_score: 1, completeness_score: 0.8, composite: 0.8 },
            regime_probs: { bull: 0.33, chop: 0.34, bear: 0.33, high_vol: 0 },
            volatility_bucket: 'medium',
            data_freshness_ms: null,
            fallback_active: false,
            data_quality_flags: [],
            provenance_flags: ['historical_reconstruction'],
            lifecycle: {
              emitted_at: asof,
              valid_until: new Date(new Date(asof).getTime() + 30 * 86400000).toISOString(),
            },
            raw_payload: rec,
            contract_version: '1.0.0',
          }],
          verdict,
          confidence: Number(rec.conf) || 0.5,
          blocking_reasons: [],
          fallback_active: false,
          fallback_level: 'exact',
          regime_probs: { bull: 0.33, chop: 0.34, bear: 0.33, high_vol: 0 },
          volatility_bucket: 'medium',
          data_quality_flags: [],
          provenance_flags: ['historical_reconstruction'],
          created_at: new Date(asof).toISOString(),
        };

        if (!DRY_RUN) {
          appendDecision(decision);
        }
        existingIds.add(deterministicId);

        // Try to match with outcome data
        const outcomeData = findOutcome(outcomeIndex, symbol, horizon, asof);
        if (outcomeData) {
          const outcomeRecord = {
            decision_id: deterministicId,
            symbol,
            asset_class: decision.asset_class,
            horizon,
            emitted_at: new Date(asof).toISOString(),
            entry_valid_until: new Date(new Date(asof).getTime() + 10 * 86400000).toISOString(),
            entry_triggered: null, // backfill: entry status unknown
            expired_without_entry: null, // backfill: expiry status unknown
            verdict,
            outcome_1d: outcomeData.outcome_1d ?? null,
            outcome_5d: outcomeData.outcome_5d ?? null,
            outcome_20d: outcomeData.outcome_20d ?? null,
            outcome_60d: outcomeData.outcome_60d ?? null,
            mfe: outcomeData.mfe ?? null,
            mae: outcomeData.mae ?? null,
            direction_correct: outcomeData.direction_correct ?? null,
            weights_version: 'default-prior',
            policy_version: rec.policy_version || 'unknown',
            code_ref: 'backfill',
            matured: true,
            estimated_slippage: null, // no friction data for backfill
            spread_at_signal_time: null,
            updated_at: new Date().toISOString(),
            backfill: true,
          };

          if (!DRY_RUN && !existingOutcomeIds.has(deterministicId)) {
            appendOutcome(outcomeRecord);
            existingOutcomeIds.add(deterministicId);
            outcomesCreated++;
          } else if (existingOutcomeIds.has(deterministicId)) {
            outcomeDuplicatesSkipped++;
          }
        }

        created++;
      }
    } catch (err) {
      errors++;
    }
  }

  const summary = {
    timestamp: new Date().toISOString(),
    prediction_files_scanned: predFiles.length,
    decisions_created: created,
    duplicates_skipped: skipped,
    outcomes_created: outcomesCreated,
    outcome_duplicates_skipped: outcomeDuplicatesSkipped,
    errors,
    dry_run: DRY_RUN,
  };

  process.stdout.write(JSON.stringify(summary, null, 2) + '\n');
}

function findOutcome(outcomeIndex, symbol, horizon, asof) {
  const horizonKey = { short: '1d', medium: '5d', long: '20d' }[horizon] || '5d';
  const dateStr = asof.slice(0, 10);
  return outcomeIndex.get(`${dateStr}|${symbol}|${horizonKey}`) || outcomeIndex.get(`${dateStr}|${symbol}|${horizon}`) || null;
}

function buildOutcomeIndex() {
  const index = new Map();

  for (const candidatePath of OUTCOME_FILES) {
    const dateStr = path.basename(candidatePath).slice(0, 10);
    const suffix = candidatePath.endsWith('.ndjson') ? '.ndjson' : '.json';

    try {
      const content = fs.readFileSync(candidatePath, 'utf8');
      const records = suffix === '.ndjson'
        ? content.split('\n').filter(Boolean).map(l => JSON.parse(l))
        : [JSON.parse(content)].flat();

      for (const match of records) {
        const symbol = (match.ticker || match.symbol || '').toUpperCase();
        const horizon = match.horizon || '';
        if (!symbol || !horizon) continue;

        index.set(`${dateStr}|${symbol}|${horizon}`, {
          outcome_1d: match.outcome_1d ?? match.ret_1d ?? null,
          outcome_5d: match.outcome_5d ?? match.ret_5d ?? null,
          outcome_20d: match.outcome_20d ?? match.ret_20d ?? null,
          outcome_60d: match.outcome_60d ?? match.ret_60d ?? null,
          mfe: match.mfe ?? null,
          mae: match.mae ?? null,
          direction_correct: match.direction_correct ?? match.hit ?? null,
        });
      }
    } catch {
      // Skip corrupted files
    }
  }

  return index;
}

function listFilesRecursive(rootDir) {
  const out = [];
  const stack = [rootDir];
  while (stack.length) {
    const current = stack.pop();
    if (!current || !fs.existsSync(current)) continue;
    const stat = fs.statSync(current);
    if (stat.isFile()) {
      out.push(current);
      continue;
    }
    for (const entry of fs.readdirSync(current)) {
      stack.push(path.join(current, entry));
    }
  }
  return out.sort();
}

const ETF_SYMBOLS = new Set([
  'SPY', 'QQQ', 'IWM', 'DIA', 'VOO', 'VTI', 'VEA', 'VWO', 'EFA', 'EEM',
  'BND', 'AGG', 'TLT', 'GLD', 'SLV', 'XLF', 'XLK', 'XLE', 'XLV', 'XLI',
  'XLP', 'XLY', 'XLU', 'XLB', 'XLRE', 'XLC', 'ARKK', 'ARKG', 'ARKW',
  'SMH', 'SOXX', 'IBB', 'KRE', 'XOP', 'KWEB', 'IEMG', 'HYG', 'LQD',
]);

function isETF(symbol) {
  return ETF_SYMBOLS.has(symbol.toUpperCase());
}

main().catch(err => {
  process.stderr.write(`Error: ${err.message}\n`);
  process.exit(1);
});
