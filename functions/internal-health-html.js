/**
 * Embedded Mission Control Dashboard HTML
 * 
 * This file contains the complete HTML for /internal/health
 * to avoid file system access issues in Cloudflare Pages Functions
 */

// HTML content embedded as string constant
const MISSION_CONTROL_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Mission Control v3.0 - RubikVault</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, sans-serif;
      background: #0a0e27;
      color: #e0e0e0;
      padding: 20px;
      line-height: 1.6;
    }
    .container { max-width: 1400px; margin: 0 auto; }
    h1 { color: #4a9eff; margin-bottom: 10px; }
    .subtitle { color: #888; margin-bottom: 30px; }
    .header {
      background: #1a1e37;
      padding: 20px;
      border-radius: 8px;
      margin-bottom: 20px;
      display: grid;
      grid-template-columns: 1fr 1fr 1fr;
      gap: 20px;
    }
    .header-item {
      background: #0f1320;
      padding: 15px;
      border-radius: 6px;
    }
    .header-label { font-size: 12px; color: #888; text-transform: uppercase; margin-bottom: 5px; }
    .header-value { font-size: 24px; font-weight: bold; }
    .status-ok { color: #4caf50; }
    .status-warn { color: #ff9800; }
    .status-crit { color: #f44336; }
    .controls {
      background: #1a1e37;
      padding: 15px;
      border-radius: 8px;
      margin-bottom: 20px;
      display: flex;
      gap: 10px;
      flex-wrap: wrap;
    }
    .controls input, .controls select {
      background: #0f1320;
      border: 1px solid #333;
      color: #e0e0e0;
      padding: 8px 12px;
      border-radius: 4px;
      font-size: 14px;
    }
    .controls input:focus, .controls select:focus {
      outline: none;
      border-color: #4a9eff;
    }
    .modules-table {
      background: #1a1e37;
      border-radius: 8px;
      overflow: hidden;
    }
    table {
      width: 100%;
      border-collapse: collapse;
    }
    th {
      background: #0f1320;
      padding: 12px;
      text-align: left;
      font-size: 12px;
      text-transform: uppercase;
      color: #888;
      font-weight: 600;
      position: sticky;
      top: 0;
    }
    td {
      padding: 12px;
      border-top: 1px solid #252940;
    }
    tr:hover { background: #252940; }
    .badge {
      display: inline-block;
      padding: 4px 8px;
      border-radius: 4px;
      font-size: 11px;
      font-weight: 600;
      text-transform: uppercase;
    }
    .badge-ok { background: #1b5e20; color: #4caf50; }
    .badge-warn { background: #e65100; color: #ff9800; }
    .badge-error { background: #b71c1c; color: #f44336; }
    .badge-stale { background: #424242; color: #9e9e9e; }
    .proof-chain {
      display: flex;
      gap: 4px;
    }
    .proof-item {
      width: 20px;
      height: 20px;
      border-radius: 3px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      font-size: 10px;
      font-weight: bold;
    }
    .proof-pass { background: #1b5e20; color: #4caf50; }
    .proof-fail { background: #b71c1c; color: #f44336; }
    .proof-warn { background: #e65100; color: #ff9800; }
    .proof-unknown { background: #424242; color: #9e9e9e; }
    .links {
      display: flex;
      gap: 8px;
    }
    .link {
      color: #4a9eff;
      text-decoration: none;
      font-size: 12px;
      padding: 4px 8px;
      border: 1px solid #4a9eff;
      border-radius: 4px;
    }
    .link:hover { background: #4a9eff; color: #0a0e27; }
    .top-issues {
      background: #1a1e37;
      padding: 20px;
      border-radius: 8px;
      margin-bottom: 20px;
    }
    .issue {
      padding: 10px;
      margin-bottom: 10px;
      background: #0f1320;
      border-left: 4px solid;
      border-radius: 4px;
    }
    .issue-crit { border-color: #f44336; }
    .issue-warn { border-color: #ff9800; }
    .loading {
      text-align: center;
      padding: 40px;
      color: #888;
    }
    .error {
      background: #b71c1c;
      color: #fff;
      padding: 15px;
      border-radius: 8px;
      margin-bottom: 20px;
    }
    @media (max-width: 768px) {
      .header { grid-template-columns: 1fr; }
      table { font-size: 12px; }
      th, td { padding: 8px; }
    }
  </style>
</head>
<body>
  <div class="container">
    <h1>Mission Control v3.0</h1>
    <div class="subtitle">RubikVault System Health Dashboard</div>
    <div id="loading" class="loading">Loading provider state...</div>
    <div id="error" class="error" style="display: none;"></div>
    <div id="content" style="display: none;">
      <div class="header" id="header"></div>
      <div class="top-issues" id="top-issues" style="display: none;">
        <h3 style="margin-bottom: 15px; color: #4a9eff;">Top Issues</h3>
        <div id="issues-list"></div>
      </div>
      <div class="controls">
        <input type="text" id="search" placeholder="Search modules..." style="flex: 1; min-width: 200px;">
        <select id="filter-tier">
          <option value="">All Tiers</option>
          <option value="critical">Critical</option>
          <option value="standard">Standard</option>
          <option value="experimental">Experimental</option>
        </select>
        <select id="filter-status">
          <option value="">All Status</option>
          <option value="ok">OK</option>
          <option value="warn">Warn</option>
          <option value="error">Error</option>
          <option value="stale">Stale</option>
        </select>
        <select id="filter-domain">
          <option value="">All Domains</option>
        </select>
      </div>
      <div class="modules-table">
        <table>
          <thead>
            <tr>
              <th>Module</th>
              <th>Tier</th>
              <th>Domain</th>
              <th>Status</th>
              <th>Published</th>
              <th>Age</th>
              <th>Proof Chain</th>
              <th>Failure</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody id="modules-body"></tbody>
        </table>
      </div>
    </div>
  </div>
  <script>
    let state = null;
    let filteredModules = [];
    async function loadState() {
      try {
        const res = await fetch('/data/provider-state.json');
        if (!res.ok) {
          throw new Error(\`HTTP \${res.status}: \${res.statusText}\`);
        }
        state = await res.json();
        render();
      } catch (err) {
        document.getElementById('loading').style.display = 'none';
        document.getElementById('error').style.display = 'block';
        document.getElementById('error').textContent = 
          \`Failed to load provider-state.json: \${err.message}. \` +
          \`Check if Finalizer has run and generated the file.\`;
        console.error('Load error:', err);
      }
    }
    function render() {
      document.getElementById('loading').style.display = 'none';
      document.getElementById('content').style.display = 'block';
      renderHeader();
      renderTopIssues();
      renderModules();
      setupFilters();
    }
    function renderHeader() {
      const sys = state.system || {};
      const header = document.getElementById('header');
      const statusClass = \`status-\${sys.status || 'unknown'}\`;
      header.innerHTML = \`
        <div class="header-item">
          <div class="header-label">System Status</div>
          <div class="header-value \${statusClass}">\${(sys.status || 'unknown').toUpperCase()}</div>
        </div>
        <div class="header-item">
          <div class="header-label">Last Publish</div>
          <div class="header-value">\${formatDate(sys.last_publish_at)}</div>
        </div>
        <div class="header-item">
          <div class="header-label">Critical OK</div>
          <div class="header-value \${sys.critical_ok ? 'status-ok' : 'status-crit'}">
            \${sys.critical_ok ? 'YES' : 'NO'}
          </div>
        </div>
      \`;
    }
    function renderTopIssues() {
      const issues = state.system?.top_issues || [];
      if (issues.length === 0) {
        document.getElementById('top-issues').style.display = 'none';
        return;
      }
      document.getElementById('top-issues').style.display = 'block';
      const list = document.getElementById('issues-list');
      list.innerHTML = issues.map(issue => \`
        <div class="issue issue-\${issue.severity}">
          <strong>\${issue.module}</strong>: \${issue.class}<br>
          <small>\${issue.hint || 'No hint available'}</small>
        </div>
      \`).join('');
    }
    function renderModules() {
      const modules = state.modules || [];
      filteredModules = modules;
      const domainSelect = document.getElementById('filter-domain');
      const domains = [...new Set(modules.map(m => m.domain))].sort();
      domainSelect.innerHTML = '<option value="">All Domains</option>' +
        domains.map(d => \`<option value="\${d}">\${d}</option>\`).join('');
      applyFilters();
    }
    function applyFilters() {
      const search = document.getElementById('search').value.toLowerCase();
      const tier = document.getElementById('filter-tier').value;
      const status = document.getElementById('filter-status').value;
      const domain = document.getElementById('filter-domain').value;
      filteredModules = (state.modules || []).filter(m => {
        if (search && !m.module.toLowerCase().includes(search)) return false;
        if (tier && m.tier !== tier) return false;
        if (status && m.status !== status) return false;
        if (domain && m.domain !== domain) return false;
        return true;
      });
      const body = document.getElementById('modules-body');
      body.innerHTML = filteredModules.map(m => \`
        <tr>
          <td><strong>\${m.module}</strong></td>
          <td><span class="badge badge-\${m.tier}">\${m.tier}</span></td>
          <td>\${m.domain}</td>
          <td><span class="badge badge-\${m.status}">\${m.status}</span></td>
          <td>\${m.published ? '✓' : '✗'}</td>
          <td>\${formatAge(m.freshness?.age_minutes)}</td>
          <td>\${renderProofChain(m.proof_chain)}</td>
          <td>\${m.failure?.class || '-'}</td>
          <td class="links">
            <a href="\${m.links.debug}" class="link" target="_blank">Debug</a>
            <a href="\${m.links.snapshot}" class="link" target="_blank">Snapshot</a>
          </td>
        </tr>
      \`).join('');
    }
    function renderProofChain(chain) {
      if (!chain) return '-';
      const items = ['FILE', 'SCHEMA', 'FRESH', 'PLAUS', 'UI', 'DELIVERY'];
      return \`<div class="proof-chain">\${items.map(item => {
        const status = chain[item] || 'UNKNOWN';
        const classMap = {
          'PASS': 'proof-pass',
          'FAIL': 'proof-fail',
          'WARN': 'proof-warn',
          'UNKNOWN': 'proof-unknown'
        };
        return \`<span class="proof-item \${classMap[status] || 'proof-unknown'}" title="\${item}: \${status}">\${item[0]}</span>\`;
      }).join('')}</div>\`;
    }
    function setupFilters() {
      document.getElementById('search').addEventListener('input', applyFilters);
      document.getElementById('filter-tier').addEventListener('change', applyFilters);
      document.getElementById('filter-status').addEventListener('change', applyFilters);
      document.getElementById('filter-domain').addEventListener('change', applyFilters);
    }
    function formatDate(iso) {
      if (!iso) return '-';
      try {
        const d = new Date(iso);
        return d.toLocaleString();
      } catch {
        return iso;
      }
    }
    function formatAge(minutes) {
      if (minutes === null || minutes === undefined) return '-';
      if (minutes < 60) return \`\${Math.round(minutes)}m\`;
      if (minutes < 1440) return \`\${Math.round(minutes / 60)}h\`;
      return \`\${Math.round(minutes / 1440)}d\`;
    }
    loadState();
    setInterval(loadState, 30000);
  </script>
</body>
</html>`;

export async function onRequestGet(context) {
  const { request } = context;
  const url = new URL(request.url);
  
  // Serve embedded HTML for /internal-health/* (matches /internal/health after routing)
  // Note: Cloudflare Pages routes /internal/health to functions/internal-health.js
  if (url.pathname.startsWith('/internal-health') || url.pathname.startsWith('/internal/health')) {
    return new Response(MISSION_CONTROL_HTML, {
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'no-store'
      }
    });
  }
  
  return new Response('Not found', { status: 404 });
}
