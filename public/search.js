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

  function renderDropdown(items) {
    dropdown.innerHTML = '';
    if (!items.length) {
      const empty = document.createElement('div');
      empty.className = 'rv-dd-item';
      empty.textContent = 'No matches';
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
    let payload;
    try {
      payload = await fetchJson(url);
    } catch {
      if (seq !== requestSeq) return;
      close();
      return;
    }
    if (seq !== requestSeq) return;
    const items = payload?.data?.symbols ?? [];
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
    suggestions = mapped.slice(0, limit);
    activeIndex = -1;
    if (!suggestions.length) {
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
