function maskSensitive(input) {
  if (!input) return '';
  let out = String(input);
  out = out.replace(/token=([A-Za-z0-9._-]+)/gi, 'token=***');
  out = out.replace(/authorization:\s*bearer\s+[A-Za-z0-9._-]+/gi, 'authorization: bearer ***');
  return out;
}

function collapseWhitespace(input) {
  return String(input).replace(/\s+/g, ' ').trim();
}

export async function fetchWithContext(url, opts = {}, ctx = {}) {
  const start = Date.now();
  try {
    const res = await fetch(url, { cache: 'no-store', ...opts });
    if (!res.ok) {
      const raw = await res.text().catch(() => '');
      const masked = maskSensitive(raw);
      const snippet = collapseWhitespace(masked).slice(0, 300);
      const ms = Date.now() - start;
      const err = new Error(`HTTP ${res.status} ${res.statusText || ''} (${ms}ms) ${snippet}`.trim());
      err.status = res.status;
      err.url = url;
      throw err;
    }
    return res;
  } catch (err) {
    const ms = Date.now() - start;
    const payload = {
      type: 'TEST_FETCH_FAIL',
      url,
      ms,
      ctx,
      env: {
        OPS_BASE: process.env.OPS_BASE || null,
        RV_BASE: process.env.RV_BASE || null,
        BASE_URL: process.env.BASE_URL || null,
        BASE: process.env.BASE || null,
        CI: process.env.CI || null
      },
      err: err?.stack || err?.message || String(err)
    };

    const jsonLog = process.env.CI === 'true' || process.env.CI === '1' || process.env.RV_LOG_JSON === '1';
    if (jsonLog) {
      console.error(JSON.stringify(payload, null, 2));
    } else {
      console.error('TEST_FETCH_FAIL');
      console.error(`url: ${url}`);
      console.error(`ms: ${ms}`);
      console.error(`ctx: ${JSON.stringify(ctx)}`);
      console.error(`env: ${JSON.stringify(payload.env)}`);
      console.error(`err: ${payload.err}`);
    }

    throw err;
  }
}

