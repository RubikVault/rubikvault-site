/**
 * RUNBLOCK v3.0 — Leakage Guards
 *
 * RED-level hard blocker. If any assertion fails:
 * - Global State = RED
 * - Pipeline halt
 * - No signals, no trading, no promotion
 */

/**
 * Assert no temporal leakage in a feature/label pair.
 *
 * @param {Object} params
 * @param {string} params.asofTimestamp - When the snapshot was taken
 * @param {string} params.labelStartTimestamp - When the label period begins
 * @param {string} params.featureTimestamp - Latest timestamp used in features
 * @param {string} [params.publishTime] - Publish time for macro/event data
 * @returns {{ pass: boolean, violations: string[] }}
 */
export function assertNoLeakage({ asofTimestamp, labelStartTimestamp, featureTimestamp, publishTime }) {
  const violations = [];
  const asof = new Date(asofTimestamp).getTime();
  const labelStart = new Date(labelStartTimestamp).getTime();
  const featureTs = new Date(featureTimestamp).getTime();

  if (asof >= labelStart) {
    violations.push(`asof_timestamp(${asofTimestamp}) >= label_start(${labelStartTimestamp})`);
  }
  if (featureTs > asof) {
    violations.push(`feature_timestamp(${featureTimestamp}) > asof(${asofTimestamp})`);
  }
  if (publishTime) {
    const pub = new Date(publishTime).getTime();
    if (pub > asof) {
      violations.push(`publish_time(${publishTime}) > asof(${asofTimestamp})`);
    }
  }

  return { pass: violations.length === 0, violations };
}

/**
 * Assert purge/embargo periods are respected in walk-forward construction.
 *
 * @param {Object} params
 * @param {string} params.trainEnd - End of training window
 * @param {string} params.valStart - Start of validation window
 * @param {number} params.purgeDays - Purge period in trading days
 * @param {number} params.embargoDays - Embargo period in trading days
 * @returns {{ pass: boolean, violations: string[] }}
 */
export function assertPurgeEmbargo({ trainEnd, valStart, purgeDays = 5, embargoDays = 5 }) {
  const violations = [];
  const trainEndMs = new Date(trainEnd).getTime();
  const valStartMs = new Date(valStart).getTime();
  // Approximate trading day = 1.4 calendar days
  const purgeMs = purgeDays * 1.4 * 86400000;
  const embargoMs = embargoDays * 1.4 * 86400000;

  const gap = valStartMs - trainEndMs;
  const requiredGap = purgeMs + embargoMs;

  if (gap < requiredGap) {
    violations.push(
      `Gap between trainEnd(${trainEnd}) and valStart(${valStart}) is ${Math.round(gap / 86400000)}d, ` +
      `need ~${Math.round(requiredGap / 86400000)}d (purge=${purgeDays}+embargo=${embargoDays} trading days)`
    );
  }

  return { pass: violations.length === 0, violations };
}

/**
 * Validate a full training/validation split for leakage.
 *
 * @param {Array} trainSamples - [{ asof, features_ts, label_start }]
 * @param {Array} valSamples - [{ asof, features_ts, label_start }]
 * @returns {{ pass: boolean, violations: string[] }}
 */
export function validateSplit(trainSamples, valSamples) {
  const violations = [];

  for (const s of trainSamples) {
    const check = assertNoLeakage({
      asofTimestamp: s.asof,
      labelStartTimestamp: s.label_start,
      featureTimestamp: s.features_ts,
    });
    if (!check.pass) {
      violations.push(...check.violations.map(v => `TRAIN: ${v}`));
    }
  }

  for (const s of valSamples) {
    const check = assertNoLeakage({
      asofTimestamp: s.asof,
      labelStartTimestamp: s.label_start,
      featureTimestamp: s.features_ts,
    });
    if (!check.pass) {
      violations.push(...check.violations.map(v => `VAL: ${v}`));
    }
  }

  return { pass: violations.length === 0, violations };
}
