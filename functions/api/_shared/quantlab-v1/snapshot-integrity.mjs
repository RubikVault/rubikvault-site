/**
 * QuantLab V1 — Snapshot Integrity & Audit Chain
 * SHA-256 hashing with chained decision audit trail.
 */
import { createHash } from 'node:crypto';

/**
 * Compute SHA-256 hash of a deterministic JSON representation.
 * @param {Object} obj
 * @returns {string} hex hash
 */
export function hashSnapshot(obj) {
  const canonical = JSON.stringify(obj, Object.keys(obj).sort());
  return createHash('sha256').update(canonical, 'utf8').digest('hex');
}

/**
 * Verify integrity of an object against an expected hash.
 * @param {Object} obj
 * @param {string} expectedHash
 * @returns {boolean}
 */
export function verifyIntegrity(obj, expectedHash) {
  return hashSnapshot(obj) === expectedHash;
}

/**
 * Hash an array of SignalContracts (order-independent via sorting by source+horizon).
 * @param {Object[]} contracts
 * @returns {string}
 */
export function hashContracts(contracts) {
  const sorted = [...contracts].sort((a, b) =>
    `${a.source}:${a.horizon}`.localeCompare(`${b.source}:${b.horizon}`)
  );
  return hashSnapshot(sorted);
}

/**
 * Hash a fusion result.
 * @param {Object} fusionResult
 * @returns {string}
 */
export function hashFusionResult(fusionResult) {
  const { fused_score, fused_confidence, source_contributions, fallback_level } = fusionResult;
  return hashSnapshot({ fused_score, fused_confidence, source_contributions, fallback_level });
}

/**
 * Hash a policy/config object.
 * @param {Object} policy
 * @returns {string}
 */
export function hashPolicy(policy) {
  return hashSnapshot(policy);
}

/**
 * Build a complete audit chain for a decision.
 * @param {Object} params
 * @param {Object[]} params.contracts
 * @param {Object} params.weights - Weight snapshot
 * @param {Object} params.policy - Policy config
 * @param {Object} params.fusionResult
 * @param {Object} params.decisionRecord - The decision (without chain hashes)
 * @param {string|null} params.previousHash - Hash of the previous decision in the chain
 * @returns {Object} All hash fields to merge into DecisionRecord
 */
export function buildAuditChain({ contracts, weights, policy, fusionResult, decisionRecord, previousHash = null }) {
  const contractsHash = hashContracts(contracts || []);
  const weightsHash = hashSnapshot(weights || {});
  const policyHash = hashPolicy(policy || {});
  const fusionHash = fusionResult ? hashFusionResult(fusionResult) : null;

  // Decision hash includes all other hashes + core decision fields
  const decisionCore = {
    decision_id: decisionRecord.decision_id,
    symbol: decisionRecord.symbol,
    horizon: decisionRecord.horizon,
    verdict: decisionRecord.verdict,
    confidence: decisionRecord.confidence,
    contracts_hash: contractsHash,
    weights_hash: weightsHash,
    policy_hash: policyHash,
    fusion_result_hash: fusionHash,
    previous_decision_hash: previousHash,
  };
  const decisionHash = hashSnapshot(decisionCore);

  return {
    contracts_hash: contractsHash,
    weights_hash: weightsHash,
    policy_hash: policyHash,
    fusion_result_hash: fusionHash,
    decision_record_hash: decisionHash,
    previous_decision_hash: previousHash,
    chain_valid: true,
  };
}
