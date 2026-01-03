const UNIVERSE_PATHS = [
  "./data/universes/all_us.json",
  "./data/symbols/universe.min.json",
  "./data/symbols/symbols.min.json",
  "./data/symbols/sp500.json",
  "./data/symbols/nasdaq.json",
  "./data/symbols/dow.json",
  "./data/symbols/russell.json",
  "./assets/nasdaq_symbols.min.json"
];

let universePromise = null;
let cachedUniverse = null;

function normalizeSymbol(value) {
  return String(value || "").toUpperCase().trim();
}

function normalizeName(value) {
  const name = String(value || "").trim();
  return name || "N/A";
}

function isValidSymbol(symbol) {
  if (!symbol) return false;
  return /^[A-Z0-9.:-]{1,10}$/.test(symbol);
}

function normalizeEntry(item) {
  const symbol = normalizeSymbol(item?.s || item?.symbol || item?.ticker);
  if (!isValidSymbol(symbol)) return null;
  return {
    s: symbol,
    n: normalizeName(item?.n || item?.name || item?.company || ""),
    i: item?.i || item?.index || item?.indexTags || ""
  };
}

async function loadPath(path) {
  try {
    const response = await fetch(path, { cache: "force-cache" });
    if (!response.ok) return [];
    const data = await response.json();
    return Array.isArray(data) ? data : [];
  } catch (error) {
    return [];
  }
}

async function buildUniverse() {
  const map = new Map();
  for (const path of UNIVERSE_PATHS) {
    const data = await loadPath(path);
    data.forEach((item) => {
      const entry = normalizeEntry(item);
      if (!entry) return;
      if (!map.has(entry.s)) {
        map.set(entry.s, entry);
      }
    });
  }
  return Array.from(map.values());
}

export async function getUniverse() {
  if (cachedUniverse) return cachedUniverse;
  if (!universePromise) {
    universePromise = buildUniverse().then((list) => {
      cachedUniverse = list;
      return list;
    });
  }
  return universePromise;
}

export async function searchUniverse(prefix, limit = 20) {
  const trimmed = normalizeSymbol(prefix).replace(/\s+/g, "");
  if (!trimmed) return [];
  const list = await getUniverse();
  const results = [];
  for (const entry of list) {
    if (entry.s.startsWith(trimmed)) {
      results.push(entry);
      if (results.length >= limit) break;
    }
  }
  return results;
}

export function getUniversePaths() {
  return UNIVERSE_PATHS.slice();
}
