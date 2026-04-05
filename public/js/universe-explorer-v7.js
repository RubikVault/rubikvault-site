(function () {
  const CLASS_ORDER = ['ALL', 'STOCK', 'ETF', 'BOND'];
  const SORT_FIELDS = [
    { key: 'symbol', label: 'Symbol' },
    { key: 'name', label: 'Name' },
    { key: 'class', label: 'Class' },
    { key: 'exchange', label: 'Exchange' },
    { key: 'status', label: 'Status' },
    { key: 'bars', label: 'Bars' },
    { key: 'lastTrade', label: 'Last Trade' }
  ];
  const PAGE_SIZES = [50, 100, 200];

  function escapeHtml(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function toFinite(value, fallback = 0) {
    const n = Number(value);
    return Number.isFinite(n) ? n : fallback;
  }

  function debounce(fn, waitMs) {
    let timer = null;
    return function debounced(...args) {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => fn.apply(this, args), waitMs);
    };
  }

  function normalizeClass(value) {
    const raw = String(value || 'ALL').trim().toUpperCase();
    const aliases = new Map([
      ['STOCKS', 'STOCK'],
      ['ETFS', 'ETF'],
      ['BONDS', 'BOND'],
    ]);
    const resolved = aliases.get(raw) || raw;
    return CLASS_ORDER.includes(resolved) ? resolved : 'ALL';
  }

  function normalizeSort(value) {
    const raw = String(value || 'symbol').trim();
    return SORT_FIELDS.some((it) => it.key === raw) ? raw : 'symbol';
  }

  function normalizeDir(value) {
    return String(value || 'asc').toLowerCase() === 'desc' ? 'desc' : 'asc';
  }

  function normalizePage(value) {
    return Math.max(1, Math.floor(toFinite(value, 1)));
  }

  function normalizePageSize(value) {
    const n = Math.floor(toFinite(value, 200));
    return PAGE_SIZES.includes(n) ? n : 200;
  }

  function splitCsv(value) {
    const raw = String(value || 'ALL').trim();
    if (!raw || raw.toUpperCase() === 'ALL') return ['ALL'];
    const rows = raw.split(',').map((it) => it.trim()).filter(Boolean);
    return rows.length ? rows : ['ALL'];
  }

  function joinCsv(values) {
    const list = (Array.isArray(values) ? values : []).map((v) => String(v || '').trim()).filter(Boolean);
    if (!list.length || list.includes('ALL')) return 'ALL';
    return list.join(',');
  }

  function firstCsvValue(value) {
    return splitCsv(value)[0] || 'ALL';
  }

  function formatCount(value) {
    const n = toFinite(value, 0);
    return n.toLocaleString('en-US');
  }

  function formatDate(value) {
    if (!value) return '—';
    try {
      return new Date(value).toLocaleString('en-US', {
        year: 'numeric',
        month: 'short',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit'
      });
    } catch {
      return String(value);
    }
  }

  function writeVariantToUrl() {
    try {
      const url = new URL(window.location.href);
      url.searchParams.set('ui', 'C');
      window.history.replaceState({}, '', `${url.pathname}${url.search}${url.hash}`);
    } catch {
      // no-op
    }
  }

  function getStatusColor(status) {
    const key = String(status || '').toUpperCase();
    if (key === 'ACTIVE_RECENT') return '#34d399';
    if (key === 'PARTIAL_HISTORY') return '#f59e0b';
    if (key === 'EOD_ONLY') return '#60a5fa';
    if (key === 'METADATA_ONLY') return '#94a3b8';
    return '#64748b';
  }

  function getStatusLabel(status) {
    const key = String(status || '').toUpperCase();
    if (key === 'ACTIVE_RECENT') return 'Active';
    if (key === 'PARTIAL_HISTORY') return 'Partial';
    if (key === 'EOD_ONLY') return 'EOD';
    if (key === 'METADATA_ONLY') return 'Metadata';
    return key || '—';
  }

  function ensureStyles() {
    if (document.getElementById('ue-v7-style')) return;
    const style = document.createElement('style');
    style.id = 'ue-v7-style';
    style.textContent = `
      .ue-shell { margin-top: 1rem; padding: 1rem; background: rgba(15,23,42,0.35); border: 1px solid rgba(100,116,139,0.22); border-radius: 12px; }
      .ue-title-row { display:flex; justify-content:space-between; align-items:flex-start; gap:0.8rem; flex-wrap:wrap; }
      .ue-title { margin:0; font-size:1.65rem; color:#e5e7eb; }
      .ue-subtitle { margin-top:0.2rem; color:#94a3b8; font-size:0.9rem; }
      .ue-search-row { margin-top:0.8rem; display:grid; grid-template-columns:minmax(240px, 1.4fr) auto; gap:0.6rem; align-items:center; }
      .ue-search-wrap { position:relative; }
      .ue-input, .ue-select, .ue-number { width:100%; background:rgba(15,23,42,0.35); color:#e5e7eb; border:1px solid rgba(100,116,139,0.28); border-radius:10px; padding:0.55rem 0.7rem; font-size:0.86rem; }
      .ue-search-results { position:absolute; top:calc(100% + 4px); left:0; right:0; z-index:20; max-height:240px; overflow:auto; background:rgba(2,6,23,0.97); border:1px solid rgba(100,116,139,0.35); border-radius:10px; }
      .ue-search-item { width:100%; text-align:left; border:0; background:transparent; color:#cbd5e1; cursor:pointer; padding:0.45rem 0.6rem; display:flex; justify-content:space-between; gap:0.5rem; font-size:0.82rem; }
      .ue-search-item:hover { background:rgba(56,189,248,0.14); }
      .ue-search-item.is-active { background:rgba(56,189,248,0.18); }
      .ue-kpi-strip { margin-top:0.8rem; display:grid; grid-template-columns:repeat(auto-fit, minmax(170px, 1fr)); gap:0.5rem; }
      .ue-kpi-card { padding:0.65rem; border:1px solid rgba(100,116,139,0.22); border-radius:10px; background:rgba(15,23,42,0.25); }
      .ue-kpi-label { color:#94a3b8; font-size:0.72rem; text-transform:uppercase; letter-spacing:0.07em; }
      .ue-kpi-value { color:#e5e7eb; font-size:1rem; font-weight:700; margin-top:0.2rem; }
      .ue-breadcrumb { margin-top:0.8rem; color:#64748b; font-size:0.78rem; }
      .ue-results-bar { margin-top:0.6rem; display:flex; justify-content:space-between; gap:0.6rem; align-items:center; flex-wrap:wrap; color:#94a3b8; font-size:0.78rem; }
      .ue-btn { border:1px solid rgba(100,116,139,0.35); background:rgba(15,23,42,0.32); color:#e5e7eb; border-radius:10px; padding:0.4rem 0.65rem; cursor:pointer; font-size:0.78rem; }
      .ue-btn:disabled { opacity:0.45; cursor:not-allowed; }
      .ue-btn-chip { border-radius:999px; padding:0.28rem 0.56rem; font-size:0.74rem; }
      .ue-btn.active { border-color:rgba(56,189,248,0.55); color:#38bdf8; }
      .ue-grid-cards { margin-top:0.7rem; display:grid; grid-template-columns:repeat(auto-fit,minmax(140px,1fr)); gap:0.5rem; }
      .ue-class-card { border:1px solid rgba(100,116,139,0.22); background:rgba(15,23,42,0.25); border-radius:10px; padding:0.55rem; cursor:pointer; text-align:left; }
      .ue-class-card.active { border-color:rgba(56,189,248,0.45); background:rgba(56,189,248,0.12); }
      .ue-class-card strong { color:#e5e7eb; font-size:0.82rem; display:block; }
      .ue-class-card span { color:#94a3b8; font-size:0.74rem; }
      .ue-pills { margin-top:0.6rem; display:flex; gap:0.4rem; flex-wrap:wrap; }
      .ue-filter-row { margin-top:0.7rem; display:grid; grid-template-columns:repeat(auto-fit,minmax(130px,1fr)); gap:0.45rem; align-items:end; }
      .ue-filter-block label { display:block; color:#94a3b8; font-size:0.72rem; margin-bottom:0.25rem; }
      .ue-table-wrap { margin-top:0.7rem; overflow:auto; border:1px solid rgba(100,116,139,0.22); border-radius:10px; }
      .ue-table { width:100%; min-width:860px; border-collapse:collapse; font-size:0.82rem; }
      .ue-table th, .ue-table td { padding:0.45rem; border-top:1px solid rgba(100,116,139,0.18); vertical-align:top; }
      .ue-table th { border-top:0; color:#94a3b8; position:sticky; top:0; background:rgba(2,6,23,0.95); }
      .ue-sort-btn { border:0; background:transparent; color:inherit; cursor:pointer; font-weight:700; display:inline-flex; align-items:center; gap:0.3rem; }
      .ue-status { display:inline-flex; align-items:center; gap:0.35rem; color:#cbd5e1; }
      .ue-status-dot { width:8px; height:8px; border-radius:999px; display:inline-block; }
      .ue-symbol { color:#93c5fd; text-decoration:none; font-weight:700; }
      .ue-symbol:hover { color:#bfdbfe; }
      .ue-pagination { margin-top:0.65rem; display:flex; gap:0.5rem; flex-wrap:wrap; align-items:center; justify-content:space-between; }
      .ue-pagination-left, .ue-pagination-right { display:flex; gap:0.4rem; align-items:center; flex-wrap:wrap; }
      .ue-skeleton td { color:#64748b; }
      .ue-tabs { margin-top:0.65rem; display:flex; gap:0.45rem; overflow:auto; padding-bottom:0.2rem; }
      .ue-tabs .ue-btn { white-space:nowrap; }
      .ue-more { margin-top:0.55rem; }
      .ue-modal { position:fixed; inset:0; background:rgba(2,6,23,0.75); display:none; align-items:center; justify-content:center; z-index:90; }
      .ue-modal.open { display:flex; }
      .ue-modal-card { width:min(92vw,620px); max-height:80vh; overflow:auto; border:1px solid rgba(100,116,139,0.35); border-radius:12px; padding:0.8rem; background:rgba(2,6,23,0.98); }
      .ue-modal-list { margin-top:0.6rem; display:grid; grid-template-columns:repeat(auto-fit,minmax(120px,1fr)); gap:0.4rem; }
      .ue-mobile-detail { display:none; }
      @media (max-width: 860px) {
        .ue-search-row { grid-template-columns:1fr; }
        .ue-col-name, .ue-col-lastTrade { display:none; }
        .ue-table { min-width:640px; }
        .ue-mobile-detail.show { display:table-row; }
      }
    `;
    document.head.appendChild(style);
  }

  class UniverseDataAdapter {
    constructor() {
      this.summaryCache = null;
      this.browseCache = new Map();
      this.searchCache = new Map();
    }

    async fetchJson(url) {
      const response = await fetch(url, { cache: 'no-store' });
      if (!response.ok) throw new Error(`http_${response.status}`);
      return await response.json();
    }

    async getSummary(pageSize = 200) {
      if (this.summaryCache) return this.summaryCache;
      const payload = await this.fetchJson(`/api/universe/summary?pageSize=${encodeURIComponent(pageSize)}`);
      this.summaryCache = payload;
      return payload;
    }

    async browse(request) {
      const normalized = {
        page: normalizePage(request?.page),
        pageSize: normalizePageSize(request?.pageSize),
        class: normalizeClass(request?.class),
        exchange: String(request?.exchange || 'ALL').trim().toUpperCase() || 'ALL',
        status: String(request?.status || 'ALL').trim().toUpperCase() || 'ALL',
        q: String(request?.q || '').trim(),
        sort: normalizeSort(request?.sort),
        dir: normalizeDir(request?.dir),
        minBars: Math.max(0, Math.floor(toFinite(request?.minBars, 0)))
      };
      const key = JSON.stringify(normalized);
      if (this.browseCache.has(key)) {
        const cached = this.browseCache.get(key);
        this.browseCache.delete(key);
        this.browseCache.set(key, cached);
        return cached;
      }

      const params = new URLSearchParams();
      Object.entries(normalized).forEach(([k, v]) => params.set(k, String(v)));
      const payload = await this.fetchJson(`/api/universe/browse?${params.toString()}`);
      this.browseCache.set(key, payload);
      while (this.browseCache.size > 5) {
        const oldest = this.browseCache.keys().next().value;
        this.browseCache.delete(oldest);
      }
      return payload;
    }

    async search(q, classFilter = 'ALL') {
      const normalizedQ = String(q || '').trim();
      const normalizedClass = normalizeClass(classFilter);
      const key = `${normalizedClass}|${normalizedQ}`;
      if (this.searchCache.has(key)) return this.searchCache.get(key);

      const params = new URLSearchParams();
      params.set('q', normalizedQ);
      params.set('limit', '20');
      if (normalizedClass !== 'ALL') params.set('class', normalizedClass);

      const payload = await this.fetchJson(`/api/universe/search?${params.toString()}`);
      this.searchCache.set(key, payload);
      while (this.searchCache.size > 15) {
        const oldest = this.searchCache.keys().next().value;
        this.searchCache.delete(oldest);
      }
      return payload;
    }
  }

  const state = {
    filters: {
      class: 'ALL',
      exchange: 'ALL',
      status: 'ALL',
      q: '',
      minBarsPreset: 0
    },
    paging: {
      page: 1,
      pageSize: 200
    },
    sort: {
      field: 'symbol',
      dir: 'asc'
    },
    summary: null,
    browse: null,
    loading: false,
    error: null,
    searchItems: [],
    searchActiveIndex: -1,
    showSearchList: false,
    exchangeModalOpen: false,
    exchangeModalQuery: '',
    moreFiltersOpen: false,
    expandedRows: new Set(),
    jumpPageInput: ''
  };

  const adapter = new UniverseDataAdapter();
  let rootEl = null;
  let outsideClickBound = false;

  function getExchangeOptions(summary) {
    const rows = Array.isArray(summary?.totals?.by_exchange_top) ? summary.totals.by_exchange_top : [];
    return rows.map((row) => ({
      exchange: String(row.exchange || '').toUpperCase(),
      count: toFinite(row.count, 0),
      pct: toFinite(row.pct, 0)
    })).filter((row) => row.exchange);
  }

  function getStatusOptions(summary) {
    const byStatus = summary?.totals?.by_status && typeof summary.totals.by_status === 'object'
      ? summary.totals.by_status
      : {};
    const rows = Object.entries(byStatus)
      .map(([status, row]) => ({ status, count: toFinite(row?.count, 0) }))
      .filter((row) => row.count > 0)
      .sort((a, b) => b.count - a.count);
    if (!rows.length) {
      return ['ACTIVE_RECENT', 'PARTIAL_HISTORY', 'EOD_ONLY', 'METADATA_ONLY'];
    }
    return rows.map((row) => row.status);
  }

  function isStatusSelected(status) {
    const selected = splitCsv(state.filters.status);
    return selected.includes(status);
  }

  function setStatusSelected(status, enabled) {
    const selected = splitCsv(state.filters.status).filter((v) => v !== 'ALL');
    const next = new Set(selected);
    if (enabled) next.add(status);
    else next.delete(status);
    state.filters.status = next.size ? joinCsv([...next]) : 'ALL';
  }

  function isExchangeSelected(exchange) {
    const selected = splitCsv(state.filters.exchange);
    return selected.includes(exchange);
  }

  function toggleExchangeSelection(exchange) {
    const selected = splitCsv(state.filters.exchange).filter((v) => v !== 'ALL');
    const next = new Set(selected);
    if (next.has(exchange)) next.delete(exchange);
    else next.add(exchange);
    state.filters.exchange = next.size ? joinCsv([...next]) : 'ALL';
  }

  function clearExpandedRows() {
    state.expandedRows = new Set();
  }

  function renderSearchList() {
    if (!state.showSearchList || !Array.isArray(state.searchItems) || !state.searchItems.length) return '';
    return `
      <div class="ue-search-results">
        ${state.searchItems.map((row, idx) => `
          <button class="ue-search-item ${idx === state.searchActiveIndex ? 'is-active' : ''}" data-action="ue-pick-search" data-symbol="${escapeHtml(row.symbol)}" data-index="${idx}">
            <span>${escapeHtml(row.symbol)} · ${escapeHtml(row.name || '—')}</span>
            <span style="color:#94a3b8;">${escapeHtml(row.class || '—')}</span>
          </button>
        `).join('')}
      </div>
    `;
  }

  function applySearchSelection(symbol) {
    const value = String(symbol || '').trim();
    if (!value) return;
    state.filters.q = value;
    state.showSearchList = false;
    state.searchItems = [];
    state.searchActiveIndex = -1;
    void refreshBrowse({ resetPage: true });
  }

  function renderKpiStrip(summary) {
    const allCount = toFinite(summary?.totals?.all?.count, 0);
    const exchangesTotal = summary?.totals?.exchanges_total;
    const health = String(summary?.data_health || '—');

    return `
      <div class="ue-kpi-strip" data-testid="ue-kpi-strip">
        <div class="ue-kpi-card"><div class="ue-kpi-label">Total Assets</div><div class="ue-kpi-value">${formatCount(allCount)}</div></div>
        <div class="ue-kpi-card"><div class="ue-kpi-label"># Exchanges</div><div class="ue-kpi-value">${Number.isFinite(Number(exchangesTotal)) ? formatCount(exchangesTotal) : '—'}</div></div>
        <div class="ue-kpi-card"><div class="ue-kpi-label">Data Health</div><div class="ue-kpi-value">${escapeHtml(health)}</div></div>
        <div class="ue-kpi-card"><div class="ue-kpi-label">Last Update</div><div class="ue-kpi-value">${escapeHtml(formatDate(summary?.updated_at))}</div></div>
      </div>
    `;
  }

  function renderResultsSummary(meta) {
    const page = toFinite(meta?.page, 1);
    const pageSize = toFinite(meta?.pageSize, 200);
    const totalCount = toFinite(meta?.totalCount, 0);
    const totalPages = Math.max(1, toFinite(meta?.totalPages, 1));
    const start = totalCount <= 0 ? 0 : ((page - 1) * pageSize + 1);
    const end = Math.min(page * pageSize, totalCount);

    return `Showing ${formatCount(start)}–${formatCount(end)} of ${formatCount(totalCount)} • Page ${page}/${totalPages} • Sort: ${escapeHtml(meta?.sort || state.sort.field)} ${escapeHtml(meta?.dir || state.sort.dir)}`;
  }

  function renderBreadcrumb() {
    const cls = state.filters.class || 'ALL';
    const ex = firstCsvValue(state.filters.exchange || 'ALL');
    const status = firstCsvValue(state.filters.status || 'ALL');
    return `Markets > Universe (v7) > ${escapeHtml(cls)} > ${escapeHtml(ex)} > ${escapeHtml(status)}`;
  }

  function renderSortArrow(field) {
    if (state.sort.field !== field) return '↕';
    return state.sort.dir === 'asc' ? '↑' : '↓';
  }

  function renderTableRows(items) {
    if (state.loading) {
      return Array.from({ length: 8 }, () => `
        <tr class="ue-skeleton"><td colspan="8">Loading rows…</td></tr>
      `).join('');
    }

    if (!Array.isArray(items) || !items.length) {
      return '<tr><td colspan="8" style="color:#64748b;">No assets found for current filters.</td></tr>';
    }

    return items.map((row) => {
      const key = String(row.canonical_id || row.symbol || '');
      const expanded = state.expandedRows.has(key);
      return `
        <tr>
          <td style="width:34px;"><button class="ue-btn ue-btn-chip" data-action="ue-toggle-row" data-row-key="${escapeHtml(key)}">${expanded ? '−' : '+'}</button></td>
          <td><a class="ue-symbol" href="/analyze/${encodeURIComponent(row.symbol || '')}">${escapeHtml(row.symbol || '—')}</a></td>
          <td class="ue-col-name">${escapeHtml(row.name || '—')}</td>
          <td>${escapeHtml(row.class || '—')}</td>
          <td>${escapeHtml(row.exchange || '—')}</td>
          <td><span class="ue-status"><span class="ue-status-dot" style="background:${getStatusColor(row.status)};"></span>${escapeHtml(getStatusLabel(row.status))}</span></td>
          <td style="text-align:right;">${formatCount(row.bars)}</td>
          <td class="ue-col-lastTrade">${escapeHtml(row.last_trade || '—')}</td>
        </tr>
        <tr class="ue-mobile-detail ${expanded ? 'show' : ''}">
          <td colspan="8" style="color:#94a3b8; font-size:0.78rem;">
            <strong style="color:#cbd5e1;">${escapeHtml(row.name || row.symbol || '—')}</strong> • Last Trade: ${escapeHtml(row.last_trade || '—')} • canonical_id: ${escapeHtml(row.canonical_id || '—')}
          </td>
        </tr>
      `;
    }).join('');
  }

  function renderTable(meta, items) {
    return `
      <div class="ue-table-wrap">
        <table class="ue-table" data-testid="ue-table">
          <thead>
            <tr>
              <th></th>
              ${SORT_FIELDS.map((field) => {
                const align = field.key === 'bars' ? ' style="text-align:right;"' : '';
                const colClass = field.key === 'name' ? ' ue-col-name' : field.key === 'lastTrade' ? ' ue-col-lastTrade' : '';
                return `<th class="${colClass.trim()}"${align}><button class="ue-sort-btn" data-action="ue-sort" data-sort-field="${field.key}">${escapeHtml(field.label)} <span>${renderSortArrow(field.key)}</span></button></th>`;
              }).join('')}
            </tr>
          </thead>
          <tbody>${renderTableRows(items)}</tbody>
        </table>
      </div>
    `;
  }

  function renderPagination(meta) {
    const page = toFinite(meta?.page, 1);
    const totalPages = Math.max(1, toFinite(meta?.totalPages, 1));

    return `
      <div class="ue-pagination">
        <div class="ue-pagination-left">
          <button class="ue-btn" data-action="ue-page-first" ${page <= 1 ? 'disabled' : ''}>First</button>
          <button class="ue-btn" data-action="ue-page-prev" ${page <= 1 ? 'disabled' : ''}>Prev</button>
          <button class="ue-btn" data-action="ue-page-next" ${page >= totalPages ? 'disabled' : ''}>Next</button>
          <button class="ue-btn" data-action="ue-page-last" ${page >= totalPages ? 'disabled' : ''}>Last</button>
        </div>
        <div class="ue-pagination-right">
          <label style="color:#94a3b8; font-size:0.76rem;">Page</label>
          <input class="ue-number" type="number" min="1" max="${totalPages}" value="${escapeHtml(state.jumpPageInput || String(page))}" data-action="ue-jump-input" style="width:88px;" />
          <button class="ue-btn" data-action="ue-jump-go">Go</button>
          <label style="color:#94a3b8; font-size:0.76rem;">Size</label>
          <select class="ue-select" data-action="ue-page-size" style="width:94px;">
            ${PAGE_SIZES.map((size) => `<option value="${size}" ${size === state.paging.pageSize ? 'selected' : ''}>${size}</option>`).join('')}
          </select>
        </div>
      </div>
    `;
  }

  function UniverseExplorerVariantC(context) {
    const statusOptions = getStatusOptions(context.summary);
    const exchangeOptions = getExchangeOptions(context.summary).slice(0, 10);
    const classTabs = ['ALL', 'STOCK', 'ETF', 'BOND'];

    return `
      <section data-testid="ue-variant-C">
        <div style="display:flex; justify-content:space-between; align-items:center; gap:0.6rem; margin-bottom:0.45rem;">
          <div style="color:#94a3b8; font-size:0.82rem;">Variant C • Mobile-first Tabs</div>
          <div style="color:#64748b; font-size:0.74rem;">Stable tie-break: canonical_id</div>
        </div>
        <div class="ue-tabs" data-testid="ue-filters">
          ${classTabs.map((cls) => `<button class="ue-btn ue-btn-chip ${state.filters.class === cls ? 'active' : ''}" data-action="ue-set-class" data-class="${cls}">${cls}</button>`).join('')}
        </div>
        <div class="ue-pills" data-testid="ue-exchange-pills">
          <button class="ue-btn ue-btn-chip ${state.filters.exchange === 'ALL' ? 'active' : ''}" data-action="ue-set-exchange" data-exchange="ALL">ALL</button>
          ${exchangeOptions.map((row) => `<button class="ue-btn ue-btn-chip ${isExchangeSelected(row.exchange) ? 'active' : ''}" data-action="ue-toggle-exchange" data-exchange="${escapeHtml(row.exchange)}">${escapeHtml(row.exchange)}</button>`).join('')}
        </div>
        <div class="ue-pills">
          <button class="ue-btn ue-btn-chip ${state.filters.status === 'ALL' ? 'active' : ''}" data-action="ue-set-status" data-status="ALL">ALL</button>
          ${statusOptions.map((status) => `<button class="ue-btn ue-btn-chip ${isStatusSelected(status) ? 'active' : ''}" data-action="ue-toggle-status" data-status="${escapeHtml(status)}">${escapeHtml(getStatusLabel(status))}</button>`).join('')}
        </div>
        <div class="ue-more">
          <button class="ue-btn" data-action="ue-toggle-more">${state.moreFiltersOpen ? 'Hide' : 'More'} filters</button>
        </div>
        ${state.moreFiltersOpen ? `
          <div class="ue-filter-row" data-testid="ue-filters">
            <div class="ue-filter-block">
              <label>Sort</label>
              <select class="ue-select" data-action="ue-set-sort-field">
                ${SORT_FIELDS.map((it) => `<option value="${it.key}" ${state.sort.field === it.key ? 'selected' : ''}>${escapeHtml(it.label)}</option>`).join('')}
              </select>
            </div>
            <div class="ue-filter-block">
              <label>Direction</label>
              <select class="ue-select" data-action="ue-set-sort-dir">
                <option value="asc" ${state.sort.dir === 'asc' ? 'selected' : ''}>asc</option>
                <option value="desc" ${state.sort.dir === 'desc' ? 'selected' : ''}>desc</option>
              </select>
            </div>
            <div class="ue-filter-block">
              <label>Min bars</label>
              <select class="ue-select" data-action="ue-set-minbars-select">
                <option value="0" ${toFinite(state.filters.minBarsPreset, 0) === 0 ? 'selected' : ''}>ALL</option>
                <option value="250" ${toFinite(state.filters.minBarsPreset, 0) === 250 ? 'selected' : ''}>>=250</option>
                <option value="500" ${toFinite(state.filters.minBarsPreset, 0) === 500 ? 'selected' : ''}>>=500</option>
                <option value="1000" ${toFinite(state.filters.minBarsPreset, 0) === 1000 ? 'selected' : ''}>>=1000</option>
              </select>
            </div>
          </div>
        ` : ''}
        ${renderTable(context.meta, context.items)}
        ${renderPagination(context.meta)}
      </section>
    `;
  }

  function renderExchangeModal(summary) {
    const rows = getExchangeOptions(summary);
    const q = String(state.exchangeModalQuery || '').trim().toUpperCase();
    const filtered = q ? rows.filter((row) => row.exchange.includes(q)) : rows;

    return `
      <div class="ue-modal ${state.exchangeModalOpen ? 'open' : ''}" data-action="ue-close-exchange-modal">
        <div class="ue-modal-card" onclick="event.stopPropagation();">
          <div style="display:flex; justify-content:space-between; align-items:center; gap:0.5rem;">
            <strong style="color:#e5e7eb;">Select Exchange</strong>
            <button class="ue-btn ue-btn-chip" data-action="ue-close-exchange-modal">Close</button>
          </div>
          <div style="margin-top:0.55rem;">
            <input class="ue-input" type="text" value="${escapeHtml(state.exchangeModalQuery)}" placeholder="Search exchange..." data-action="ue-exchange-search" />
          </div>
          <div class="ue-modal-list">
            <button class="ue-btn ${state.filters.exchange === 'ALL' ? 'active' : ''}" data-action="ue-set-exchange" data-exchange="ALL">ALL</button>
            ${filtered.map((row) => `<button class="ue-btn ${isExchangeSelected(row.exchange) ? 'active' : ''}" data-action="ue-toggle-exchange" data-exchange="${escapeHtml(row.exchange)}">${escapeHtml(row.exchange)} (${formatCount(row.count)})</button>`).join('')}
          </div>
        </div>
      </div>
    `;
  }

  function UniverseExplorerPage(context) {
    const summary = context.summary || {};
    const browse = context.browse || { meta: {}, items: [] };
    const variantContext = {
      summary,
      meta: browse.meta || {},
      items: Array.isArray(browse.items) ? browse.items : []
    };

    const variantHtml = UniverseExplorerVariantC(variantContext);

    return `
      <section class="ue-shell" id="UniverseExplorerPage">
        <div class="ue-title-row">
          <div>
            <h2 class="ue-title">Universe Explorer</h2>
            <div class="ue-subtitle">Markets subpage (v7) with deterministic paging and shared adapter</div>
          </div>
          <div style="color:#94a3b8; font-size:0.82rem; font-weight:700;">Mode: C • Mobile-first Tabs</div>
        </div>

        <div class="ue-search-row">
          <div class="ue-search-wrap">
            <input class="ue-input" type="text" value="${escapeHtml(state.filters.q)}" placeholder="Search symbol or name" data-action="ue-search-input" />
            ${renderSearchList()}
          </div>
          <div style="display:flex; justify-content:flex-end; align-items:center; gap:0.55rem; color:#94a3b8; font-size:0.78rem;">
            <span>Last update:</span>
            <span style="color:#e5e7eb; font-weight:600;">${escapeHtml(formatDate(summary.updated_at))}</span>
          </div>
        </div>

        ${renderKpiStrip(summary)}
        <div class="ue-breadcrumb">${escapeHtml(renderBreadcrumb())}</div>
        <div class="ue-results-bar">
          <div>${escapeHtml(renderResultsSummary(browse.meta || {}))}</div>
          <button class="ue-btn" data-action="ue-reset-filters">Reset Filters</button>
        </div>

        ${variantHtml}
        ${renderExchangeModal(summary)}
      </section>
    `;
  }

  async function refreshBrowse({ resetPage = false } = {}) {
    if (resetPage) {
      state.paging.page = 1;
      state.jumpPageInput = '1';
    }

    state.loading = true;
    state.error = null;
    render();

    try {
      const payload = await adapter.browse({
        page: state.paging.page,
        pageSize: state.paging.pageSize,
        class: state.filters.class,
        exchange: state.filters.exchange,
        status: state.filters.status,
        q: state.filters.q,
        sort: state.sort.field,
        dir: state.sort.dir,
        minBars: state.filters.minBarsPreset
      });

      state.browse = payload;
      const resolvedPage = normalizePage(payload?.meta?.page || state.paging.page);
      state.paging.page = resolvedPage;
      state.jumpPageInput = String(resolvedPage);
      clearExpandedRows();
    } catch (error) {
      state.error = String(error?.message || error);
      state.browse = {
        meta: {
          page: 1,
          pageSize: state.paging.pageSize,
          totalCount: 0,
          totalPages: 1,
          sort: state.sort.field,
          dir: state.sort.dir,
          filters_applied: {
            class: state.filters.class,
            exchange: state.filters.exchange,
            status: state.filters.status,
            q: state.filters.q
          },
          stable_tiebreak: 'canonical_id'
        },
        items: []
      };
    } finally {
      state.loading = false;
      render();
    }
  }

  async function refreshSummary() {
    try {
      state.summary = await adapter.getSummary(state.paging.pageSize);
    } catch (error) {
      state.summary = {
        updated_at: null,
        totals: {
          all: { count: 0, pages: 1 },
          by_class: {},
          by_exchange_top: [],
          exchanges_total: null
        },
        data_health: '—'
      };
      state.error = String(error?.message || error);
    }
  }

  async function refreshSearch(q) {
    const trimmed = String(q || '').trim();
    if (!trimmed) {
      state.searchItems = [];
      state.showSearchList = false;
      state.searchActiveIndex = -1;
      render();
      return;
    }

    try {
      const payload = await adapter.search(trimmed, state.filters.class);
      state.searchItems = Array.isArray(payload?.items) ? payload.items : [];
      state.showSearchList = true;
      state.searchActiveIndex = state.searchItems.length ? 0 : -1;
      render();
    } catch {
      state.searchItems = [];
      state.showSearchList = false;
      state.searchActiveIndex = -1;
      render();
    }
  }

  const debouncedSearch = debounce((q) => {
    void refreshSearch(q);
  }, 320);

  function render() {
    if (!rootEl) return;
    rootEl.innerHTML = UniverseExplorerPage({ summary: state.summary, browse: state.browse });
    bindEvents();
  }

  function handleSort(field) {
    const normalized = normalizeSort(field);
    if (state.sort.field === normalized) {
      state.sort.dir = state.sort.dir === 'asc' ? 'desc' : 'asc';
    } else {
      state.sort.field = normalized;
      state.sort.dir = 'asc';
    }
    void refreshBrowse({ resetPage: true });
  }

  function handleResetFilters() {
    state.filters.class = 'ALL';
    state.filters.exchange = 'ALL';
    state.filters.status = 'ALL';
    state.filters.q = '';
    state.filters.minBarsPreset = 0;
    state.moreFiltersOpen = false;
    state.searchItems = [];
    state.searchActiveIndex = -1;
    state.showSearchList = false;
    state.exchangeModalOpen = false;
    state.exchangeModalQuery = '';
    void refreshBrowse({ resetPage: true });
  }

  function bindEvents() {
    if (!rootEl) return;

    rootEl.querySelectorAll('[data-action="ue-sort"]').forEach((btn) => {
      btn.addEventListener('click', () => handleSort(btn.getAttribute('data-sort-field') || 'symbol'));
    });

    const searchInput = rootEl.querySelector('[data-action="ue-search-input"]');
    if (searchInput) {
      searchInput.addEventListener('input', (event) => {
        state.filters.q = String(event.target.value || '');
        state.searchActiveIndex = -1;
        if (!state.filters.q.trim()) {
          state.searchItems = [];
          state.showSearchList = false;
          render();
          return;
        }
        debouncedSearch(state.filters.q);
      });
      searchInput.addEventListener('keydown', (event) => {
        if (event.key === 'ArrowDown' && state.showSearchList && state.searchItems.length) {
          event.preventDefault();
          state.searchActiveIndex = Math.min(state.searchItems.length - 1, Math.max(0, state.searchActiveIndex + 1));
          render();
          return;
        }
        if (event.key === 'ArrowUp' && state.showSearchList && state.searchItems.length) {
          event.preventDefault();
          state.searchActiveIndex = Math.max(0, state.searchActiveIndex - 1);
          render();
          return;
        }
        if (event.key === 'Enter') {
          if (state.showSearchList && state.searchItems.length) {
            event.preventDefault();
            const idx = state.searchActiveIndex >= 0 ? state.searchActiveIndex : 0;
            const pick = state.searchItems[idx];
            applySearchSelection(pick?.symbol || '');
            return;
          }
          state.showSearchList = false;
          void refreshBrowse({ resetPage: true });
        }
        if (event.key === 'Escape') {
          state.showSearchList = false;
          state.searchActiveIndex = -1;
          render();
        }
      });
    }

    rootEl.querySelectorAll('[data-action="ue-pick-search"]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const symbol = String(btn.getAttribute('data-symbol') || '').trim();
        applySearchSelection(symbol);
      });
    });

    rootEl.querySelectorAll('[data-action="ue-set-class"]').forEach((btn) => {
      btn.addEventListener('click', () => {
        state.filters.class = normalizeClass(btn.getAttribute('data-class') || 'ALL');
        void refreshBrowse({ resetPage: true });
      });
    });

    rootEl.querySelectorAll('[data-action="ue-set-class-select"], [data-action="ue-set-class-radio"]').forEach((el) => {
      el.addEventListener('change', () => {
        state.filters.class = normalizeClass(el.value || 'ALL');
        void refreshBrowse({ resetPage: true });
      });
    });

    rootEl.querySelectorAll('[data-action="ue-set-exchange"]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const value = String(btn.getAttribute('data-exchange') || 'ALL').trim().toUpperCase();
        state.filters.exchange = !value || value === 'ALL' ? 'ALL' : value;
        state.exchangeModalOpen = false;
        void refreshBrowse({ resetPage: true });
      });
    });

    rootEl.querySelectorAll('[data-action="ue-toggle-exchange"], [data-action="ue-toggle-exchange-check"]').forEach((btn) => {
      const handler = () => {
        const exchange = String(btn.getAttribute('data-exchange') || btn.value || '').trim().toUpperCase();
        if (!exchange) return;
        toggleExchangeSelection(exchange);
        void refreshBrowse({ resetPage: true });
      };
      if (btn.tagName === 'INPUT') {
        btn.addEventListener('change', handler);
      } else {
        btn.addEventListener('click', handler);
      }
    });

    rootEl.querySelectorAll('[data-action="ue-set-exchange-select"]').forEach((select) => {
      select.addEventListener('change', () => {
        const exchange = String(select.value || 'ALL').toUpperCase();
        state.filters.exchange = exchange || 'ALL';
        void refreshBrowse({ resetPage: true });
      });
    });

    rootEl.querySelectorAll('[data-action="ue-set-status"]').forEach((btn) => {
      btn.addEventListener('click', () => {
        state.filters.status = String(btn.getAttribute('data-status') || 'ALL').toUpperCase() || 'ALL';
        void refreshBrowse({ resetPage: true });
      });
    });

    rootEl.querySelectorAll('[data-action="ue-toggle-status"], [data-action="ue-toggle-status-check"]').forEach((btn) => {
      const handler = () => {
        const status = String(btn.getAttribute('data-status') || btn.value || '').trim().toUpperCase();
        if (!status) return;
        if (status === 'ALL') {
          state.filters.status = 'ALL';
        } else {
          setStatusSelected(status, !isStatusSelected(status));
        }
        void refreshBrowse({ resetPage: true });
      };
      if (btn.tagName === 'INPUT') {
        btn.addEventListener('change', handler);
      } else {
        btn.addEventListener('click', handler);
      }
    });

    rootEl.querySelectorAll('[data-action="ue-set-status-select"]').forEach((select) => {
      select.addEventListener('change', () => {
        state.filters.status = String(select.value || 'ALL').toUpperCase() || 'ALL';
        void refreshBrowse({ resetPage: true });
      });
    });

    rootEl.querySelectorAll('[data-action="ue-set-sort-field"]').forEach((select) => {
      select.addEventListener('change', () => {
        state.sort.field = normalizeSort(select.value || 'symbol');
        void refreshBrowse({ resetPage: true });
      });
    });

    rootEl.querySelectorAll('[data-action="ue-set-sort-dir"]').forEach((select) => {
      select.addEventListener('change', () => {
        state.sort.dir = normalizeDir(select.value || 'asc');
        void refreshBrowse({ resetPage: true });
      });
    });

    rootEl.querySelectorAll('[data-action="ue-set-minbars"]').forEach((btn) => {
      btn.addEventListener('click', () => {
        state.filters.minBarsPreset = Math.max(0, Math.floor(toFinite(btn.getAttribute('data-minbars'), 0)));
        void refreshBrowse({ resetPage: true });
      });
    });

    rootEl.querySelectorAll('[data-action="ue-set-minbars-select"]').forEach((select) => {
      select.addEventListener('change', () => {
        state.filters.minBarsPreset = Math.max(0, Math.floor(toFinite(select.value, 0)));
        void refreshBrowse({ resetPage: true });
      });
    });

    rootEl.querySelectorAll('[data-action="ue-page-first"]').forEach((btn) => {
      btn.addEventListener('click', () => {
        state.paging.page = 1;
        void refreshBrowse();
      });
    });

    rootEl.querySelectorAll('[data-action="ue-page-prev"]').forEach((btn) => {
      btn.addEventListener('click', () => {
        state.paging.page = Math.max(1, state.paging.page - 1);
        void refreshBrowse();
      });
    });

    rootEl.querySelectorAll('[data-action="ue-page-next"]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const maxPages = Math.max(1, toFinite(state.browse?.meta?.totalPages, 1));
        state.paging.page = Math.min(maxPages, state.paging.page + 1);
        void refreshBrowse();
      });
    });

    rootEl.querySelectorAll('[data-action="ue-page-last"]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const maxPages = Math.max(1, toFinite(state.browse?.meta?.totalPages, 1));
        state.paging.page = maxPages;
        void refreshBrowse();
      });
    });

    rootEl.querySelectorAll('[data-action="ue-jump-input"]').forEach((input) => {
      input.addEventListener('input', () => {
        state.jumpPageInput = String(input.value || '');
      });
    });

    rootEl.querySelectorAll('[data-action="ue-jump-go"]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const maxPages = Math.max(1, toFinite(state.browse?.meta?.totalPages, 1));
        const requested = normalizePage(state.jumpPageInput || state.paging.page);
        state.paging.page = Math.min(maxPages, requested);
        void refreshBrowse();
      });
    });

    rootEl.querySelectorAll('[data-action="ue-page-size"]').forEach((select) => {
      select.addEventListener('change', () => {
        state.paging.pageSize = normalizePageSize(select.value);
        void refreshSummary().then(() => refreshBrowse({ resetPage: true }));
      });
    });

    rootEl.querySelectorAll('[data-action="ue-reset-filters"]').forEach((btn) => {
      btn.addEventListener('click', handleResetFilters);
    });

    rootEl.querySelectorAll('[data-action="ue-open-exchange-modal"]').forEach((btn) => {
      btn.addEventListener('click', () => {
        state.exchangeModalOpen = true;
        render();
      });
    });

    rootEl.querySelectorAll('[data-action="ue-close-exchange-modal"]').forEach((btn) => {
      btn.addEventListener('click', () => {
        state.exchangeModalOpen = false;
        render();
      });
    });

    rootEl.querySelectorAll('[data-action="ue-exchange-search"]').forEach((input) => {
      input.addEventListener('input', () => {
        state.exchangeModalQuery = String(input.value || '');
        render();
      });
    });

    rootEl.querySelectorAll('[data-action="ue-toggle-more"]').forEach((btn) => {
      btn.addEventListener('click', () => {
        state.moreFiltersOpen = !state.moreFiltersOpen;
        render();
      });
    });

    rootEl.querySelectorAll('[data-action="ue-toggle-row"]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const key = String(btn.getAttribute('data-row-key') || '');
        if (!key) return;
        if (state.expandedRows.has(key)) state.expandedRows.delete(key);
        else state.expandedRows.add(key);
        render();
      });
    });

  }

  function handleOutsideSearch(event) {
    if (!rootEl || !event?.target) return;
    const searchWrap = rootEl.querySelector('.ue-search-wrap');
    if (!searchWrap) return;
    if (searchWrap.contains(event.target)) return;
    if (state.showSearchList) {
      state.showSearchList = false;
      state.searchActiveIndex = -1;
      render();
    }
  }

  async function init() {
    ensureStyles();
    rootEl = document.getElementById('universe-explorer-root');
    if (!rootEl) return;

    writeVariantToUrl();

    await refreshSummary();

    state.browse = {
      meta: {
        page: 1,
        pageSize: state.paging.pageSize,
        totalCount: 0,
        totalPages: 1,
        sort: state.sort.field,
        dir: state.sort.dir,
        filters_applied: {
          class: state.filters.class,
          exchange: state.filters.exchange,
          status: state.filters.status,
          q: state.filters.q
        },
        stable_tiebreak: 'canonical_id'
      },
      items: []
    };

    render();
    await refreshBrowse({ resetPage: true });

    if (!outsideClickBound) {
      document.addEventListener('click', handleOutsideSearch, true);
      outsideClickBound = true;
    }

    window.addEventListener('popstate', () => {
      writeVariantToUrl();
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => { void init(); });
  } else {
    void init();
  }

  window.UniverseDataAdapter = UniverseDataAdapter;
  window.UniverseExplorerPage = UniverseExplorerPage;
  window.UniverseExplorerVariantC = UniverseExplorerVariantC;
})();
