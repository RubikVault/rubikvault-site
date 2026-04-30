import { serveStaticJson } from "./_shared/static-only.js";
import {
  compareUniverseSearchCandidates,
  comparePreferredUniverseRows,
  isAllowedWebUniverseRecord,
  normalizeUniverseTypeNorm,
  parseUniverseAssetClassFilter,
} from "../../public/js/universe-ssot.js";

let CACHE_EXACT_INDEX = null;
let CACHE_EXACT_TIME = 0;

export async function onRequestGet(context) {
  const { request, env = {} } = context;
  const url = new URL(request.url);

  const implMarker = "functions/api/universe.js:fallback-v1";

  if (url.searchParams.get("debug") === "1") {
    return serveStaticJson(request, "universe", null, context);
  }

  const origin = url.origin;

  async function fetchJson(path) {
    let res = null;
    let attempts = 0;
    while (attempts < 3) {
      try {
        res = await fetch(new URL(path, origin).toString());
        break; // Success
      } catch (err) {
        attempts++;
        if (attempts >= 3) {
          console.error(`[fetchJson] Failed to fetch ${path} after 3 attempts`, err);
          return null;
        }
        await new Promise(r => setTimeout(r, 50)); // Tiny delay before retry
      }
    }
    if (!res || !res.ok) return null;
    const lowerPath = String(path || "").toLowerCase();
    const contentType = String(res.headers.get("content-type") || "").toLowerCase();
    const contentEncoding = String(res.headers.get("content-encoding") || "").toLowerCase();

    // Cloudflare Workers `fetch` often automatically decompresses the body AND strips `content-encoding: gzip`.
    // If it doesn't strip it, or we rely on the .gz file extension, we use DecompressionStream.
    const isGzipPayload =
      contentEncoding.includes("gzip") ||
      lowerPath.endsWith(".gz") ||
      contentType.includes("application/gzip") ||
      contentType.includes("application/x-gzip");

    if (!isGzipPayload) {
      try {
        return await res.json();
      } catch (e) {
        console.error("fetchJson parse error:", e);
        return null;
      }
    }

    if (typeof DecompressionStream === "function" && res.body) {
      try {
        // We'll peek or buffer to safely decode, but since we can't easily peek a stream,
        // we'll clone it: if decompression fails (meaning it was already decompressed), we catch and parse the clone.
        const resClone = res.clone();
        try {
          const decompressed = res.body.pipeThrough(new DecompressionStream("gzip"));
          const text = await new Response(decompressed).text();
          return JSON.parse(text);
        } catch (decompressErr) {
          // Fallback: it might already be decompressed and just be plaintext JSON!
          return await resClone.json();
        }
      } catch (e) {
        console.error("fetchJson Stream/JSON error:", e);
        return null;
      }
    }

    // Fallback for runtimes without DecompressionStream support.
    try {
      return await res.json();
    } catch (e) {
      return null;
    }
  }

  function normalizeSymbol(raw) {
    const symbol = String(raw || "").trim().toUpperCase();
    if (!symbol) return null;
    if (!/^[A-Z0-9.\-]{1,15}$/.test(symbol)) return null;
    return symbol;
  }

  function normalizeAssetClass(raw) {
    const parsed = parseUniverseAssetClassFilter(raw);
    if (parsed.removed) return "__REMOVED__";
    if (!parsed.value || parsed.value === "all") return null;
    return parsed.value.toUpperCase();
  }

  function normalizeBool(raw) {
    const v = String(raw || "").trim().toLowerCase();
    return v === "1" || v === "true" || v === "yes";
  }

  const PROTECTED_SEARCH_ALIASES = new Map([
    ["ford", ["F"]],
    ["visa", ["V"]],
    ["tesl", ["TSLA"]],
    ["tesla", ["TSLA"]],
  ]);

  const PROTECTED_SEARCH_ROWS = new Map([
    ["F", {
      canonical_id: "US:F",
      symbol: "F",
      exchange: "US",
      name: "Ford Motor Company",
      type_norm: "STOCK",
      layer: "L0_LEGACY_CORE",
    }],
    ["V", {
      canonical_id: "US:V",
      symbol: "V",
      exchange: "US",
      name: "Visa Inc",
      type_norm: "STOCK",
      layer: "L0_LEGACY_CORE",
    }],
    ["TSLA", {
      canonical_id: "US:TSLA",
      symbol: "TSLA",
      exchange: "US",
      name: "Tesla Inc",
      type_norm: "STOCK",
      layer: "L0_LEGACY_CORE",
    }],
  ]);

  function normalizeSearchText(raw) {
    return String(raw || "").toLowerCase().replace(/[^a-z0-9]/g, "");
  }

  function canonicalKey(it) {
    return String(it?.canonical_id || "").trim().toUpperCase()
      || `${String(it?.exchange || "").trim().toUpperCase()}:${String(it?.symbol || it?.ticker || "").trim().toUpperCase()}`;
  }

  function protectedSymbolsForQuery(normalizedQuery, symbolQuery) {
    const out = [];
    for (const [alias, symbols] of PROTECTED_SEARCH_ALIASES.entries()) {
      if (alias === normalizedQuery || alias.startsWith(normalizedQuery) || normalizedQuery.startsWith(alias)) {
        out.push(...symbols);
      }
    }
    if (symbolQuery) out.push(symbolQuery);
    return [...new Set(out.map((value) => normalizeSymbol(value)).filter(Boolean))];
  }

  function protectedFallbackItemsForQuery(normalizedQuery, symbolQuery) {
    return protectedSymbolsForQuery(normalizedQuery, symbolQuery)
      .map((symbol) => PROTECTED_SEARCH_ROWS.get(symbol))
      .filter(Boolean);
  }

  function scanExactIndexByName(exactBySymbol, normalizedQuery, maxItems = 750) {
    if (!exactBySymbol || normalizedQuery.length < 3) return [];
    const hits = [];
    for (const item of Object.values(exactBySymbol)) {
      const symbolText = normalizeSearchText(item?.symbol || item?.ticker || "");
      const nameText = normalizeSearchText(item?.name || "");
      if (
        (symbolText && (symbolText.startsWith(normalizedQuery) || symbolText.includes(normalizedQuery))) ||
        (nameText && nameText.includes(normalizedQuery))
      ) {
        hits.push(item);
        if (hits.length >= maxItems) break;
      }
    }
    return hits;
  }

  function appendUniqueCandidates(target, source, seen) {
    if (!Array.isArray(source)) return;
    for (const item of source) {
      const key = canonicalKey(item);
      if (!key || seen.has(key)) continue;
      seen.add(key);
      target.push(item);
    }
  }

  function isNonEmptySymbols(list) {
    return Array.isArray(list) && list.length > 0;
  }

  const q = String(url.searchParams.get("q") || "").toLowerCase().trim();
  const qSymbol = normalizeSymbol(q);
  const assetClass = normalizeAssetClass(
    url.searchParams.get("asset_class")
    || url.searchParams.get("type_norm")
    || url.searchParams.get("assetClass")
  );
  const exact = normalizeBool(url.searchParams.get("exact"));
  const allowColdExactScan = normalizeBool(url.searchParams.get("allow_exact_scan"))
    || String(env?.RV_UNIVERSE_ALLOW_EXACT_SCAN || "").trim() === "1";
  const requestedLimit = Number(url.searchParams.get("limit"));
  const LIMIT = Number.isFinite(requestedLimit) ? Math.max(1, Math.min(100, requestedLimit)) : 25;
  const cursor = Number(url.searchParams.get("cursor"));
  const offset = Number.isFinite(cursor) && cursor >= 0 ? Math.floor(cursor) : 0;

  const activeAssetClassMeta = parseUniverseAssetClassFilter(url.searchParams.get("asset_class") || "all");
  const activeAssetClass = activeAssetClassMeta.removed ? "__REMOVED__" : activeAssetClassMeta.value;
  function normalizedType(itemRow) {
    return String(normalizeUniverseTypeNorm(itemRow?.type_norm || itemRow?.type)).toLowerCase();
  }
  function includeByAssetClass(itemRow) {
    if (activeAssetClass === "__REMOVED__") return false;
    if (!isAllowedWebUniverseRecord(itemRow)) return false;
    if (activeAssetClass === "all" || !activeAssetClass) return true;
    const t = normalizedType(itemRow);
    if (["stock", "stocks"].includes(activeAssetClass)) return t === "stock";
    if (["etf", "etfs"].includes(activeAssetClass)) return t === "etf";
    if (["bond", "bonds"].includes(activeAssetClass)) return t === "bond";
    return true;
  }

  function toUniverseOutRow(it) {
    if (!it) return null;
    const canonical = typeof it?.canonical_id === "string" ? it.canonical_id : null;
    const canonicalExchange = canonical && canonical.includes(":") ? canonical.split(":")[0] : null;
    const out = {
      symbol: it?.symbol ? String(it.symbol) : null,
      ticker: it?.ticker ? String(it.ticker) : null,
      canonical_id: canonical,
      exchange: typeof it?.exchange === "string" && it.exchange.trim()
        ? it.exchange
        : (canonicalExchange || null),
      currency: typeof it?.currency === "string" ? it.currency : null,
      type_norm: it?.type_norm || null,
      layer: it?.layer || null,
      score_0_100: Number.isFinite(Number(it?.score_0_100)) ? Number(it.score_0_100) : null,
      bars_count: Number.isFinite(Number(it?.bars_count)) ? Number(it.bars_count) : null,
      avg_volume_30d: Number.isFinite(Number(it?.avg_volume_30d)) ? Number(it.avg_volume_30d) : null,
      last_trade_date: typeof it?.last_trade_date === "string" ? it.last_trade_date.slice(0, 10) : null,
      quality_basis: typeof it?.quality_basis === "string" ? it.quality_basis : null
    };
    if (typeof it?.name === "string" && it.name.trim()) out.name = it.name.trim();
    return out;
  }

  function makeV7Payload(symbols, source, nextCursor = null) {
    return {
      schema_version: "3.0",
      ok: true,
      metadata: {
        impl: "functions/api/universe.js:v7-search-adapter",
        fallbackUsed: false,
        source,
        next_cursor: nextCursor
      },
      data: { symbols }
    };
  }

  function applyQFilter(list) {
    const arr = Array.isArray(list) ? list : [];
    const scoped = arr.filter((it) => includeByAssetClass(it));
    if (!q) return scoped.slice(offset, offset + LIMIT);
    if (exact && qSymbol) {
      return scoped.filter((it) => normalizeSymbol(it?.symbol || it || "") === qSymbol).slice(0, LIMIT);
    }
    return scoped
      .filter((it) => {
        const sym = String(it?.symbol || it || "").toLowerCase();
        const name = String(it?.name || "").toLowerCase();
        return (
          (sym && (sym.startsWith(q) || sym.includes(q))) ||
          (name && name.includes(q))
        );
      })
      .slice(offset, offset + LIMIT);
  }

  async function tryV7Search() {
    if (!q) return null;

    const normalized = q.replace(/[^a-zA-Z0-9]/g, "");
    if (!normalized) return null;

    async function getExactIndexDoc() {
      const now = Date.now();
      if (!CACHE_EXACT_INDEX || now - CACHE_EXACT_TIME > 600000) {
        CACHE_EXACT_INDEX = await fetchJson("/data/universe/v7/search/search_exact_by_symbol.json.gz");
        CACHE_EXACT_TIME = now;
      }
      return CACHE_EXACT_INDEX;
    }

    if (!exact && normalized.length === 1) {
      let candidates = [];
      const globalTop = await fetchJson("/data/universe/v7/search/search_global_top_30000.json.gz")
        || await fetchJson("/data/universe/v7/search/search_global_top_2000.json.gz");
      if (Array.isArray(globalTop?.items)) candidates = globalTop.items;
      if (candidates.length) {
        const seenSymbols = new Set();
        const filtered = candidates
          .filter((it) => includeByAssetClass(it))
          .filter((it) => {
            const sym = String(it?.symbol || "").toLowerCase();
            const name = String(it?.name || "").toLowerCase();
            return (sym && sym.startsWith(q)) || (name && name.startsWith(q));
          })
      .sort((a, b) => {
        const searchRank = compareUniverseSearchCandidates(b, a, { query: q, symbolQuery: qSymbol || q });
        if (searchRank !== 0) return searchRank;
        const aSym = String(a?.symbol || "").toUpperCase();
        const bSym = String(b?.symbol || "").toUpperCase();
        const aExact = aSym === qSymbol ? 0 : 1;
            const bExact = bSym === qSymbol ? 0 : 1;
            if (aExact !== bExact) return aExact - bExact;
            const aUs = String(a?.exchange || "").toUpperCase() === "US" ? 0 : 1;
            const bUs = String(b?.exchange || "").toUpperCase() === "US" ? 0 : 1;
            if (aUs !== bUs) return aUs - bUs;
            if (aSym.length !== bSym.length) return aSym.length - bSym.length;
            return aSym.localeCompare(bSym);
          })
          .filter((it) => {
            const sym = String(it?.symbol || it?.ticker || "").toUpperCase();
            if (!sym || seenSymbols.has(sym)) return false;
            seenSymbols.add(sym);
            return true;
          })
          .slice(offset, offset + LIMIT)
          .map((it) => toUniverseOutRow(it))
          .filter(Boolean);
        const nextCursor = filtered.length === LIMIT ? offset + LIMIT : null;
        return makeV7Payload(filtered, "v7_search_single_letter_fastpath", nextCursor);
      }
    }

    if (exact && qSymbol) {
      const exactIndexDoc = await getExactIndexDoc();
      const exactBySymbol = exactIndexDoc?.by_symbol && typeof exactIndexDoc.by_symbol === "object"
        ? exactIndexDoc.by_symbol
        : null;
      if (exactBySymbol) {
        const exactCandidate = exactBySymbol[qSymbol];
        if (exactCandidate && includeByAssetClass(exactCandidate)) {
          const row = toUniverseOutRow(exactCandidate);
          if (row) return makeV7Payload([row], "v7_search_exact_index", null);
        }
      }
    }

    let exactIndexDoc = null;
    let exactBySymbol = null;
    if (allowColdExactScan) {
      exactIndexDoc = await getExactIndexDoc();
      exactBySymbol = exactIndexDoc?.by_symbol && typeof exactIndexDoc.by_symbol === "object"
        ? exactIndexDoc.by_symbol
        : null;
    }
    const protectedItems = protectedFallbackItemsForQuery(normalized, qSymbol);
    if (exactBySymbol) {
      appendUniqueCandidates(
        protectedItems,
        protectedSymbolsForQuery(normalized, qSymbol).map((symbol) => exactBySymbol?.[symbol]).filter(Boolean),
        new Set(protectedItems.map((item) => canonicalKey(item))),
      );
    }

    const manifest = await fetchJson("/data/universe/v7/search/search_index_manifest.json");
    const buckets = manifest?.buckets;

    const prefixes = [];
    for (let depth = 1; depth <= 3; depth += 1) {
      if (normalized.length >= depth) prefixes.push(normalized.slice(0, depth).toLowerCase());
    }

    let bucketPayload = null;
    if (buckets && typeof buckets === "object") {
      for (let i = prefixes.length - 1; i >= 0; i -= 1) {
        const prefix = prefixes[i];
        if (!buckets[prefix]) continue;
        bucketPayload = await fetchJson(`/data/universe/v7/search/buckets/${prefix}.json.gz`);
        if (bucketPayload?.items && Array.isArray(bucketPayload.items)) break;
      }
    }
    let source = "v7_search_buckets";
    let sourceItems = Array.isArray(bucketPayload?.items) ? bucketPayload.items : [];

    // Always merge global top 2000 so name-based searches (e.g. "Apple") find the primary
    // stock (AAPL) even if it lives in a different symbol-prefix bucket.
    const globalTop = await fetchJson("/data/universe/v7/search/search_global_top_30000.json.gz")
      || await fetchJson("/data/universe/v7/search/search_global_top_2000.json.gz");
    const globalItems = Array.isArray(globalTop?.items) ? globalTop.items : [];
    const exactNameItems = allowColdExactScan ? scanExactIndexByName(exactBySymbol, normalized) : [];
    const mergedSourceItems = [];
    const mergedSeen = new Set();
    appendUniqueCandidates(mergedSourceItems, protectedItems, mergedSeen);
    appendUniqueCandidates(mergedSourceItems, sourceItems, mergedSeen);
    appendUniqueCandidates(mergedSourceItems, globalItems, mergedSeen);
    appendUniqueCandidates(mergedSourceItems, exactNameItems, mergedSeen);
    sourceItems = mergedSourceItems;
    source = [
      protectedItems.length ? "protected" : null,
      Array.isArray(bucketPayload?.items) ? "buckets" : null,
      globalItems.length ? "global" : null,
      exactNameItems.length ? "exact_index" : null,
    ].filter(Boolean).join("+") || "v7_search_empty";

    if (!Array.isArray(sourceItems) || sourceItems.length === 0) {
      const exactByPrefix1 = allowColdExactScan && exactIndexDoc?.by_prefix_1 && typeof exactIndexDoc.by_prefix_1 === "object"
        ? exactIndexDoc.by_prefix_1
        : null;
      let candidates = [];
      if (exactBySymbol) {
        const prefixKey = normalized.charAt(0).toLowerCase();
        if (normalized.length === 1 && exactByPrefix1 && Array.isArray(exactByPrefix1[prefixKey])) {
          candidates = exactByPrefix1[prefixKey]
            .map((symbol) => exactBySymbol[String(symbol || "").toUpperCase()])
            .filter(Boolean);
        } else {
          if (globalItems.length) {
            candidates = globalItems;
          } else {
            candidates = Object.values(exactBySymbol).slice(0, 5000);
          }
        }
      }
      if (candidates.length > 0) {
        sourceItems = candidates;
        source = "v7_search_exact_index";
      }
    }

    // Final fallback
    if (!Array.isArray(sourceItems)) {
      if (globalItems.length) {
        sourceItems = globalItems;
        source = "v7_search_global_top";
      }
    }

    if (!Array.isArray(sourceItems)) return null;

    function getItemExchange(it) {
      if (typeof it?.exchange === "string" && it.exchange.trim()) return it.exchange.trim().toUpperCase();
      if (typeof it?.canonical_id === "string" && it.canonical_id.includes(":")) return it.canonical_id.split(":")[0].toUpperCase();
      return "";
    }

    function getProtectedRank(it) {
      const sym = normalizeSymbol(it?.symbol || it?.ticker || it?.canonical_id?.split(":")?.[1]);
      if (!sym) return 100;
      const protectedSymbols = protectedSymbolsForQuery(normalized, qSymbol);
      const idx = protectedSymbols.indexOf(sym);
      return idx === -1 ? 100 : idx;
    }

    const seenCanonicalIds = new Set();
    const seenSymbols = new Set();

    const filtered = sourceItems
      .filter((it) => includeByAssetClass(it))
      .filter((it) => {
        if (exact && qSymbol) {
          return normalizeSymbol(it?.symbol || it?.ticker || it?.canonical_id?.split(":")?.[1]) === qSymbol;
        }
        const sym = String(it?.symbol || "").toLowerCase();
        const name = String(it?.name || "").toLowerCase();
        return (sym && (sym.startsWith(q) || sym.includes(q))) || (name && name.includes(q));
      })
      .sort((a, b) => {
        const aProtected = getProtectedRank(a);
        const bProtected = getProtectedRank(b);
        if (aProtected !== bProtected) return aProtected - bProtected;
        const searchRank = compareUniverseSearchCandidates(b, a, { query: q, symbolQuery: qSymbol || q });
        if (searchRank !== 0) return searchRank;
        const aSym = String(a?.symbol || a?.ticker || "").toUpperCase();
        const bSym = String(b?.symbol || b?.ticker || "").toUpperCase();
        const aName = String(a?.name || "").toLowerCase();
        const bName = String(b?.name || "").toLowerCase();
        const aRank = aSym === qSymbol ? 0 : aSym.startsWith(qSymbol || "") ? 1 : aName.startsWith(q) ? 2 : 3;
        const bRank = bSym === qSymbol ? 0 : bSym.startsWith(qSymbol || "") ? 1 : bName.startsWith(q) ? 2 : 3;
        if (aRank !== bRank) return aRank - bRank;
        const aLayer = String(a?.layer || "").toUpperCase() === "L0_LEGACY_CORE" ? 0 : 1;
        const bLayer = String(b?.layer || "").toUpperCase() === "L0_LEGACY_CORE" ? 0 : 1;
        if (aLayer !== bLayer) return aLayer - bLayer;
        const aExch = getItemExchange(a);
        const bExch = getItemExchange(b);
        const aUs = aExch === "US" ? 0 : 1;
        const bUs = bExch === "US" ? 0 : 1;
        if (aUs !== bUs) return aUs - bUs;
        const aVol = Number(a?.avg_volume_30d) || 0;
        const bVol = Number(b?.avg_volume_30d) || 0;
        if (aVol !== bVol) return bVol - aVol;
        if (aSym.length !== bSym.length) return aSym.length - bSym.length;
        return aSym.localeCompare(bSym);
      })
      .filter((it) => {
        const canonicalId = String(it?.canonical_id || "").trim().toUpperCase();
        if (!canonicalId) return true;
        if (seenCanonicalIds.has(canonicalId)) return false;
        seenCanonicalIds.add(canonicalId);
        return true;
      })
      .filter((it) => {
        const sym = String(it?.symbol || it?.ticker || "").toUpperCase();
        if (!sym || seenSymbols.has(sym)) return false;
        seenSymbols.add(sym);
        return true;
      })
      .slice(offset, offset + LIMIT)
      .map((it) => toUniverseOutRow(it))
      .filter(Boolean);

    const nextCursor = filtered.length === LIMIT ? offset + LIMIT : null;
    return makeV7Payload(filtered, source, nextCursor);
  }

  const v7 = await tryV7Search();
  if (v7) {
    return new Response(JSON.stringify(v7), {
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "public, max-age=120",
        "X-RV-Universe-Impl": "functions/api/universe.js:v7-search-adapter"
      }
    });
  }

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
        const type_norm = String(item?.type_norm || "STOCK").toUpperCase();
        const row = name ? { symbol, name } : { symbol };
        row.type_norm = type_norm;
        return row;
      })
      .filter(Boolean);

    const filtered = applyQFilter(symbols);
    const nextCursor = filtered.length === LIMIT ? offset + LIMIT : null;
    return new Response(
      JSON.stringify({
        schema_version: "3.0",
        ok: true,
        metadata: { impl: implMarker, fallbackUsed: false, next_cursor: nextCursor },
        data: { symbols: filtered }
      }),
      {
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": "public, max-age=300",
          "X-RV-Universe-Impl": implMarker
        }
      }
    );
  }

  const universeMeta = await fetchJson("/data/rvci/universe_meta.json");
  const tierMap = universeMeta?.data?.tiers;
  let tierSymbols = [];
  if (tierMap && typeof tierMap === "object") {
    for (const key of Object.keys(tierMap)) {
      const list = tierMap[key];
      if (Array.isArray(list)) tierSymbols.push(...list);
    }
  }

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
    if (!normalized || seen.has(normalized)) return;
    seen.add(normalized);
    const name = resolveNameMap.get(normalized) || null;
    const row = name ? { symbol: normalized, name } : { symbol: normalized };
    row.type_norm = "STOCK";
    merged.push(row);
  }

  for (const sym of tierSymbols) pushSymbol(sym);
  for (const { ticker } of resolveEntries) pushSymbol(ticker);

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

  const filtered = applyQFilter(merged);
  const nextCursor = filtered.length === LIMIT ? offset + LIMIT : null;

  return new Response(
    JSON.stringify({
      schema_version: "3.0",
      ok: true,
      metadata: { impl: implMarker, fallbackUsed: true, next_cursor: nextCursor },
      data: { symbols: filtered }
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
