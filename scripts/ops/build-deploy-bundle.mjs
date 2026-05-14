#!/usr/bin/env node
/**
 * Build Deploy Bundle
 *
 * Builds dist/pages-prod/ from public/ by:
 *  1. Syncing all public/ content except gitignored/local-only heavy dirs
 *  2. Enforcing Cloudflare Pages file count budget (<= BUNDLE_FILE_LIMIT)
 *  3. Writing var/private/ops/build-bundle-meta.json as local proof artifact
 *
 * Usage:
 *   node scripts/ops/build-deploy-bundle.mjs [--dry-run] [--strict]
 *
 * --dry-run : count files and report budget without writing dist/
 * --strict  : exit 1 if bundle exceeds budget (default: warn only)
 *
 * Integrated into: npm run build:deploy
 * Called by:       scripts/ops/release-gate-check.mjs before wrangler deploy
 */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { gunzipSync } from 'node:zlib';

const REPO_ROOT      = path.resolve(fileURLToPath(new URL('.', import.meta.url)), '../..');
const PUBLIC_DIR     = path.join(REPO_ROOT, 'public');
const DIST_DIR       = path.join(REPO_ROOT, 'dist/pages-prod');
const MANIFEST_PATH  = path.join(REPO_ROOT, 'config/runtime-manifest.json');
const PRIVATE_OPS_DIR = path.join(REPO_ROOT, 'var/private/ops');
const DECISION_RETENTION_REPORT_PATH = path.join(REPO_ROOT, 'public/data/reports/decision-bundle-retention-latest.json');
const DEPLOY_BUNDLE_SIZE_REPORT_PATH = path.join(PRIVATE_OPS_DIR, 'deploy-bundle-size-report.json');

// Cloudflare Pages hard limit: 20k files. We use 18k as safety margin.
// Note: Cloudflare Pages now supports 20,000 files (as of 2024 pricing tier change).
const BUNDLE_FILE_LIMIT = 18_000;
const BUNDLE_HEADROOM_CRITICAL_THRESHOLD = 17_900;

// Directories inside public/ to exclude from the deploy bundle.
// These are either gitignored (local-only) or too large for Pages.
// Order matters: more specific paths should come before general ones.
const RSYNC_EXCLUDES = [
  // Gitignored locally — not in the git repo, must not go to Pages
  'data/hist-probs/',          // 40K+ files, 1.4GB — ticker prob JSON files
  'data/v3/series/adjusted_all/', // gitignored bulk series
  'data/features-v2/',         // gitignored
  'data/forecast/reports/',    // gitignored
  'data/forecast/v6/',         // gitignored
  'data/eod/bars/',            // gitignored bars JSON
  'data/eod/history/packs',   // symlink → QuantLabHot/storage/universe-v7-history (local-only, up to 56MB files)
  'data/rvci/',                // gitignored
  'data/features-v4/stock-insights/index.json', // gitignored
  'data/snapshots/stock-analysis.json',          // gitignored
  // Large local dirs that are also gitignored or superseded by KV/R2
  'data/marketphase/',         // 53K+ files — market phase per-ticker
  'data/v3/series/',           // 13K+ files — v3 per-ticker series
  'data/quantlab/reports/',    // large model report archives
  'data/quantlab/',            // QuantLab internals — local/NAS only
  'data/reports/',             // internal reports — local/NAS only
  'data/ops/',                 // release proofs, ops state, audits — local/NAS only
  'data/ops-daily.json',       // ops dashboard state — local/NAS only
  'data/pipeline/',            // pipeline internals — local/NAS only
  'data/ui/',                  // dashboard/supervisor UI state — local/NAS only
  'data/runblock/',            // local validation state
  'data/runtime/',             // control/gate internals
  'data/decisions/',           // full decision bundles expose internal model output
  'data/universe/v7/reports/', // audit/gap reports — local/NAS only
  'data/universe/v7/registry/*report*.json',
  'data/universe/v7/ssot/*report*.json',
  'data/v3/audit/',
  'mirror/',                   // legacy public mirror data moved local-only
  'mirrors/',                  // public mirror dashboards/data moved local-only
  'js/stock-ui/modules/audit.js',
  // Universe v7 search buckets: locally the pipeline generates 23K+ gitignored buckets;
  // only the ~1K git-tracked buckets should be deployed. We exclude all here and
  // then explicitly copy git-tracked bucket files below.
  'data/universe/v7/search/buckets/',
  // Too large for Cloudflare Pages (25 MiB per-file limit)
  'data/ops/stock-analyzer-operability-latest.json', // full universe audit — 50–60 MB, not served by Pages
  'data/ops/mac-history-rescue-all-latest.json',     // rescue audit snapshot — build-only
  'data/eod/history/pack-manifest.global.json',      // global pack manifest — build-only
  'data/eod/history/pack-manifest.global.lookup.json', // global lookup — build-only
  'data/eod/history/pack-manifest.us-eu.json',       // oversized build manifest; runtime uses public shards
  'data/eod/history/pack-manifest.us-eu.lookup.json', // manifest lookup pairs with oversized manifest
  'data/universe/v7/read_models/marketphase_deep_summary.json', // 35 MB NAS-generated deep summary — build-only
  // Mac metadata artifacts — never appropriate in a web bundle
  '.DS_Store',
  '._*',
  '__MACOSX/',
  // Atomic write temp files — hidden files with extra extensions (.json.RANDOM_SUFFIX)
  '.*.json.*',
  // Placeholder files — directory markers only, no runtime value
  '.gitkeep',
  // Backup files — development artifacts
  '*.bak',
  // Debug directory — contains AI trace artifacts and development proofs
  'debug/',
  // Build-only feature reports — not runtime data
  'data/features-v4/reports/',
  // Developer documentation in public/ root — not for end users
  'BLOCK_ANALYSIS.md',
  'DEBUG_README.md',
  'RUNBOOK.md',
  // Internal Dashboards & Tools - Local/NAS only, not for public Cloudflare.
  '/dashboard*.html',
  '/dashboard_v*/',
  '/dashboard_v6_meta_data.json',
  '/internal-dashboard*',
  '/mission-control*',
  '/quantlab-v4-daily*',
  '/runblock-v3-local-check.html',
  '/diagnose.js',
  '/internal/',
  '/ops/',
  '/learning.html',
  '/proof.html',      // internal verification
];

const RUNTIME_SERIES_ALLOWLIST = [
  'data/v3/series/adjusted/US__AAPL.ndjson.gz',
  'data/v3/series/adjusted/US__SPY.ndjson.gz',
  'data/v3/series/adjusted/US__F.ndjson.gz',
];

const DECISION_CORE_PUBLIC_PROOF_REPORTS = [
  'data/reports/decision-core-buy-breadth-latest.json',
  'data/reports/stock-decision-core-ui-buy-breadth-latest.json',
  'data/reports/stock-decision-core-ui-random20-latest.json',
  'data/reports/frontpage-best-setups-ui-proof-latest.json',
  'data/reports/decision-core-historical-replay-latest.json',
  'data/reports/decision-core-outcome-bootstrap-latest.json',
];

const PUBLIC_RUNTIME_ALLOWLIST = [
  'data/runtime/hist-probs-status-summary.json',
  'data/runtime/stock-analyzer-ui-delivery.json',
  'data/runtime/stock-analyzer-provider-exceptions-latest.json',
];

const PUBLIC_DASHBOARD_STATUS_REPORT = 'data/status/dashboard-v7-public-latest.json';

const RUNTIME_HISTORICAL_CACHE_LIMIT = Number(process.env.RV_RUNTIME_HISTORICAL_CACHE_LIMIT || 750);
const RUNTIME_HISTORICAL_CANONICAL_IDS = String(process.env.RV_RUNTIME_HISTORICAL_CANONICAL_IDS || 'US:F,US:AAPL,US:HOOD,US:SPY')
  .split(',')
  .map((item) => item.trim().toUpperCase())
  .filter(Boolean);
const RUNTIME_HISTORICAL_SCOPE_CACHE = String(process.env.RV_RUNTIME_HISTORICAL_SCOPE_CACHE ?? '0') !== '0';
const CANONICAL_IDS_PATH = path.join(PUBLIC_DIR, 'data/universe/v7/ssot/assets.global.canonical.ids.json');
const historyShardCache = new Map();

// ─── Helpers ──────────────────────────────────────────────────────────────────

function log(msg) { console.log(`[build-deploy-bundle] ${msg}`); }

function countFiles(dir) {
  if (!fs.existsSync(dir)) return 0;
  let count = 0;
  function walk(d) {
    for (const entry of fs.readdirSync(d, { withFileTypes: true })) {
      if (entry.isDirectory()) walk(path.join(d, entry.name));
      else count++;
    }
  }
  walk(dir);
  return count;
}

function dirSizeMb(dir) {
  if (!fs.existsSync(dir)) return 0;
  const r = spawnSync('du', ['-sm', dir], { encoding: 'utf8', timeout: 30000 });
  return parseInt(r.stdout?.split('\t')[0] || '0', 10);
}

function buildBundleSizeReport(bundleDir, {
  bundleFileCount,
  bundleSizeMb,
  bundleMaxFileBytes,
  bundleHeadroom,
  manifestResult,
} = {}) {
  const files = [];
  const dirBytes = new Map();
  function addDirBytes(relPath, bytes) {
    const parts = relPath.split('/').filter(Boolean);
    for (let i = 1; i < parts.length; i += 1) {
      const dir = parts.slice(0, i).join('/');
      dirBytes.set(dir, (dirBytes.get(dir) || 0) + bytes);
    }
  }
  function walk(current) {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) {
        walk(full);
        continue;
      }
      const rel = path.relative(bundleDir, full).replace(/\\/g, '/');
      const bytes = fs.statSync(full).size;
      files.push({ file: rel, size_bytes: bytes, size_mb: +(bytes / 1024 / 1024).toFixed(3) });
      addDirBytes(rel, bytes);
    }
  }
  if (fs.existsSync(bundleDir)) walk(bundleDir);
  files.sort((a, b) => b.size_bytes - a.size_bytes || a.file.localeCompare(b.file));
  const bundleHash = computeBundleHash(bundleDir, files);
  const topDirs = [...dirBytes.entries()]
    .map(([dir, sizeBytes]) => ({ dir, size_bytes: sizeBytes, size_mb: +(sizeBytes / 1024 / 1024).toFixed(3) }))
    .sort((a, b) => b.size_bytes - a.size_bytes || a.dir.localeCompare(b.dir))
    .slice(0, 50);

  const previous = readJson(DEPLOY_BUNDLE_SIZE_REPORT_PATH);
  const previousSummary = previous?.summary || {};
  const summary = {
    generated_at: utcNow(),
    bundle_file_count: bundleFileCount,
    bundle_size_mb: bundleSizeMb,
    bundle_max_file_bytes: bundleMaxFileBytes,
    bundle_headroom: bundleHeadroom,
    bundle_size_warning: bundleSizeMb > Number(process.env.RV_DEPLOY_BUNDLE_SIZE_WARN_MB || 1500),
    bundle_hash: bundleHash,
    file_count_delta: Number.isFinite(Number(previousSummary.bundle_file_count))
      ? bundleFileCount - Number(previousSummary.bundle_file_count)
      : null,
    size_mb_delta: Number.isFinite(Number(previousSummary.bundle_size_mb))
      ? bundleSizeMb - Number(previousSummary.bundle_size_mb)
      : null,
    manifest_check: manifestResult?.manifest_check ?? 'skipped',
  };

  return {
    schema: 'rv.deploy_bundle_size_report.v1',
    summary,
    top_files: files.slice(0, 50),
    top_dirs: topDirs,
  };
}

function computeBundleHash(bundleDir, files) {
  const hash = crypto.createHash('sha256');
  const sorted = [...files].sort((a, b) => a.file.localeCompare(b.file));
  for (const file of sorted) {
    const full = path.join(bundleDir, file.file);
    hash.update(file.file);
    hash.update('\0');
    hash.update(String(file.size_bytes));
    hash.update('\0');
    hash.update(fs.readFileSync(full));
    hash.update('\0');
  }
  return `sha256:${hash.digest('hex')}`;
}

function removeAppleDoubleArtifacts(dir) {
  if (!fs.existsSync(dir)) return 0;
  let removed = 0;
  function walk(current) {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const full = path.join(current, entry.name);
      if (entry.name === '__MACOSX' || entry.name.startsWith('._')) {
        fs.rmSync(full, { recursive: true, force: true });
        removed += 1;
        continue;
      }
      if (entry.isDirectory()) walk(full);
    }
  }
  walk(dir);
  return removed;
}

function publicDashboardHtml() {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>RubikVault Decision Center</title>
  <style>
    :root {
      color-scheme: dark;
      --bg:#08111f; --panel:#111c2d; --panel2:#16243a; --text:#eef4ff; --muted:#9badc7;
      --ok:#3ddc97; --warn:#ffca66; --bad:#ff6b7a; --line:#243650; --blue:#69a7ff;
    }
    *{box-sizing:border-box} body{margin:0;background:var(--bg);color:var(--text);font-family:Inter,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}
    main{width:min(1220px,calc(100vw - 32px));margin:0 auto;padding:28px 0 48px}
    header{display:flex;justify-content:space-between;gap:16px;align-items:flex-start;margin-bottom:20px}
    h1{font-size:clamp(28px,5vw,52px);line-height:1;margin:0 0 10px;letter-spacing:0}
    h2{font-size:18px;margin:0 0 14px}.sub{color:var(--muted);max-width:820px;line-height:1.5}
    .grid{display:grid;gap:14px}.cols4{grid-template-columns:repeat(4,minmax(0,1fr))}.cols3{grid-template-columns:repeat(3,minmax(0,1fr))}.cols2{grid-template-columns:repeat(2,minmax(0,1fr))}
    .card{background:linear-gradient(180deg,var(--panel),#0d1828);border:1px solid var(--line);border-radius:8px;padding:16px;min-width:0}
    .metric{font-size:28px;font-weight:800}.label{color:var(--muted);font-size:12px;text-transform:uppercase;letter-spacing:.08em}.row{display:flex;justify-content:space-between;gap:12px;border-top:1px solid var(--line);padding:10px 0}.row:first-child{border-top:0}
    .pill{display:inline-flex;align-items:center;border:1px solid var(--line);border-radius:999px;padding:4px 9px;font-size:12px;color:var(--muted);gap:6px}.ok{color:var(--ok)}.warn{color:var(--warn)}.bad{color:var(--bad)}
    table{width:100%;border-collapse:collapse} th,td{text-align:left;border-bottom:1px solid var(--line);padding:9px 8px;font-size:13px} th{color:var(--muted);font-weight:650}
    a{color:var(--blue);text-decoration:none}.small{font-size:12px;color:var(--muted)} .stack{display:flex;flex-direction:column;gap:10px}.bar{height:8px;border-radius:999px;background:#0a1320;overflow:hidden}.bar span{display:block;height:100%;background:linear-gradient(90deg,var(--ok),var(--blue))}
    @media(max-width:880px){header{display:block}.cols4,.cols3,.cols2{grid-template-columns:1fr}main{width:min(100vw - 20px,1220px);padding-top:18px}.metric{font-size:24px}}
  </style>
</head>
<body>
  <main>
    <header>
      <div>
        <h1>RubikVault Decision Center</h1>
        <div class="sub">Public operational truth for Decision Core, BUY breadth, NAS run health, deploy proof, frontpage validation, and module outcome scorecards.</div>
      </div>
      <div class="pill" id="generated">Loading</div>
    </header>
    <section class="grid cols4" id="hero"></section>
    <section class="grid cols3" style="margin-top:14px" id="buyBreadth"></section>
    <section class="card" style="margin-top:14px">
      <h2>Best Setups: Short / Mid / Long</h2>
      <div class="grid cols3" id="horizons"></div>
    </section>
    <section class="grid cols2" style="margin-top:14px">
      <div class="card"><h2>Pipeline Health</h2><div id="pipeline"></div></div>
      <div class="card"><h2>UI Proofs</h2><div id="proofs"></div></div>
    </section>
    <section class="card" style="margin-top:14px">
      <h2>Module Outcome Scorecards</h2>
      <div class="small" style="margin-bottom:10px">Empirical hit rates by horizon. Not profit probability. Not alpha proof.</div>
      <div style="overflow:auto"><table id="modules"></table></div>
    </section>
    <section class="card" style="margin-top:14px">
      <h2>Caveats</h2>
      <div id="caveats" class="stack"></div>
    </section>
  </main>
  <script>
    const fmt = (v) => v == null ? "n/a" : String(v);
    const pct = (v) => Number.isFinite(Number(v)) ? (Number(v) * 100).toFixed(1) + "%" : "n/a";
    const cls = (ok) => ok ? "ok" : "bad";
    const statusCls = (s) => s === "OK" ? "ok" : s === "DEGRADED" || s === "WARN" || s === "WARNING" ? "warn" : "bad";
    function card(label, value, status) { return '<div class="card"><div class="label">'+label+'</div><div class="metric '+statusCls(status || value)+'">'+fmt(value)+'</div></div>'; }
    function row(label, value, status) { return '<div class="row"><span>'+label+'</span><strong class="'+statusCls(status || value)+'">'+fmt(value)+'</strong></div>'; }
    function signalRow(a) {
      const href = a.analyzer_url || "#";
      return '<div class="row"><span><a href="'+href+'">'+fmt(a.ticker)+'</a> <span class="small">'+fmt(a.region)+' '+fmt(a.asset_type)+'</span></span><strong>'+fmt(a.signal_quality_score)+'</strong></div>';
    }
    async function load() {
      const res = await fetch('/data/status/dashboard-v7-public-latest.json?_=' + Date.now(), { cache: 'no-store' });
      if (!res.ok) throw new Error('status fetch failed');
      const d = await res.json();
      document.getElementById('generated').textContent = 'Target ' + fmt(d.target_market_date) + ' · Updated ' + fmt(d.generated_at);
      document.getElementById('hero').innerHTML = [
        card('Release ready', d.public_truth.release_ready ? 'YES' : 'NO', d.public_truth.release_ready ? 'OK' : 'FAIL'),
        card('Decision ready', d.public_truth.decision_ready ? 'YES' : 'NO', d.public_truth.decision_ready ? 'OK' : 'FAIL'),
        card('Data plane', d.public_truth.data_plane_green ? 'GREEN' : 'BLOCKED', d.public_truth.data_plane_green ? 'OK' : 'FAIL'),
        card('Deploy smokes', d.deploy.smokes_ok ? 'OK' : 'FAIL', d.deploy.smokes_ok ? 'OK' : 'FAIL')
      ].join('');
      const counts = d.decision_core.selected_counts || {};
      const avail = d.decision_core.available_counts || {};
      document.getElementById('buyBreadth').innerHTML = ['us_stock_etf','eu_stock_etf','asia_stock_etf'].map(k => {
        const label = k.replaceAll('_',' ').toUpperCase();
        return '<div class="card"><div class="label">'+label+'</div><div class="metric ok">'+fmt(counts[k])+'</div><div class="small">Available core BUY: '+fmt(avail[k])+'</div></div>';
      }).join('');
      const horizons = d.best_setups.horizons || {};
      document.getElementById('horizons').innerHTML = ['short','medium','long'].map(h => {
        const rows = (horizons[h] || []).slice(0,10).map(signalRow).join('');
        return '<div class="card"><h2>'+h.toUpperCase()+'</h2>'+rows+'</div>';
      }).join('');
      const p = d.pipeline || {};
      document.getElementById('pipeline').innerHTML = [
        row('Stage health', p.stage_health.status),
        row('Scheduler', p.scheduler.status + ' · ' + fmt(p.scheduler.schedule_policy)),
        row('Watchdog', p.watchdog.status),
        row('Cron', p.cron.status),
        row('Disk free GB', p.disk.free_gb),
        row('EODHD budget used', p.eodhd_budget.used_pct == null ? 'n/a' : p.eodhd_budget.used_pct + '%'),
        row('Bundle preflight', p.cloudflare_bundle.status),
        row('Stale actionable inputs', p.stale_data.actionable_stale_input_count),
        row('Reason-code drift', p.reason_code_drift.status),
        row('Connectivity', p.connectivity.status)
      ].join('');
      const u = d.ui_proofs || {};
      document.getElementById('proofs').innerHTML = [
        row('BUY breadth UI', u.buy_breadth.status),
        row('Random20 UI', u.random20.status),
        row('Random50 UI', u.random50.status),
        row('Regional30 UI', u.regional30.status),
        row('Frontpage analyzer proof', u.frontpage_best_setups.status),
        row('Frontpage pages OK', (u.frontpage_best_setups.counts?.ok ?? 'n/a') + ' / ' + (u.frontpage_best_setups.counts?.unique_analyzer_pages ?? u.frontpage_best_setups.counts?.total ?? 'n/a')),
        row('No stale actionable BUY', p.stale_data.stale_actionable_buy_forbidden ? 'YES' : 'NO', p.stale_data.stale_actionable_buy_forbidden ? 'OK' : 'FAIL')
      ].join('');
      const modules = d.module_scorecards.modules || {};
      document.getElementById('modules').innerHTML = '<thead><tr><th>Module</th><th>Status</th><th>Short hit</th><th>Mid hit</th><th>Long hit</th><th>Samples</th><th>As of</th></tr></thead><tbody>' +
        Object.values(modules).map(m => {
          const s = m.horizons.short, mid = m.horizons.mid, l = m.horizons.long;
          const samples = [s.sample_n, mid.sample_n, l.sample_n].map(fmt).join(' / ');
          return '<tr><td>'+fmt(m.name)+'</td><td class="'+statusCls(m.status)+'">'+fmt(m.status)+'</td><td>'+pct(s.hit_rate)+'</td><td>'+pct(mid.hit_rate)+'</td><td>'+pct(l.hit_rate)+'</td><td>'+samples+'</td><td>'+fmt(m.source_asof)+'</td></tr>';
        }).join('') + '</tbody>';
      document.getElementById('caveats').innerHTML = (d.caveats || []).map(x => '<div class="small">'+x+'</div>').join('');
    }
    load().catch(err => {
      document.body.innerHTML = '<main><div class="card"><h1>Dashboard unavailable</h1><div class="bad">'+String(err.message || err)+'</div></div></main>';
    });
  </script>
</body>
</html>
`;
}

function materializePublicDashboardV7() {
  const r = spawnSync(process.execPath, [
    path.join(REPO_ROOT, 'scripts/ops/build-public-dashboard-v7-report.mjs'),
  ], { cwd: REPO_ROOT, encoding: 'utf8', stdio: 'pipe', timeout: 30_000 });
  if (r.status !== 0) {
    process.stderr.write(r.stdout || '');
    process.stderr.write(r.stderr || '');
    log('FATAL: build-public-dashboard-v7-report failed');
    process.exit(4);
  }
  const reportSrc = path.join(PUBLIC_DIR, PUBLIC_DASHBOARD_STATUS_REPORT);
  const reportDest = path.join(DIST_DIR, PUBLIC_DASHBOARD_STATUS_REPORT);
  if (fs.existsSync(reportSrc)) {
    fs.mkdirSync(path.dirname(reportDest), { recursive: true });
    fs.copyFileSync(reportSrc, reportDest);
  }
  const html = publicDashboardHtml();
  const htmlPaths = [
    path.join(DIST_DIR, 'dashboard_v7.html'),
    path.join(DIST_DIR, 'dashboard_v7/index.html'),
  ];
  for (const dest of htmlPaths) {
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.writeFileSync(dest, html, 'utf8');
  }
  log('Materialized public-safe dashboard_v7.html');
}

function utcNow() { return new Date().toISOString(); }

function readJson(p) {
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return null; }
}

function normalizeHistoricalRow(row) {
  if (Array.isArray(row)) {
    const date = String(row[0] || '').slice(0, 10);
    const close = Number(row[4] ?? row[5]);
    if (!date || !Number.isFinite(close)) return null;
    const open = Number(row[1]);
    const high = Number(row[2]);
    const low = Number(row[3]);
    const adjClose = Number(row[5]);
    const volume = Number(row[6]);
    return {
      date,
      open: Number.isFinite(open) ? open : close,
      high: Number.isFinite(high) ? high : close,
      low: Number.isFinite(low) ? low : close,
      close,
      adjClose: Number.isFinite(adjClose) ? adjClose : close,
      volume: Number.isFinite(volume) ? volume : 0,
    };
  }
  const date = String(row?.date || row?.trading_date || '').slice(0, 10);
  const close = Number(row?.close ?? row?.adjusted_close ?? row?.adj_close);
  if (!date || !Number.isFinite(close)) return null;
  const open = Number(row?.open);
  const high = Number(row?.high);
  const low = Number(row?.low);
  const volume = Number(row?.volume);
  return {
    date,
    open: Number.isFinite(open) ? open : close,
    high: Number.isFinite(high) ? high : close,
    low: Number.isFinite(low) ? low : close,
    close,
    adjClose: close,
    volume: Number.isFinite(volume) ? volume : 0,
  };
}

function readAdjustedSeriesRows(filePath) {
  const text = gunzipSync(fs.readFileSync(filePath)).toString('utf8');
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      try { return normalizeHistoricalRow(JSON.parse(line)); } catch { return null; }
    })
    .filter(Boolean)
    .sort((a, b) => a.date.localeCompare(b.date));
}

function buildRuntimeHistoricalPayload(key, rows, source) {
  const bars = rows.length > RUNTIME_HISTORICAL_CACHE_LIMIT
    ? rows.slice(-RUNTIME_HISTORICAL_CACHE_LIMIT)
    : rows;
  const ticker = key.includes('__') ? key.split('__').slice(1).join('__') : key;
  const latest = bars[bars.length - 1] || null;
  return {
    ok: true,
    data: {
      ticker,
      bars,
      indicators: [],
      indicator_issues: [],
      breakout_v12: {
        status: 'not_generated',
        source: 'runtime_historical_cache',
        reason: 'Historical endpoint cache returns chart bars only.',
      },
      breakout_v2: null,
      breakout_v2_legacy: null,
    },
    meta: {
      status: 'fresh',
      generated_at: utcNow(),
      data_date: latest?.date || null,
      provider: 'runtime_historical_cache',
      source,
      quality_flags: ['RUNTIME_HISTORICAL_CACHE', `BAR_LIMIT_${RUNTIME_HISTORICAL_CACHE_LIMIT}`],
      version: 'v2',
    },
    error: null,
  };
}

function writeRuntimeHistoricalPayload(outputDir, key, rows, source) {
  if (!Array.isArray(rows) || rows.length < 60) return 0;
  const body = JSON.stringify(buildRuntimeHistoricalPayload(key, rows, source));
  fs.writeFileSync(path.join(outputDir, `${key}.json`), body);
  return Buffer.byteLength(body);
}

function readRuntimeHistoricalCanonicalIds() {
  const ids = new Set(RUNTIME_HISTORICAL_CANONICAL_IDS);
  if (!RUNTIME_HISTORICAL_SCOPE_CACHE) return [...ids];
  try {
    const doc = JSON.parse(fs.readFileSync(CANONICAL_IDS_PATH, 'utf8'));
    const canonicalIds = Array.isArray(doc?.canonical_ids) ? doc.canonical_ids : [];
    for (const id of canonicalIds) {
      const canonicalId = String(id || '').trim().toUpperCase();
      if (/^[A-Z0-9_.-]+:[A-Z0-9_.-]+$/.test(canonicalId)) ids.add(canonicalId);
    }
  } catch {
    // Keep explicit canaries when scope doc is unavailable.
  }
  return [...ids].sort();
}

function readHistoryShardDoc(shardKey) {
  const cleanShard = String(shardKey || '').trim().toUpperCase();
  if (!cleanShard) return null;
  if (historyShardCache.has(cleanShard)) return historyShardCache.get(cleanShard);
  const shardDir = path.join(PUBLIC_DIR, 'data/eod/history/shards');
  for (const name of [`${cleanShard}.json.gz`, `${cleanShard}.json`]) {
    const filePath = path.join(shardDir, name);
    if (!fs.existsSync(filePath)) continue;
    try {
      const text = name.endsWith('.gz')
        ? gunzipSync(fs.readFileSync(filePath)).toString('utf8')
        : fs.readFileSync(filePath, 'utf8');
      const doc = JSON.parse(text);
      historyShardCache.set(cleanShard, doc);
      return doc;
    } catch {
      historyShardCache.set(cleanShard, null);
      return null;
    }
  }
  historyShardCache.set(cleanShard, null);
  return null;
}

function readHistoryShardRows(symbol) {
  const cleanSymbol = String(symbol || '').trim().toUpperCase().replace(/[^A-Z0-9.\-]/g, '');
  if (!cleanSymbol) return [];
  let prefixLen = 2;
  try {
    const manifest = JSON.parse(fs.readFileSync(path.join(PUBLIC_DIR, 'data/eod/history/shards/manifest.public-history-shards.json'), 'utf8'));
    prefixLen = Math.max(1, Math.min(4, Number(manifest?.shard_prefix_len || prefixLen) || prefixLen));
  } catch {
    prefixLen = 2;
  }
  const shardKeys = [...new Set([cleanSymbol.slice(0, prefixLen), cleanSymbol[0] || '_'].filter(Boolean))];
  let rawRows = null;
  for (const shardKey of shardKeys) {
    const shard = readHistoryShardDoc(shardKey);
    rawRows = shard?.[cleanSymbol];
    if (Array.isArray(rawRows)) break;
  }
  if (!Array.isArray(rawRows)) return [];
  return rawRows
    .map((row) => normalizeHistoricalRow(row))
    .filter(Boolean)
    .sort((a, b) => a.date.localeCompare(b.date));
}

function materializeRuntimeHistoricalCache() {
  const sourceDir = path.join(PUBLIC_DIR, 'data/v3/series/adjusted');
  if (!fs.existsSync(sourceDir)) return { written: 0, skipped: 0, bytes: 0 };
  const outputDir = path.join(DIST_DIR, 'data/v3/runtime/historical');
  fs.rmSync(outputDir, { recursive: true, force: true });
  fs.mkdirSync(outputDir, { recursive: true });

  let written = 0;
  let skipped = 0;
  let bytes = 0;
  for (const name of fs.readdirSync(sourceDir)) {
    if (!/^.+\.ndjson\.gz$/.test(name)) continue;
    const sourcePath = path.join(sourceDir, name);
    const key = name.replace(/\.ndjson\.gz$/, '');
    try {
      const rows = readAdjustedSeriesRows(sourcePath);
      if (rows.length < 60) {
        skipped += 1;
        continue;
      }
      const writtenBytes = writeRuntimeHistoricalPayload(outputDir, key, rows, 'adjusted_series');
      written += 1;
      bytes += writtenBytes;
    } catch {
      skipped += 1;
    }
  }
  for (const canonicalId of readRuntimeHistoricalCanonicalIds()) {
    const [exchange, symbol] = canonicalId.split(':');
    const key = `${exchange}__${symbol}`.replace(/[^A-Z0-9_.-]/g, '');
    if (!key || fs.existsSync(path.join(outputDir, `${key}.json`))) continue;
    try {
      const rows = readHistoryShardRows(symbol);
      const writtenBytes = writeRuntimeHistoricalPayload(outputDir, key, rows, 'public_history_shard');
      if (writtenBytes > 0) {
        written += 1;
        bytes += writtenBytes;
      } else {
        skipped += 1;
      }
    } catch {
      skipped += 1;
    }
  }
  return { written, skipped, bytes };
}

function escapeRegexChar(ch) {
  return /[\\^$+?.()|[\]{}]/.test(ch) ? `\\${ch}` : ch;
}

function globMatches(relPath, pattern) {
  if (pattern.endsWith('/**')) {
    const prefix = pattern.slice(0, -3);
    return relPath === prefix || relPath.startsWith(`${prefix}/`);
  }
  let source = '^';
  for (let i = 0; i < pattern.length; i += 1) {
    const ch = pattern[i];
    const next = pattern[i + 1];
    if (ch === '*' && next === '*') {
      source += '.*';
      i += 1;
    } else if (ch === '*') {
      source += '[^/]*';
    } else {
      source += escapeRegexChar(ch);
    }
  }
  source += '$';
  return new RegExp(source).test(relPath);
}

function runDecisionBundleRetention() {
  if (process.env.RV_DECISION_BUNDLE_RETENTION === '0') {
    log('Decision bundle retention skipped via RV_DECISION_BUNDLE_RETENTION=0');
    return null;
  }
  const keepDays = process.env.RV_DECISION_BUNDLE_KEEP_MARKET_DAYS || '1';
  const args = [
    path.join(REPO_ROOT, 'scripts/ops/retention-decision-bundles.mjs'),
    `--keep-market-days=${keepDays}`,
    '--keep-latest-only',
  ];
  log(`Running decision bundle retention before deploy bundle (keep_market_days=${keepDays}, keep_latest_only=true)...`);
  const r = spawnSync(process.execPath, args, {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    timeout: 300_000,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  if (r.status !== 0) {
    log(`ERROR: decision bundle retention failed with exit ${r.status ?? 'timeout'}`);
    if (r.stderr) log(r.stderr.slice(0, 1000));
    process.exit(5);
  }
  const report = readJson(DECISION_RETENTION_REPORT_PATH);
  log(`Decision bundle retention OK: archived ${report?.archived_snapshots?.length ?? 0} snapshots`);
  return report;
}

function runPageCoreRetention() {
  if (process.env.RV_PAGE_CORE_RETENTION === '0') {
    log('Page-core retention skipped via RV_PAGE_CORE_RETENTION=0');
    return null;
  }
  const args = [
    path.join(REPO_ROOT, 'scripts/ops/retention-page-core-bundles.mjs'),
    `--keep-daily=${process.env.RV_PAGE_CORE_KEEP_DAILY || '7'}`,
  ];
  log('Running page-core retention before deploy bundle...');
  const r = spawnSync(process.execPath, args, {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    timeout: 300_000,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  if (r.status !== 0) {
    log(`ERROR: page-core retention failed with exit ${r.status ?? 'timeout'}`);
    if (r.stderr) log(r.stderr.slice(0, 1000));
    process.exit(5);
  }
  try {
    return JSON.parse(String(r.stdout || '').trim().split('\n').pop() || 'null');
  } catch {
    return null;
  }
}

function buildPublicStatus() {
  if (process.env.RV_PUBLIC_STATUS_BUILD === '0') {
    log('Public status build skipped via RV_PUBLIC_STATUS_BUILD=0');
    return;
  }
  const r = spawnSync(process.execPath, [
    path.join(REPO_ROOT, 'scripts/ops/build-public-status.mjs'),
  ], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    timeout: 30_000,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  if (r.status !== 0) {
    log(`ERROR: build-public-status failed with exit ${r.status ?? 'timeout'}`);
    if (r.stderr) log(r.stderr.slice(0, 1000));
    process.exit(5);
  }
  if (r.stdout.trim()) log(r.stdout.trim());
}

function buildDecisionModuleScorecard() {
  if (process.env.RV_DECISION_MODULE_SCORECARD_BUILD === '0') {
    log('Decision module scorecard build skipped via RV_DECISION_MODULE_SCORECARD_BUILD=0');
    return;
  }
  const r = spawnSync(process.execPath, [
    path.join(REPO_ROOT, 'scripts/ops/build-decision-module-scorecard.mjs'),
  ], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    timeout: 30_000,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  if (r.status !== 0) {
    log(`ERROR: build-decision-module-scorecard failed with exit ${r.status ?? 'timeout'}`);
    if (r.stderr) log(r.stderr.slice(0, 1000));
    process.exit(5);
  }
  if (r.stdout.trim()) log(r.stdout.trim());
}

function buildHistProbsPublicProjection() {
  if (process.env.RV_HIST_PROBS_PUBLIC_PROJECTION_BUILD === '0') {
    log('Hist-probs public projection build skipped via RV_HIST_PROBS_PUBLIC_PROJECTION_BUILD=0');
    return;
  }
  const sourceDir = path.join(REPO_ROOT, 'public/data/hist-probs');
  if (!fs.existsSync(sourceDir)) {
    log('Hist-probs public projection skipped: public/data/hist-probs missing');
    return;
  }
  const outputDir = path.join(REPO_ROOT, 'public/data/hist-probs-public');
  const latestPath = path.join(outputDir, 'latest.json');
  const manifestPath = path.join(outputDir, 'manifest.json');
  const force = process.env.RV_HIST_PROBS_PUBLIC_PROJECTION_FORCE === '1';
  if (!force && fs.existsSync(latestPath) && fs.existsSync(manifestPath)) {
    const latest = readJson(latestPath) || {};
    const shardCount = Number(latest.shard_count || 0);
    const profileCount = Number(latest.profile_count || 0);
    const latestMtime = Math.max(fs.statSync(latestPath).mtimeMs, fs.statSync(manifestPath).mtimeMs);
    const sourceMarkers = [
      path.join(sourceDir, 'run-summary.json'),
      path.join(sourceDir, 'regime-daily.json'),
      path.join(sourceDir, 'deferred-latest.json'),
    ].filter((item) => fs.existsSync(item));
    const sourceChanged = sourceMarkers.some((item) => fs.statSync(item).mtimeMs > latestMtime);
    const hasShards = shardCount > 0
      && fs.existsSync(path.join(outputDir, 'shards', `${String(Math.max(0, shardCount - 1)).padStart(3, '0')}.json`));
    if (profileCount > 0 && hasShards && !sourceChanged) {
      log(`Hist-probs public projection reused (${profileCount} profiles, ${shardCount} shards). Set RV_HIST_PROBS_PUBLIC_PROJECTION_FORCE=1 to rebuild.`);
      return;
    }
    if (sourceChanged) log('Hist-probs public projection rebuild required: source markers newer than public projection.');
  }
  const r = spawnSync(process.execPath, [
    path.join(REPO_ROOT, 'scripts/ops/build-hist-probs-public-projection.mjs'),
  ], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    timeout: Number(process.env.RV_HIST_PROBS_PUBLIC_PROJECTION_TIMEOUT_MS || 600_000),
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  if (r.status !== 0) {
    log(`ERROR: build-hist-probs-public-projection failed with exit ${r.status ?? 'timeout'}`);
    if (r.stderr) log(r.stderr.slice(0, 1000));
    process.exit(5);
  }
  if (r.stdout.trim()) log(r.stdout.trim());
}

// ─── Runtime Manifest Validation ──────────────────────────────────────────────
// Checks every file in the bundle against config/runtime-manifest.json.
// Default: unmatched files or violations cause exit 4.
// --no-strict-manifest: unmatched files warn only.
function validateBundleAgainstManifest(bundleDir, manifest) {
  const defaultMax  = manifest.defaults?.maxFileSizeBytes ?? 26214400;
  const allowRules  = manifest.allow ?? [];
  const denyHints   = (manifest.denyNameHints ?? []).map(h => h.toLowerCase());
  const requiredDefs = manifest.required ?? [];

  const violations = []; // hard failures: deny hint hit or size exceeds class budget
  const unmatched  = []; // no allow rule matched (warning in default, failure in strict)
  const missing    = []; // required files absent

  function walk(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) { walk(full); continue; }
      const relPath = path.relative(bundleDir, full).replace(/\\/g, '/');
      const size    = fs.statSync(full).size;
      const nameLow = entry.name.toLowerCase();

      // match against allow rules (first match wins)
      let matched = null;
      for (const rule of allowRules) {
        if (globMatches(relPath, rule.pattern)) { matched = rule; break; }
      }

      // denyNameHints are a secondary safety net for broad allow rules. A file
      // with a sensitive-looking name must opt in explicitly in its allow rule.
      const hitHint = denyHints.find(h => nameLow.includes(h));
      if (hitHint && matched?.allowDenyNameHints !== true) {
        violations.push({ file: relPath, reason: 'deny_hint', hint: hitHint, size_bytes: size });
        continue;
      }

      if (!matched) {
        unmatched.push({ file: relPath, size_bytes: size });
        continue;
      }

      const budget = matched.maxFileSizeBytes ?? defaultMax;
      if (size > budget) {
        violations.push({
          file: relPath,
          reason: 'size_exceeds_budget',
          class: matched.class,
          size_mb: +(size / 1024 / 1024).toFixed(2),
          budget_mb: +(budget / 1024 / 1024).toFixed(2),
          size_bytes: size,
          budget_bytes: budget,
        });
      }
    }
  }
  walk(bundleDir);

  for (const req of requiredDefs) {
    if (!fs.existsSync(path.join(bundleDir, req.path))) {
      missing.push({ path: req.path, reason: 'required_file_missing' });
    }
  }

  const hasFatal    = violations.length > 0 || missing.length > 0;
  const hasUnmatched = unmatched.length > 0;
  const manifestCheck = hasFatal ? 'failed' : hasUnmatched ? 'warnings' : 'passed';

  return {
    manifest_check: manifestCheck,
    manifest_version: manifest.version ?? null,
    violations,
    missing,
    unmatched,
  };
}

// ─── Main ─────────────────────────────────────────────────────────────────────

const argv           = process.argv.slice(2);
const isDryRun       = argv.includes('--dry-run');
const isStrict       = argv.includes('--strict');
const isStrictManifest = !argv.includes('--no-strict-manifest');

if (!fs.existsSync(PUBLIC_DIR)) {
  log('ERROR: public/ directory not found.');
  process.exit(1);
}

log(`Source:      ${PUBLIC_DIR}`);
log(`Destination: ${DIST_DIR}`);
log(`Dry run:     ${isDryRun}`);
log(`Strict mode: ${isStrict}`);
log(`Strict manifest: ${isStrictManifest}`);

const retentionReport = isDryRun ? null : runDecisionBundleRetention();
const pageCoreRetentionReport = isDryRun ? null : runPageCoreRetention();
if (!isDryRun) buildHistProbsPublicProjection();
if (!isDryRun) buildPublicStatus();
if (!isDryRun) buildDecisionModuleScorecard();

// Build rsync exclude args
const excludeArgs = RSYNC_EXCLUDES.flatMap(e => ['--exclude', e]);

log('Syncing public/ → dist/pages-prod/ (excluding heavy dirs)...');

const rsyncArgs = [
  '-a',                   // archive mode (preserves permissions, symlinks, etc.)
  '--delete',             // remove files in dest not in source
  '--delete-excluded',    // also remove previously synced excluded files
  '--prune-empty-dirs',   // don't create empty dirs from excluded subtrees
  '--stats',              // summary statistics
  ...excludeArgs,
  `${PUBLIC_DIR}/`,       // trailing slash = sync contents, not the dir itself
  `${DIST_DIR}/`,
];

if (isDryRun) {
  rsyncArgs.unshift('-n');  // dry-run: simulate without writing
} else {
  fs.mkdirSync(DIST_DIR, { recursive: true });
}

const rsyncResult = spawnSync('rsync', rsyncArgs, {
  cwd: REPO_ROOT,
  encoding: 'utf8',
  timeout: 300_000,
  stdio: ['ignore', 'pipe', 'pipe'],
});

if (rsyncResult.status !== 0) {
  log(`ERROR: rsync failed with exit ${rsyncResult.status ?? 'timeout'}`);
  if (rsyncResult.stderr) log(rsyncResult.stderr.slice(0, 1000));
  process.exit(1);
}

if (!isDryRun) {
  // Print rsync stats to console
  const statsLines = (rsyncResult.stdout || '').split('\n').filter(l => l.trim());
  for (const line of statsLines.slice(-10)) log(line);
  const removedAppleDouble = removeAppleDoubleArtifacts(DIST_DIR);
  if (removedAppleDouble > 0) log(`Removed ${removedAppleDouble} AppleDouble metadata artifacts from dist/`);

  // Copy only git-tracked search bucket files (excludes 22K+ gitignored local buckets)
  const bucketsResult = spawnSync('git', ['ls-files', 'public/data/universe/v7/search/buckets'], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  if (bucketsResult.status === 0 && bucketsResult.stdout.trim()) {
    const bucketFiles = bucketsResult.stdout.trim().split('\n').filter(Boolean);
    const destBuckets = path.join(DIST_DIR, 'data/universe/v7/search/buckets');
    fs.mkdirSync(destBuckets, { recursive: true });
    // Remove any stale bucket files in dest not in git
    if (fs.existsSync(destBuckets)) {
      const gitTrackedNames = new Set(bucketFiles.map(f => path.basename(f)));
      for (const name of fs.readdirSync(destBuckets)) {
        if (!gitTrackedNames.has(name)) fs.rmSync(path.join(destBuckets, name), { force: true });
      }
    }
    for (const relPath of bucketFiles) {
      const src = path.join(REPO_ROOT, relPath);
      const dest = path.join(REPO_ROOT, 'dist/pages-prod', relPath.replace(/^public\//, ''));
      if (fs.existsSync(src)) fs.copyFileSync(src, dest);
    }
    log(`Copied ${bucketFiles.length} git-tracked search bucket files to dist/`);
  }

  let copiedRuntimeSeries = 0;
  for (const relPath of RUNTIME_SERIES_ALLOWLIST) {
    const src = path.join(PUBLIC_DIR, relPath);
    const dest = path.join(DIST_DIR, relPath);
    if (!fs.existsSync(src)) continue;
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(src, dest);
    copiedRuntimeSeries += 1;
  }
  if (copiedRuntimeSeries > 0) log(`Copied ${copiedRuntimeSeries} runtime chart series files to dist/`);

  let copiedDecisionCoreProofReports = 0;
  for (const relPath of DECISION_CORE_PUBLIC_PROOF_REPORTS) {
    const src = path.join(PUBLIC_DIR, relPath);
    if (!fs.existsSync(src)) continue;
    const dest = path.join(DIST_DIR, relPath);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(src, dest);
    copiedDecisionCoreProofReports += 1;
  }
  if (copiedDecisionCoreProofReports > 0) log(`Copied ${copiedDecisionCoreProofReports} Decision-Core public proof reports to dist/`);

  materializePublicDashboardV7();

  const runtimeHistoricalCache = materializeRuntimeHistoricalCache();
  log(`Runtime historical cache: wrote ${runtimeHistoricalCache.written} files, skipped ${runtimeHistoricalCache.skipped}, ${Math.round(runtimeHistoricalCache.bytes / 1024 / 1024)} MB`);

  fs.rmSync(path.join(DIST_DIR, 'data/runtime'), { recursive: true, force: true });

  let copiedRuntimePublicFiles = 0;
  for (const relPath of PUBLIC_RUNTIME_ALLOWLIST) {
    const src = path.join(PUBLIC_DIR, relPath);
    if (!fs.existsSync(src)) continue;
    const dest = path.join(DIST_DIR, relPath);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(src, dest);
    copiedRuntimePublicFiles += 1;
  }
  if (copiedRuntimePublicFiles > 0) log(`Copied ${copiedRuntimePublicFiles} public runtime files to dist/`);
}

// Count bundle files: in dry-run parse rsync --stats output; otherwise count actual files
let bundleFileCount;
let bundleSizeMb;
if (isDryRun) {
  // Parse "Number of files: N (reg: M, dir: D)" — M is the total regular files in the bundle
  // This is the TOTAL count (not just incremental delta), which is what we need for budget checks.
  const statsOut = rsyncResult.stdout || '';
  const totalMatch = statsOut.match(/Number of files:\s*[\d,]+\s*\(reg:\s*([\d,]+)/);
  bundleFileCount = totalMatch ? parseInt(totalMatch[1].replace(/,/g, ''), 10) : 0;
  // Parse total file size from stats (bytes of all files in the source subset)
  const szMatch = statsOut.match(/Total file size:\s*([\d,]+)/);
  const szBytes = szMatch ? parseInt(szMatch[1].replace(/,/g, ''), 10) : 0;
  bundleSizeMb = Math.round(szBytes / 1024 / 1024);
} else {
  bundleFileCount = countFiles(DIST_DIR);
  bundleSizeMb    = dirSizeMb(DIST_DIR);
}
const publicFileCount = countFiles(PUBLIC_DIR);

log('');
log('═══════════════════════════════════════════════');
log('           DEPLOY BUNDLE SUMMARY');
log('═══════════════════════════════════════════════');
log(`public/ total files:         ${publicFileCount.toLocaleString()}`);
log(`dist/pages-prod/ files:      ${bundleFileCount.toLocaleString()} / ${BUNDLE_FILE_LIMIT.toLocaleString()} limit`);
log(`dist/pages-prod/ size:       ${bundleSizeMb} MB`);
log('═══════════════════════════════════════════════');

const bundleHeadroom = BUNDLE_FILE_LIMIT - bundleFileCount;
const headroomCritical = bundleFileCount > BUNDLE_HEADROOM_CRITICAL_THRESHOLD;
const overBudget = bundleFileCount >= BUNDLE_FILE_LIMIT;
if (overBudget) {
  log(`BUDGET EXCEEDED: ${bundleFileCount} >= ${BUNDLE_FILE_LIMIT} — add more excludes to RSYNC_EXCLUDES`);
  if (isStrict) process.exit(2);
} else {
  log(`Budget OK: ${bundleFileCount} files (${bundleHeadroom} headroom)`);
  if (headroomCritical) {
    log(`HEADROOM CRITICAL: ${bundleFileCount} files exceeds warning threshold ${BUNDLE_HEADROOM_CRITICAL_THRESHOLD}`);
  }
}

// ── Cloudflare Pages 25 MiB per-file size guard ────────────────────────────
// Scan the bundle for files exceeding Cloudflare's hard 25 MiB limit.
// This catches regressions early (before wrangler fails mid-deploy) and gives
// a clear list of violators so the fix is obvious. Add violators to RSYNC_EXCLUDES
// or redirect their pipeline output to NAS_OPS_ROOT/pipeline-artifacts/.
let bundleMaxFileBytes = 0;
if (!isDryRun && fs.existsSync(DIST_DIR)) {
  const CF_MAX_BYTES = 25 * 1024 * 1024; // 25 MiB
  const violators = [];
  function scanSizes(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) { scanSizes(full); continue; }
      const { size } = fs.statSync(full);
      if (size > bundleMaxFileBytes) bundleMaxFileBytes = size;
      if (size > CF_MAX_BYTES) {
        violators.push({ file: path.relative(DIST_DIR, full), size_mb: (size / 1024 / 1024).toFixed(1) });
      }
    }
  }
  scanSizes(DIST_DIR);
  if (violators.length > 0) {
    log('');
    log('FATAL: Cloudflare Pages 25 MiB per-file limit violated:');
    for (const v of violators) log(`  ${v.size_mb} MiB  ${v.file}`);
    log('Fix: add to RSYNC_EXCLUDES or redirect output to NAS_OPS_ROOT/pipeline-artifacts/');
    process.exit(3);
  } else {
    log(`Size guard OK: no file exceeds 25 MiB. Max file: ${(bundleMaxFileBytes / 1024 / 1024).toFixed(2)} MiB`);
  }
}

// ── Runtime Manifest Contract Check ────────────────────────────────────────
// Validates every bundle file against config/runtime-manifest.json.
// Requires an explicit allow rule; catches deny-hinted names and over-budget files.
// Default: unmatched files fail. --no-strict-manifest: unmatched files warn only.
let manifestResult = null;
if (!isDryRun && fs.existsSync(DIST_DIR) && fs.existsSync(MANIFEST_PATH)) {
  let manifest;
  try { manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8')); }
  catch (e) { log(`WARN: could not parse runtime-manifest.json — skipping manifest check: ${e.message}`); }

  if (manifest) {
    log('');
    log('Running runtime manifest contract check...');
    manifestResult = validateBundleAgainstManifest(DIST_DIR, manifest);

    if (manifestResult.violations.length > 0) {
      log('MANIFEST VIOLATIONS (hard failures):');
      for (const v of manifestResult.violations) {
        if (v.reason === 'deny_hint') {
          log(`  DENY  ${v.file}  (matches denyNameHint: "${v.hint}", ${(v.size_bytes / 1024 / 1024).toFixed(2)} MiB)`);
        } else {
          log(`  SIZE  ${v.file}  (class: ${v.class}, ${v.size_mb} MiB > budget ${v.budget_mb} MiB)`);
        }
      }
    }
    if (manifestResult.missing.length > 0) {
      log('REQUIRED FILES MISSING:');
      for (const m of manifestResult.missing) log(`  MISSING  ${m.path}`);
    }
    if (manifestResult.unmatched.length > 0) {
      const label = isStrictManifest ? 'UNMATCHED (strict — will fail)' : 'UNMATCHED (warning — add pattern to runtime-manifest.json to silence)';
      log(`${label}:`);
      for (const u of manifestResult.unmatched.slice(0, 20)) {
        log(`  UNMATCHED  ${u.file}  (${(u.size_bytes / 1024).toFixed(0)} KB)`);
      }
      if (manifestResult.unmatched.length > 20) log(`  ... and ${manifestResult.unmatched.length - 20} more`);
    }

    const checkStatus = manifestResult.manifest_check;
    log(`Manifest check result: ${checkStatus} (violations: ${manifestResult.violations.length}, missing: ${manifestResult.missing.length}, unmatched: ${manifestResult.unmatched.length})`);

    const hasFatal = manifestResult.violations.length > 0 || manifestResult.missing.length > 0;
    const hasUnmatched = manifestResult.unmatched.length > 0;
    if (hasFatal) {
      log('FATAL: manifest contract violations found. Fix violations before deploy.');
      log('Fix: add RSYNC_EXCLUDES entries or redirect output to NAS_OPS_ROOT/pipeline-artifacts/');
      process.exit(4);
    }
    if (hasUnmatched && isStrictManifest) {
      log('FATAL (--strict-manifest): unmatched files found. Add allow patterns to config/runtime-manifest.json.');
      process.exit(4);
    }
    if (checkStatus === 'passed') {
      log('Manifest contract OK: all bundle files are allowlisted and within budgets.');
    }
  }
} else if (!isDryRun && !fs.existsSync(MANIFEST_PATH)) {
  log('WARN: config/runtime-manifest.json not found — skipping manifest contract check.');
}

// Write bundle meta proof artifact
if (!isDryRun) {
  const metaDir = PRIVATE_OPS_DIR;
  fs.mkdirSync(metaDir, { recursive: true });
  const sizeReport = buildBundleSizeReport(DIST_DIR, {
    bundleFileCount,
    bundleSizeMb,
    bundleMaxFileBytes,
    bundleHeadroom,
    manifestResult,
  });
  fs.writeFileSync(DEPLOY_BUNDLE_SIZE_REPORT_PATH, JSON.stringify(sizeReport, null, 2) + '\n');
  log(`Bundle size report written: ${DEPLOY_BUNDLE_SIZE_REPORT_PATH}`);
  const metaPath = path.join(metaDir, 'build-bundle-meta.json');
  fs.writeFileSync(metaPath, JSON.stringify({
    schema: 'rv_build_bundle_meta_v2',
    generated_at: utcNow(),
    source_dir: 'public/',
    dest_dir: 'dist/pages-prod/',
    public_file_count: publicFileCount,
    bundle_file_count: bundleFileCount,
    bundle_size_mb: bundleSizeMb,
    bundle_max_file_bytes: bundleMaxFileBytes,
    bundle_hash: sizeReport.summary.bundle_hash,
    bundle_size_warning: sizeReport.summary.bundle_size_warning,
    top_files_report_path: 'var/private/ops/deploy-bundle-size-report.json',
    budget_limit: BUNDLE_FILE_LIMIT,
    budget_headroom: bundleHeadroom,
    headroom_critical: headroomCritical,
    budget_ok: !overBudget,
    decision_bundle_retention: retentionReport ? {
      keep_market_days: retentionReport.keep_market_days,
      keep_latest_only: retentionReport.keep_latest_only,
      latest_kept: retentionReport.latest_kept,
      archived_snapshots: retentionReport.archived_snapshots?.length ?? 0,
    } : null,
    page_core_retention: pageCoreRetentionReport,
    manifest_version: manifestResult?.manifest_version ?? null,
    manifest_check: manifestResult?.manifest_check ?? 'skipped',
    manifest_violations: manifestResult?.violations?.length ?? 0,
    manifest_missing: manifestResult?.missing?.length ?? 0,
    manifest_unmatched: manifestResult?.unmatched?.length ?? 0,
    excludes: RSYNC_EXCLUDES,
  }, null, 2) + '\n');
  log(`Bundle meta written: ${metaPath}`);
}

log('Done.');
process.exit(overBudget && isStrict ? 2 : 0);
