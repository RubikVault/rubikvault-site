function getByPath(obj, path) {
  if (!obj || typeof obj !== "object") return undefined;
  const parts = String(path || "").split(".").filter(Boolean);
  let current = obj;
  for (const part of parts) {
    if (!current || typeof current !== "object") return undefined;
    current = current[part];
  }
  return current;
}

export function itemsCount(payload, registryEntry, meta) {
  const primaryKey = registryEntry?.primaryKey || "items";
  const value = getByPath(payload, primaryKey);
  if (Array.isArray(value)) return value.length;
  if (value && typeof value === "object") return Object.keys(value).length;
  if (meta && typeof meta === "object" && !meta.reason) {
    meta.reason = "ITEMS_PATH_MISSING";
  }
  return 0;
}
