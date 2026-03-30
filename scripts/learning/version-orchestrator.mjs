/**
 * V6.0 — Version Orchestrator
 *
 * Manages SemVer transitions and recomputation triggers.
 * Coordinates version bumps with artifact invalidation.
 */

/**
 * Bump version string based on scope.
 *
 * - full_recomputation → minor bump (6.0.x → 6.1.0)
 * - partial → patch bump (6.0.x → 6.0.x+1)
 *
 * @param {string} currentVersion - e.g. '6.0.0'
 * @param {string} scope - 'full' | 'partial'
 * @returns {string} New version string
 */
export function bumpVersion(currentVersion, scope) {
  const parts = (currentVersion || '6.0.0').split('.').map(Number);
  if (parts.length !== 3 || parts.some(p => !Number.isFinite(p))) {
    return '6.0.1';
  }

  const [major, minor, patch] = parts;

  if (scope === 'full') {
    return `${major}.${minor + 1}.0`;
  }

  return `${major}.${minor}.${patch + 1}`;
}

/**
 * Determine which artifacts should be invalidated on a version bump.
 *
 * @param {string} newVersion - The new version after bump
 * @param {string} scope - 'full' | 'partial'
 * @returns {string[]} List of artifact categories to invalidate
 */
export function invalidateArtifacts(newVersion, scope) {
  const artifacts = [];

  if (scope === 'full') {
    artifacts.push(
      'trial_registry',
      'recalibration_ledger',
      'cached_predictions',
      'governance_reports',
      'peer_group_snapshots',
    );
  } else {
    artifacts.push(
      'cached_predictions',
      'governance_reports',
    );
  }

  return artifacts;
}

/**
 * Trigger a recomputation event.
 *
 * @param {Object} params
 * @param {string} params.scope - 'full' | 'partial'
 * @param {string} params.trigger - Why the recompute was triggered
 * @param {string} params.currentVersion - Current system version
 * @returns {{ new_version: string, invalidated_artifacts: string[], recompute_scope: string, triggered_at: string }}
 */
export function triggerRecompute({ scope, trigger, currentVersion }) {
  const effectiveScope = scope === 'full' ? 'full' : 'partial';
  const newVersion = bumpVersion(currentVersion, effectiveScope);
  const invalidated = invalidateArtifacts(newVersion, effectiveScope);

  return {
    new_version: newVersion,
    previous_version: currentVersion,
    invalidated_artifacts: invalidated,
    recompute_scope: effectiveScope,
    trigger,
    triggered_at: new Date().toISOString(),
  };
}
