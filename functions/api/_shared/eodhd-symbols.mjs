function normalizeSymbol(value) {
  return String(value || '').trim().toUpperCase();
}

function normalizeExchange(value) {
  return String(value || '').trim().toUpperCase();
}

function exchangeFromCanonicalId(canonicalId) {
  const normalized = normalizeSymbol(canonicalId);
  if (!normalized.includes(':')) return '';
  return normalizeExchange(normalized.split(':')[0]);
}

function usClassShareSymbol(symbol) {
  const normalized = normalizeSymbol(symbol);
  const classShare = normalized.match(/^([A-Z0-9]+)\.([A-Z])$/);
  if (!classShare) return '';
  return `${classShare[1]}-${classShare[2]}.US`;
}

export function resolveEodhdFundamentalsSymbol({
  symbol,
  exchange,
  providerSymbol,
  canonicalId,
} = {}) {
  const resolvedExchange = normalizeExchange(exchange) || exchangeFromCanonicalId(canonicalId);
  const rawProvider = normalizeSymbol(providerSymbol);
  const rawSymbol = normalizeSymbol(symbol);
  const base = rawProvider || rawSymbol;
  if (!base) return '';

  if (resolvedExchange === 'US') {
    const classShare = usClassShareSymbol(base);
    if (classShare) return classShare;
    if (base.endsWith('.US')) return base;
    if (!base.includes('.')) return `${base}.US`;
    return base;
  }

  if (base.includes('.')) return base;
  if (resolvedExchange) return `${base}.${resolvedExchange}`;
  return base;
}
