function get(obj, path) {
  const parts = String(path).split('.').filter(Boolean);
  let cur = obj;
  for (const part of parts) {
    if (cur == null) return undefined;
    cur = cur[part];
  }
  return cur;
}

export function pickPaths(obj, paths) {
  const out = {};
  for (const p of paths) {
    out[p] = get(obj, p);
  }
  return out;
}
