async function fetchJson(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error('request_failed');
  return response.json();
}

function createBadge(text) {
  const badge = document.createElement('span');
  badge.className = 'rv-badge';
  badge.textContent = text;
  return badge;
}

export async function attachSearchUI(rootElement, options = {}) {
  if (!rootElement) return;
  rootElement.innerHTML = '';
  rootElement.classList.add('rv-search');
  const placeholder = options.placeholder || 'Search ticker or company';
  const limit = Number.isFinite(options.limit) ? options.limit : 12;
  const debug = Boolean(options.debug);
  const prefill = options.prefill || '';

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
      const targetUrl = new URL('/stock.html', window.location.origin);
      targetUrl.searchParams.set('ticker', item.ticker);
      if (debug) targetUrl.searchParams.set('debug', '1');
      window.location.assign(targetUrl.toString());
    });

  const input = document.createElement('input');
  input.type = 'search';
  input.className = 'rv-search-input';
  input.placeholder = placeholder;
  input.autocomplete = 'off';
  input.value = prefill;
  rootElement.appendChild(input);

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
      const label = item.name ? `${item.name} (${item.ticker})` : item.ticker;
      const title = document.createElement('strong');
      title.textContent = label;
      entry.appendChild(title);
      const badgeRow = document.createElement('div');
      badgeRow.className = 'rv-badge-row';
      ['DJ30', 'SP500', 'NDX100', 'RUT2000'].forEach((key) => {
        if (item.membership[key]) {
          badgeRow.appendChild(createBadge(key));
        }
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

  async function doFetch(q) {
    const raw = String(q || '').trim();
    if (!raw) {
      close();
      return;
    }
    const seq = ++requestSeq;
    const url = `/api/universe?q=${encodeURIComponent(raw)}&t=${Date.now()}`;

    if (pageDebug) {
      console.log('[rv][search] universe request', { url });
    }

    let payload;
    try {
      payload = await fetchJson(url);
    } catch {
      if (seq !== requestSeq) return;
      if (pageDebug) {
        console.log('[rv][search] universe response', { ok: false, count: null });
      }
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

    const items = payload?.data?.symbols ?? [];
    if (pageDebug) {
      console.log('[rv][search] universe response', { ok: true, count: items.length });
    }

    if (!items.length) {
      if (pageDebug && raw.length >= 1) {
        emptyMessage = 'No matches';
        suggestions = [];
        activeIndex = -1;
        renderDropdown([]);
        return;
      }
      close();
      return;
    }

    const mapped = Array.isArray(items)
      ? items
          .map((it) => {
            const symbol = it?.symbol ? String(it.symbol).toUpperCase() : null;
            if (!symbol) return null;
            return {
              ticker: symbol,
              name: it?.name ? String(it.name) : '',
              nameLower: it?.name ? String(it.name).toLowerCase() : '',
              membership: { DJ30: false, SP500: false, NDX100: false, RUT2000: false },
              indexes: []
            };
          })
          .filter(Boolean)
      : [];
    emptyMessage = null;
    suggestions = mapped.slice(0, limit);
    activeIndex = -1;
    if (!suggestions.length) {
      if (pageDebug && raw.length >= 1) {
        emptyMessage = 'No matches';
        renderDropdown([]);
        return;
      }
      close();
      return;
    }
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
    if (input.value.trim()) {
      scheduleFetch(input.value.trim());
    }
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
    if (!rootElement.contains(event.target)) {
      close();
    }
  });

  if (prefill) {
    scheduleFetch(prefill);
  }

  return {
    destroy() {
      input.remove();
      dropdown.remove();
    }
  };
}

/*
Manual verification checklist:
- Type "Apple" -> shows "Apple Inc. (AAPL)"
- ArrowDown + Enter navigates
- Type "aap" -> shows AAP + AAPL
- Esc closes suggestions
- Clicking suggestion navigates
- With ?debug=1, console logs request URL + ok + count
*/
