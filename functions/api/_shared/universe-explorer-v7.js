import { compareUniverseSearchCandidates } from '../../../public/js/universe-ssot.js';

const ALLOWED_CLASSES = new Set(['ALL', 'FUND', 'STOCK', 'ETF', 'CRYPTO', 'FOREX', 'BOND', 'INDEX', 'OTHER']);
const ALLOWED_SORT_FIELDS = new Set(['symbol', 'name', 'class', 'exchange', 'status', 'bars', 'lastTrade']);
const STATUS_PRIORITY = {
  ACTIVE_RECENT: 5,
  PARTIAL_HISTORY: 4,
  EOD_ONLY: 3,
  METADATA_ONLY: 2,
  STALE: 1,
  DEAD: 0
};

let snapshotCache = null;
let snapshotRowsCache = null;
let systemStatusCache = null;
let searchTopCache = null;
let summaryCache = null;
const browseCache = new Map();

function cacheGet(cache, key) {
  if (!cache.has(key)) return null;
  const value = cache.get(key);
  cache.delete(key);
  cache.set(key, value);
  return value;
}

function cacheSet(cache, key, value, maxEntries) {
  if (cache.has(key)) cache.delete(key);
  cache.set(key, value);
  while (cache.size > maxEntries) {
    const oldest = cache.keys().next().value;
    cache.delete(oldest);
  }
}

async function fetchJsonMaybeGz(context, path) {
  const reqUrl = new URL(context.request.url);
  const origin = reqUrl.origin;
  const url = new URL(path, origin).toString();
  const response = await fetch(url, { cf: { cacheTtl: 120, cacheEverything: true } });
  if (!response.ok) {
    throw new Error(`fetch_failed:${path}:${response.status}`);
  }

  const lowerPath = String(path || '').toLowerCase();
  const contentType = String(response.headers.get('content-type') || '').toLowerCase();
  const isGzip =
    lowerPath.endsWith('.gz') ||
    contentType.includes('application/gzip') ||
    contentType.includes('application/x-gzip');

  if (!isGzip) {
    return await response.json();
  }

  if (typeof DecompressionStream === 'function' && response.body) {
    const inflated = response.body.pipeThrough(new DecompressionStream('gzip'));
    const text = await new Response(inflated).text();
    return JSON.parse(text);
  }

  return await response.json();
}

function toFinite(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function normalizeClass(value) {
  const raw = String(value || 'ALL').trim().toUpperCase();
  const aliases = new Map([
    ['STOCKS', 'STOCK'],
    ['ETFS', 'ETF'],
    ['FUNDS', 'FUND'],
    ['BONDS', 'BOND'],
    ['INDICES', 'INDEX'],
    ['INDEXES', 'INDEX'],
    ['CRYPTOS', 'CRYPTO'],
    ['FX', 'FOREX']
  ]);
  const resolved = aliases.get(raw) || raw;
  return ALLOWED_CLASSES.has(resolved) ? resolved : 'ALL';
}

function normalizeSort(value) {
  const raw = String(value || 'symbol').trim();
  return ALLOWED_SORT_FIELDS.has(raw) ? raw : 'symbol';
}

function normalizeDir(value) {
  return String(value || 'asc').trim().toLowerCase() === 'desc' ? 'desc' : 'asc';
}

function normalizeStatusValue(value) {
  const raw = String(value || '').trim().toUpperCase();
  if (!raw || raw === 'ALL') return 'ALL';
  return raw;
}

function splitStatusFilter(value) {
  const normalized = normalizeStatusValue(value);
  if (normalized === 'ALL') return ['ALL'];
  const parts = normalized.split(',').map((p) => p.trim()).filter(Boolean);
  return parts.length ? parts : [normalized];
}

function normalizeExchange(value) {
  const raw = String(value || 'ALL').trim().toUpperCase();
  return raw || 'ALL';
}

function splitExchangeFilter(value) {
  const normalized = normalizeExchange(value);
  if (normalized === 'ALL') return ['ALL'];
  const parts = normalized.split(',').map((p) => p.trim()).filter(Boolean);
  return parts.length ? parts : [normalized];
}

function normalizeSymbol(value) {
  const symbol = String(value || '').trim().toUpperCase();
  if (!symbol) return '';
  return symbol;
}

function normalizeLastTrade(value) {
  if (!value || typeof value !== 'string') return null;
  const date = value.slice(0, 10);
  if (/^\d{4}-\d{2}-\d{2}$/.test(date)) return date;
  return null;
}

function inferStatus(row) {
  const explicit = String(row?.status || '').trim().toUpperCase();
  if (explicit) return explicit;

  const bars = Math.max(0, Math.floor(toFinite(row?.bars_count, 0)));
  const lastTrade = normalizeLastTrade(row?.last_trade_date);

  if (lastTrade) {
    const ts = Date.parse(`${lastTrade}T00:00:00Z`);
    if (Number.isFinite(ts)) {
      const ageDays = Math.max(0, Math.floor((Date.now() - ts) / 86400000));
      if (ageDays <= 5 && bars > 0) return 'ACTIVE_RECENT';
      if (bars > 0) return 'PARTIAL_HISTORY';
      return 'EOD_ONLY';
    }
  }

  if (bars > 0) return 'PARTIAL_HISTORY';
  return 'METADATA_ONLY';
}

function compareRows(a, b, field, dir) {
  const direction = dir === 'desc' ? -1 : 1;

  const values = (() => {
    if (field === 'bars') return [toFinite(a.bars, 0), toFinite(b.bars, 0)];
    if (field === 'lastTrade') {
      const aTs = a.last_trade ? Date.parse(`${a.last_trade}T00:00:00Z`) : -1;
      const bTs = b.last_trade ? Date.parse(`${b.last_trade}T00:00:00Z`) : -1;
      return [Number.isFinite(aTs) ? aTs : -1, Number.isFinite(bTs) ? bTs : -1];
    }
    if (field === 'status') {
      return [STATUS_PRIORITY[a.status] ?? -1, STATUS_PRIORITY[b.status] ?? -1];
    }
    const key = field === 'class' ? 'class' : field;
    return [String(a[key] || ''), String(b[key] || '')];
  })();

  if (values[0] < values[1]) return -1 * direction;
  if (values[0] > values[1]) return 1 * direction;

  // Deterministic paging contract: canonical_id is the stable tie-breaker.
  return String(a.canonical_id || '').localeCompare(String(b.canonical_id || ''));
}

function normalizeRow(record) {
  const canonicalId = String(record?.canonical_id || '').trim();
  if (!canonicalId) return null;
  const symbol = normalizeSymbol(record?.symbol || canonicalId.split(':').pop() || '');
  if (!symbol) return null;

  const className = normalizeClass(record?.type_norm);
  const exchange = normalizeExchange(record?.exchange || record?.mic || canonicalId.split(':')[0] || 'UNK');
  const status = inferStatus(record);
  const bars = Math.max(0, Math.floor(toFinite(record?.bars_count, 0)));
  const lastTrade = normalizeLastTrade(record?.last_trade_date);

  return {
    canonical_id: canonicalId,
    symbol,
    name: String(record?.name || '').trim() || symbol,
    class: className,
    exchange,
    status,
    bars,
    last_trade: lastTrade
  };
}

async function getSnapshotPayload(context) {
  if (snapshotCache) return snapshotCache;
  // P4: Prefer lean browse index (smaller, only fields used by browse/filter/sort)
  try {
    snapshotCache = await fetchJsonMaybeGz(context, '/data/universe/v7/registry/registry.browse.json.gz');
    if (snapshotCache) return snapshotCache;
  } catch { /* browse index not available yet, fallback to full snapshot */ }
  // Fallback: full snapshot (original behavior)
  snapshotCache = await fetchJsonMaybeGz(context, '/data/universe/v7/registry/registry.snapshot.json.gz');
  return snapshotCache;
}

async function getRows(context) {
  if (snapshotRowsCache) return snapshotRowsCache;
  const payload = await getSnapshotPayload(context);
  const records = Array.isArray(payload?.records) ? payload.records : [];
  snapshotRowsCache = records
    .map(normalizeRow)
    .filter(Boolean)
    .sort((a, b) => String(a.canonical_id).localeCompare(String(b.canonical_id)));
  return snapshotRowsCache;
}

async function getSystemStatus(context) {
  if (systemStatusCache) return systemStatusCache;
  try {
    systemStatusCache = await fetchJsonMaybeGz(context, '/data/universe/v7/reports/system_status.json');
  } catch {
    systemStatusCache = null;
  }
  return systemStatusCache;
}

async function getSummary(context, pageSize = 200) {
  const effectivePageSize = Math.max(1, Math.min(200, Math.floor(toFinite(pageSize, 200))));
  const cacheKey = `summary:${effectivePageSize}`;
  if (summaryCache?.key === cacheKey) return summaryCache.value;

  const [rows, snapshot, systemStatus] = await Promise.all([
    getRows(context),
    getSnapshotPayload(context),
    getSystemStatus(context)
  ]);

  const totalCount = rows.length;
  const byClass = {};
  const byStatus = {};
  const exchangeMap = new Map();

  for (const row of rows) {
    if (!byClass[row.class]) byClass[row.class] = { count: 0, pages: 0 };
    byClass[row.class].count += 1;
    if (!byStatus[row.status]) byStatus[row.status] = { count: 0, pages: 0 };
    byStatus[row.status].count += 1;
    exchangeMap.set(row.exchange, (exchangeMap.get(row.exchange) || 0) + 1);
  }

  for (const cls of Object.keys(byClass)) {
    byClass[cls].pages = Math.max(1, Math.ceil(byClass[cls].count / effectivePageSize));
  }
  for (const status of Object.keys(byStatus)) {
    byStatus[status].pages = Math.max(1, Math.ceil(byStatus[status].count / effectivePageSize));
  }

  const byExchangeTop = [...exchangeMap.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 30)
    .map(([exchange, count]) => ({
      exchange,
      count,
      pct: totalCount > 0 ? Number((count / totalCount).toFixed(6)) : 0
    }));

  const summary = {
    updated_at: snapshot?.generated_at || new Date().toISOString(),
    totals: {
      all: {
        count: totalCount,
        pages: Math.max(1, Math.ceil(totalCount / effectivePageSize))
      },
      by_class: byClass,
      by_status: byStatus,
      by_exchange_top: byExchangeTop,
      exchanges_total: exchangeMap.size || null
    },
    data_health: String(systemStatus?.drift_state || '').trim().toUpperCase() || '—'
  };

  summaryCache = { key: cacheKey, value: summary };
  return summary;
}

function normalizeBrowseRequest(params = {}) {
  const page = Math.max(1, Math.floor(toFinite(params.page, 1)));
  const pageSize = Math.max(1, Math.min(200, Math.floor(toFinite(params.pageSize, 200))));
  const classFilter = normalizeClass(params.class || params.assetClass || 'ALL');
  const exchangeFilter = splitExchangeFilter(params.exchange || 'ALL');
  const statusFilter = splitStatusFilter(params.status || 'ALL');
  const q = String(params.q || '').trim().toLowerCase();
  const sort = normalizeSort(params.sort || 'symbol');
  const dir = normalizeDir(params.dir || 'asc');
  const minBars = Math.max(0, Math.floor(toFinite(params.minBars, 0)));

  return {
    page,
    pageSize,
    class: classFilter,
    exchange: exchangeFilter,
    status: statusFilter,
    q,
    sort,
    dir,
    minBars
  };
}

function filterRows(rows, req) {
  const statusSet = new Set(req.status);
  const exchangeSet = new Set(req.exchange);
  return rows.filter((row) => {
    if (req.class !== 'ALL' && row.class !== req.class) return false;
    if (!exchangeSet.has('ALL') && !exchangeSet.has(row.exchange)) return false;
    if (!statusSet.has('ALL') && !statusSet.has(row.status)) return false;
    if (req.minBars > 0 && toFinite(row.bars, 0) < req.minBars) return false;
    if (!req.q) return true;
    const symbol = String(row.symbol || '').toLowerCase();
    const name = String(row.name || '').toLowerCase();
    return symbol.includes(req.q) || name.includes(req.q);
  });
}

async function browseUniverse(context, params = {}) {
  const req = normalizeBrowseRequest(params);
  const cacheKey = JSON.stringify(req);
  const cached = cacheGet(browseCache, cacheKey);
  if (cached) return cached;

  const rows = await getRows(context);
  const filtered = filterRows(rows, req).sort((a, b) => compareRows(a, b, req.sort, req.dir));

  const totalCount = filtered.length;
  const totalPages = Math.max(1, Math.ceil(totalCount / req.pageSize));
  const page = Math.min(req.page, totalPages);
  const start = (page - 1) * req.pageSize;
  const items = filtered.slice(start, start + req.pageSize);

  const response = {
    meta: {
      page,
      pageSize: req.pageSize,
      totalCount,
      totalPages,
      sort: req.sort,
      dir: req.dir,
      filters_applied: {
        class: req.class,
        exchange: req.exchange.length === 1 ? req.exchange[0] : req.exchange.join(','),
        status: req.status.length === 1 ? req.status[0] : req.status.join(','),
        q: req.q
      },
      stable_tiebreak: 'canonical_id'
    },
    items
  };

  cacheSet(browseCache, cacheKey, response, 30);
  return response;
}

async function getSearchTop(context) {
  if (searchTopCache) return searchTopCache;
  try {
    const payload = await fetchJsonMaybeGz(context, '/data/universe/v7/search/search_global_top_2000.json.gz');
    const items = Array.isArray(payload?.items) ? payload.items : [];
    searchTopCache = items
      .map((row) => normalizeRow(row))
      .filter(Boolean)
      .slice(0, 2000);
  } catch {
    searchTopCache = [];
  }
  return searchTopCache;
}

async function searchUniverse(context, params = {}) {
  const q = String(params.q || '').trim().toLowerCase();
  const limit = Math.max(1, Math.min(20, Math.floor(toFinite(params.limit, 20))));
  const classFilter = normalizeClass(params.class || 'ALL');
  const rows = await getSearchTop(context);
  const filtered = rows.filter((row) => {
    if (classFilter !== 'ALL' && row.class !== classFilter) return false;
    if (!q) return true;
    const symbol = String(row.symbol || '').toLowerCase();
    const name = String(row.name || '').toLowerCase();
    return symbol.includes(q) || name.includes(q);
  });

  const items = filtered
    .sort((a, b) => {
      const ranked = compareUniverseSearchCandidates(b, a, { query: q, symbolQuery: q });
      if (ranked !== 0) return ranked;
      return String(a.canonical_id || '').localeCompare(String(b.canonical_id || ''));
    })
    .slice(0, limit);
  return { q, limit, items };
}

export {
  getSummary,
  browseUniverse,
  searchUniverse,
  normalizeClass,
  normalizeSort,
  normalizeDir,
  normalizeExchange,
  normalizeStatusValue
};
