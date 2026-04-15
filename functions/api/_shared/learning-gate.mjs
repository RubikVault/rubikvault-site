const LEARNING_STATUSES = new Set(['BOOTSTRAP', 'ACTIVE', 'SAFE_MODE']);

function normalizeLearningStatus(value, fallback = 'BOOTSTRAP') {
  const normalized = String(value || '').trim().toUpperCase();
  return LEARNING_STATUSES.has(normalized) ? normalized : fallback;
}

function normalizeSafetySwitch(value) {
  return value && typeof value === 'object' ? value : null;
}

function normalizeMinimumNStatus(value) {
  return value && typeof value === 'object' ? value : null;
}

export function computeMinimumNNotMet(minimumNStatus = null, safetySwitch = null) {
  if (String(safetySwitch?.trigger || '').trim().toLowerCase() === 'minimum_n_not_met') return true;
  if (!minimumNStatus || typeof minimumNStatus !== 'object') return false;
  if (minimumNStatus.ready_for_safety === false) return true;
  const byHorizon = minimumNStatus.by_horizon && typeof minimumNStatus.by_horizon === 'object'
    ? Object.values(minimumNStatus.by_horizon)
    : [];
  return byHorizon.length > 0 && byHorizon.some((row) => row?.satisfied === false);
}

export function deriveLearningGate({
  learning_status = null,
  safety_switch = null,
  minimum_n_status = null,
  policy = null,
  default_status = null,
} = {}) {
  const learningStatus = normalizeLearningStatus(
    learning_status,
    normalizeLearningStatus(default_status || policy?.learning_status?.default || null)
  );
  const safetySwitch = normalizeSafetySwitch(safety_switch);
  const minimumNStatus = normalizeMinimumNStatus(
    minimum_n_status || safetySwitch?.minimum_n_status || null
  );
  const minimumNNotMet = computeMinimumNNotMet(minimumNStatus, safetySwitch);
  const safetyLevel = String(safetySwitch?.level || '').trim().toUpperCase() || null;
  const defaultStatus = normalizeLearningStatus(default_status || policy?.learning_status?.default || null);
  let blockedReason = null;
  if (minimumNNotMet) blockedReason = 'minimum_n_not_met';
  else if (learningStatus === 'BOOTSTRAP') blockedReason = 'learning_bootstrap';
  else if (learningStatus === 'SAFE_MODE' || safetyLevel === 'RED') blockedReason = String(safetySwitch?.trigger || 'safety_switch_red').trim().toLowerCase();

  const effectiveStatus = blockedReason
    ? (learningStatus === 'SAFE_MODE' || safetyLevel === 'RED' ? 'SAFE_MODE' : 'BLOCKED')
    : learningStatus;

  return {
    status: effectiveStatus,
    learning_status: learningStatus,
    learning_status_default: defaultStatus,
    safety_level: safetyLevel,
    safety_switch: safetySwitch,
    minimum_n_status: minimumNStatus,
    minimum_n_not_met: minimumNNotMet,
    blocked_reason: blockedReason,
    ready_for_safety: minimumNStatus?.ready_for_safety === true,
    ready_for_release: effectiveStatus === 'ACTIVE' && minimumNNotMet !== true && safetyLevel !== 'RED',
  };
}
