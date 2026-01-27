const EPSILON = 1e-6;

function isFiniteNumber(value) {
  return Number.isFinite(Number(value));
}

export function validateEodRecord(rec) {
  if (!rec || typeof rec !== 'object') {
    return { ok: false, reason: 'record_not_object' };
  }

  const symbol = String(rec.symbol || '').trim();
  if (!symbol) return { ok: false, reason: 'symbol_missing' };

  const date = String(rec.date || '').trim();
  if (!date) return { ok: false, reason: 'date_missing' };

  const open = rec.open;
  const high = rec.high;
  const low = rec.low;
  const close = rec.close;
  const volume = rec.volume;

  if (!isFiniteNumber(open)) return { ok: false, reason: 'open_invalid' };
  if (!isFiniteNumber(high)) return { ok: false, reason: 'high_invalid' };
  if (!isFiniteNumber(low)) return { ok: false, reason: 'low_invalid' };
  if (!isFiniteNumber(close)) return { ok: false, reason: 'close_invalid' };
  if (!isFiniteNumber(volume)) return { ok: false, reason: 'volume_invalid' };

  const highNum = Number(high);
  const lowNum = Number(low);
  const closeNum = Number(close);
  const volumeNum = Number(volume);

  if (volumeNum < 0) return { ok: false, reason: 'volume_negative' };
  if (highNum + EPSILON < lowNum) return { ok: false, reason: 'high_lt_low' };

  if (closeNum + EPSILON < lowNum || closeNum - EPSILON > highNum) {
    return { ok: false, reason: 'close_outside_range' };
  }

  return { ok: true };
}
