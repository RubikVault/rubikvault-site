document.addEventListener('DOMContentLoaded', () => {
  fetch('/data/snapshot.json', { cache: 'no-store' })
    .then((res) => {
      if (!res.ok) throw new Error('Snapshot fetch failed');
      return res.json();
    })
    .then(applySnapshot)
    .catch((err) => {
      console.warn('Snapshot load error:', err);
    });
});

function applySnapshot(data) {
  // Market overview helper
  const mv = data.market_overview || {};
  setMarketItem('spx', mv.spx);
  setMarketItem('ndx', mv.ndx);
  setMarketItem('dax', mv.dax);
  setMarketItem('btc', mv.btc);
  setMarketItem('eth', mv.eth);
  setMarketItem('gold', mv.gold);
  setMarketItem('us10y', mv.us10y);
  setMarketItem('vix', mv.vix);

  // Crypto heatmap
  const heat = data.crypto_heatmap || {};
  fillList('heatmap-gainers', heat.gainers);
  fillList('heatmap-losers', heat.losers);

  // Macro
  const macro = data.macro || {};
  setText('macro-fedfunds', macro.fed_funds);
  setText('macro-ecb', macro.ecb_main);
  setText('macro-cpi', macro.us_cpi_yoy);
  setText('macro-risk-score', macro.risk_score_label || macro.risk_score);

  // Summary bullets
  const summary = Array.isArray(data.summary) ? data.summary : [];
  const summaryList = document.getElementById('snapshot-summary');
  if (summaryList && summary.length) {
    summaryList.innerHTML = '';
    summary.forEach((line) => {
      const li = document.createElement('li');
      li.textContent = line;
      summaryList.appendChild(li);
    });
  }

  // Movers
  const movers = data.top_movers || {};
  fillMovers('movers-equities', movers.equities);
  fillMovers('movers-crypto', movers.crypto);
}

function setMarketItem(key, obj) {
  if (!obj) return;
  const valEl = document.getElementById(`mv-${key}`);
  const chgEl = document.getElementById(`mv-${key}-chg`);
  if (valEl) valEl.textContent = obj.value ?? '–';
  if (chgEl) {
    const change = obj.change_pct;
    if (typeof change === 'number') {
      const sign = change > 0 ? '+' : '';
      chgEl.textContent = `${sign}${change.toFixed(2)}%`;
      chgEl.classList.remove('positive', 'negative');
      if (change > 0) chgEl.classList.add('positive');
      if (change < 0) chgEl.classList.add('negative');
    } else {
      chgEl.textContent = obj.change_label || '–';
    }
  }
}

function fillList(id, arr) {
  const el = document.getElementById(id);
  if (!el || !Array.isArray(arr)) return;
  el.innerHTML = '';
  arr.forEach((item) => {
    const li = document.createElement('li');
    const left = document.createElement('span');
    left.className = 'rv-heatmap-token';
    left.textContent = item.symbol || item.name || '–';
    const right = document.createElement('span');
    right.className = 'rv-heatmap-change';
    const change = item.change_pct;
    if (typeof change === 'number') {
      const sign = change > 0 ? '+' : '';
      right.textContent = `${sign}${change.toFixed(2)}%`;
      right.classList.add(change >= 0 ? 'positive' : 'negative');
    } else {
      right.textContent = item.change_label || '–';
    }
    li.appendChild(left);
    li.appendChild(right);
    el.appendChild(li);
  });
}

function fillMovers(id, arr) {
  const el = document.getElementById(id);
  if (!el || !Array.isArray(arr)) return;
  el.innerHTML = '';
  arr.forEach((item) => {
    const li = document.createElement('li');
    const left = document.createElement('span');
    left.className = 'rv-movers-symbol';
    left.textContent = item.symbol || item.name || '–';
    const right = document.createElement('span');
    right.className = 'rv-movers-change';
    const change = item.change_pct;
    if (typeof change === 'number') {
      const sign = change > 0 ? '+' : '';
      right.textContent = `${sign}${change.toFixed(2)}%`;
      if (change >= 0) right.classList.add('positive');
      if (change < 0) right.classList.add('negative');
    } else {
      right.textContent = item.change_label || '–';
    }
    li.appendChild(left);
    li.appendChild(right);
    el.appendChild(li);
  });
}

function setText(id, value) {
  const el = document.getElementById(id);
  if (!el) return;
  el.textContent = value ?? '–';
}
