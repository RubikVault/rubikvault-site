#!/usr/bin/env node
/**
 * QuantLab V1 — Daily Outcome Update
 * Reads decision ledger, evaluates lifecycle states, estimates frictions, updates outcomes.
 * Run: node scripts/learning/quantlab-v1/daily-outcome-update.mjs [--dry-run]
 */
import fs from 'node:fs';
import path from 'node:path';
import { readDecisions } from '../../../functions/api/_shared/quantlab-v1/decision-ledger.mjs';
import { readOutcomes, appendOutcome, updateOutcome } from '../../../functions/api/_shared/quantlab-v1/outcome-ledger.mjs';
import { evaluateLifecycle, classifyOutcomeState, computeEntryDeadline, LIFECYCLE_STATES } from '../../../functions/api/_shared/quantlab-v1/signal-lifecycle.mjs';
import { estimateFrictions, computeNetOutcome } from '../../../functions/api/_shared/quantlab-v1/execution-frictions.mjs';

const ROOT = process.cwd();
const DRY_RUN = process.argv.includes('--dry-run');

async function main() {
  const decisions = readDecisions();
  const existingOutcomes = new Map(readOutcomes().map(o => [o.decision_id, o]));

  let created = 0;
  let updated = 0;
  const stateCounts = { emitted: 0, entry_triggered: 0, expired_without_entry: 0, invalidated_before_entry: 0, executed_and_matured: 0 };
  const frictionStats = { total_estimated: 0, count: 0 };

  for (const dec of decisions) {
    if (!existingOutcomes.has(dec.decision_id)) {
      const outcomeRecord = {
        decision_id: dec.decision_id,
        symbol: dec.symbol,
        asset_class: dec.asset_class,
        horizon: dec.horizon,
        emitted_at: dec.created_at,
        entry_valid_until: computeEntryDeadline(dec.horizon, dec.created_at),
        entry_triggered: false,
        expired_without_entry: false,
        verdict: dec.verdict,
        trade_signal: dec.trade_signal || null,
        outcome_1d: null, outcome_5d: null, outcome_20d: null, outcome_60d: null,
        outcome_net_1d: null, outcome_net_5d: null, outcome_net_20d: null, outcome_net_60d: null,
        mfe: null, mae: null, direction_correct: null,
        estimated_slippage: null, spread_at_signal_time: null,
        corporate_actions_flag: null, liquidity_bucket: null,
        weights_version: dec.weights_version,
        policy_version: dec.policy_version,
        code_ref: dec.code_ref,
        matured: false,
        updated_at: new Date().toISOString(),
      };

      if (!DRY_RUN) appendOutcome(outcomeRecord);
      created++;
      stateCounts.emitted++;
      continue;
    }

    const outcome = existingOutcomes.get(dec.decision_id);
    if (outcome.matured) {
      stateCounts[classifyOutcomeState(outcome).replace(/ /g, '_')] =
        (stateCounts[classifyOutcomeState(outcome)] || 0) + 1;
      continue;
    }

    // Evaluate lifecycle transitions
    const entryZone = outcome.trade_signal?.entry_zone || null;
    const lifecyclePatch = evaluateLifecycle(outcome, null, entryZone);

    // Estimate frictions for executed signals
    const patch = { ...lifecyclePatch };
    if ((outcome.entry_triggered || patch.entry_triggered) && !outcome.estimated_slippage) {
      const frictions = estimateFrictions({
        close: outcome.trade_signal?.entry_zone?.high || 0,
        atr: null,
        volatility_bucket: dec.volatility_bucket || 'medium',
        liquidity_bucket: outcome.liquidity_bucket || 'medium',
      });
      patch.estimated_slippage = frictions.estimated_slippage;
      patch.spread_at_signal_time = frictions.estimated_spread;
      frictionStats.total_estimated += frictions.friction_pct;
      frictionStats.count++;

      // Apply net outcomes if gross outcomes exist
      for (const window of ['1d', '5d', '20d', '60d']) {
        const grossKey = `outcome_${window}`;
        const netKey = `outcome_net_${window}`;
        if (outcome[grossKey] != null && outcome[netKey] == null) {
          const net = computeNetOutcome(outcome[grossKey], frictions);
          patch[netKey] = net.net;
        }
      }

      // Aggregate gross/net for the primary horizon window
      const primaryWindow = { short: '1d', medium: '5d', long: '20d' }[outcome.horizon] || '5d';
      const grossVal = outcome[`outcome_${primaryWindow}`] ?? patch[`outcome_${primaryWindow}`] ?? null;
      const netVal = outcome[`outcome_net_${primaryWindow}`] ?? patch[`outcome_net_${primaryWindow}`] ?? null;
      if (grossVal != null && outcome.gross_outcome == null) patch.gross_outcome = grossVal;
      if (netVal != null && outcome.net_outcome_after_friction == null) patch.net_outcome_after_friction = netVal;
    }

    // Copy fallback_level from decision if not already set
    if (outcome.fallback_level == null && dec.fallback_level) {
      patch.fallback_level = dec.fallback_level;
    }

    // Mark missing friction data
    if ((outcome.entry_triggered || patch.entry_triggered) && !outcome.estimated_slippage && !patch.estimated_slippage) {
      const flags = outcome.data_quality_flags || [];
      if (!flags.includes('friction_data_missing')) {
        patch.data_quality_flags = [...flags, 'friction_data_missing'];
      }
    }

    if (Object.keys(patch).length > 0) {
      patch.updated_at = new Date().toISOString();
      if (!DRY_RUN) updateOutcome(dec.decision_id, patch);
      updated++;
    }

    const merged = { ...outcome, ...patch };
    const state = classifyOutcomeState(merged);
    stateCounts[state] = (stateCounts[state] || 0) + 1;
  }

  const summary = {
    timestamp: new Date().toISOString(),
    total_decisions: decisions.length,
    outcomes_created: created,
    outcomes_updated: updated,
    lifecycle_states: stateCounts,
    friction_stats: {
      signals_with_friction: frictionStats.count,
      avg_friction_pct: frictionStats.count > 0 ? (frictionStats.total_estimated / frictionStats.count * 100).toFixed(3) + '%' : null,
    },
    dry_run: DRY_RUN,
  };

  const reportDir = path.join(ROOT, 'mirrors/learning/quantlab-v1/reports');
  if (!fs.existsSync(reportDir)) fs.mkdirSync(reportDir, { recursive: true });
  const reportPath = path.join(reportDir, `outcome-update-${new Date().toISOString().slice(0, 10)}.json`);
  if (!DRY_RUN) fs.writeFileSync(reportPath, JSON.stringify(summary, null, 2) + '\n', 'utf8');

  process.stdout.write(JSON.stringify(summary, null, 2) + '\n');
}

main().catch(err => { process.stderr.write(`Error: ${err.message}\n`); process.exit(1); });
