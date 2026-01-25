import { serveStaticJson } from "./_shared/static-only.js";

export async function onRequestGet(context) {
  const { request } = context;
  const url = new URL(request.url);

  const implMarker = "functions/api/universe.js:fallback-v1";

  if (url.searchParams.get("debug") === "1") {
    return serveStaticJson(request, "universe", null, context);
  }

  const origin = url.origin;

  async function fetchJson(path) {
    const res = await fetch(new URL(path, origin).toString());
    if (!res.ok) return null;
    return await res.json();
  }

  function normalizeSymbol(raw) {
    const symbol = String(raw || "").trim().toUpperCase();
    if (!symbol) return null;
    if (!/^[A-Z0-9.\-]{1,15}$/.test(symbol)) return null;
    return symbol;
  }

  function isNonEmptySymbols(list) {
    return Array.isArray(list) && list.length > 0;
  }

  // 1) Primary source: v3 universe snapshot (may be placeholder with data:null)
  const snapshot = await fetchJson("/data/snapshots/universe/latest.json");
  const snapshotSymbols = snapshot?.data?.symbols;
  if (snapshot?.schema_version === "3.0" && isNonEmptySymbols(snapshotSymbols)) {
    const symbols = snapshotSymbols
      .map((item) => {
        if (typeof item === "string") return { symbol: normalizeSymbol(item) };
        if (!item || typeof item !== "object") return null;
        const symbol = normalizeSymbol(item.symbol || item.ticker || item.id);
        if (!symbol) return null;
        const name = typeof item.name === "string" && item.name.trim() ? item.name.trim() : null;
        return name ? { symbol, name } : { symbol };
      })
      .filter(Boolean);

    return new Response(
      JSON.stringify({
        schema_version: "3.0",
        ok: true,
        metadata: { impl: implMarker, fallbackUsed: false },
        data: { symbols }
      }),
      {
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": "public, max-age=300"
          ,"X-RV-Universe-Impl": implMarker
        }
      }
    );
  }

  // 2) Fallback: RVCI universe meta (large ticker universe, names optional)
  const universeMeta = await fetchJson("/data/rvci/universe_meta.json");
  const tierMap = universeMeta?.data?.tiers;
  let tierSymbols = [];
  if (tierMap && typeof tierMap === "object") {
    for (const key of Object.keys(tierMap)) {
      const list = tierMap[key];
      if (Array.isArray(list)) tierSymbols.push(...list);
    }
  }

  // 3) Fallback: symbol resolve index (small but gives names)
  const resolveIndex = await fetchJson("/data/symbol-resolve.v1.json");
  const resolveEntries = Array.isArray(resolveIndex?.entries) ? resolveIndex.entries : [];
  const resolveNameMap = new Map();
  for (const entry of resolveEntries) {
    if (!entry || typeof entry !== "object") continue;
    const sym = normalizeSymbol(entry.ticker);
    if (!sym) continue;
    const name = typeof entry.name === "string" && entry.name.trim() ? entry.name.trim() : null;
    if (name) resolveNameMap.set(sym, name);
  }

  const merged = [];
  const seen = new Set();

  function pushSymbol(sym) {
    const normalized = normalizeSymbol(sym);
    if (!normalized) return;
    if (seen.has(normalized)) return;
    seen.add(normalized);
    const name = resolveNameMap.get(normalized) || null;
    merged.push(name ? { symbol: normalized, name } : { symbol: normalized });
  }

  for (const sym of tierSymbols) pushSymbol(sym);
  for (const { ticker } of resolveEntries) pushSymbol(ticker);

  // 4) Last-resort fallback: registry groups (tiny)
  if (merged.length === 0) {
    const registry = await fetchJson("/data/registry/universe.v1.json");
    const groups = registry?.groups;
    if (groups && typeof groups === "object") {
      for (const group of Object.values(groups)) {
        const symbols = Array.isArray(group?.symbols) ? group.symbols : [];
        for (const sym of symbols) pushSymbol(sym);
      }
    }
  }

  return new Response(
    JSON.stringify({
      schema_version: "3.0",
      ok: true,
      metadata: { impl: implMarker, fallbackUsed: true },
      data: { symbols: merged }
    }),
    {
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "public, max-age=300",
        "X-RV-Universe-Fallback": "true",
        "X-RV-Universe-Impl": implMarker
      }
    }
  );
}
