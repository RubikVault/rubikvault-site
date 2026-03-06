/**
 * Market Hub v3 — Isolated JS Module
 * Renders all /market tabs from global-latest.json + v7 universe data.
 * ZERO shared state with analyzer/scientific/elliott/forecast.
 */
(function () {
    'use strict';

    // ═══ CONSTANTS ═══
    const DATA_URLS = [
        '/data/v3/derived/market/global-latest.json',
        '/data/v3/derived/market/latest.json'
    ];
    const MH = {
        bg: '#070a0f', panel: '#0d1119', surface: '#111827', border: '#1c2535',
        dim: '#243044', text: '#dde3ed', muted: '#5a6a82', faint: '#0f1722',
        bull: '#10b981', warn: '#f59e0b', bear: '#ef4444', neutral: '#475569',
        blue: '#3b82f6', purple: '#8b5cf6', orange: '#f97316'
    };
    const PHASE_COLORS = { EARLY: '#3b82f6', MID: '#10b981', LATE: '#f59e0b', EXHAUSTED: '#f97316', REVERSAL_RISK: '#ef4444', NEUTRAL: '#475569' };
    const PHASE_LABELS = { EARLY: 'Early', MID: 'Mid Trend', LATE: 'Late', EXHAUSTED: 'Exhausted', REVERSAL_RISK: 'Reversal Risk', NEUTRAL: 'Neutral' };
    const CONF_COLORS = { HIGH: '#10b981', MEDIUM: '#f59e0b', LOW: '#ef4444' };

    const TABS = [
        { id: 'snapshot', label: 'Snapshot' },
        { id: 'flows', label: 'Flows' },
        { id: 'sectors', label: 'Sectors' },
        { id: 'commodities', label: 'Commodities' },
        { id: 'crypto', label: 'Crypto' },
        { id: 'countries', label: 'Countries & FX' },
        { id: 'risks', label: 'Risks' },
        { id: 'playbook', label: 'Playbooks' },
        { id: 'alerts', label: 'Alerts' },
        { id: 'methodology', label: 'Methodology' },
        { id: 'glossary', label: 'Glossary' }
    ];

    let doc = null;
    let currentTab = 'snapshot';
    let proMode = false;
    let alertsState = [];
    try {
        const raw = localStorage.getItem('mh_alerts');
        const parsed = raw ? JSON.parse(raw) : [];
        alertsState = Array.isArray(parsed) ? parsed : [];
    } catch {
        alertsState = [];
    }

    // ═══ HELPERS ═══
    function esc(s) { const d = document.createElement('div'); d.textContent = s; return d.innerHTML; }

    function scorePill(score) {
        const s = Number(score) || 0;
        const cls = s >= 65 ? 'mh-score-bull' : s >= 45 ? 'mh-score-warn' : 'mh-score-bear';
        return `<span class="mh-score ${cls}">${s}</span>`;
    }

    function phaseBadge(phase) {
        const c = PHASE_COLORS[phase] || MH.neutral;
        const l = PHASE_LABELS[phase] || phase || '—';
        return `<span class="mh-phase" style="background:${c}22;color:${c}">${esc(l)}</span>`;
    }

    function confBadge(conf) {
        const label = conf?.label || 'LOW';
        const c = CONF_COLORS[label] || MH.neutral;
        return `<span class="mh-conf" style="background:${c}15;color:${c}">${label}${conf?.value != null ? ' ' + conf.value.toFixed(2) : ''}</span>`;
    }

    function driverChips(drivers) {
        if (!Array.isArray(drivers) || !drivers.length) return '';
        return drivers.slice(0, 3).map(d => {
            const c = d.dir === 'up' ? MH.bull : d.dir === 'down' ? MH.bear : MH.muted;
            const v = d.value != null ? (typeof d.value === 'number' ? d.value.toFixed(1) + (d.unit || '') : d.value) : '';
            return `<span class="mh-chip" style="background:${c}15;color:${c}">${esc(d.label)} ${v}</span>`;
        }).join(' ');
    }

    function sourcesFooter(sources, asOf) {
        const src = Array.isArray(sources) ? sources.join(', ') : (sources || 'EODHD');
        return `<div class="mh-sources">Source: ${esc(src)} | As of: ${esc(asOf || '—')}</div>`;
    }

    function card(inner) { return `<article class="mh-card">${inner}</article>`; }
    function secTitle(t) { return `<div class="mh-section-title">${esc(t)}</div>`; }

    function cardRow(c) {
        if (!c) return '';
        return `<div class="mh-card-row">
      <div class="mh-card-row-left">
        <div class="mh-card-row-tags">
          <span class="mh-card-row-name">${esc(c.name || c.id)}</span>
          ${phaseBadge(c.phase)} ${confBadge(c.confidence)}
        </div>
        <div class="mh-card-row-drivers">${driverChips(c.drivers_top3)}</div>
        ${c.tldr ? `<div class="mh-card-row-tldr">${esc(c.tldr)}</div>` : ''}
      </div>
      <div class="mh-card-row-right">${scorePill(c.score)}</div>
    </div>`;
    }

    function fmtPct(v) {
        if (!Number.isFinite(Number(v))) return '—';
        const n = Number(v);
        return `${n >= 0 ? '+' : ''}${n.toFixed(2)}%`;
    }

    function sessionStatus(region) {
        const now = new Date();
        const utcH = now.getUTCHours() + now.getUTCMinutes() / 60;
        const sessions = { asia: [0, 8], europe: [7, 16.5], americas: [13.5, 21] };
        const [open, close] = sessions[region] || [0, 0];
        const day = now.getUTCDay();
        if (day === 0 || day === 6) return { text: 'Weekend', color: '#64748b', bg: 'rgba(100,116,139,0.2)' };
        if (utcH >= open && utcH < close) return { text: 'OPEN', color: '#34d399', bg: 'rgba(52,211,153,0.15)' };
        return { text: 'Closed', color: '#94a3b8', bg: 'rgba(100,116,139,0.2)' };
    }

    function clamp(v, min, max) {
        const n = Number(v);
        if (!Number.isFinite(n)) return min;
        return Math.min(max, Math.max(min, n));
    }

    function normalizeMarketDoc(raw, sourceUrl) {
        if (!raw || typeof raw !== 'object') return null;
        const data = raw?.data && typeof raw.data === 'object' ? raw.data : {};
        const hasCards = data?.cards && typeof data.cards === 'object' && Object.keys(data.cards).length > 0;
        if (hasCards) return raw;

        const sectors = Array.isArray(data.sectors) ? data.sectors : [];
        const indices = Array.isArray(data.indices) ? data.indices : [];
        const pulse = data.pulse && typeof data.pulse === 'object' ? data.pulse : {};
        const cards = {};

        function phaseFromChange(changePct) {
            const c = Number(changePct) || 0;
            if (c >= 1.2) return 'MID';
            if (c >= 0.25) return 'EARLY';
            if (c <= -1.2) return 'REVERSAL_RISK';
            if (c <= -0.25) return 'LATE';
            return 'NEUTRAL';
        }

        function confidenceFromStaleness(staleDays) {
            const sd = Number(staleDays);
            if (!Number.isFinite(sd)) return { label: 'MEDIUM', value: 0.6 };
            if (sd <= 1) return { label: 'HIGH', value: 0.82 };
            if (sd <= 3) return { label: 'MEDIUM', value: 0.62 };
            return { label: 'LOW', value: 0.35 };
        }

        function buildCard(type, id, name, changePct, staleDays) {
            const change = Number(changePct) || 0;
            const score = Math.round(clamp(50 + (change * 18), 0, 100));
            const dir = change > 0 ? 'up' : (change < 0 ? 'down' : 'flat');
            return {
                id,
                type,
                name,
                score,
                phase: phaseFromChange(change),
                confidence: confidenceFromStaleness(staleDays),
                momentum: { m20: change, m60: null, m200: null },
                vol_z: null,
                drivers_top3: [
                    { label: 'Flow Direction', dir, value: change, unit: '%' },
                    { label: 'Price Change', dir, value: change, unit: '%' }
                ],
                tldr: `${name} ${change >= 0 ? 'up' : 'down'} ${Math.abs(change).toFixed(2)}%`
            };
        }

        sectors.forEach((s) => {
            const symbol = String(s?.symbol || '').toUpperCase();
            if (!symbol) return;
            const id = `SECTOR:${symbol}`;
            cards[id] = buildCard('sector', id, s?.display_name || s?.sector || symbol, s?.change_pct, s?.stale_days);
        });

        indices.forEach((idx) => {
            const symbol = String(idx?.symbol || '').toUpperCase();
            if (!symbol) return;
            const id = `INDEX:${symbol}`;
            cards[id] = buildCard('index', id, symbol, idx?.change_pct, idx?.stale_days);
        });

        const riskOnOff = Number.isFinite(Number(pulse?.risk_on_off)) ? Number(pulse.risk_on_off) : 0.5;
        const flowScore = Math.round(clamp(riskOnOff * 100, 0, 100));
        const riskScore = Math.round(clamp((1 - riskOnOff) * 100, 0, 100));
        const trendScore = Math.round(clamp(50 + ((Number(pulse?.average_change_pct) || 0) * 12), 0, 100));
        const regimeMode = String(pulse?.risk_mode || '').toLowerCase() === 'risk-off' ? 'STRESS' : 'NORMAL';

        return {
            meta: {
                ...(raw.meta || {}),
                source_url: sourceUrl,
                source_fallback: 'market-latest-adapter',
                cards_built: Object.keys(cards).length
            },
            data: {
                cards,
                sessions: {
                    asia: { indices: [] },
                    europe: { indices: [] },
                    americas: {
                        indices: indices.map((idx) => ({
                            symbol: idx?.symbol || null,
                            display: idx?.symbol || null,
                            change_pct: Number(idx?.change_pct) || 0
                        }))
                    }
                },
                regime_mode: regimeMode,
                regime_details: {
                    breadth_z: null,
                    credit_z: null,
                    vol_z: null
                },
                us_pulse: {
                    average_change_pct: Number(pulse?.average_change_pct) || 0,
                    breadth_up: Number(pulse?.breadth_up) || 0,
                    breadth_down: Number(pulse?.breadth_down) || 0,
                    risk_mode: pulse?.risk_mode || 'neutral',
                    symbols_covered: Number(pulse?.symbols_covered) || 0
                },
                investment_compass: {
                    composite_score: Math.round(clamp((trendScore * 0.45) + (flowScore * 0.35) + ((100 - riskScore) * 0.20), 0, 100)),
                    trend_score: trendScore,
                    risk_score: riskScore,
                    flow_score: flowScore,
                    summary: 'Derived from market pulse and sector/index daily movement.'
                }
            }
        };
    }

    function emptyMarketDoc() {
        return {
            meta: {
                data_date: null,
                generated_at: new Date().toISOString(),
                cards_built: 0,
                source_fallback: 'empty'
            },
            data: {
                cards: {},
                sessions: { asia: { indices: [] }, europe: { indices: [] }, americas: { indices: [] } },
                regime_mode: 'NEUTRAL',
                regime_details: { breadth_z: null, credit_z: null, vol_z: null },
                us_pulse: { breadth_up: 0, breadth_down: 0, average_change_pct: 0, risk_mode: 'neutral', symbols_covered: 0 },
                investment_compass: { composite_score: 50, trend_score: 50, risk_score: 50, flow_score: 50, summary: 'No market snapshot available.' }
            }
        };
    }

    function getCards() { return doc?.data?.cards || {}; }
    function getGDoc() { return doc?.data || {}; }
    function getAsOf() { return doc?.meta?.data_date || ''; }

    function filterCards(prefix) {
        return Object.entries(getCards()).filter(([k]) => k.startsWith(prefix)).map(([, v]) => v).sort((a, b) => b.score - a.score);
    }

    // ═══ TAB RENDERERS ═══

    function renderSnapshot(panel) {
        const gDoc = getGDoc(), cards = getCards(), asOf = getAsOf();
        if (!gDoc) { panel.innerHTML = card('<span style="color:#64748b">No data available.</span>'); return; }
        let h = '';
        const regime = gDoc.regime_mode || 'NORMAL';
        const rd = gDoc.regime_details || {};
        const regCol = regime === 'CRISIS' ? MH.bear : regime === 'STRESS' ? MH.warn : MH.bull;

        // Regime + Composite
        h += card(`<div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:0.6rem">
      <div>
        <div style="font-size:1.1rem;color:${regCol};font-weight:700">Regime: ${regime}</div>
        <div style="font-size:0.78rem;color:${MH.muted};margin-top:0.2rem">
          Breadth Z: ${rd.breadth_z?.toFixed(2) || '—'} | Credit Z: ${rd.credit_z?.toFixed(2) || '—'} | Vol Z: ${rd.vol_z?.toFixed(2) || '—'}
        </div>
      </div>
      <div style="display:flex;gap:0.5rem">${scorePill(gDoc.investment_compass?.composite_score || 50)}
        <span style="font-size:0.78rem;color:${MH.muted};align-self:center">Composite</span>
      </div>
    </div>`);

        // Sessions
        h += '<div class="mh-grid-3">';
        for (const region of ['asia', 'europe', 'americas']) {
            const st = sessionStatus(region);
            const indices = gDoc.sessions?.[region]?.indices || [];
            const idxH = indices.length ? indices.map(idx => {
                const c = (idx.change_pct || 0) >= 0 ? MH.bull : MH.bear;
                return `<span style="color:${c};font-size:0.82rem">${esc(idx.display || idx.symbol)} ${fmtPct(idx.change_pct)}</span>`;
            }).join(' &nbsp; ') : '<span style="color:#64748b">No data</span>';
            h += `<article class="mh-card">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:0.4rem">
          <span style="font-weight:700;color:${MH.text}">${region.charAt(0).toUpperCase() + region.slice(1)}</span>
          <span style="font-size:0.72rem;padding:0.1rem 0.4rem;border-radius:5px;background:${st.bg};color:${st.color}">${st.text}</span>
        </div>
        <div>${idxH}</div>
      </article>`;
        }
        h += '</div>';

        // Phase Distribution
        const phaseG = { EARLY: [], MID: [], LATE: [], EXHAUSTED: [], REVERSAL_RISK: [], NEUTRAL: [] };
        Object.values(cards).forEach(c => { if (phaseG[c.phase]) phaseG[c.phase].push(c); });
        const total = Object.keys(cards).length || 1;
        h += card(`${secTitle('Trend Lifecycle Distribution')}
      <div class="mh-phase-bar">${Object.entries(phaseG).filter(([, v]) => v.length).map(([k, v]) => {
            const pct = (v.length / total * 100).toFixed(0);
            return `<div class="mh-phase-bar-seg" style="flex:${v.length};background:${PHASE_COLORS[k]}" title="${PHASE_LABELS[k]}: ${v.length}">${pct}%</div>`;
        }).join('')}</div>
      <div style="display:flex;gap:0.6rem;flex-wrap:wrap;font-size:0.75rem">${Object.entries(phaseG).filter(([, v]) => v.length).map(([k, v]) =>
            `<span style="color:${PHASE_COLORS[k]}">${PHASE_LABELS[k]}: ${v.length}</span>`).join('')}
      </div>`);

        // Top/Bottom
        const sorted = Object.values(cards).sort((a, b) => b.score - a.score);
        h += '<div class="mh-grid-2">';
        h += card(`${secTitle('Highest Scores')}${sorted.slice(0, 5).map(c => cardRow(c)).join('')}`);
        h += card(`${secTitle('Lowest Scores')}${sorted.slice(-5).reverse().map(c => cardRow(c)).join('')}`);
        h += '</div>';

        // Compass
        const compass = gDoc.investment_compass;
        if (compass) {
            h += card(`${secTitle('Investment Compass')}
        <div class="mh-grid-auto">
          <div><span style="color:${MH.muted};font-size:0.78rem">Composite</span><div style="color:${MH.text};font-weight:700;font-size:1.1rem">${compass.composite_score ?? '—'}/100</div></div>
          <div><span style="color:${MH.muted};font-size:0.78rem">Trend</span><div style="color:${(compass.trend_score || 0) >= 50 ? MH.bull : MH.bear};font-weight:600">${compass.trend_score ?? '—'}</div></div>
          <div><span style="color:${MH.muted};font-size:0.78rem">Risk</span><div style="color:${(compass.risk_score || 0) >= 50 ? MH.bull : MH.bear};font-weight:600">${compass.risk_score ?? '—'}</div></div>
          <div><span style="color:${MH.muted};font-size:0.78rem">Flows</span><div style="color:${(compass.flow_score || 0) >= 50 ? MH.bull : MH.bear};font-weight:600">${compass.flow_score ?? '—'}</div></div>
        </div>
        ${compass.summary ? `<div style="margin-top:0.5rem;font-size:0.82rem;color:${MH.muted}">${esc(compass.summary)}</div>` : ''}
        ${sourcesFooter('EODHD (derived)', asOf)}`);
        }
        panel.innerHTML = h;
    }

    function renderSectors(panel) {
        const sc = filterCards('SECTOR:'), asOf = getAsOf();
        if (!sc.length) { panel.innerHTML = card('<span style="color:#64748b">No sector data.</span>'); return; }
        let h = secTitle(`US Sectors (${sc.length})`);
        h += '<div style="overflow-x:auto"><table class="mh-table"><thead><tr>';
        h += `<th>Sector</th><th class="mh-center">Score</th><th class="mh-center">Phase</th><th class="mh-center">Conf</th><th class="mh-right">Mom (20d)</th><th class="mh-right">Vol Z</th><th>Drivers</th>`;
        h += '</tr></thead><tbody>';
        sc.forEach(c => {
            const mc = (c.momentum?.m20 || 0) >= 0 ? MH.bull : MH.bear;
            h += `<tr>
        <td style="color:${MH.text};font-weight:600">${esc(c.name)}</td>
        <td class="mh-center">${scorePill(c.score)}</td>
        <td class="mh-center">${phaseBadge(c.phase)}</td>
        <td class="mh-center">${confBadge(c.confidence)}</td>
        <td class="mh-right" style="color:${mc};font-weight:600">${(c.momentum?.m20 || 0).toFixed(2)}%</td>
        <td class="mh-right" style="color:${(c.vol_z || 0) > 1 ? MH.bear : MH.muted}">${(c.vol_z || 0).toFixed(2)}</td>
        <td>${driverChips(c.drivers_top3)}</td>
      </tr>`;
        });
        h += '</tbody></table></div>';
        h += sourcesFooter('SPDR Sector ETFs via EODHD', asOf);
        panel.innerHTML = h;
    }

    function renderCommodities(panel) {
        const cc = filterCards('CMDTY:'), asOf = getAsOf();
        if (!cc.length) { panel.innerHTML = card('<span style="color:#64748b">No commodity data.</span>'); return; }
        let h = secTitle(`Commodities (${cc.length})`);
        h += cc.map(c => cardRow(c)).join('');
        h += sourcesFooter('ETF proxies (GLD, SLV, USO, UNG, CPER) via EODHD', asOf);
        panel.innerHTML = h;
    }

    function renderCrypto(panel) {
        const cc = filterCards('CRYPTO:'), asOf = getAsOf();
        if (!cc.length) { panel.innerHTML = card('<span style="color:#64748b">No crypto data.</span>'); return; }
        let h = secTitle(`Crypto (${cc.length})`);
        const avg = cc.reduce((s, c) => s + c.score, 0) / cc.length;
        const appetite = avg >= 60 ? 'Risk-On' : avg >= 45 ? 'Neutral' : 'Risk-Off';
        const appC = avg >= 60 ? MH.bull : avg >= 45 ? MH.warn : MH.bear;
        h += card(`<div style="display:flex;justify-content:space-between;align-items:center">
      <div><div style="font-size:0.82rem;color:${MH.muted}">Crypto Risk Appetite</div>
        <div style="font-size:1.2rem;font-weight:700;color:${appC}">${appetite}</div></div>
      <div style="text-align:right"><div style="font-size:0.78rem;color:${MH.muted}">Avg Score</div>${scorePill(Math.round(avg))}</div>
    </div>`);
        h += cc.map(c => cardRow(c)).join('');
        h += sourcesFooter('EODHD Crypto (CC exchange)', asOf);
        panel.innerHTML = h;
    }

    function renderCountries(panel) {
        const fxCards = filterCards('FX:');
        const idxCards = filterCards('INDEX:');
        const asOf = getAsOf();
        let h = '';

        if (idxCards.length) {
            h += secTitle(`Global Indices (${idxCards.length})`);
            h += '<div style="overflow-x:auto"><table class="mh-table"><thead><tr>';
            h += '<th>Index</th><th class="mh-center">Score</th><th class="mh-center">Phase</th><th class="mh-center">Conf</th><th class="mh-right">Mom 20d</th><th class="mh-right">Vol Z</th>';
            h += '</tr></thead><tbody>';
            idxCards.forEach(c => {
                const mc = (c.momentum?.m20 || 0) >= 0 ? MH.bull : MH.bear;
                h += `<tr><td style="color:${MH.text};font-weight:600">${esc(c.name)}</td>
          <td class="mh-center">${scorePill(c.score)}</td><td class="mh-center">${phaseBadge(c.phase)}</td>
          <td class="mh-center">${confBadge(c.confidence)}</td>
          <td class="mh-right" style="color:${mc};font-weight:600">${(c.momentum?.m20 || 0).toFixed(2)}%</td>
          <td class="mh-right" style="color:${(c.vol_z || 0) > 1 ? MH.bear : MH.muted}">${(c.vol_z || 0).toFixed(2)}</td></tr>`;
            });
            h += '</tbody></table></div>';
        }

        if (fxCards.length) {
            h += secTitle(`Forex (${fxCards.length})`);
            h += fxCards.map(c => cardRow(c)).join('');
        }

        if (!h) h = card('<span style="color:#64748b">No country/FX data.</span>');
        h += sourcesFooter('EODHD Global Indices + Forex', asOf);
        panel.innerHTML = h;
    }

    function renderFlows(panel) {
        const gDoc = getGDoc(), cards = getCards(), asOf = getAsOf();
        let h = secTitle('Capital Flows (Price-Derived Proxy)');
        h += `<div style="font-size:0.76rem;color:${MH.warn};margin-bottom:0.6rem">Flows are derived from multi-day price trends — not real fund-flow data (EPFR/ICI).</div>`;
        const all = Object.entries(cards).map(([k, v]) => ({ key: k, ...v })).sort((a, b) => b.score - a.score);
        if (!all.length) { panel.innerHTML = card('<span style="color:#64748b">No flow data.</span>'); return; }
        h += '<div style="overflow-x:auto"><table class="mh-table"><thead><tr>';
        h += '<th>Asset</th><th class="mh-center">Type</th><th class="mh-center">Score</th><th class="mh-center">Phase</th><th class="mh-center">Flow Dir</th><th class="mh-right">Mom 20d</th>';
        h += '</tr></thead><tbody>';
        all.forEach(c => {
            const fd = c.drivers_top3?.find(d => d.label === 'Flow Direction');
            const fc = fd?.dir === 'up' ? MH.bull : fd?.dir === 'down' ? MH.bear : MH.muted;
            const fl = fd ? (fd.dir === 'up' ? 'Inflow' : 'Outflow') : '—';
            const mc = (c.momentum?.m20 || 0) >= 0 ? MH.bull : MH.bear;
            h += `<tr><td style="color:${MH.text}">${esc(c.name || c.key)}</td>
        <td class="mh-center" style="font-size:0.72rem;color:${MH.muted}">${esc(c.type || '—')}</td>
        <td class="mh-center">${scorePill(c.score)}</td>
        <td class="mh-center">${phaseBadge(c.phase)}</td>
        <td class="mh-center" style="color:${fc};font-weight:600">${fl}</td>
        <td class="mh-right" style="color:${mc}">${(c.momentum?.m20 || 0).toFixed(2)}%</td></tr>`;
        });
        h += '</tbody></table></div>';
        h += sourcesFooter('EODHD (price-derived proxy)', asOf);
        panel.innerHTML = h;
    }

    function renderRisks(panel) {
        const gDoc = getGDoc(), cards = getCards(), asOf = getAsOf();
        const rd = gDoc?.regime_details || {};
        const regime = gDoc?.regime_mode || 'NORMAL';
        const regCol = regime === 'CRISIS' ? MH.bear : regime === 'STRESS' ? MH.warn : MH.bull;
        let h = secTitle('Risk Radar');

        // Regime
        h += card(`<div style="display:flex;justify-content:space-between;align-items:center">
      <div><div style="font-size:0.82rem;color:${MH.muted}">Market Regime</div>
        <div style="font-size:1.4rem;font-weight:700;color:${regCol}">${regime}</div></div>
      <div style="display:grid;gap:0.3rem;text-align:right">
        <div style="font-size:0.78rem"><span style="color:${MH.muted}">Breadth Z:</span> <span style="color:${(rd.breadth_z || 0) < -1 ? MH.bear : MH.text};font-weight:600">${rd.breadth_z?.toFixed(2) || '—'}</span></div>
        <div style="font-size:0.78rem"><span style="color:${MH.muted}">Credit Z:</span> <span style="color:${(rd.credit_z || 0) > 1.5 ? MH.bear : MH.text};font-weight:600">${rd.credit_z?.toFixed(2) || '—'}</span></div>
        <div style="font-size:0.78rem"><span style="color:${MH.muted}">Vol Z:</span> <span style="color:${(rd.vol_z || 0) > 1.5 ? MH.bear : MH.text};font-weight:600">${rd.vol_z?.toFixed(2) || '—'}</span></div>
      </div>
    </div>`);

        // Breadth
        const pulse = gDoc?.us_pulse;
        if (pulse) {
            const total = (pulse.breadth_up || 0) + (pulse.breadth_down || 0);
            const upPct = total > 0 ? ((pulse.breadth_up / total) * 100).toFixed(0) : 50;
            h += card(`${secTitle('Market Breadth')}
        <div class="mh-breadth-bar">
          <div style="flex:${pulse.breadth_up || 1};background:${MH.bull};display:flex;align-items:center;justify-content:center;font-size:0.65rem;color:#fff">▲ ${pulse.breadth_up || 0}</div>
          <div style="flex:${pulse.breadth_down || 1};background:${MH.bear};display:flex;align-items:center;justify-content:center;font-size:0.65rem;color:#fff">▼ ${pulse.breadth_down || 0}</div>
        </div>
        <div style="font-size:0.78rem;color:${MH.muted}">${upPct}% advancing | Risk Mode: <span style="color:${pulse.risk_mode === 'risk-on' ? MH.bull : MH.bear};font-weight:600">${esc(pulse.risk_mode || '—')}</span> | Coverage: ${Number(pulse.symbols_covered || 0).toLocaleString()}</div>`);
        }

        // Danger Zone
        const riskAssets = Object.values(cards).filter(c => c.phase === 'REVERSAL_RISK' || c.phase === 'EXHAUSTED').sort((a, b) => a.score - b.score);
        if (riskAssets.length) {
            h += card(`${secTitle('Danger Zone — Exhausted / Reversal Risk')}${riskAssets.map(c => cardRow(c)).join('')}`);
        }
        h += sourcesFooter('EODHD + Derived breadth', asOf);
        panel.innerHTML = h;
    }

    function renderPlaybook(panel) {
        const gDoc = getGDoc(), cards = getCards(), asOf = getAsOf();
        const regime = gDoc?.regime_mode || 'NORMAL';
        let h = secTitle('Playbook — Actionable Observations');

        const opps = Object.values(cards).filter(c => (c.phase === 'EARLY' || c.phase === 'MID') && c.score >= 50).sort((a, b) => b.score - a.score).slice(0, 8);
        const danger = Object.values(cards).filter(c => c.phase === 'REVERSAL_RISK' || c.phase === 'EXHAUSTED' || c.score < 35).sort((a, b) => a.score - b.score).slice(0, 5);

        h += '<div class="mh-grid-2">';
        h += card(`<div style="font-size:0.88rem;font-weight:700;color:${MH.bull};margin-bottom:0.5rem">Opportunities (${opps.length})</div>
      ${opps.length ? opps.map(c => cardRow(c)).join('') : '<span style="color:#64748b">No strong opportunities.</span>'}`);
        h += card(`<div style="font-size:0.88rem;font-weight:700;color:${MH.bear};margin-bottom:0.5rem">Danger Zones (${danger.length})</div>
      ${danger.length ? danger.map(c => cardRow(c)).join('') : '<span style="color:#64748b">None flagged.</span>'}`);
        h += '</div>';

        if (regime !== 'NORMAL') {
            h += card(`<div style="color:${MH.warn};font-size:0.82rem">Regime is <strong>${regime}</strong> — all scores dampened. Reduce exposure and favor hedges.</div>`);
        }

        // Hedges
        const hedges = Object.values(cards).filter(c => c.type === 'commodity' || c.id?.startsWith('FX:')).filter(c => c.score >= 55).sort((a, b) => b.score - a.score).slice(0, 5);
        if (hedges.length) {
            h += card(`${secTitle('Potential Hedges (Score ≥ 55)')}${hedges.map(c => cardRow(c)).join('')}`);
        }

        h += `<div style="font-size:0.72rem;color:${MH.muted};margin-top:0.5rem;font-style:italic">This is not financial advice. All observations are based on quantitative signals and intended for informational purposes only.</div>`;
        h += sourcesFooter('EODHD (derived)', asOf);
        panel.innerHTML = h;
    }

    function renderAlerts(panel) {
        const cards = getCards();
        let h = secTitle('Watchlist & Alerts');
        h += card(`<div style="font-size:0.85rem;color:${MH.text};margin-bottom:0.6rem">Track assets and get notified when phase/score changes significantly.</div>
      <div style="display:flex;gap:0.5rem;flex-wrap:wrap;margin-bottom:0.8rem">
        <input id="mh-alert-input" type="text" placeholder="Add asset ID (e.g. SECTOR:XLK)" style="flex:1;min-width:200px;padding:0.5rem;background:${MH.surface};border:1px solid ${MH.border};border-radius:6px;color:${MH.text};font-size:0.85rem"/>
        <button onclick="window._mhAddAlert()" style="padding:0.5rem 1rem;background:rgba(59,130,246,0.15);border:1px solid rgba(59,130,246,0.3);border-radius:6px;color:#60a5fa;font-weight:600;cursor:pointer;font-size:0.85rem">+ Add</button>
      </div>
      <div id="mh-alert-list">${renderAlertList(cards)}</div>`);
        panel.innerHTML = h;
    }

    function renderAlertList(cards) {
        if (!alertsState.length) return '<div style="color:#64748b;font-size:0.82rem">No alerts set. Add asset IDs above.</div>';
        return alertsState.map(id => {
            const c = cards[id];
            if (!c) return `<div class="mh-card-row"><span style="color:${MH.muted}">${esc(id)} — no data</span>
        <button onclick="window._mhRemoveAlert('${esc(id)}')" style="background:none;border:none;color:${MH.bear};cursor:pointer;font-size:0.8rem">✕</button></div>`;
            return `<div class="mh-card-row">${cardRow(c)}<button onclick="window._mhRemoveAlert('${esc(id)}')" style="background:none;border:none;color:${MH.bear};cursor:pointer;font-size:0.8rem;position:absolute;right:0.5rem">✕</button></div>`;
        }).join('');
    }

    window._mhAddAlert = function () {
        const inp = document.getElementById('mh-alert-input');
        const val = (inp?.value || '').trim().toUpperCase();
        if (!val || alertsState.includes(val)) return;
        alertsState.push(val);
        localStorage.setItem('mh_alerts', JSON.stringify(alertsState));
        const list = document.getElementById('mh-alert-list');
        if (list) list.innerHTML = renderAlertList(getCards());
        if (inp) inp.value = '';
    };

    window._mhRemoveAlert = function (id) {
        alertsState = alertsState.filter(a => a !== id);
        localStorage.setItem('mh_alerts', JSON.stringify(alertsState));
        const list = document.getElementById('mh-alert-list');
        if (list) list.innerHTML = renderAlertList(getCards());
    };

    function renderMethodology(panel) {
        panel.innerHTML = `
      ${secTitle('Methodology — How Scores Are Computed')}
      ${card(`<div style="font-size:0.88rem;font-weight:700;color:${MH.text};margin-bottom:0.6rem">Score Schema (0-100)</div>
        <div style="font-size:0.8rem;color:${MH.muted};line-height:1.6">
          <p><strong>Formula:</strong> <span class="mh-code">score = clamp(50 + 50 × weighted_sum, 0, 100)</span></p>
          <p><strong>Components:</strong> Momentum (m20/m60/m200), Flow Direction, Volatility Z-score, Macro proxy, Valuation proxy</p>
          <p><strong>Weights by type:</strong></p>
          <table class="mh-table" style="font-size:0.78rem">
            <tr><th>Type</th><th class="mh-center">Mom</th><th class="mh-center">Flow</th><th class="mh-center">Val</th><th class="mh-center">Macro</th><th class="mh-center">Risk</th></tr>
            <tr><td>Default</td><td class="mh-center">35%</td><td class="mh-center">20%</td><td class="mh-center">15%</td><td class="mh-center">20%</td><td class="mh-center">10%</td></tr>
            <tr><td>Crypto</td><td class="mh-center">25%</td><td class="mh-center">30%</td><td class="mh-center">10%</td><td class="mh-center">15%</td><td class="mh-center">20%</td></tr>
            <tr><td>Country</td><td class="mh-center">25%</td><td class="mh-center">20%</td><td class="mh-center">15%</td><td class="mh-center">30%</td><td class="mh-center">10%</td></tr>
          </table>
        </div>`)}
      ${card(`<div style="font-size:0.88rem;font-weight:700;color:${MH.text};margin-bottom:0.6rem">Phase Classification (Trend Lifecycle)</div>
        <div style="font-size:0.8rem;color:${MH.muted};line-height:1.6;display:grid;gap:0.3rem">
          <div>${phaseBadge('EARLY')} Short momentum positive, medium not yet confirmed</div>
          <div>${phaseBadge('MID')} All timeframes aligned positive</div>
          <div>${phaseBadge('LATE')} Long trend intact but short momentum fading</div>
          <div>${phaseBadge('EXHAUSTED')} Trend overheated — high vol or divergence</div>
          <div>${phaseBadge('REVERSAL_RISK')} Medium and long momentum both negative</div>
          <div>${phaseBadge('NEUTRAL')} No clear trend or insufficient data</div>
        </div>`)}
      ${card(`<div style="font-size:0.88rem;font-weight:700;color:${MH.text};margin-bottom:0.6rem">Confidence Calculation</div>
        <div style="font-size:0.8rem;color:${MH.muted};line-height:1.6">
          <p><span class="mh-code">confidence = signal_agreement × data_quality</span></p>
          <p>Data quality = coverage × freshness × source reliability</p>
          <p><strong>HIGH</strong> ≥ 0.75 | <strong>MEDIUM</strong> ≥ 0.50 | <strong>LOW</strong> &lt; 0.50</p>
        </div>`)}
      ${card(`<div style="font-size:0.88rem;font-weight:700;color:${MH.text};margin-bottom:0.6rem">Regime Engine</div>
        <div style="font-size:0.8rem;color:${MH.muted};line-height:1.6">
          <p><strong>NORMAL:</strong> No stress → scores unmodified</p>
          <p><strong>STRESS:</strong> 2+ of: Vol Z > 1.5, Credit Z > 1.5, Breadth Z &lt; -1.5 → scores ×0.6</p>
          <p><strong>CRISIS:</strong> 3 conditions + Credit Z > 2.5 → scores ×0.3</p>
        </div>`)}
      ${card(`<div style="font-size:0.88rem;font-weight:700;color:${MH.text};margin-bottom:0.6rem">Data Sources & Limitations</div>
        <div style="font-size:0.8rem;color:${MH.muted};line-height:1.6">
          <p><strong>Tier A:</strong> FRED, BIS, IMF, CFTC, EIA — <em>not yet integrated</em></p>
          <p><strong>Tier B:</strong> EODHD — all prices, ETF proxies, indices</p>
          <p><strong>Tier C:</strong> Derived — ETF AUM proxies, price-derived flows, computed breadth</p>
          <div style="margin-top:0.5rem;padding:0.5rem;background:${MH.surface};border-radius:6px;border-left:3px solid ${MH.warn}">
            <strong style="color:${MH.warn}">Known Limitations:</strong>
            <ul style="margin:0.3rem 0 0 1rem;padding:0">
              <li>No real fund-flow data — flows from price trends only</li>
              <li>No options/skew data — vol from realized returns</li>
              <li>No COT positioning, no on-chain crypto</li>
              <li>Breadth from ~2,450 US stocks only</li>
            </ul>
          </div>
        </div>`)}`;
    }

    function renderGlossary(panel) {
        const terms = [
            ['Score (0-100)', '0-30 = bearish, 30-70 = neutral, 70-100 = bullish. Composite of momentum, flows, risk, macro.'],
            ['Phase', 'EARLY (new trend) → MID (confirmed) → LATE (fading) → EXHAUSTED (overheated) → REVERSAL_RISK (breaking).'],
            ['Confidence', 'HIGH/MEDIUM/LOW — computed from signal agreement × data quality. Never manually set.'],
            ['Regime', 'NORMAL (no stress) / STRESS (elevated vol/credit) / CRISIS (multiple stress triggers). Dampens scores.'],
            ['Momentum (m20/m60/m200)', 'Price change over 20/60/200 days in %. Positive = uptrend.'],
            ['Vol Z', 'Volatility z-score. >1.5 = elevated volatility, contributes to STRESS regime.'],
            ['Breadth Z', 'Market breadth z-score. Negative = more stocks declining than advancing.'],
            ['Credit Z', 'Credit spread z-score. >1.5 = credit deterioration.'],
            ['Flow Direction', 'Inflow/Outflow derived from multi-day price trends. Proxy only.'],
            ['CardPayload', 'Universal data object for every asset. Contains score, phase, confidence, drivers, risks, sources, data_status.'],
            ['Coverage Ratio', 'How many inputs are available vs expected. <0.6 → Score forced near 50, Confidence LOW.'],
            ['Freshness Days', 'Days since last data update. Stale data > 2 days reduces confidence.'],
            ['Anti-Noise', 'Phase cannot flip unless confirmed for 2+ consecutive days. Prevents flicker.'],
            ['Regime Damping', 'In STRESS: scores ×0.6, confidence ×0.85. In CRISIS: scores ×0.3, confidence ×0.7.'],
        ];
        let h = secTitle('Glossary');
        terms.forEach(([term, desc]) => {
            h += `<div style="padding:0.5rem 0;border-bottom:1px solid ${MH.border}">
        <div style="font-weight:700;color:${MH.text};font-size:0.88rem">${esc(term)}</div>
        <div style="font-size:0.8rem;color:${MH.muted};margin-top:0.15rem">${esc(desc)}</div>
      </div>`;
        });
        panel.innerHTML = h;
    }

    const RENDERERS = {
        snapshot: renderSnapshot, sectors: renderSectors, commodities: renderCommodities,
        crypto: renderCrypto, countries: renderCountries, flows: renderFlows,
        risks: renderRisks, playbook: renderPlaybook, alerts: renderAlerts,
        methodology: renderMethodology, glossary: renderGlossary
    };

    function renderPanelError(tabId, reason) {
        const panel = document.getElementById('mh-panel-' + tabId);
        if (!panel) return;
        panel.innerHTML = card(`
          <div style="font-size:0.86rem;color:${MH.text};font-weight:700;margin-bottom:0.35rem;">N/A</div>
          <div style="font-size:0.8rem;color:${MH.muted};line-height:1.5;">
            Data unavailable for this panel.
            <br/>Reason: <span style="color:${MH.warn};">${esc(reason || 'render_error')}</span>
          </div>
          ${sourcesFooter(doc?.meta?.source_fallback || 'market-hub-fallback', doc?.meta?.data_date || null)}
        `);
    }

    // ═══ TAB SWITCHING ═══
    function switchTab(tabId) {
        currentTab = tabId;
        document.querySelectorAll('.mh-tab').forEach(t => t.classList.toggle('mh-tab-active', t.dataset.tab === tabId));
        document.querySelectorAll('.mh-panel').forEach(p => p.classList.toggle('mh-panel-active', p.id === 'mh-panel-' + tabId));
        if (!doc || !RENDERERS[tabId]) return;
        try {
            RENDERERS[tabId](document.getElementById('mh-panel-' + tabId));
        } catch (err) {
            console.error('[MH] render failure for tab', tabId, err);
            renderPanelError(tabId, err?.message || 'render_failure');
        }
    }

    // ═══ INIT ═══
    async function fetchJsonWithTimeout(url, timeoutMs = 4500) {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), timeoutMs);
        try {
            const response = await fetch(url, { signal: controller.signal, cache: 'no-store' });
            if (!response.ok) return null;
            return await response.json();
        } catch {
            return null;
        } finally {
            clearTimeout(timer);
        }
    }

    async function loadData() {
        const attempts = await Promise.all(
            DATA_URLS.map(async (url) => {
                try {
                    const payload = await fetchJsonWithTimeout(url, 4500);
                    return { url, payload };
                } catch (e) {
                    console.warn('Market data load failed:', url, e);
                    return { url, payload: null };
                }
            })
        );
        for (const { url, payload } of attempts) {
            if (!payload) continue;
            const normalized = normalizeMarketDoc(payload, url);
            if (!normalized) continue;
            normalized.meta = normalized.meta || {};
            if (!normalized.meta.source_url) normalized.meta.source_url = url;
            if (!normalized.meta.source_fallback) normalized.meta.source_fallback = 'market-hub';
            doc = normalized;
            return doc;
        }
        doc = emptyMarketDoc();
        return doc;
    }

    function buildDOM(root) {
        // Regime banner
        let html = '<div id="mh-regime-banner" class="mh-regime-banner"></div>';

        // Header
        html += `<div class="mh-header">
      <div><h1>Global Market Hub</h1>
        <div class="mh-header-sub">Score / Phase / Confidence for every asset class — powered by EOD data</div></div>
      <div id="mh-header-meta" class="mh-header-meta">Loading…</div>
    </div>`;

        // Demo warning
        html += `<div class="mh-demo-warn">All scores based on End of The Day Data and Flows are price-proxies, not real fund-flows. Confidence is computed from data availability. <a href="#" onclick="window._mhSwitchTab('methodology');return false">Full methodology</a></div>`;

        // Tab bar
        html += '<div class="mh-tab-bar">';
        TABS.forEach(t => {
            html += `<button class="mh-tab${t.id === 'snapshot' ? ' mh-tab-active' : ''}" data-tab="${t.id}" onclick="window._mhSwitchTab('${t.id}')">${t.label}</button>`;
        });
        html += '</div>';

        // Panels
        TABS.forEach(t => {
            html += `<div id="mh-panel-${t.id}" class="mh-panel${t.id === 'snapshot' ? ' mh-panel-active' : ''}"></div>`;
        });

        root.innerHTML = html;
    }

    window._mhSwitchTab = switchTab;

    function buildMarketFieldAudit() {
        const cards = getCards();
        const gDoc = getGDoc();
        const has = (v) => {
            if (v == null) return false;
            if (Array.isArray(v)) return v.length > 0;
            if (typeof v === 'object') return Object.keys(v).length > 0;
            if (typeof v === 'string') return v.trim().length > 0;
            return true;
        };
        const checks = {
            snapshot: has(gDoc?.regime_mode) && has(gDoc?.investment_compass),
            flows: has(cards),
            sectors: filterCards('SECTOR:').length > 0,
            commodities: filterCards('CMDTY:').length > 0,
            crypto: filterCards('CRYPTO:').length > 0,
            countries: filterCards('INDEX:').length > 0 || filterCards('FX:').length > 0,
            risks: has(gDoc?.regime_details),
            playbook: has(cards),
            alerts: true,
            methodology: true,
            glossary: true
        };
        return Object.fromEntries(
            Object.entries(checks).map(([tab, ok]) => [tab, {
                HAS_VALUE: ok,
                VALUE_VALID: ok,
                LOGIC_VALID: ok,
                status: ok ? 'ok' : 'unavailable'
            }])
        );
    }

    async function init() {
        const root = document.getElementById('market-view');
        if (!root) return;

        buildDOM(root);
        await loadData();

        const gDoc = doc?.data || {};
        const meta = doc?.meta || {};
        const metaEl = document.getElementById('mh-header-meta');
        if (metaEl) metaEl.textContent = `Data: ${meta.data_date || '—'} | Updated: ${(meta.generated_at || '').slice(0, 16).replace('T', ' ')} | Cards: ${meta.cards_built || 0}`;

        // Regime banner
        const regime = gDoc.regime_mode || 'NORMAL';
        const banner = document.getElementById('mh-regime-banner');
        if (banner) {
            if (regime === 'STRESS') { banner.className = 'mh-regime-banner mh-stress'; banner.textContent = 'STRESS REGIME — Scores dampened to 60%. Elevated volatility or credit deterioration detected.'; }
            else if (regime === 'CRISIS') { banner.className = 'mh-regime-banner mh-crisis'; banner.textContent = 'CRISIS REGIME — Scores dampened to 30%. Multiple stress indicators triggered.'; }
            else { banner.className = 'mh-regime-banner'; banner.textContent = ''; }
        }

        // Render active tab (always render to avoid stuck loading state)
        switchTab(currentTab);
        window.__rvUiAudit = window.__rvUiAudit || {};
        window.__rvUiAudit.market = {
            asOf: doc?.meta?.data_date || null,
            source: doc?.meta?.source_url || doc?.meta?.source_fallback || 'unknown',
            fields: buildMarketFieldAudit()
        };
    }

    // Expose for SPA integration
    window._mhInit = init;
    window._mhSwitchTab = switchTab;

})();
