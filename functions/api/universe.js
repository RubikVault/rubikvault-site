import { serveStaticJson } from "./_shared/static-only.js";

let CACHE_EXACT_INDEX = null;
let CACHE_EXACT_TIME = 0;

export async function onRequestGet(context) {
  const { request } = context;
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
    const v = String(raw || "").trim().toUpperCase();
    if (!v || v === "ALL") return null;
    const aliases = new Map([
      ["STOCKS", "STOCK"],
      ["EQUITIES", "STOCK"],
      ["CRYPTOS", "CRYPTO"],
      ["FX", "FOREX"],
      ["BONDS", "BOND"],
      ["INDICES", "INDEX"],
      ["FUNDS", "FUND"],
      ["ETFS", "ETF"]
    ]);
    const resolved = aliases.get(v) || v;
    const allowed = new Set(["STOCK", "ETF", "FUND", "BOND", "INDEX", "FOREX", "CRYPTO", "OTHER"]);
    return allowed.has(resolved) ? resolved : null;
  }

  function normalizeBool(raw) {
    const v = String(raw || "").trim().toLowerCase();
    return v === "1" || v === "true" || v === "yes";
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
  const requestedLimit = Number(url.searchParams.get("limit"));
  const LIMIT = Number.isFinite(requestedLimit) ? Math.max(1, Math.min(100, requestedLimit)) : 25;
  const cursor = Number(url.searchParams.get("cursor"));
  const offset = Number.isFinite(cursor) && cursor >= 0 ? Math.floor(cursor) : 0;

  const activeAssetClass = String(url.searchParams.get("asset_class") || "all").toLowerCase();
  function normalizedType(itemRow) {
    const t = String(itemRow?.type_norm || itemRow?.type || "").trim().toLowerCase();
    if (!t) return "other";
    if (["common stock", "preferred stock", "stock", "equity", "equities"].includes(t)) return "stock";
    if (["etf", "fund", "funds", "etfs"].includes(t)) return "etf";
    if (["crypto", "cryptos"].includes(t)) return "crypto";
    if (["forex", "fx"].includes(t)) return "forex";
    if (["bond", "bonds"].includes(t)) return "bond";
    if (["index", "indices", "indicies"].includes(t)) return "index";
    if (["commodity", "commodities"].includes(t)) return "commodity";
    return "other";
  }
  function includeByAssetClass(itemRow) {
    if (activeAssetClass === "all" || !activeAssetClass) return true;
    const t = normalizedType(itemRow);
    if (["stock", "stocks"].includes(activeAssetClass)) return t === "stock";
    if (["etf", "etfs", "fund", "funds"].includes(activeAssetClass)) return t === "etf";
    if (activeAssetClass === "crypto") return t === "crypto";
    if (["forex", "fx"].includes(activeAssetClass)) return t === "forex";
    if (["bond", "bonds"].includes(activeAssetClass)) return t === "bond";
    if (["index", "indices", "indicies"].includes(activeAssetClass)) return t === "index";
    if (["commodity", "commodities"].includes(activeAssetClass)) return t === "commodity";
    if (["other", "others"].includes(activeAssetClass)) {
      return !["stock", "etf", "crypto", "forex", "bond", "index", "commodity"].includes(t);
    }
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
      const exactIndexDoc = await getExactIndexDoc();
      const exactBySymbol = exactIndexDoc?.by_symbol && typeof exactIndexDoc.by_symbol === "object"
        ? exactIndexDoc.by_symbol
        : null;
      const exactByPrefix1 = exactIndexDoc?.by_prefix_1 && typeof exactIndexDoc.by_prefix_1 === "object"
        ? exactIndexDoc.by_prefix_1
        : null;
      let candidates = [];
      if (exactBySymbol && exactByPrefix1) {
        const prefixKey = normalized.charAt(0).toLowerCase();
        if (Array.isArray(exactByPrefix1[prefixKey])) {
          candidates = exactByPrefix1[prefixKey]
            .map((symbol) => exactBySymbol[String(symbol || "").toUpperCase()])
            .filter(Boolean);
        }
      }
      if (!candidates.length) {
        const globalTop = await fetchJson("/data/universe/v7/search/search_global_top_2000.json.gz");
        if (Array.isArray(globalTop?.items)) candidates = globalTop.items;
      }
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

    const manifest = await fetchJson("/data/universe/v7/search/search_index_manifest.json");
    const buckets = manifest?.buckets;
    if (!buckets || typeof buckets !== "object") return null;

    const prefixes = [];
    for (let depth = 1; depth <= 3; depth += 1) {
      if (normalized.length >= depth) prefixes.push(normalized.slice(0, depth));
    }

    let bucketPayload = null;
    for (let i = prefixes.length - 1; i >= 0; i -= 1) {
      const prefix = prefixes[i];
      if (!buckets[prefix]) continue;
      bucketPayload = await fetchJson(`/data/universe/v7/search/buckets/${prefix}.json.gz`);
      if (bucketPayload?.items && Array.isArray(bucketPayload.items)) break;
    }
    let source = "v7_search_buckets";
    let sourceItems = bucketPayload?.items;

    if (normalized.length === 1 || !Array.isArray(sourceItems) || sourceItems.length === 0) {
      const exactIndexDoc = await getExactIndexDoc();
      const exactBySymbol = exactIndexDoc?.by_symbol && typeof exactIndexDoc.by_symbol === "object"
        ? exactIndexDoc.by_symbol
        : null;
      const exactByPrefix1 = exactIndexDoc?.by_prefix_1 && typeof exactIndexDoc.by_prefix_1 === "object"
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
          // Fallback to Top Global index for short misses, NEVER full scan the whole universe
          const globalTop = await fetchJson("/data/universe/v7/search/search_global_top_2000.json.gz");
          if (Array.isArray(globalTop?.items)) {
            candidates = globalTop.items;
          } else {
            candidates = Object.values(exactBySymbol).slice(0, 5000); // Cap fallback to avoid locking JS thread
          }
        }
      }
      if (candidates.length > 0) {
        sourceItems = candidates;
        source = "v7_search_exact_index";
      }
    }

    // Single-character queries can miss bucket coverage. Fallback to global top index.
    if (!Array.isArray(sourceItems)) {
      const globalTop = await fetchJson("/data/universe/v7/search/search_global_top_2000.json.gz");
      if (Array.isArray(globalTop?.items)) {
        sourceItems = globalTop.items;
        source = "v7_search_global_top";
      }
    }

    if (!Array.isArray(sourceItems)) return null;

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
        const aSym = String(a?.symbol || a?.ticker || "").toUpperCase();
        const bSym = String(b?.symbol || b?.ticker || "").toUpperCase();
        const aName = String(a?.name || "").toLowerCase();
        const bName = String(b?.name || "").toLowerCase();
        const aRank = aSym === qSymbol ? 0 : aSym.startsWith(qSymbol || "") ? 1 : aName.startsWith(q) ? 2 : 3;
        const bRank = bSym === qSymbol ? 0 : bSym.startsWith(qSymbol || "") ? 1 : bName.startsWith(q) ? 2 : 3;
        if (aRank !== bRank) return aRank - bRank;
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
