export function getTiingoKeyInfo(env) {
  const primary = String(env?.TIINGO_API_KEY || "").trim();
  if (primary) return { key: primary, source: "TIINGO_API_KEY" };
  const alias = String(env?.TIIANGO_API_KEY || "").trim();
  if (alias) {
    console.warn('[DEPRECATED] Using TIIANGO_API_KEY (typo). Please migrate to TIINGO_API_KEY.');
    return { key: alias, source: "TIIANGO_API_KEY (DEPRECATED)" };
  }
  return { key: null, source: null };
}

export function getTiingoKey(env) {
  return getTiingoKeyInfo(env).key;
}
