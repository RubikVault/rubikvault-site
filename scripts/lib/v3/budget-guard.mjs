import path from "node:path";
import { readJson, writeJsonAtomic } from "./stable-io.mjs";

export function estimatePlannedCalls(dpName, plannedCalls, budgetPolicy) {
  const hardCap = Number(budgetPolicy.hard_cap || 0);
  const reserve = Number(budgetPolicy.reserve || 0);
  const dpCap = Number((budgetPolicy.max_planned_calls || {})[dpName] || hardCap);
  return {
    dpName,
    plannedCalls,
    hardCap,
    reserve,
    dpCap
  };
}

export async function loadBudgetLedger(rootDir) {
  const ledgerPath = path.join(rootDir, "public/data/v3/system/budget-ledger.json");
  const ledger = await readJson(ledgerPath, {
    meta: {
      schema: "budget-ledger.v1"
    },
    hard_cap: 0,
    reserve: 0,
    used_calls: 0,
    by_dp: {}
  });
  return { ledgerPath, ledger };
}

export async function initBudgetLedger(rootDir, budgetPolicy, runContext) {
  const { ledgerPath, ledger } = await loadBudgetLedger(rootDir);
  ledger.hard_cap = Number(budgetPolicy.hard_cap || 0);
  ledger.reserve = Number(budgetPolicy.reserve || 0);
  ledger.meta = {
    ...(ledger.meta || {}),
    schema: "budget-ledger.v1",
    updated_at: runContext.generatedAt,
    run_id: runContext.runId,
    commit: runContext.commit
  };
  await writeJsonAtomic(ledgerPath, ledger);
  return ledger;
}

export function assertBudgetBeforeCalls(ledger, planned) {
  const remaining = Number(ledger.hard_cap || 0) - Number(ledger.used_calls || 0);
  const safeRemaining = remaining - Number(ledger.reserve || 0);

  if (planned.plannedCalls > planned.dpCap) {
    throw new Error(`BUDGET_BLOCKED:planned>${planned.dpCap} for ${planned.dpName}`);
  }
  if (planned.plannedCalls > safeRemaining) {
    throw new Error(`BUDGET_BLOCKED:planned>${safeRemaining} safe remaining for ${planned.dpName}`);
  }
}

export async function consumeBudget(rootDir, dpName, calls, runContext) {
  const { ledgerPath, ledger } = await loadBudgetLedger(rootDir);
  ledger.used_calls = Number(ledger.used_calls || 0) + Number(calls || 0);
  ledger.by_dp = ledger.by_dp || {};
  ledger.by_dp[dpName] = Number(ledger.by_dp[dpName] || 0) + Number(calls || 0);
  ledger.meta = {
    ...(ledger.meta || {}),
    updated_at: runContext.generatedAt,
    run_id: runContext.runId,
    commit: runContext.commit
  };
  await writeJsonAtomic(ledgerPath, ledger);
  return ledger;
}
