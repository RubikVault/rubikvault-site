export function formatNumber(value, options = {}) {
  const num = Number(value);
  if (!Number.isFinite(num)) return '—';
  const digits = Number.isFinite(options.digits) ? options.digits : 2;
  return num.toLocaleString(undefined, { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

export function formatPercent(value, digits = 2) {
  const num = Number(value);
  if (!Number.isFinite(num)) return '—';
  const pct = num * 100;
  const sign = pct > 0 ? '+' : '';
  return `${sign}${pct.toFixed(digits)}%`;
}

export function formatDateDDMMYYYY(d) {
  if (!d || d === '—') return '—';
  const parts = String(d).split('-');
  if (parts.length === 3) return `${parts[2]}-${parts[1]}-${parts[0]}`;
  return String(d);
}
