#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';

const ROOT = path.resolve(new URL('../..', import.meta.url).pathname);
const DEFAULT_BASE_URL = process.env.RV_MARKET_HUB_AUDIT_BASE_URL || 'https://rubikvault.com';
const DEFAULT_OUTPUT = path.join(ROOT, 'tmp/market-hub-integrity-audit.json');
const EXPECTED_TABS = ['dashboard', 'flows', 'assets', 'riskmonitor', 'help'];

function argValue(name, fallback = null) {
  const direct = process.argv.find((arg) => arg.startsWith(`${name}=`));
  if (direct) return direct.slice(name.length + 1);
  const idx = process.argv.indexOf(name);
  return idx >= 0 ? process.argv[idx + 1] : fallback;
}

function flag(name) {
  return process.argv.includes(name);
}

function normalizeBaseUrl(value) {
  return String(value || DEFAULT_BASE_URL).replace(/\/+$/, '');
}

function count(value) {
  if (Array.isArray(value)) return value.length;
  if (value && typeof value === 'object') return Object.keys(value).length;
  return 0;
}

function parseDateOnly(value) {
  const text = String(value || '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return null;
  const date = new Date(`${text}T12:00:00Z`);
  return Number.isFinite(date.getTime()) ? date : null;
}

function ageDays(value) {
  const date = parseDateOnly(value);
  if (!date) return null;
  return Math.floor((Date.now() - date.getTime()) / 86400000);
}

async function fetchJson(baseUrl, route) {
  const url = new URL(route, `${baseUrl}/`);
  url.searchParams.set('rv_audit', `${Date.now()}-${Math.random().toString(16).slice(2)}`);
  const response = await fetch(url, { headers: { accept: 'application/json' } });
  const text = await response.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    // keep null for typed failure below
  }
  return { route, url: url.toString(), status: response.status, ok: response.ok, json, text_bytes: Buffer.byteLength(text) };
}

function checkUiContract(source) {
  const checks = [];
  const failures = [];
  const tabBlock = source.match(/const\s+TABS\s*=\s*\[([\s\S]*?)\];/m)?.[1] || '';
  const tabs = [...tabBlock.matchAll(/id:\s*['"]([^'"]+)['"]/g)].map((match) => match[1]);
  const sameTabs = tabs.length === EXPECTED_TABS.length && EXPECTED_TABS.every((id, idx) => tabs[idx] === id);
  checks.push({ id: 'ui_tabs_5_contract', ok: sameTabs, expected: EXPECTED_TABS, actual: tabs });
  if (!sameTabs) failures.push('ui_tabs_5_contract');

  for (const id of EXPECTED_TABS) {
    const rendererName = {
      dashboard: 'renderDashboard',
      flows: 'renderCapitalRotation',
      assets: 'renderAssetClasses',
      riskmonitor: 'renderRiskMonitor',
      help: 'renderHelp',
    }[id];
    const ok = new RegExp(`${id}\\s*:\\s*${rendererName}`).test(source);
    checks.push({ id: `ui_renderer_${id}`, ok, renderer: rendererName });
    if (!ok) failures.push(`ui_renderer_${id}`);
  }

  const forbidden = [
    { id: 'legacy_methodology_tab_link', pattern: /_mhSwitchTab\(['"]methodology['"]\)/ },
    { id: 'help_emoji_label', pattern: /label:\s*['"]ℹ️['"]/ },
    { id: 'default_full_history_fetch', pattern: /full=1/ },
    { id: 'german_market_copy', pattern: /Betroffene|Stuetzend|Dagegen|Historischer|Schwaeche|Flaechenbrand|Keine Divergenzen|ueber|staerk|bestaet|frueh|spaet|fuehrt|Sektor|Beobachtenswert|unterstuetzt|abwarten|Vorsicht|Achtung|Gesamtbild|Historisch|Zyklus|Divergenz|Oberflaeche|moeglich|naechst|widersprech|verschlechtert|seitwaerts|unklar|Konfirmationen|waehrend|schwaech/i },
  ];
  for (const item of forbidden) {
    const ok = !item.pattern.test(source);
    checks.push({ id: item.id, ok });
    if (!ok) failures.push(item.id);
  }

  return { checks, failures };
}

const baseUrl = normalizeBaseUrl(argValue('--base-url', DEFAULT_BASE_URL));
const output = argValue('--output', DEFAULT_OUTPUT);
const maxDataAgeDays = Number(argValue('--max-data-age-days', process.env.RV_MARKET_HUB_MAX_DATA_AGE_DAYS || 3));
const strictLegacyLatest = flag('--strict-legacy-latest') || process.env.RV_MARKET_HUB_STRICT_LEGACY_LATEST === '1';

const checks = [];
const warnings = [];
const failures = [];

function addCheck(check) {
  checks.push(check);
  if (!check.ok && check.severity === 'warning') warnings.push(check.id);
  else if (!check.ok) failures.push(check.id);
}

const globalLatest = await fetchJson(baseUrl, '/data/v3/derived/market/global-latest.json');
addCheck({ id: 'global_latest_http_200', ok: globalLatest.ok && Boolean(globalLatest.json), status: globalLatest.status });
const globalMeta = globalLatest.json?.meta || {};
const globalCards = count(globalLatest.json?.data?.cards);
const globalDateAge = ageDays(globalMeta.data_date);
addCheck({ id: 'global_latest_schema', ok: globalMeta.schema_version === 'rv.derived.global-market.v2', actual: globalMeta.schema_version || null });
addCheck({ id: 'global_latest_fresh', ok: globalDateAge != null && globalDateAge <= maxDataAgeDays, data_date: globalMeta.data_date || null, age_days: globalDateAge, max_data_age_days: maxDataAgeDays });
addCheck({ id: 'global_latest_symbols_available', ok: Number(globalMeta.symbols_available || 0) > 0, actual: Number(globalMeta.symbols_available || 0) });
addCheck({ id: 'global_latest_cards_built', ok: Number(globalMeta.cards_built || globalCards || 0) > 0, actual: Number(globalMeta.cards_built || globalCards || 0) });

const rotation = await fetchJson(baseUrl, '/data/v3/derived/market/capital-rotation/latest.json');
addCheck({ id: 'capital_rotation_http_200', ok: rotation.ok && Boolean(rotation.json), status: rotation.status });
const rotationData = rotation.json?.data || {};
const rotationRatios = count(rotationData.ratios);
addCheck({ id: 'capital_rotation_schema', ok: String(rotation.json?.schema_version || '') === '3.0', actual: rotation.json?.schema_version || null });
addCheck({ id: 'capital_rotation_ratios', ok: rotationRatios > 0, actual: rotationRatios });
addCheck({ id: 'capital_rotation_global_score', ok: Number.isFinite(Number(rotationData.globalScore?.value)), actual: rotationData.globalScore?.value ?? null });

const ratioIndex = await fetchJson(baseUrl, '/data/v3/derived/market/capital-rotation/ratios/index.json');
addCheck({ id: 'ratio_index_http_200', ok: ratioIndex.ok && Boolean(ratioIndex.json), status: ratioIndex.status });
addCheck({ id: 'ratio_index_entries', ok: count(ratioIndex.json) > 0, actual: count(ratioIndex.json) });

const legacyLatest = await fetchJson(baseUrl, '/data/v3/derived/market/latest.json');
const legacyMeta = legacyLatest.json?.meta || {};
const legacyDateAge = ageDays(legacyMeta.data_date);
const legacyFresh = legacyDateAge != null && legacyDateAge <= maxDataAgeDays;
const legacyTypedStale = legacyFresh
  || String(legacyMeta.status || '').toLowerCase() === 'degraded'
  || String(legacyMeta.freshness_status || '').toLowerCase() === 'stale'
  || (Array.isArray(legacyMeta.stale_flags) && legacyMeta.stale_flags.length > 0);
addCheck({ id: 'legacy_market_latest_http_200', ok: legacyLatest.ok && Boolean(legacyLatest.json), status: legacyLatest.status, severity: strictLegacyLatest ? 'error' : 'warning' });
addCheck({ id: 'legacy_market_latest_typed_stale_allowed', ok: legacyTypedStale, data_date: legacyMeta.data_date || null, age_days: legacyDateAge, status: legacyMeta.status || null, freshness_status: legacyMeta.freshness_status || null, stale_flags: legacyMeta.stale_flags || [], severity: strictLegacyLatest ? 'error' : 'warning' });

const uiSource = await fs.readFile(path.join(ROOT, 'public/assets/js/market-hub.js'), 'utf8');
const ui = checkUiContract(uiSource);
for (const check of ui.checks) addCheck(check);

const summary = {
  base_url: baseUrl,
  generated_at: new Date().toISOString(),
  ok: failures.length === 0,
  warnings_count: warnings.length,
  failures_count: failures.length,
  data_date: globalMeta.data_date || null,
  symbols_available: Number(globalMeta.symbols_available || 0),
  cards_built: Number(globalMeta.cards_built || globalCards || 0),
  capital_rotation_ratios: rotationRatios,
  legacy_latest_data_date: legacyMeta.data_date || null,
};

const report = { schema: 'rv.market_hub_integrity_audit.v1', summary, checks, warnings, failures };
await fs.mkdir(path.dirname(output), { recursive: true });
await fs.writeFile(output, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(summary, null, 2));
if (failures.length) {
  console.error(`MARKET_HUB_AUDIT_FAIL ${failures.join(',')}`);
  process.exit(1);
}
console.log('MARKET_HUB_AUDIT_PASS');
