function normalizeText(value, fallback) {
  if (value === null || value === undefined) return fallback;
  const text = String(value);
  return text.length ? text : fallback;
}

export function rvMark(el, key) {
  if (!el || !key) return;
  el.dataset.rvField = key;
}

export function rvSetText(el, key, value, fallback = "—") {
  if (!el) return;
  if (key) rvMark(el, key);
  el.textContent = normalizeText(value, fallback);
}

export function rvSetNumber(el, key, value, options = {}, fallback = "—") {
  if (!el) return;
  if (key) rvMark(el, key);
  const num = Number(value);
  if (!Number.isFinite(num)) {
    el.textContent = fallback;
    return;
  }
  el.textContent = new Intl.NumberFormat("en-US", options).format(num);
}

export function rvSetAttr(el, key, attr, value) {
  if (!el || !attr) return;
  if (key) rvMark(el, key);
  if (value === null || value === undefined) return;
  el.setAttribute(attr, String(value));
}
