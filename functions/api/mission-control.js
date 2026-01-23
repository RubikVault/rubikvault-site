const MODULES_TO_TRACK = ['universe', 'market-prices', 'market-stats', 'market-score', 'stock'];
const SNAPSHOT_PATHS = [
  (moduleName) => `/data/snapshots/${moduleName}/latest.json`,
  (moduleName) => `/data/snapshots/${moduleName}.json`
];

async function fetchSnapshotInfo(requestUrl, moduleName) {
  for (const builder of SNAPSHOT_PATHS) {
    const path = builder(moduleName);
    const url = new URL(path, requestUrl);
    try {
      const response = await fetch(url.toString());
      if (!response.ok) continue;
      const payload = await response.json();
      const metadata = payload?.metadata || {};
      const asOf = metadata?.as_of || metadata?.published_at || metadata?.fetched_at || null;
      return {
        ok: true,
        path,
        served_from: metadata.served_from || 'ASSET',
        schema_version: payload?.schema_version || null,
        module: payload?.module || metadata.module || moduleName,
        as_of: asOf,
        record_count: metadata?.record_count ?? null,
        raw: {
          module: payload?.module || metadata.module || moduleName,
          schema_version: payload?.schema_version || null,
          served_from: metadata.served_from || 'ASSET',
          record_count: metadata?.record_count ?? null
        }
      };
    } catch (error) {
      continue;
    }
  }
  return { ok: false, paths_checked: SNAPSHOT_PATHS.map((builder) => builder(moduleName)) };
}

async function loadRegistry() {
  try {
    const response = await fetch(new URL('/data/registry/modules.json', 'https://example.com').toString());
    if (!response.ok) throw new Error('registry missing');
    const payload = await response.json();
    return payload?.modules || {};
  } catch (error) {
    return {};
  }
}

function buildModuleStatus(moduleName, snapshotInfo) {
  const entry = {
    module: moduleName,
    status: snapshotInfo.ok ? 'ok' : 'missing',
    reason_codes: snapshotInfo.ok ? [] : ['MISSING_SNAPSHOT'],
    as_of: snapshotInfo.ok ? snapshotInfo.as_of : null,
    path: snapshotInfo.ok ? snapshotInfo.path : snapshotInfo.paths_checked,
    snapshot: snapshotInfo.ok ? snapshotInfo.raw : null
  };
  return entry;
}

export async function onRequestGet(context) {
  const requestUrl = context.request.url;
  const debug = new URL(requestUrl).searchParams.get('debug') === '1';
  const modules = [];
  let reasonCounts = {};
  for (const moduleName of MODULES_TO_TRACK) {
    const info = await fetchSnapshotInfo(requestUrl, moduleName);
    const entry = buildModuleStatus(moduleName, info);
    modules.push(entry);
    entry.reason_codes.forEach((code) => {
      reasonCounts[code] = (reasonCounts[code] || 0) + 1;
    });
  }
  const payload = {
    schema_version: '1.0',
    module: 'mission-control',
    served_from: 'ASSET',
    request: {
      ts_utc: new Date().toISOString(),
      debug
    },
    modules,
    reason_counts: reasonCounts,
    links: {
      trace: '/api/trace?ticker=SPY'
    }
  };
  return new Response(JSON.stringify(payload, null, 2), {
    headers: { 'Content-Type': 'application/json' }
  });
}
