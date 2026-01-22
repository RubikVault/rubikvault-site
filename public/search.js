const CACHE_KEY = 'rv-search-universe-v1';
const CACHE_TTL_MS = 6 * 60 * 60 * 1000;

const storage = typeof window !== 'undefined' ? window.localStorage : null;
let cachedIndex = null;

function readCache() {
  if (!storage) return null;
  try {
    const payload = storage.getItem(CACHE_KEY);
    if (!payload) return null;
    const parsed = JSON.parse(payload);
    if (Date.now() - (parsed.timestamp || 0) > CACHE_TTL_MS) {
      storage.removeItem(CACHE_KEY);
      return null;
    }
    return parsed.data;
  } catch (error) {
    return null;
  }
}

function writeCache(data) {
  if (!storage) return;
  try {
    storage.setItem(CACHE_KEY, JSON.stringify({ timestamp: Date.now(), data }));
  } catch (error) {
    // ignore
  }
}

async function fetchUniverse(debug = false) {
  const url = new URL('/api/universe', window.location.origin);
  if (debug) url.searchParams.set('debug', '1');
  const response = await fetch(url.toString());
  if (!response.ok) throw new Error('unable to load universe');
  const payload = await response.json();
  if (payload?.schema_version !== '3.0' || typeof payload?.data !== 'object') {
    throw new Error('invalid universe payload');
  }
  return payload.data;
}

export async function loadUniverseIndex(debug = false) {
  if (cachedIndex) return cachedIndex;
  let universeData = readCache();
  if (!universeData) {
    universeData = await fetchUniverse(debug);
    writeCache(universeData);
  }
  cachedIndex = buildSearchIndex(universeData);
  return cachedIndex;
}

export function buildSearchIndex(universeData) {
  if (!universeData || typeof universeData !== 'object') return [];
  return Object.entries(universeData).map(([ticker, record]) => {
    const name = record?.name || '';
    const nameLower = name.toLowerCase();
    const indexes = Array.isArray(record?.indexes) ? record.indexes : [];
    return {
      ticker: String(ticker || '').toUpperCase(),
      name,
      nameLower,
      membership: {
        DJ30: indexes.includes('DJ30'),
        SP500: indexes.includes('SP500'),
        NDX100: indexes.includes('NDX100'),
        RUT2000: indexes.includes('RUT2000')
      },
      indexes
    };
  });
}

export function filterUniverse(index, query, limit = 12) {
  if (!query || !index || !Array.isArray(index)) return [];
  const raw = query.trim();
  if (!raw) return [];
  const upper = raw.toUpperCase();
  const lower = raw.toLowerCase();

  const scored = index
    .map((entry) => {
      let score = 0;
      if (entry.ticker === upper) {
        score = 4;
      } else if (entry.ticker.startsWith(upper)) {
        score = 3;
      } else if (entry.nameLower.startsWith(lower)) {
        score = 2;
      } else if (entry.nameLower.includes(lower)) {
        score = 1;
      }
      return { entry, score };
    })
    .filter((item) => item.score > 0);

  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    if (a.entry.ticker < b.entry.ticker) return -1;
    if (a.entry.ticker > b.entry.ticker) return 1;
    return 0;
  });

  return scored.slice(0, limit).map((item) => item.entry);
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

  let index = [];
  let suggestions = [];
  let highlighted = -1;
  let loaded = false;

  async function ensureIndex() {
    if (loaded) return;
    try {
      index = await loadUniverseIndex(debug);
    } catch (error) {
      console.error('search universe load failed', error);
      index = [];
    }
    loaded = true;
  }

  function renderDropdown(items) {
    dropdown.innerHTML = '';
    if (!items.length) {
      const empty = document.createElement('div');
      empty.className = 'rv-dd-item';
      empty.textContent = 'No matches';
      dropdown.appendChild(empty);
      dropdown.style.display = 'block';
      return;
    }
    items.forEach((item, idx) => {
      const entry = document.createElement('div');
      entry.className = 'rv-dd-item';
      entry.tabIndex = 0;
      entry.dataset.index = String(idx);
      const title = document.createElement('strong');
      title.textContent = item.ticker;
      entry.appendChild(title);
      if (item.name) {
        const sub = document.createElement('div');
        sub.textContent = item.name;
        entry.appendChild(sub);
      }
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
  }

  async function handleInput() {
    await ensureIndex();
    const query = input.value;
    suggestions = filterUniverse(index, query, limit);
    highlighted = -1;
    if (!query.trim()) {
      dropdown.style.display = 'none';
      suggestions = [];
      return;
    }
    renderDropdown(suggestions);
  }

  function handleSelect(indexPosition) {
    const item = suggestions[indexPosition];
    if (!item) return;
    onSelect(item);
    dropdown.style.display = 'none';
    highlighted = -1;
  }

  function highlightSelection(direction) {
    if (!suggestions.length) return;
    highlighted = Math.max(0, Math.min(suggestions.length - 1, highlighted + direction));
    Array.from(dropdown.children).forEach((el, idx) => {
      el.classList.toggle('rv-dd-item--highlighted', idx === highlighted);
    });
  }

  input.addEventListener('input', () => handleInput());
  input.addEventListener('focus', () => {
    if (!dropdown.innerHTML && input.value.trim()) {
      handleInput();
    }
  });

  input.addEventListener('keydown', (event) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      highlightSelection(1);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      highlightSelection(-1);
    } else if (event.key === 'Enter') {
      if (highlighted >= 0) {
        event.preventDefault();
        handleSelect(highlighted);
      }
    } else if (event.key === 'Escape') {
      dropdown.style.display = 'none';
    }
  });

  document.addEventListener('click', (event) => {
    if (!rootElement.contains(event.target)) {
      dropdown.style.display = 'none';
    }
  });

  if (prefill) {
    handleInput();
  }

  return {
    destroy() {
      input.remove();
      dropdown.remove();
    }
  };
}
