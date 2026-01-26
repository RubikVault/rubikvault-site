const HTML = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Mission Control — RubikVault</title>
  <style>
    * { box-sizing: border-box; }
    body {
      margin: 0;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Oxygen, Ubuntu, Cantarell, "Helvetica Neue", Arial, sans-serif;
      background: #0b1220;
      color: #e5e7eb;
    }
    .wrap {
      max-width: 1100px;
      margin: 0 auto;
      padding: 24px;
    }
    h1 {
      margin: 0 0 6px;
      font-size: 28px;
      letter-spacing: -0.02em;
    }
    .sub {
      color: #94a3b8;
      margin-bottom: 18px;
      font-size: 14px;
    }
    .grid {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 12px;
      margin: 14px 0 22px;
    }
    .card {
      border: 1px solid rgba(148, 163, 184, 0.25);
      background: rgba(15, 23, 42, 0.7);
      border-radius: 12px;
      padding: 14px;
      overflow: hidden;
    }
    .k { color: #94a3b8; font-size: 12px; text-transform: uppercase; letter-spacing: 0.06em; }
    .v { margin-top: 6px; font-size: 22px; font-weight: 800; }
    .warn { color: #fbbf24; }
    .ok { color: #34d399; }
    .bad { color: #fb7185; }
    .row { display: flex; gap: 10px; align-items: baseline; justify-content: space-between; }
    table { width: 100%; border-collapse: collapse; }
    th, td { text-align: left; padding: 10px 8px; border-bottom: 1px solid rgba(148, 163, 184, 0.15); font-size: 13px; }
    th { color: #94a3b8; font-weight: 700; }
    .pill { display: inline-block; padding: 2px 8px; border-radius: 999px; border: 1px solid rgba(148,163,184,0.25); font-size: 12px; color: #e5e7eb; }
    .pill.ok { border-color: rgba(52, 211, 153, 0.35); color: #a7f3d0; }
    .pill.bad { border-color: rgba(251, 113, 133, 0.35); color: #fecdd3; }
    .pill.warn { border-color: rgba(251, 191, 36, 0.35); color: #fde68a; }
    .small { color: #94a3b8; font-size: 12px; }
    @media (max-width: 860px) {
      .grid { grid-template-columns: 1fr; }
    }
  </style>
</head>
<body>
  <div class="wrap">
    <h1>Mission Control</h1>
    <div class="sub">Deterministic observability (KV-safe, no secrets)</div>

    <div id="loading" class="card">Loading…</div>

    <div id="main" style="display:none;">
      <div class="grid">
        <div class="card">
          <div class="k">Calls (day)</div>
          <div class="v" id="calls-day">—</div>
          <div class="small" id="kv-status">—</div>
        </div>
        <div class="card">
          <div class="k">Calls (week)</div>
          <div class="v" id="calls-week">—</div>
          <div class="small">Rolling week key (ISO)</div>
        </div>
        <div class="card">
          <div class="k">Calls (month)</div>
          <div class="v" id="calls-month">—</div>
          <div class="small">YYYY-MM</div>
        </div>
      </div>

      <div class="card" style="margin-bottom: 12px;">
        <div class="row">
          <div>
            <div class="k">Tiingo diagnostics</div>
            <div class="v" id="tiingo-status">—</div>
          </div>
          <div class="small" id="tiingo-meta">—</div>
        </div>
      </div>

      <div class="card" style="margin-bottom: 12px;">
        <div class="k" style="margin-bottom: 10px;">Top endpoints (day)</div>
        <table>
          <thead>
            <tr><th>Endpoint</th><th>Calls</th></tr>
          </thead>
          <tbody id="endpoints"></tbody>
        </table>
      </div>

      <div class="card">
        <div class="k" style="margin-bottom: 10px;">Snapshots</div>
        <table>
          <thead>
            <tr><th>Module</th><th>Status</th><th>As of</th><th>Records</th></tr>
          </thead>
          <tbody id="snapshots"></tbody>
        </table>
      </div>

      <div class="small" style="margin-top: 14px;">API: <a href="/api/mission-control/summary" style="color:#60a5fa;">/api/mission-control/summary</a></div>
    </div>
  </div>

  <script>
    function esc(s) {
      return String(s == null ? '' : s)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
    }

    function fmtNum(n) {
      const v = Number(n);
      if (!Number.isFinite(v)) return '—';
      return v.toLocaleString();
    }

    function pill(text, cls) {
      return '<span class="pill ' + cls + '">' + esc(text) + '</span>';
    }

    async function load() {
      const loading = document.getElementById('loading');
      const main = document.getElementById('main');
      try {
        const res = await fetch('/api/mission-control/summary?debug=1');
        const payload = await res.json();
        const data = payload && payload.data ? payload.data : {};

        document.getElementById('calls-day').textContent = fmtNum(data.calls && data.calls.day);
        document.getElementById('calls-week').textContent = fmtNum(data.calls && data.calls.week);
        document.getElementById('calls-month').textContent = fmtNum(data.calls && data.calls.month);

        const hasKV = Boolean(data.kv && data.kv.hasKV);
        document.getElementById('kv-status').innerHTML = hasKV
          ? '<span class="small ok">KV bound</span>'
          : '<span class="small warn">KV not bound</span>';

        const tiingo = data.tiingo || null;
        if (!tiingo) {
          document.getElementById('tiingo-status').innerHTML = pill('UNKNOWN', 'warn');
          document.getElementById('tiingo-meta').textContent = 'No diagnostics';
        } else {
          document.getElementById('tiingo-status').innerHTML = tiingo.canReachTiingo ? pill('OK', 'ok') : pill('FAIL', 'bad');
          document.getElementById('tiingo-meta').textContent =
            'keyPresent=' + String(Boolean(tiingo.keyPresent)) +
            ' source=' + String(tiingo.keySource || 'null') +
            ' http=' + String(tiingo.httpStatus == null ? 'null' : tiingo.httpStatus) +
            ' latencyMs=' + String(tiingo.latencyMs == null ? 'null' : tiingo.latencyMs);
        }

        const endpoints = Array.isArray(data.top_endpoints) ? data.top_endpoints : [];
        document.getElementById('endpoints').innerHTML = endpoints.length
          ? endpoints.map((row) => '<tr><td>' + esc(row.endpoint) + '</td><td>' + fmtNum(row.day) + '</td></tr>').join('')
          : '<tr><td colspan="2" class="small">No endpoint counters (KV missing or no traffic yet)</td></tr>';

        const snaps = Array.isArray(data.snapshots) ? data.snapshots : [];
        document.getElementById('snapshots').innerHTML = snaps.map((s) => {
          const ok = Boolean(s.ok);
          const st = ok ? (s.status || 'OK') : 'MISSING';
          const cls = ok ? 'ok' : 'warn';
          return '<tr>' +
            '<td>' + esc(s.module) + '</td>' +
            '<td>' + pill(st, cls) + '</td>' +
            '<td class="small">' + esc(s.as_of || '—') + '</td>' +
            '<td>' + esc(s.record_count == null ? '—' : s.record_count) + '</td>' +
          '</tr>';
        }).join('');

        loading.style.display = 'none';
        main.style.display = 'block';
      } catch (e) {
        loading.textContent = 'Failed to load mission control summary.';
      }
    }

    load();
    setInterval(load, 30000);
  </script>
</body>
</html>`;

export async function onRequestGet() {
  return new Response(HTML, {
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store'
    }
  });
}
