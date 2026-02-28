function normText(v) {
  return String(v || '').trim();
}

function normTicker(v) {
  return normText(v).toUpperCase();
}

function normName(v) {
  return normText(v).toLowerCase();
}

function toArray(input) {
  return Array.isArray(input) ? input : [];
}

export function buildSearchIndex(entries = []) {
  return toArray(entries)
    .map((entry) => {
      const ticker = normTicker(entry?.ticker || entry?.symbol || entry?.id);
      if (!ticker) return null;
      const name = normText(entry?.name || '');
      return {
        ticker,
        name,
        tickerLower: ticker.toLowerCase(),
        nameLower: name.toLowerCase(),
        membership: entry?.membership && typeof entry.membership === 'object'
          ? entry.membership
          : { DJ30: false, SP500: false, NDX100: false, RUT2000: false },
        indexes: Array.isArray(entry?.indexes) ? entry.indexes : [],
        type_norm: entry?.type_norm ? String(entry.type_norm).toUpperCase() : null,
        layer: entry?.layer || null,
        score_0_100: Number.isFinite(Number(entry?.score_0_100)) ? Number(entry.score_0_100) : null
      };
    })
    .filter(Boolean);
}

export function filterUniverse(index, query, limit = 12) {
  const q = normText(query).toLowerCase();
  if (!q) return [];

  const rows = toArray(index)
    .map((entry) => {
      const ticker = normTicker(entry?.ticker || entry?.symbol || entry?.id);
      if (!ticker) return null;
      const name = normText(entry?.name || '');
      const tickerLower = ticker.toLowerCase();
      const nameLower = name.toLowerCase();

      let rank = null;
      if (tickerLower === q) rank = 0;
      else if (tickerLower.startsWith(q)) rank = 1;
      else if (nameLower.startsWith(q)) rank = 2;
      else if (tickerLower.includes(q)) rank = 3;
      else if (nameLower.includes(q)) rank = 4;
      if (rank == null) return null;

      return {
        ...entry,
        ticker,
        name,
        tickerLower,
        nameLower,
        _rank: rank
      };
    })
    .filter(Boolean)
    .sort((a, b) => {
      if (a._rank !== b._rank) return a._rank - b._rank;
      if (a.ticker.length !== b.ticker.length) return a.ticker.length - b.ticker.length;
      return a.ticker.localeCompare(b.ticker);
    });

  return rows.slice(0, Math.max(1, Number(limit) || 12)).map((row) => {
    const out = { ...row };
    delete out._rank;
    return out;
  });
}

async function fetchJson(url, options = {}) {
  const res = await window.fetch(url, options);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

function createBadge(text) {
  const badge = document.createElement('span');
  badge.className = 'rv-badge';
  badge.textContent = text;
  return badge;
}

function createClassBadge(typeNorm) {
  const t = String(typeNorm || '').toUpperCase();
  if (!t) return null;
  const badge = document.createElement('span');
  badge.className = 'rv-badge';
  badge.textContent = t;
  return badge;
}

function suggestionPriority(item, query) {
  const ticker = normTicker(item?.ticker);
  const exchange = normTicker(item?.exchange);
  const name = normName(item?.name);
  const qTicker = normTicker(query);
  const qName = normName(query);
  const rank =
    ticker === qTicker ? 0 :
    ticker.startsWith(qTicker) ? 1 :
    name.startsWith(qName) ? 2 :
    3;
  const usRank = exchange === 'US' ? 0 : 1;
  const tickerLen = ticker ? ticker.length : 99;
  const scoreRank = Number.isFinite(Number(item?.score_0_100)) ? -Number(item.score_0_100) : 0;
  return [rank, usRank, tickerLen, scoreRank, ticker];
}

function compareSuggestionPriority(a, b, query) {
  const pa = suggestionPriority(a, query);
  const pb = suggestionPriority(b, query);
  for (let i = 0; i < pa.length; i += 1) {
    if (pa[i] < pb[i]) return -1;
    if (pa[i] > pb[i]) return 1;
  }
  return 0;
}

function suggestionDedupeKey(item) {
  const name = normName(item?.name);
  if (name && name.length >= 3) return `name:${name}`;
  return `ticker:${normTicker(item?.ticker)}`;
}

function normalizeAssetClass(v) {
  const raw = String(v || '').trim().toUpperCase();
  if (!raw || raw === 'ALL') return 'all';
  const aliases = new Map([
    ['STOCKS', 'stock'],
    ['EQUITIES', 'stock'],
    ['ETFS', 'etf'],
    ['FUNDS', 'fund'],
    ['BONDS', 'bond'],
    ['INDICES', 'index'],
    ['FX', 'forex'],
    ['CRYPTOS', 'crypto']
  ]);
  return aliases.get(raw) || raw.toLowerCase();
}

export async function attachSearchUI(rootElement, options = {}) {
  if (!rootElement) return;
  rootElement.innerHTML = '';
  rootElement.classList.add('rv-search');
  const placeholder = options.placeholder || 'Search ticker or company';
  const limit = Number.isFinite(options.limit) ? options.limit : 12;
  const debug = Boolean(options.debug);
  const prefill = options.prefill || '';
  const enableAssetClassFilter = options.enableAssetClassFilter !== false;
  const assetClassOptions = Array.isArray(options.assetClassOptions) && options.assetClassOptions.length
    ? options.assetClassOptions
    : [
      { value: 'all', label: 'All' },
      { value: 'stock', label: 'Stocks' },
      { value: 'etf', label: 'ETFs' },
      { value: 'fund', label: 'Funds' },
      { value: 'crypto', label: 'Crypto' },
      { value: 'forex', label: 'Forex' },
      { value: 'bond', label: 'Bonds' },
      { value: 'index', label: 'Indices' }
    ];
  let activeAssetClass = normalizeAssetClass(options.assetClass || 'all');

  const pageDebug = (() => {
    try {
      const params = new URLSearchParams(window.location.search || '');
      return params.get('debug') === '1';
    } catch {
      return false;
    }
  })();
  const onSelect =
    options.onSelect ||
    ((item) => {
      const targetUrl = new URL(`/analyze/${encodeURIComponent(item.ticker)}`, window.location.origin);
      if (debug) targetUrl.searchParams.set('debug', '1');
      window.location.assign(targetUrl.toString());
    });

  const controls = document.createElement('div');
  controls.style.display = 'flex';
  controls.style.gap = '0.5rem';
  controls.style.alignItems = 'center';

  if (enableAssetClassFilter) {
    const filter = document.createElement('select');
    filter.className = 'rv-search-input';
    filter.style.maxWidth = '130px';
    filter.style.flex = '0 0 auto';
    filter.setAttribute('aria-label', 'Asset class filter');
    for (const option of assetClassOptions) {
      const opt = document.createElement('option');
      opt.value = normalizeAssetClass(option.value);
      opt.textContent = option.label;
      if (opt.value === activeAssetClass) opt.selected = true;
      filter.appendChild(opt);
    }
    filter.addEventListener('change', () => {
      activeAssetClass = normalizeAssetClass(filter.value);
      if (input.value.trim()) scheduleFetch(input.value.trim());
    });
    controls.appendChild(filter);
  }

  const input = document.createElement('input');
  input.type = 'search';
  input.className = 'rv-search-input';
  input.placeholder = placeholder;
  input.autocomplete = 'off';
  input.value = prefill;
  input.style.flex = '1 1 auto';
  controls.appendChild(input);
  rootElement.appendChild(controls);

  const dropdown = document.createElement('div');
  dropdown.className = 'rv-search-dd';
  dropdown.style.display = 'none';
  rootElement.appendChild(dropdown);

  let suggestions = [];
  let activeIndex = -1;
  let open = false;
  let debounceTimer = null;
  let blurTimer = null;
  let requestSeq = 0;
  let emptyMessage = null;

  function renderDropdown(items) {
    dropdown.innerHTML = '';
    if (!items.length) {
      if (!emptyMessage) {
        dropdown.style.display = 'none';
        open = false;
        return;
      }
      const empty = document.createElement('div');
      empty.className = 'rv-dd-item';
      empty.textContent = emptyMessage;
      dropdown.appendChild(empty);
      dropdown.style.display = 'block';
      open = true;
      return;
    }
    items.forEach((item, idx) => {
      const entry = document.createElement('div');
      entry.className = 'rv-dd-item';
      entry.tabIndex = 0;
      entry.dataset.index = String(idx);
      const exch = item.exchange ? ` · ${item.exchange}` : '';
      const label = item.name ? `${item.name} (${item.ticker}${exch})` : `${item.ticker}${exch}`;
      const title = document.createElement('strong');
      title.textContent = label;
      entry.appendChild(title);
      const badgeRow = document.createElement('div');
      badgeRow.className = 'rv-badge-row';
      const classBadge = createClassBadge(item.type_norm);
      if (classBadge) badgeRow.appendChild(classBadge);
      ['DJ30', 'SP500', 'NDX100', 'RUT2000'].forEach((key) => {
        if (item.membership?.[key]) badgeRow.appendChild(createBadge(key));
      });
      if (badgeRow.children.length) entry.appendChild(badgeRow);
      entry.addEventListener('click', () => handleSelect(idx));
      dropdown.appendChild(entry);
    });
    dropdown.style.display = 'block';
    open = true;
  }

  function close() {
    open = false;
    activeIndex = -1;
    suggestions = [];
    emptyMessage = null;
    dropdown.style.display = 'none';
  }

  function applyActiveClass() {
    Array.from(dropdown.children).forEach((el, idx) => {
      el.classList.toggle('rv-dd-item--highlighted', idx === activeIndex);
    });
  }

  let activeController = null;

  async function doFetch(q) {
    const raw = String(q || '').trim();
    if (!raw) {
      close();
      return;
    }

    if (activeController) {
      activeController.abort();
    }
    activeController = new AbortController();
    const { signal } = activeController;

    const seq = ++requestSeq;
    const params = new URLSearchParams();
    params.set('q', raw);
    params.set('limit', String(limit));
    params.set('t', String(Date.now()));
    if (activeAssetClass !== 'all') params.set('asset_class', activeAssetClass);
    const url = `/api/universe?${params.toString()}`;

    if (pageDebug) {
      console.log('[rv][search] universe request', { url });
    }

    let payload;
    try {
      payload = await fetchJson(url, { signal });
    } catch (err) {
      if (err.name === 'AbortError') return;
      if (seq !== requestSeq) return;
      if (pageDebug) console.log('[rv][search] universe response', { ok: false, count: null });
      close();
      return;
    }
    if (seq !== requestSeq) return;

    if (!Array.isArray(payload?.data?.symbols)) {
      if (pageDebug) {
        console.warn('[rv][search] invalid universe payload shape', {
          hasData: typeof payload?.data === 'object',
          symbolsType: typeof payload?.data?.symbols
        });
      }
      close();
      return;
    }

    const items = payload.data.symbols;
    if (pageDebug) console.log('[rv][search] universe response', { ok: true, count: items.length });

    if (!items.length) {
      emptyMessage = 'No matches';
      suggestions = [];
      activeIndex = -1;
      renderDropdown([]);
      return;
    }

    const deduped = new Map();
    items
      .map((it) => {
        const symbol = it?.symbol ? String(it.symbol).toUpperCase() : null;
        if (!symbol) return null;
        const exchange = it?.exchange
          ? String(it.exchange).toUpperCase()
          : (typeof it?.canonical_id === 'string' && it.canonical_id.includes(':')
            ? String(it.canonical_id).split(':')[0].toUpperCase()
            : null);
        return {
          ticker: symbol,
          name: it?.name ? String(it.name) : '',
          exchange,
          membership: { DJ30: false, SP500: false, NDX100: false, RUT2000: false },
          indexes: [],
          type_norm: it?.type_norm ? String(it.type_norm).toUpperCase() : null,
          layer: it?.layer || null,
          score_0_100: Number.isFinite(Number(it?.score_0_100)) ? Number(it.score_0_100) : null
        };
      })
      .filter(Boolean)
      .forEach((item) => {
        const key = suggestionDedupeKey(item);
        const prev = deduped.get(key);
        if (!prev || compareSuggestionPriority(item, prev, raw) < 0) {
          deduped.set(key, item);
        }
      });

    suggestions = Array.from(deduped.values())
      .sort((a, b) => compareSuggestionPriority(a, b, raw))
      .slice(0, limit);

    emptyMessage = null;
    activeIndex = -1;
    renderDropdown(suggestions);
    applyActiveClass();
  }

  function scheduleFetch(q) {
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => doFetch(q), 150);
  }

  function handleSelect(indexPosition) {
    const item = suggestions[indexPosition];
    if (!item) return;
    onSelect(item);
    close();
  }

  function highlightSelection(direction) {
    if (!open || !suggestions.length) return;
    activeIndex = Math.max(0, Math.min(suggestions.length - 1, activeIndex + direction));
    applyActiveClass();
  }

  input.addEventListener('input', () => {
    const q = input.value.trim();
    if (!q) {
      close();
      return;
    }
    scheduleFetch(q);
  });

  input.addEventListener('focus', () => {
    if (blurTimer) clearTimeout(blurTimer);
    if (input.value.trim() && suggestions.length) {
      open = true;
      dropdown.style.display = 'block';
      applyActiveClass();
      return;
    }
    if (input.value.trim()) scheduleFetch(input.value.trim());
  });

  input.addEventListener('blur', () => {
    if (blurTimer) clearTimeout(blurTimer);
    blurTimer = setTimeout(() => close(), 120);
  });

  input.addEventListener('keydown', (event) => {
    if (event.key === 'ArrowDown') {
      if (open) {
        event.preventDefault();
        highlightSelection(1);
      }
    } else if (event.key === 'ArrowUp') {
      if (open) {
        event.preventDefault();
        highlightSelection(-1);
      }
    } else if (event.key === 'Enter') {
      if (open && suggestions.length) {
        event.preventDefault();
        const pickIndex = activeIndex >= 0 ? activeIndex : 0;
        handleSelect(pickIndex);
      }
    } else if (event.key === 'Escape') {
      close();
    }
  });

  document.addEventListener('click', (event) => {
    if (!rootElement.contains(event.target)) close();
  });

  if (prefill) scheduleFetch(prefill);

  return {
    destroy() {
      controls.remove();
      dropdown.remove();
    }
  };
}
