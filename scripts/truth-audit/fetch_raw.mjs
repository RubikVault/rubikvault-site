import fs from 'node:fs';
import path from 'node:path';
import { AUDIT_DIR, RAW_DIR, getBaseUrl, ensureAuditDirs, writeRuntimeContext } from './config.mjs';

ensureAuditDirs();
writeRuntimeContext();
const BASE_URL = getBaseUrl();

const targets = [
  { name: 'api_stock_UBER', url: '/api/stock?ticker=UBER', type: 'json' },
  { name: 'api_stock_TEAM', url: '/api/stock?ticker=TEAM', type: 'json' },
  { name: 'api_stock_WBD', url: '/api/stock?ticker=WBD', type: 'json' },
  { name: 'api_stock_UBER_debug', url: '/api/stock?ticker=UBER&debug=1', type: 'json' },
  { name: 'mission_control_summary', url: '/api/mission-control/summary?debug=1', type: 'json' },
  { name: 'ui_path_trace_UBER', url: '/debug/ui-path/UBER.ui-path.trace.json', type: 'json' },
  { name: 'ops_html', url: '/ops/', type: 'html' },
  { name: 'analyze_UBER_html', url: '/analyze/UBER', type: 'html' }
];

async function fetchText(url) {
  const res = await fetch(url, { cache: 'no-store' });
  const text = await res.text();
  return { status: res.status, ok: res.ok, contentType: res.headers.get('content-type') || '', text };
}

async function run() {
  const index = [];
  for (const target of targets) {
    const fullUrl = `${BASE_URL}${target.url}`;
    const result = await fetchText(fullUrl);
    const meta = {
      name: target.name,
      url: fullUrl,
      status: result.status,
      ok: result.ok,
      content_type: result.contentType
    };

    const filePath = path.join(RAW_DIR, `${target.name}.${target.type === 'json' ? 'json' : 'html'}`);
    if (result.ok) {
      fs.writeFileSync(filePath, result.text);
    } else {
      fs.writeFileSync(filePath, JSON.stringify({ error: `HTTP ${result.status}`, url: fullUrl }, null, 2));
    }
    index.push({ ...meta, file: path.relative(AUDIT_DIR, filePath) });
    console.log(`Fetched ${target.name} -> ${result.status}`);
  }

  fs.writeFileSync(path.join(AUDIT_DIR, 'RAW_INDEX.json'), JSON.stringify(index, null, 2));
}

run().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
