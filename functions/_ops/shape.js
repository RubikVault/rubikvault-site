export function getBarNode(resp) {
  if (!resp || typeof resp !== 'object') return null;
  const data = resp.data && typeof resp.data === 'object' ? resp.data : null;
  return data && typeof data.latest_bar === 'object' ? data.latest_bar : null;
}

export function getTruthChainsNode(summary) {
  if (!summary || typeof summary !== 'object') return null;
  const data = summary.data && typeof summary.data === 'object' ? summary.data : null;
  return data && typeof data.truthChains === 'object' ? data.truthChains : null;
}

export function safeKeys(obj) {
  return obj && typeof obj === 'object' ? Object.keys(obj) : [];
}
