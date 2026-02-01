import { formatNumber, formatPercent, formatDateDDMMYYYY } from './formatters.mjs';

export function computeUiValues(stockPayload) {
  const data = stockPayload?.data || {};
  const bar = data?.latest_bar || null;
  const close = bar?.close ?? null;
  const volume = bar?.volume ?? null;
  const date = bar?.date || '—';
  const changeAbs = data?.change?.abs ?? null;
  const changePct = data?.change?.pct ?? null;

  const closeDisplay = close == null ? '—' : `$${formatNumber(close, { digits: 2 })}`;
  const dayAbsDisplay = formatNumber(changeAbs, { digits: 2 });
  const dayPctDisplay = `(${formatPercent(changePct, 2)})`;
  const volumeDisplay = volume == null ? '—' : Number(volume).toLocaleString();
  const dateDisplay = formatDateDDMMYYYY(date);

  return {
    close,
    closeDisplay,
    dayAbs: changeAbs,
    dayAbsDisplay,
    dayPct: changePct,
    dayPctDisplay,
    volume,
    volumeDisplay,
    date,
    dateDisplay
  };
}
