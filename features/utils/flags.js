const STORAGE_KEY = "rv_feature_flags";

function readStorage() {
  try {
    const raw = window.localStorage?.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch (error) {
    return {};
  }
}

function writeStorage(value) {
  try {
    window.localStorage?.setItem(STORAGE_KEY, JSON.stringify(value));
  } catch (error) {
    // ignore
  }
}

export function getOverrides() {
  return readStorage();
}

export function setOverride(featureId, enabled) {
  const overrides = readStorage();
  if (enabled === null || enabled === undefined) {
    delete overrides[featureId];
  } else {
    overrides[featureId] = Boolean(enabled);
  }
  writeStorage(overrides);
  return overrides;
}

export function clearOverrides() {
  writeStorage({});
}

export function getOverrideCount() {
  return Object.keys(readStorage()).length;
}

export function applyOverrides(features = []) {
  const overrides = readStorage();
  return features.map((feature) => {
    if (overrides.hasOwnProperty(feature.id)) {
      return { ...feature, enabled: overrides[feature.id] };
    }
    return feature;
  });
}
