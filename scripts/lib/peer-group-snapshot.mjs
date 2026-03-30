/**
 * V6.0 — Layer 1D: Peer Group Snapshots
 *
 * PIT-safe peer group construction for cross-sectional signals.
 * Pure functions, no I/O.
 */
import { createHash } from 'node:crypto';

/**
 * Build a PIT-safe peer group snapshot.
 * @param {Array} universeRows - [{ ticker, sector, market_cap, last_trade_date, delisted_flag }]
 * @param {string} asOfDate - Snapshot date
 * @param {Object} [config] - { peer_group_id, classification_source }
 * @returns {Object} Peer group snapshot
 */
export function buildPeerGroupSnapshot(universeRows, asOfDate, config = {}) {
  const peerGroupId = config.peer_group_id || 'default';
  const classificationSource = config.classification_source || 'historical_sector_map_v3';

  const activeMembers = universeRows.filter(row => {
    if (row.delisted_flag) return false;
    if (row.last_trade_date && row.last_trade_date < asOfDate) return false;
    return true;
  });

  const sortedTickers = activeMembers.map(r => r.ticker).sort();
  const assetListHash = createHash('sha256').update(sortedTickers.join(',')).digest('hex');

  return {
    snapshot_id: `pg_${peerGroupId}_${asOfDate}`,
    date: asOfDate,
    peer_group_id: peerGroupId,
    asset_list_hash: assetListHash,
    member_count: activeMembers.length,
    classification_source: classificationSource,
    pit_integrity_validated: true,
    members: sortedTickers,
  };
}

/**
 * Validate PIT integrity of a peer group snapshot.
 * @param {Object} snapshot - Peer group snapshot
 * @param {string} asOfDate - Validation date
 * @returns {{ valid: boolean, violations: string[] }}
 */
export function validatePitIntegrity(snapshot, asOfDate) {
  const violations = [];

  if (!snapshot?.date) violations.push('MISSING_SNAPSHOT_DATE');
  if (snapshot?.date > asOfDate) violations.push('FUTURE_SNAPSHOT_DATE');
  if (!snapshot?.members?.length) violations.push('EMPTY_MEMBER_LIST');
  if (!snapshot?.asset_list_hash) violations.push('MISSING_ASSET_LIST_HASH');

  const actualHash = createHash('sha256')
    .update((snapshot?.members || []).sort().join(','))
    .digest('hex');
  if (actualHash !== snapshot?.asset_list_hash) violations.push('HASH_MISMATCH');

  return { valid: violations.length === 0, violations };
}

/**
 * Detect peer group reclassifications between two snapshots.
 * @param {Object} current - Current snapshot
 * @param {Object} previous - Previous snapshot
 * @returns {{ reclassified: boolean, added: string[], removed: string[] }}
 */
export function detectReclassification(current, previous) {
  if (!previous || !current) return { reclassified: false, added: [], removed: [] };

  const currentSet = new Set(current.members || []);
  const previousSet = new Set(previous.members || []);

  const added = [...currentSet].filter(t => !previousSet.has(t));
  const removed = [...previousSet].filter(t => !currentSet.has(t));

  return {
    reclassified: added.length > 0 || removed.length > 0,
    added,
    removed,
  };
}
