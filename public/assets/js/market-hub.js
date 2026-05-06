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
    const DICT_URL = '/config/narrative-dictionary.json';
    const MH = {
        bg: '#070a0f', panel: '#0d1119', surface: '#111827', border: '#1c2535',
        dim: '#243044', text: '#dde3ed', muted: '#5a6a82', faint: '#0f1722',
        bull: '#10b981', warn: '#f59e0b', bear: '#ef4444', neutral: '#475569',
        blue: '#3b82f6', purple: '#8b5cf6', orange: '#f97316'
    };
    const PHASE_COLORS = { EARLY: '#3b82f6', MID: '#10b981', LATE: '#f59e0b', EXHAUSTED: '#f97316', REVERSAL_RISK: '#ef4444', NEUTRAL: '#475569' };
    // Fallback labels — overridden by narrative dictionary when loaded
    const PHASE_LABELS_FALLBACK = { EARLY: 'Early', MID: 'Mid Trend', LATE: 'Late', EXHAUSTED: 'Exhausted', REVERSAL_RISK: 'Reversal Risk', NEUTRAL: 'Neutral' };
    const CONF_COLORS = { HIGH: '#10b981', MEDIUM: '#f59e0b', LOW: '#ef4444' };

    // Narrative dictionary — loaded at init, provides all labels/tooltips
    let narrativeDict = null;

    const TABS = [
        { id: 'dashboard', label: 'Dashboard' },
        { id: 'flows', label: 'Capital Rotation' },
        { id: 'assets', label: 'Asset Classes' },
        { id: 'riskmonitor', label: 'Risk Monitor' },
        { id: 'help', label: 'Help' }
    ];

    let doc = null;
    let rotationDoc = null;
    const ROTATION_SUMMARY_URL = '/data/v3/derived/market/capital-rotation/latest.json';
    let currentTab = 'dashboard';
    let proMode = false;

    // ═══ HELPERS ═══
    function esc(s) { const d = document.createElement('div'); d.textContent = s; return d.innerHTML; }

    // Dictionary lookup: returns entry or null
    function dictLookup(section, key) {
        return narrativeDict?.[section]?.[key] || null;
    }
    function dictLabel(section, key, fallback) {
        return dictLookup(section, key)?.label || fallback || key || '—';
    }
    function dictTooltip(section, key) {
        return dictLookup(section, key)?.tooltip || '';
    }
    function phaseLabel(phase) {
        return dictLabel('phase', phase, PHASE_LABELS_FALLBACK[phase]);
    }

    // Build tldr from structured narrative codes (dictionary-driven)
    function buildTldr(c) {
        if (!c?.narrative) return c?.tldr || '';
        const phaseShort = dictLookup('phase', c.narrative.phase_code)?.short || c.narrative.phase_code;
        const confLabel = dictLabel('confidence', c.narrative.confidence_code, c.narrative.confidence_code);
        return `${phaseShort}. Score ${c.score}/100, ${confLabel} confidence.`;
    }

    function scorePill(score) {
        const s = Number(score) || 0;
        const band = s >= 65 ? 'bullish' : s >= 45 ? 'neutral' : 'bearish';
        const cls = s >= 65 ? 'mh-score-bull' : s >= 45 ? 'mh-score-warn' : 'mh-score-bear';
        const tip = dictTooltip('score_bands', band);
        return `<span class="mh-score ${cls}"${tip ? ` title="${esc(tip)}"` : ''}>${s}</span>`;
    }

    function phaseBadge(phase) {
        const c = PHASE_COLORS[phase] || MH.neutral;
        const l = phaseLabel(phase);
        const tip = dictTooltip('phase', phase);
        return `<span class="mh-phase" style="background:${c}22;color:${c}"${tip ? ` title="${esc(tip)}"` : ''}>${esc(l)}</span>`;
    }

    function confBadge(conf) {
        const label = conf?.label || 'LOW';
        const c = CONF_COLORS[label] || MH.neutral;
        const tip = dictTooltip('confidence', label);
        return `<span class="mh-conf" style="background:${c}15;color:${c}"${tip ? ` title="${esc(tip)}"` : ''}>${label}${conf?.value != null ? ' ' + conf.value.toFixed(2) : ''}</span>`;
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

    function quoteChips(q) {
        if (!q?.available) return '';
        const f = (v) => v != null ? Number(v).toFixed(2) : '—';
        return `<span class="mh-chip" style="background:${MH.surface};color:${MH.muted};font-size:0.68rem">O ${f(q.open)} H ${f(q.high)} L ${f(q.low)} C ${f(q.close)}</span>`;
    }

    function cardRow(c) {
        if (!c) return '';
        const tldr = buildTldr(c);
        return `<div class="mh-card-row">
      <div class="mh-card-row-left">
        <div class="mh-card-row-tags">
          <span class="mh-card-row-name">${esc(c.name || c.id)}</span>
          ${phaseBadge(c.phase)} ${confBadge(c.confidence)}
        </div>
        <div class="mh-card-row-drivers">${driverChips(c.drivers_top3)} ${quoteChips(c.quote)}</div>
        ${tldr ? `<div class="mh-card-row-tldr">${esc(tldr)}</div>` : ''}
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

    // ═══ EXHAUSTION GAUGE ═══
    function computeExhaustionGauge(cards) {
        const validCards = Object.values(cards).filter(c =>
            c.momentum?.m20 != null && c.phase !== 'NEUTRAL'
        );
        if (!validCards.length) return { score: 50, label: 'No Data', color: MH.muted };
        let totalScore = 0;
        for (const c of validCards) {
            const m = c.momentum;
            let cardExhaustion = 0;
            // 1. Momentum divergence: short vs long
            if (m.m200 != null && m.m20 != null) {
                cardExhaustion += Math.sign(m.m200) !== Math.sign(m.m20) ? 25 : 0;
            }
            // 2. Magnitude: extended m20 beyond ±8% = overheated
            cardExhaustion += Math.min(25, (Math.abs(m.m20 || 0) / 8) * 25);
            // 3. Phase penalty
            const phasePenalty = { EARLY: 0, MID: 5, LATE: 15, EXHAUSTED: 25, REVERSAL_RISK: 25 };
            cardExhaustion += phasePenalty[c.phase] || 0;
            // 4. Weak flow in trending market = exhaustion signal
            const flowPenalty = c.flow?.strength === 'weak' ? 15 : c.flow?.strength === 'moderate' ? 5 : 0;
            cardExhaustion += flowPenalty;
            totalScore += Math.min(100, cardExhaustion);
        }
        const avg = totalScore / validCards.length;
        const continuation = Math.max(0, Math.min(100, Math.round(100 - avg)));
        const label = continuation >= 70 ? 'Strong Trend' : continuation >= 45 ? 'Active' : continuation >= 25 ? 'Weakening' : 'Near Reversal';
        const color = continuation >= 70 ? MH.bull : continuation >= 45 ? MH.blue : continuation >= 25 ? MH.warn : MH.bear;
        return { score: continuation, label, color };
    }

    // Render semicircular gauge SVG
    function renderExhaustionGaugeSVG(gauge) {
        const { score, label, color } = gauge;
        const W = 200, H = 120;
        const cx = W / 2, cy = H - 10, r = 80;
        const startAngle = Math.PI;
        const endAngle = startAngle + (score / 100) * Math.PI;
        const x1 = cx + r * Math.cos(startAngle), y1 = cy + r * Math.sin(startAngle);
        const x2 = cx + r * Math.cos(endAngle), y2 = cy + r * Math.sin(endAngle);
        const largeArc = score > 50 ? 1 : 0;
        let svg = `<svg viewBox="0 0 ${W} ${H}" style="width:100%;max-width:${W}px;height:auto">`;
        // Background arc
        svg += `<path d="M ${cx - r} ${cy} A ${r} ${r} 0 1 1 ${cx + r} ${cy}" fill="none" stroke="${MH.dim}" stroke-width="12" stroke-linecap="round"/>`;
        // Filled arc
        if (score > 0) {
            svg += `<path d="M ${x1} ${y1} A ${r} ${r} 0 ${largeArc} 1 ${x2} ${y2}" fill="none" stroke="${color}" stroke-width="12" stroke-linecap="round"/>`;
        }
        // Score text
        svg += `<text x="${cx}" y="${cy - 28}" fill="${color}" font-size="28" font-weight="800" text-anchor="middle" dominant-baseline="middle">${score}</text>`;
        svg += `<text x="${cx}" y="${cy - 6}" fill="${MH.muted}" font-size="11" text-anchor="middle">${esc(label)}</text>`;
        svg += '</svg>';
        return svg;
    }

    function normalizeMarketDoc(raw, sourceUrl) {
        if (!raw || typeof raw !== 'object') return null;
        const data = raw?.data && typeof raw.data === 'object' ? raw.data : {};
        const hasCards = data?.cards && typeof data.cards === 'object' && Object.keys(data.cards).length > 0;
        if (hasCards) return raw;

        // Fallback adapter: market-latest.json has no cards.
        // Build minimal display-only cards — NO competing fachlogik.
        // Phase is always NEUTRAL (single-day change cannot determine trend lifecycle).
        // Confidence is always LOW (no multi-timeframe data available).
        const sectors = Array.isArray(data.sectors) ? data.sectors : [];
        const indices = Array.isArray(data.indices) ? data.indices : [];
        const pulse = data.pulse && typeof data.pulse === 'object' ? data.pulse : {};
        const cards = {};

        function buildFallbackCard(type, id, name, changePct) {
            const change = Number(changePct) || 0;
            const score = Math.round(clamp(50 + (change * 18), 0, 100));
            const dir = change > 0 ? 'up' : (change < 0 ? 'down' : 'flat');
            return {
                id, type, name, score,
                phase: 'NEUTRAL',
                confidence: { label: 'LOW', value: 0.30, fallback: true },
                momentum: { m20: change, m60: null, m200: null },
                vol_z: null,
                drivers_top3: [
                    { label: 'Price Change', dir, value: change, unit: '%' }
                ],
                tldr: `${name} ${change >= 0 ? 'up' : 'down'} ${Math.abs(change).toFixed(2)}% (fallback — limited data)`,
                data_status: { source: 'frontend-fallback', stale: true }
            };
        }

        sectors.forEach((s) => {
            const symbol = String(s?.symbol || '').toUpperCase();
            if (!symbol) return;
            cards[`SECTOR:${symbol}`] = buildFallbackCard('sector', `SECTOR:${symbol}`, s?.display_name || s?.sector || symbol, s?.change_pct);
        });

        indices.forEach((idx) => {
            const symbol = String(idx?.symbol || '').toUpperCase();
            if (!symbol) return;
            cards[`INDEX:${symbol}`] = buildFallbackCard('index', `INDEX:${symbol}`, symbol, idx?.change_pct);
        });

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
                regime_details: { breadth_z: null, credit_z: null, vol_z: null },
                us_pulse: {
                    average_change_pct: Number(pulse?.average_change_pct) || 0,
                    breadth_up: Number(pulse?.breadth_up) || 0,
                    breadth_down: Number(pulse?.breadth_down) || 0,
                    risk_mode: pulse?.risk_mode || 'neutral',
                    symbols_covered: Number(pulse?.symbols_covered) || 0
                },
                investment_compass: {
                    composite_score: 50,
                    trend_score: 50,
                    risk_score: 50,
                    flow_score: 50,
                    summary: 'Fallback mode — global-latest.json unavailable. Scores reflect limited data.'
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

    function numericOrNull(value) {
        const n = Number(value);
        return Number.isFinite(n) ? n : null;
    }

    function trendToScore(value) {
        const text = String(value || '').toLowerCase();
        if (text === 'bullish' || text === 'risk-on') return 70;
        if (text === 'bearish' || text === 'risk-off') return 35;
        return 50;
    }

    function deriveInvestmentCompass(gDoc) {
        const compass = gDoc?.investment_compass || {};
        const cards = Object.values(gDoc?.cards || {});
        const cardScores = cards.map(c => numericOrNull(c?.score)).filter(n => n != null);
        const avgCardScore = cardScores.length
            ? Math.round(cardScores.reduce((sum, n) => sum + n, 0) / cardScores.length)
            : 50;
        const flowRows = Array.isArray(gDoc?.money_flow?.all_flows) ? gDoc.money_flow.all_flows : [];
        const flowBalance = flowRows.reduce((sum, row) => {
            const direction = String(row?.direction || '').toLowerCase();
            if (direction === 'bullish') return sum + 1;
            if (direction === 'bearish') return sum - 1;
            return sum;
        }, 0);
        const derivedTrend = Math.round(clamp((avgCardScore + trendToScore(compass.crypto_trend) + trendToScore(compass.commodity_trend)) / 3, 0, 100));
        const derivedRisk = trendToScore(compass.risk_mode || gDoc?.us_pulse?.risk_mode);
        const derivedFlow = Math.round(clamp(50 + flowBalance * 6, 0, 100));
        const trendScore = numericOrNull(compass.trend_score) ?? derivedTrend;
        const riskScore = numericOrNull(compass.risk_score) ?? derivedRisk;
        const flowScore = numericOrNull(compass.flow_score) ?? derivedFlow;
        const compositeScore = numericOrNull(compass.composite_score) ?? Math.round((trendScore + riskScore + flowScore) / 3);
        return {
            ...compass,
            composite_score: compositeScore,
            trend_score: trendScore,
            risk_score: riskScore,
            flow_score: flowScore,
            summary: compass.summary || gDoc?.money_flow?.summary || 'Compass derived from live market cards and flow proxies.'
        };
    }

    function filterCards(prefix) {
        return Object.entries(getCards()).filter(([k]) => k.startsWith(prefix)).map(([, v]) => v).sort((a, b) => b.score - a.score);
    }

    // ═══ TAB RENDERERS ═══

    // ── DASHBOARD (Hero — answer in 3 seconds) ──
    function renderDashboard(panel) {
        const gDoc = getGDoc(), cards = getCards(), asOf = getAsOf();
        if (!gDoc) { panel.innerHTML = card('<span style="color:#64748b">No data available.</span>'); return; }
        let h = '';
        const regime = gDoc.regime_mode || 'NORMAL';
        const rd = gDoc.regime_details || {};
        const regCol = regime === 'CRISIS' ? MH.bear : regime === 'STRESS' ? MH.warn : MH.bull;

        // ═══ ROW 1: Regime + Exhaustion Gauge + Breadth ═══
        const gauge = computeExhaustionGauge(cards);
        const pulse = gDoc?.us_pulse;
        const compass = deriveInvestmentCompass(gDoc);
        const pulseTotal = (pulse?.breadth_up || 0) + (pulse?.breadth_down || 0);
        const upPct = pulseTotal > 0 ? ((pulse.breadth_up / pulseTotal) * 100).toFixed(0) : '—';

        h += '<div class="mh-hero-grid">';

        // Widget 1: Regime
        const regTip = dictTooltip('regime', regime);
        h += `<article class="mh-card mh-hero-widget">
      <div style="font-size:0.72rem;color:${MH.muted};text-transform:uppercase;letter-spacing:0.08em;margin-bottom:0.4rem">Market Regime</div>
      <div style="font-size:1.6rem;font-weight:800;color:${regCol}"${regTip ? ` title="${esc(regTip)}"` : ''}>${dictLabel('regime', regime, regime)}</div>
      <div style="font-size:0.72rem;color:${MH.muted};margin-top:0.3rem">Breadth Z: ${rd.breadth_z?.toFixed(2) || '—'} · Credit Z: ${rd.credit_z?.toFixed(2) || '—'} · Vol Z: ${rd.vol_z?.toFixed(2) || '—'}</div>
      <div style="margin-top:0.5rem">${scorePill(compass.composite_score)} <span style="font-size:0.72rem;color:${MH.muted}">Composite</span></div>
    </article>`;

        // Widget 2: Exhaustion Gauge
        h += `<article class="mh-card mh-hero-widget" style="text-align:center">
      <div style="font-size:0.72rem;color:${MH.muted};text-transform:uppercase;letter-spacing:0.08em;margin-bottom:0.3rem">Trend Fuel</div>
      ${renderExhaustionGaugeSVG(gauge)}
    </article>`;

        // Widget 3: Breadth Bar
        h += `<article class="mh-card mh-hero-widget">
      <div style="font-size:0.72rem;color:${MH.muted};text-transform:uppercase;letter-spacing:0.08em;margin-bottom:0.4rem">Market Breadth</div>
      <div class="mh-breadth-bar" style="height:28px;margin-bottom:0.5rem">
        <div style="flex:${pulse?.breadth_up || 1};background:${MH.bull};display:flex;align-items:center;justify-content:center;font-size:0.72rem;color:#fff;font-weight:600">▲ ${pulse?.breadth_up || 0}</div>
        <div style="flex:${pulse?.breadth_down || 1};background:${MH.bear};display:flex;align-items:center;justify-content:center;font-size:0.72rem;color:#fff;font-weight:600">▼ ${pulse?.breadth_down || 0}</div>
      </div>
      <div style="font-size:0.78rem;color:${MH.muted}">${upPct}% advancing</div>
      <div style="font-size:0.72rem;color:${pulse?.risk_mode === 'risk-on' ? MH.bull : MH.bear};font-weight:600;margin-top:0.2rem">${esc(pulse?.risk_mode || '—')} · ${Number(pulse?.symbols_covered || 0).toLocaleString()} stocks</div>
    </article>`;
        h += '</div>';

        // ═══ ROW 2: Session Strip ═══
        h += '<div class="mh-grid-3">';
        for (const region of ['asia', 'europe', 'americas']) {
            const st = sessionStatus(region);
            const indices = gDoc.sessions?.[region]?.indices || [];
            const idxH = indices.length ? indices.map(idx => {
                const c = (idx.change_pct || 0) >= 0 ? MH.bull : MH.bear;
                return `<span style="color:${c};font-size:0.82rem">${esc(idx.display || idx.symbol)} ${fmtPct(idx.change_pct)}</span>`;
            }).join(' &nbsp; ') : '<span style="color:#64748b">No data</span>';
            h += `<article class="mh-card"><div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:0.4rem"><span style="font-weight:700;color:${MH.text}">${region.charAt(0).toUpperCase() + region.slice(1)}</span><span style="font-size:0.72rem;padding:0.1rem 0.4rem;border-radius:5px;background:${st.bg};color:${st.color}">${st.text}</span></div><div>${idxH}</div></article>`;
        }
        h += '</div>';

        // ═══ Phase Distribution ═══
        const phaseG = { EARLY: [], MID: [], LATE: [], EXHAUSTED: [], REVERSAL_RISK: [], NEUTRAL: [] };
        Object.values(cards).forEach(c => { if (phaseG[c.phase]) phaseG[c.phase].push(c); });
        const total = Object.keys(cards).length || 1;
        h += card(`${secTitle('Trend Lifecycle Distribution')}
      <div class="mh-phase-bar">${Object.entries(phaseG).filter(([, v]) => v.length).map(([k, v]) => {
            const pct = (v.length / total * 100).toFixed(0);
            return `<div class="mh-phase-bar-seg" style="flex:${v.length};background:${PHASE_COLORS[k]}" title="${phaseLabel(k)}: ${v.length}">${pct}%</div>`;
        }).join('')}</div>
      <div style="display:flex;gap:0.6rem;flex-wrap:wrap;font-size:0.75rem">${Object.entries(phaseG).filter(([, v]) => v.length).map(([k, v]) =>
            `<span style="color:${PHASE_COLORS[k]}">${phaseLabel(k)}: ${v.length}</span>`).join('')}
      </div>`);

        // ═══ Leaders / Laggards ═══
        const sorted = Object.values(cards).sort((a, b) => b.score - a.score);
        h += '<div class="mh-grid-2">';
        h += card(`${secTitle('Leaders')}${sorted.slice(0, 3).map(c => cardRow(c)).join('')}`);
        h += card(`${secTitle('Laggards')}${sorted.slice(-3).reverse().map(c => cardRow(c)).join('')}`);
        h += '</div>';

        // ═══ Compass ═══
        if (compass) {
            h += card(`${secTitle('Investment Compass')}
        <div class="mh-grid-auto">
          <div><span style="color:${MH.muted};font-size:0.78rem">Composite</span><div style="color:${MH.text};font-weight:700;font-size:1.1rem">${compass.composite_score ?? '—'}/100</div></div>
          <div><span style="color:${MH.muted};font-size:0.78rem">Trend</span><div style="color:${(compass.trend_score || 0) >= 50 ? MH.bull : MH.bear};font-weight:600">${compass.trend_score ?? '—'}</div></div>
          <div><span style="color:${MH.muted};font-size:0.78rem">Risk</span><div style="color:${(compass.risk_score || 0) >= 50 ? MH.bull : MH.bear};font-weight:600">${compass.risk_score ?? '—'}</div></div>
          <div><span style="color:${MH.muted};font-size:0.78rem">Flows</span><div style="color:${(compass.flow_score || 0) >= 50 ? MH.bull : MH.bear};font-weight:600">${compass.flow_score ?? '—'}</div></div>
        </div>
        ${compass.summary ? `<div style="margin-top:0.5rem;font-size:0.82rem;color:${MH.muted}">${esc(compass.summary)}</div>` : ''}`);
        }

        // ═══ Inline Playbook (Opps + Danger) ═══
        const opps = Object.values(cards).filter(c => (c.phase === 'EARLY' || c.phase === 'MID') && c.score >= 50).sort((a, b) => b.score - a.score).slice(0, 5);
        const danger = Object.values(cards).filter(c => c.phase === 'REVERSAL_RISK' || c.phase === 'EXHAUSTED' || c.score < 35).sort((a, b) => a.score - b.score).slice(0, 5);
        h += '<div class="mh-grid-2">';
        h += card(`<div style="font-size:0.82rem;font-weight:700;color:${MH.bull};margin-bottom:0.4rem">Opportunities (${opps.length})</div>${opps.length ? opps.map(c => cardRow(c)).join('') : '<span style="color:#64748b">None in current regime.</span>'}`);
        h += card(`<div style="font-size:0.82rem;font-weight:700;color:${MH.bear};margin-bottom:0.4rem">Danger Zones (${danger.length})</div>${danger.length ? danger.map(c => cardRow(c)).join('') : '<span style="color:#64748b">None flagged.</span>'}`);
        h += '</div>';

        h += sourcesFooter('EODHD (derived)', asOf);
        panel.innerHTML = h;
    }

    // ── ASSET CLASSES (unified filterable table) ──
    function renderAssetClasses(panel) {
        const cards = getCards(), asOf = getAsOf();
        const allCards = Object.entries(cards).map(([k, v]) => ({ key: k, ...v }));
        if (!allCards.length) { panel.innerHTML = card('<span style="color:#64748b">No asset data.</span>'); return; }

        const filters = [
            { id: 'all', label: 'All', prefix: '' },
            { id: 'sectors', label: 'Sectors', prefix: 'SECTOR:' },
            { id: 'cmdty', label: 'Commodities', prefix: 'CMDTY:' },
            { id: 'crypto', label: 'Crypto', prefix: 'CRYPTO:' },
            { id: 'indices', label: 'Indices & FX', prefix: 'INDEX:', altPrefix: 'FX:' }
        ];

        let h = secTitle(`Asset Classes (${allCards.length})`);

        // Filter strip
        h += '<div class="mh-filter-strip">';
        filters.forEach((f, i) => {
            h += `<button class="mh-filter-btn${i === 0 ? ' mh-filter-active' : ''}" data-prefix="${esc(f.prefix)}" data-alt="${esc(f.altPrefix || '')}" onclick="window._mhFilterAssets(this)">${esc(f.label)}</button>`;
        });
        h += '</div>';

        // Unified table
        h += '<div style="overflow-x:auto"><table class="mh-table" id="mh-asset-table"><thead><tr>';
        h += '<th>Asset</th><th class="mh-center">Type</th><th class="mh-center">Score</th><th class="mh-center">Phase</th><th class="mh-center">Conf</th><th class="mh-right">Mom 20d</th><th class="mh-right">Vol Z</th>';
        h += '</tr></thead><tbody>';

        allCards.sort((a, b) => b.score - a.score).forEach(c => {
            const mc = (c.momentum?.m20 || 0) >= 0 ? MH.bull : MH.bear;
            const typeLabel = c.key.split(':')[0].toLowerCase();
            h += `<tr class="mh-asset-row" data-key="${esc(c.key)}">
        <td style="color:${MH.text};font-weight:600">${esc(c.name || c.key)}</td>
        <td class="mh-center" style="font-size:0.72rem;color:${MH.muted}">${esc(typeLabel)}</td>
        <td class="mh-center">${scorePill(c.score)}</td>
        <td class="mh-center">${phaseBadge(c.phase)}</td>
        <td class="mh-center">${confBadge(c.confidence)}</td>
        <td class="mh-right" style="color:${mc};font-weight:600">${(c.momentum?.m20 || 0).toFixed(2)}%</td>
        <td class="mh-right" style="color:${(c.vol_z || 0) > 1 ? MH.bear : MH.muted}">${(c.vol_z || 0).toFixed(2)}</td>
      </tr>`;
        });
        h += '</tbody></table></div>';
        h += sourcesFooter('EODHD (ETFs, Indices, Crypto, Forex)', asOf);
        panel.innerHTML = h;
    }

    window._mhFilterAssets = function (btn) {
        document.querySelectorAll('.mh-filter-btn').forEach(b => b.classList.remove('mh-filter-active'));
        btn.classList.add('mh-filter-active');
        const prefix = btn.dataset.prefix;
        const alt = btn.dataset.alt;
        document.querySelectorAll('.mh-asset-row').forEach(row => {
            const key = row.dataset.key;
            const show = !prefix || key.startsWith(prefix) || (alt && key.startsWith(alt));
            row.style.display = show ? '' : 'none';
        });
    };

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
            const flowKey = fd?.dir === 'up' ? 'bullish' : fd?.dir === 'down' ? 'bearish' : 'neutral';
            const fl = fd ? dictLabel('flow_direction', flowKey, fd.dir === 'up' ? 'Inflow' : 'Outflow') : '—';
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

    // ── RISK MONITOR (Regime + Breadth + Danger Zone) ──
    function renderRiskMonitor(panel) {
        const gDoc = getGDoc(), cards = getCards(), asOf = getAsOf();
        const rd = gDoc?.regime_details || {};
        const regime = gDoc?.regime_mode || 'NORMAL';
        const regCol = regime === 'CRISIS' ? MH.bear : regime === 'STRESS' ? MH.warn : MH.bull;
        let h = secTitle('Risk Monitor');

        // Regime detail
        h += card(`<div style="display:flex;justify-content:space-between;align-items:center">
      <div><div style="font-size:0.82rem;color:${MH.muted}">Market Regime</div>
        <div style="font-size:1.4rem;font-weight:700;color:${regCol}" title="${esc(dictTooltip('regime', regime))}">${dictLabel('regime', regime, regime)}</div></div>
      <div style="display:grid;gap:0.3rem;text-align:right">
        <div style="font-size:0.78rem"><span style="color:${MH.muted}">Breadth Z:</span> <span style="color:${(rd.breadth_z || 0) < -1 ? MH.bear : MH.text};font-weight:600">${rd.breadth_z?.toFixed(2) || '—'}</span></div>
        <div style="font-size:0.78rem"><span style="color:${MH.muted}">Credit Z:</span> <span style="color:${(rd.credit_z || 0) > 1.5 ? MH.bear : MH.text};font-weight:600">${rd.credit_z?.toFixed(2) || '—'}</span></div>
        <div style="font-size:0.78rem"><span style="color:${MH.muted}">Vol Z:</span> <span style="color:${(rd.vol_z || 0) > 1.5 ? MH.bear : MH.text};font-weight:600">${rd.vol_z?.toFixed(2) || '—'}</span></div>
      </div></div>`);

        // Breadth
        const pulse = gDoc?.us_pulse;
        if (pulse) {
            const total = (pulse.breadth_up || 0) + (pulse.breadth_down || 0);
            const upPct = total > 0 ? ((pulse.breadth_up / total) * 100).toFixed(0) : 50;
            h += card(`${secTitle('Market Breadth')}
        <div class="mh-breadth-bar"><div style="flex:${pulse.breadth_up || 1};background:${MH.bull};display:flex;align-items:center;justify-content:center;font-size:0.65rem;color:#fff">▲ ${pulse.breadth_up || 0}</div><div style="flex:${pulse.breadth_down || 1};background:${MH.bear};display:flex;align-items:center;justify-content:center;font-size:0.65rem;color:#fff">▼ ${pulse.breadth_down || 0}</div></div>
        <div style="font-size:0.78rem;color:${MH.muted}">${upPct}% advancing | Risk Mode: <span style="color:${pulse.risk_mode === 'risk-on' ? MH.bull : MH.bear};font-weight:600">${esc(pulse.risk_mode || '—')}</span> | Coverage: ${Number(pulse.symbols_covered || 0).toLocaleString()}</div>`);
        }

        // Danger Zone
        const riskAssets = Object.values(cards).filter(c => c.phase === 'REVERSAL_RISK' || c.phase === 'EXHAUSTED').sort((a, b) => a.score - b.score);
        if (riskAssets.length) {
            h += card(`${secTitle('Danger Zone — Exhausted / Reversal Risk')}${riskAssets.map(c => cardRow(c)).join('')}`);
        }

        // Hedges
        const hedges = Object.values(cards).filter(c => c.type === 'commodity' || c.id?.startsWith('FX:')).filter(c => c.score >= 55).sort((a, b) => b.score - a.score).slice(0, 5);
        if (hedges.length) {
            h += card(`${secTitle('Potential Hedges (Score ≥ 55)')}${hedges.map(c => cardRow(c)).join('')}`);
        }

        if (regime !== 'NORMAL') {
            h += card(`<div style="color:${MH.warn};font-size:0.82rem">Regime is <strong>${regime}</strong> — all scores dampened. Reduce exposure and favor hedges.</div>`);
        }

        h += `<div style="font-size:0.72rem;color:${MH.muted};margin-top:0.5rem;font-style:italic">Not financial advice. Quantitative signals for informational purposes only.</div>`;
        h += sourcesFooter('EODHD + Derived breadth', asOf);
        panel.innerHTML = h;
    }

    // ── HELP (Methodology + Glossary combined) ──
    function renderHelp(panel) {
        let h = secTitle('Methodology & Glossary');
        h += card(`<div style="font-size:0.88rem;font-weight:700;color:${MH.text};margin-bottom:0.6rem">Score Schema (0-100)</div>
        <div style="font-size:0.8rem;color:${MH.muted};line-height:1.6">
          <p><strong>Formula:</strong> <span class="mh-code">score = clamp(50 + 50 × weighted_sum, 0, 100)</span></p>
          <p><strong>Components:</strong> Momentum (m20/m60/m200), Flow Direction, Volatility Z-score, Macro proxy, Valuation proxy</p>
        </div>`);
        h += card(`<div style="font-size:0.88rem;font-weight:700;color:${MH.text};margin-bottom:0.6rem">Phase Classification</div>
        <div style="font-size:0.8rem;color:${MH.muted};line-height:1.6;display:grid;gap:0.3rem">
          ${['EARLY', 'MID', 'LATE', 'EXHAUSTED', 'REVERSAL_RISK', 'NEUTRAL'].map(p =>
            `<div>${phaseBadge(p)} ${esc(dictTooltip('phase', p) || p)}</div>`).join('\n          ')}
        </div>`);
        h += card(`<div style="font-size:0.88rem;font-weight:700;color:${MH.text};margin-bottom:0.6rem">Regime Engine</div>
        <div style="font-size:0.8rem;color:${MH.muted};line-height:1.6">
          ${['NORMAL', 'STRESS', 'CRISIS'].map(r =>
            `<p><strong>${dictLabel('regime', r, r)}:</strong> ${esc(dictTooltip('regime', r) || r)}</p>`).join('\n          ')}
        </div>`);
        // Glossary
        const terms = [
            ['Score (0-100)', '0-30 bearish, 30-70 neutral, 70-100 bullish. Composite of momentum, flows, risk, macro.'],
            ['Phase', 'EARLY → MID → LATE → EXHAUSTED → REVERSAL_RISK. Trend lifecycle.'],
            ['Confidence', 'HIGH/MEDIUM/LOW — signal agreement × data quality.'],
            ['Regime', 'NORMAL / STRESS / CRISIS. Dampens scores in stress conditions.'],
            ['Momentum', 'Price change over 20/60/200 days. Positive = uptrend.'],
            ['Vol Z', 'Volatility z-score. >1.5 = elevated.'],
            ['Breadth Z', 'Market breadth z-score. Negative = more decliners.'],
            ['Flow Direction', 'Inflow/Outflow from multi-day price trends. Proxy only.'],
            ['Capital Rotation Score', 'Global 0-100 aggregate of macro regime, risk appetite, sector breadth.'],
            ['RAM', 'Risk-Adjusted Momentum — return / rolling volatility.'],
            ['Divergence', 'When related signals disagree. Reduces confidence.'],
            ['Exhaustion Gauge', 'Composite measure of trend fuel remaining. 100=strong, 0=near reversal.'],
        ];
        h += card(`${secTitle('Glossary')}${terms.map(([term, desc]) =>
            `<div style="padding:0.4rem 0;border-bottom:1px solid ${MH.border}"><div style="font-weight:700;color:${MH.text};font-size:0.85rem">${esc(term)}</div><div style="font-size:0.78rem;color:${MH.muted};margin-top:0.1rem">${esc(desc)}</div></div>`
        ).join('')}`);
        h += card(`<div style="font-size:0.8rem;color:${MH.muted};line-height:1.6">
          <strong>Data Sources:</strong> EODHD (prices, ETFs, indices). Derived: price-flows, breadth (~2,450 US stocks).
          <br><strong>Limitations:</strong> No real fund-flows, no options/skew data, no COT positioning.
        </div>`);
        panel.innerHTML = h;
    }

    // ═══ CAPITAL ROTATION MONITOR (Money Flow) ═══

    const RATIO_NAMES = {
        SPY_GLD: 'S&P 500 / Gold', SPY_TLT: 'S&P 500 / Treasuries', QQQ_DIA: 'Nasdaq / Dow',
        BTC_GLD: 'Bitcoin / Gold', GLD_UUP: 'Gold / Dollar', HYG_LQD: 'High Yield / IG Credit',
        VWO_SPY: 'Emerging Mkts / S&P', SPY_VGK: 'S&P 500 / Europe',
        XLK_XLP: 'Tech / Staples', SOXX_XLU: 'Semis / Utilities', XLY_XLP: 'Discret. / Staples',
        XLE_XLU: 'Energy / Utilities', XLF_SPY: 'Financials / S&P', XLI_XLP: 'Industrials / Staples',
        XLV_XLU: 'Healthcare / Utilities', XLK_RSP: 'Tech / Equal Wt S&P',
        QQQ_SPY: 'Nasdaq / S&P 500', IWM_SPY: 'Small Cap / Large Cap',
        IVW_IVE: 'Growth / Value', SMH_SPY: 'Semis / S&P 500'
    };

    function rotHeatmapCell(val, label) {
        if (val == null) return `<td class="mh-center" style="background:${MH.neutral}22;color:${MH.muted};font-size:0.72rem;padding:0.3rem" data-sort="-1">—</td>`;
        const pct = Number(val) || 0;
        const c = pct >= 60 ? MH.blue : pct <= 40 ? MH.orange : MH.neutral;
        const arrow = pct >= 55 ? '▲' : pct <= 45 ? '▼' : '—';
        return `<td class="mh-center" style="background:${c}18;color:${c};font-size:0.74rem;font-weight:600;padding:0.35rem" title="${esc(label)}: ${pct}" data-sort="${pct}">${pct} ${arrow}</td>`;
    }

    function rotConfirmCard(key, conf) {
        if (!conf) return '';
        const c = conf.supportsRotation === 'yes' ? MH.bull : conf.supportsRotation === 'no' ? MH.bear : MH.neutral;
        const icon = conf.supportsRotation === 'yes' ? '✓' : conf.supportsRotation === 'no' ? '✗' : '~';
        return `<div style="background:${MH.surface};border:1px solid ${MH.border};border-left:3px solid ${c};border-radius:6px;padding:0.5rem 0.7rem;font-size:0.78rem">
      <div style="color:${MH.text};font-weight:600">${icon} ${esc(key)}</div>
      <div style="color:${c};font-size:0.72rem">${esc(conf.state || conf.direction)}</div>
      <div style="color:${MH.muted};font-size:0.65rem">Strength: ${((conf.strength || 0) * 100).toFixed(0)}%</div>
    </div>`;
    }

    function rotBuildSectorSVG(sectorRel) {
        if (!sectorRel || !Object.keys(sectorRel).length) return '<div style="color:#64748b;font-size:0.82rem">No sector relative data.</div>';
        const W = 380, H = 280, PAD = 45;
        const entries = Object.entries(sectorRel);
        let svg = `<svg viewBox="0 0 ${W} ${H}" style="width:100%;max-width:${W}px;height:auto;font-family:monospace">`;
        svg += `<rect x="0" y="0" width="${W}" height="${H}" fill="${MH.panel}" rx="6"/>`;
        const cx = PAD, cy = PAD, cw = W - 2 * PAD, ch = H - 2 * PAD;
        svg += `<line x1="${cx}" y1="${cy + ch / 2}" x2="${cx + cw}" y2="${cy + ch / 2}" stroke="${MH.border}" stroke-width="1"/>`;
        svg += `<line x1="${cx + cw / 2}" y1="${cy}" x2="${cx + cw / 2}" y2="${cy + ch}" stroke="${MH.border}" stroke-width="1"/>`;
        svg += `<text x="${cx + cw * 0.75}" y="${cy + 14}" fill="${MH.muted}" font-size="9" text-anchor="middle">Leading</text>`;
        svg += `<text x="${cx + cw * 0.25}" y="${cy + 14}" fill="${MH.muted}" font-size="9" text-anchor="middle">Improving</text>`;
        svg += `<text x="${cx + cw * 0.75}" y="${cy + ch - 4}" fill="${MH.muted}" font-size="9" text-anchor="middle">Weakening</text>`;
        svg += `<text x="${cx + cw * 0.25}" y="${cy + ch - 4}" fill="${MH.muted}" font-size="9" text-anchor="middle">Lagging</text>`;
        svg += `<text x="${cx + cw / 2}" y="${H - 4}" fill="${MH.muted}" font-size="8" text-anchor="middle">RS Score →</text>`;
        svg += `<text x="10" y="${cy + ch / 2}" fill="${MH.muted}" font-size="8" text-anchor="middle" transform="rotate(-90,10,${cy + ch / 2})">Momentum →</text>`;
        for (const [id, s] of entries) {
            const x = cx + (Math.max(0, Math.min(100, s.rsScore)) / 100) * cw;
            const y = cy + ch - (Math.max(0, Math.min(100, s.momScore)) / 100) * ch;
            const dotC = s.rsScore >= 50 ? (s.momScore >= 50 ? MH.bull : MH.warn) : (s.momScore >= 50 ? MH.blue : MH.bear);
            const label = (s.displayName || id).replace(/ \/.*/g, '').slice(0, 8);
            svg += `<circle cx="${x}" cy="${y}" r="5" fill="${dotC}" opacity="0.85"><title>${esc(s.displayName)} | RS:${s.rsScore} Mom:${s.momScore} | ${s.quadrant}</title></circle>`;
            svg += `<text x="${x}" y="${y - 8}" fill="${MH.text}" font-size="7" text-anchor="middle">${esc(label)}</text>`;
        }
        svg += '</svg>';
        return svg;
    }

    /** Build flow intelligence summary from rotation data */
    function buildFlowIntel(rd) {
        const ratios = rd.ratios || {};
        const blocks = rd.blocks || {};
        const cycle = rd.cycle || {};
        const gs = rd.globalScore || {};
        const lines = [];

        // 1) Where is money flowing?
        const sorted = Object.entries(ratios).filter(([, r]) => r.composite != null).sort(([, a], [, b]) => b.composite - a.composite);
        const top3 = sorted.slice(0, 3);
        const bot3 = sorted.slice(-3).reverse();
        if (top3.length) {
            const names = top3.map(([id]) => RATIO_NAMES[id] || id.replace(/_/g, '/')).join(', ');
            lines.push(`<span style="color:${MH.bull}">Gaining strength:</span> ${esc(names)}`);
        }
        if (bot3.length) {
            const names = bot3.map(([id]) => RATIO_NAMES[id] || id.replace(/_/g, '/')).join(', ');
            lines.push(`<span style="color:${MH.bear}">Losing strength:</span> ${esc(names)}`);
        }

        // 2) How long? Trend strength
        const topId = top3[0]?.[0];
        const topR = topId ? ratios[topId] : null;
        if (topR) {
            const ret1m = topR.returns?.['21'];
            const ret3m = topR.returns?.['63'];
            const ret6m = topR.returns?.['126'];
            let duration = 'short-term';
            if (ret6m != null && ret6m > 0.02 && ret3m != null && ret3m > 0.01) duration = '3-6 months';
            else if (ret3m != null && ret3m > 0.01) duration = '1-3 months';
            const strength = topR.composite >= 70 ? 'strong' : topR.composite >= 55 ? 'moderate' : 'weak';
            lines.push(`Trend: <span style="color:${MH.text}">${esc(strength)}</span>, running ~${esc(duration)}`);
        }

        // 3) Cycle position
        if (cycle.state && cycle.state !== 'Neutral / Undefined') {
            const cycC = cycle.state.includes('Early') ? MH.blue : cycle.state.includes('Mid') ? MH.bull : cycle.state.includes('Late') ? MH.warn : MH.bear;
            lines.push(`Cycle: <span style="color:${cycC}">${esc(cycle.state)}</span>`);
        }

        // 4) Oversold sectors to watch (low composite = potential next rotation target)
        const sectorRatios = Object.entries(ratios).filter(([, r]) => r.category === 'sector' && r.composite != null);
        const oversold = sectorRatios.filter(([, r]) => r.composite <= 35).sort(([, a], [, b]) => a.composite - b.composite);
        if (oversold.length) {
            const names = oversold.slice(0, 3).map(([id]) => RATIO_NAMES[id] || id.replace(/_/g, '/')).join(', ');
            lines.push(`<span style="color:${MH.orange}">Watch (oversold):</span> ${names}`);
        }

        return lines;
    }

    // ═══ EXPERIMENTAL VISUALIZATIONS ═══

    const VIZ_OPTIONS = [
        { id: 'ladder', label: 'Leadership Ladder' },
        { id: 'sankey', label: 'Sankey Flow Map' },
        { id: 'rotationMap', label: 'Rotation & Opportunity Map' },
        { id: 'cycleBar', label: 'Cycle Progress Bar' },
        { id: 'timeline', label: 'Flow Story Timeline' }
    ];

    function _vizToggles() {
        try { return JSON.parse(localStorage.getItem('mh_viz_toggles') || '{}'); } catch { return {}; }
    }

    function rotVizTogglePanel() {
        const t = _vizToggles();
        let h = '<details class="mh-viz-toggle-panel"><summary>Experimental Visualizations (toggle to preview)</summary>';
        h += '<div class="mh-viz-toggle-grid">';
        VIZ_OPTIONS.forEach(o => {
            h += `<label><input type="checkbox" data-viz="${o.id}" ${t[o.id] ? 'checked' : ''} onchange="window._mhVizToggle('${o.id}',this.checked)"/> ${esc(o.label)}</label>`;
        });
        h += '</div></details>';
        return h;
    }

    window._mhVizToggle = function (id, on) {
        const t = _vizToggles();
        t[id] = on;
        localStorage.setItem('mh_viz_toggles', JSON.stringify(t));
        const el = document.getElementById('mh-viz-' + id);
        if (el) el.style.display = on ? 'block' : 'none';
    };

    // ── Traffic-light keyword coloring ──
    function _colorKeywords(text) {
        const green = ['buy', 'bullish', 'overbought', 'strength', 'strong', 'gaining', 'leading', 'positive', 'supporting', 'risk-on'];
        const red = ['sell', 'bearish', 'oversold', 'weakness', 'weak', 'losing', 'lagging', 'negative', 'conflicting', 'risk-off', 'erosion', 'deteriorating', 'caution'];
        const yellow = ['wait', 'neutral', 'mixed', 'sideways', 'unclear', 'conflicted', 'quiet'];
        let out = text;
        green.forEach(w => { out = out.replace(new RegExp(`(\\b)(${w})(\\b)`, 'gi'), `$1<span style="color:${MH.bull};font-weight:700">$2</span>$3`); });
        red.forEach(w => { out = out.replace(new RegExp(`(\\b)(${w})(\\b)`, 'gi'), `$1<span style="color:${MH.bear};font-weight:700">$2</span>$3`); });
        yellow.forEach(w => { out = out.replace(new RegExp(`(\\b)(${w})(\\b)`, 'gi'), `$1<span style="color:${MH.warn};font-weight:700">$2</span>$3`); });
        return out;
    }

    // ── Insight helper: generates a live one-liner conclusion for each section ──
    function _insightBox(text) {
        return `<div style="margin-bottom:0.5rem;padding:0.4rem 0.6rem;background:${MH.faint};border-left:3px solid ${MH.blue};border-radius:4px;font-size:0.74rem;color:${MH.text};line-height:1.4">${_colorKeywords(text)}</div>`;
    }

    function _heatmapInsight(rd) {
        const ratios = rd.ratios || {};
        const sorted = Object.entries(ratios).filter(([, r]) => r.composite != null).sort(([, a], [, b]) => b.composite - a.composite);
        if (!sorted.length) return '';
        const top = sorted[0], bot = sorted[sorted.length - 1];
        const topName = RATIO_NAMES[top[0]] || top[0], botName = RATIO_NAMES[bot[0]] || bot[0];
        const topR = top[1], botR = bot[1];
        // Trend duration estimate
        const ret6m = topR.returns?.['126'], ret3m = topR.returns?.['63'], ret1m = topR.returns?.['21'];
        let duration = 'short term (< 1 month)';
        if (ret6m != null && ret6m > 0.03 && ret3m != null && ret3m > 0.02) duration = 'built over ~3-6 months';
        else if (ret3m != null && ret3m > 0.01) duration = 'building for ~1-3 months';
        // Trend maturity
        const zAbs = Math.abs(topR.zScore || 0);
        let maturity = 'early in trend';
        if (zAbs > 2) maturity = 'extended (elevated reversal risk)';
        else if (zAbs > 1.2) maturity = 'mid-cycle';
        // Weak side
        const botZ = Math.abs(botR.zScore || 0);
        const botWatch = botZ > 1.5 ? ` — ${botName} is oversold and may become the next rotation candidate` : '';
        return _insightBox(`Strongest rotation: <strong>${esc(topName)}</strong> (Score ${topR.composite}), trend ${duration}, ${maturity}.<br>Weakest: <strong>${esc(botName)}</strong> (${botR.composite})${botWatch}.`);
    }

    function _narrativeInsight(rd) {
        const gs = rd.globalScore || {};
        const divs = rd.divergences || [];
        const sc = gs.value ?? 50;
        let phase = sc >= 65 ? 'bullish' : sc <= 35 ? 'bearish' : 'neutral';
        let signal = divs.length ? ` Warning: ${divs.length} divergence(s) active — signal picture is not clean.` : ' No active divergences.';
        return _insightBox(`Big picture: market is currently <strong>${phase}</strong> (${sc}/100).${signal} Historically, neutral phases often last 2-8 weeks before direction firms.`);
    }

    function _cycleInsight(rd) {
        const cyc = rd.cycle || {};
        const conf = cyc.confidence ?? 0;
        const state = cyc.state || 'Undefined';
        if (state.includes('Neutral') || state.includes('Undefined')) return _insightBox('No clear cycle signal — market positioning is mixed with no dominant rotation direction.');
        const early = state.includes('Early');
        const late = state.includes('Late') || state.includes('Exhausted');
        if (early) return _insightBox(`Early rotation phase (Conf: ${conf}) — early signals often precede 2-4 months of trend continuation if breadth confirms.`);
        if (late) return _insightBox(`Late phase / exhaustion (Conf: ${conf}) — rotations often resolve within 2-6 weeks. Watch candidates may become next leadership.`);
        return _insightBox(`Cycle: ${esc(state)} (Conf: ${conf}) — trend is active, but divergences can warn of a phase shift.`);
    }

    function _confirmInsight(rd) {
        const confs = rd.confirmations || {};
        const supporting = Object.entries(confs).filter(([, c]) => c.supportsRotation === 'yes');
        const against = Object.entries(confs).filter(([, c]) => c.supportsRotation === 'no');
        if (supporting.length > against.length) return _insightBox(`Confirmation mostly positive (${supporting.length} of ${Object.keys(confs).length} signals supportive) — backdrop supports current rotation.`);
        if (against.length > supporting.length) return _insightBox(`Confirmation mostly negative (${against.length} conflicting) — caution, macro backdrop works against rotation.`);
        return _insightBox('Confirmation mixed — no clear support or conflict from credit, dollar, or volatility. Wait recommended.');
    }

    function _divInsight(rd) {
        const divs = rd.divergences || [];
        if (!divs.length) return _insightBox('No divergences — signals are aligned, improving score reliability.');
        const titles = divs.map(d => d.title).join(', ');
        return _insightBox(`${divs.length} active divergence(s): ${esc(titles)} — pressure is building under the surface. Breadth erosion often precedes trend shifts by 4-8 weeks.`);
    }

    // ── Leadership Ladder ──
    function rotVizLadder(rd) {
        const ratios = rd.ratios || {};
        const sorted = Object.entries(ratios).filter(([, r]) => r.composite != null).sort(([, a], [, b]) => b.composite - a.composite);
        const top5 = sorted.slice(0, 5);
        const bot5 = sorted.slice(-5).reverse();

        function horizLabel(r) {
            const ret = r.returns || {};
            if (ret['126'] != null && Math.abs(ret['126']) > Math.abs(ret['63'] || 0)) return '6M';
            if (ret['63'] != null && Math.abs(ret['63']) > Math.abs(ret['21'] || 0)) return '3M';
            return '1M';
        }

        function renderCol(items, color, title) {
            let h = `<div class="mh-viz-ladder-col"><h4 style="color:${color}">${title}</h4>`;
            items.forEach(([id, r]) => {
                const name = RATIO_NAMES[id] || id.replace(/_/g, '/');
                h += `<div class="mh-viz-ladder-item" style="background:${color}10;border-left:3px solid ${color}">`;
                h += `<div><span style="color:${MH.text};font-weight:600">${esc(name)}</span> <span style="color:${MH.muted};font-size:0.68rem">${esc(r.category)} · ${horizLabel(r)}</span></div>`;
                h += scorePill(r.composite);
                h += '</div>';
            });
            h += '</div>';
            return h;
        }

        // Insight first
        const topName = top5[0] ? (RATIO_NAMES[top5[0][0]] || top5[0][0]) : '—';
        const botName = bot5[0] ? (RATIO_NAMES[bot5[0][0]] || bot5[0][0]) : '—';
        const topR = top5[0]?.[1], botR = bot5[0]?.[1];
        const spread = (topR?.composite || 50) - (botR?.composite || 50);
        let h = secTitle('Leadership Ladder');
        h += _insightBox(`Fuehrungsspread: ${spread} Punkte zwischen ${esc(topName)} und ${esc(botName)} — ${spread > 40 ? 'sehr breiter Spread, klare Rotationsrichtung' : spread > 20 ? 'moderater Spread, Rotation aktiv aber nicht extrem' : 'enger Spread, keine klare Fuehrung'}.`);
        h += '<div class="mh-viz-ladder">' + renderCol(top5, MH.bull, 'Top Rotations') + renderCol(bot5, MH.bear, 'Weakest') + '</div>';
        return h;
    }

    // ── Sankey Flow Map (with timeframe switcher) ──
    const SANKEY_TIMEFRAMES = [
        { id: '5', label: '1W', window: 5 },
        { id: '21', label: '1M', window: 21 },
        { id: '63', label: '3M', window: 63 },
        { id: '126', label: '6M', window: 126 },
        { id: '252', label: '1J', window: 252 },
        { id: '756', label: '3J', window: 756 }
    ];

    window._mhSankeyTf = function (tf) {
        localStorage.setItem('mh_sankey_tf', tf);
        // Re-render sankey container
        const el = document.getElementById('mh-sankey-inner');
        if (el && window._mhRotationDoc) {
            el.innerHTML = _buildSankeySvg(window._mhRotationDoc, tf);
        }
        // Update active button
        document.querySelectorAll('.mh-sankey-tf-btn').forEach(btn => {
            btn.style.background = btn.dataset.tf === tf ? MH.blue + '22' : 'transparent';
            btn.style.color = btn.dataset.tf === tf ? MH.blue : MH.muted;
        });
    };

    function _getSankeyTimeframe() {
        const saved = localStorage.getItem('mh_sankey_tf');
        if (saved && SANKEY_TIMEFRAMES.find(t => t.id === saved)) return saved;
        // Smart default: pick longest available window with data
        return '63'; // 3M default
    }

    function _buildSankeySvg(rd, tf) {
        const ratios = rd.ratios || {};
        const gs = rd.globalScore || {};
        const win = tf || '63';

        // Classify gainers/losers based on selected timeframe return
        const entries = Object.entries(ratios).filter(([, r]) => r.composite != null);
        const withReturn = entries.map(([id, r]) => {
            const ret = r.returns?.[win];
            const score = ret != null ? 50 + ret * 500 : r.composite; // scale return to pseudo-score
            return [id, r, score];
        });
        withReturn.sort(([,, a], [,, b]) => b - a);
        const gainers = withReturn.filter(([,, s]) => s > 55);
        const losers = withReturn.filter(([,, s]) => s < 45).reverse();

        const W = 600, nodeH = 22, gap = 6;
        const maxNodes = Math.max(gainers.length, losers.length, 1);
        const H = Math.max(200, maxNodes * (nodeH + gap) + 80);
        const leftX = 10, midX = W / 2, rightX = W - 160;

        let svg = `<svg viewBox="0 0 ${W} ${H}" class="mh-viz-sankey">`;
        svg += `<rect x="0" y="0" width="${W}" height="${H}" fill="${MH.panel}" rx="6"/>`;

        const regC = gs.regime === 'Bullish' ? MH.bull : gs.regime === 'Bearish' ? MH.bear : MH.neutral;
        const regY = H / 2 - 20;
        svg += `<rect x="${midX - 50}" y="${regY}" width="100" height="40" fill="${regC}" opacity="0.2" rx="6" stroke="${regC}" stroke-width="1"/>`;
        svg += `<text x="${midX}" y="${regY + 18}" fill="${regC}" font-size="10" font-weight="700" text-anchor="middle">${esc(gs.regime || 'Neutral')}</text>`;
        svg += `<text x="${midX}" y="${regY + 30}" fill="${MH.muted}" font-size="7" text-anchor="middle">Score: ${gs.value ?? 50}</text>`;

        const tfLabel = SANKEY_TIMEFRAMES.find(t => t.id === win)?.label || win;
        svg += `<text x="${leftX}" y="16" fill="${MH.bear}" font-size="9" font-weight="700">Losing (${tfLabel})</text>`;
        svg += `<text x="${rightX}" y="16" fill="${MH.bull}" font-size="9" font-weight="700">Gaining (${tfLabel})</text>`;

        losers.forEach(([id, r, score], i) => {
            const name = RATIO_NAMES[id] || id.replace(/_/g, '/');
            const y = 30 + i * (nodeH + gap);
            const w = Math.max(20, (50 - score) * 2.5);
            svg += `<rect x="${leftX}" y="${y}" width="${w}" height="${nodeH}" fill="${MH.bear}" opacity="0.4" rx="3"/>`;
            svg += `<text x="${leftX + w + 4}" y="${y + nodeH / 2 + 3}" fill="${MH.muted}" font-size="7">${esc(name)} (${r.composite})</text>`;
            const pathMidY = regY + 20;
            svg += `<path d="M ${leftX + w} ${y + nodeH / 2} C ${midX - 80} ${y + nodeH / 2}, ${midX - 80} ${pathMidY}, ${midX - 50} ${pathMidY}" fill="none" stroke="${MH.bear}" stroke-width="${Math.max(1, (50 - score) / 10)}" opacity="0.3"/>`;
        });

        gainers.forEach(([id, r, score], i) => {
            const name = RATIO_NAMES[id] || id.replace(/_/g, '/');
            const y = 30 + i * (nodeH + gap);
            const w = Math.max(20, (score - 50) * 2.5);
            svg += `<rect x="${rightX + 150 - w}" y="${y}" width="${w}" height="${nodeH}" fill="${MH.bull}" opacity="0.4" rx="3"/>`;
            svg += `<text x="${rightX + 150 - w - 4}" y="${y + nodeH / 2 + 3}" fill="${MH.muted}" font-size="7" text-anchor="end">${esc(name)} (${r.composite})</text>`;
            const pathMidY = regY + 20;
            svg += `<path d="M ${rightX + 150 - w} ${y + nodeH / 2} C ${midX + 80} ${y + nodeH / 2}, ${midX + 80} ${pathMidY}, ${midX + 50} ${pathMidY}" fill="none" stroke="${MH.bull}" stroke-width="${Math.max(1, (score - 50) / 10)}" opacity="0.3"/>`;
        });

        svg += '</svg>';
        return svg + `<div style="font-size:0.68rem;color:${MH.muted};margin-top:0.3rem">${gainers.length} gaining, ${losers.length} losing in ${tfLabel} window.</div>`;
    }

    function rotVizSankey(rd) {
        window._mhRotationDoc = rd;
        const tf = _getSankeyTimeframe();

        let h = secTitle('Sankey Flow Map');
        // Timeframe switcher
        h += `<div style="display:flex;gap:0.3rem;margin-bottom:0.4rem;align-items:center">`;
        h += `<span style="font-size:0.68rem;color:${MH.muted};margin-right:0.3rem">Zeitraum:</span>`;
        SANKEY_TIMEFRAMES.forEach(t => {
            const active = t.id === tf;
            h += `<button class="mh-sankey-tf-btn" data-tf="${t.id}" onclick="window._mhSankeyTf('${t.id}')" style="padding:0.15rem 0.45rem;font-size:0.7rem;border-radius:4px;border:1px solid ${MH.dim};cursor:pointer;font-family:inherit;font-weight:600;background:${active ? MH.blue + '22' : 'transparent'};color:${active ? MH.blue : MH.muted}">${t.label}</button>`;
        });
        h += `</div>`;
        h += `<div style="font-size:0.62rem;color:${MH.warn};margin-bottom:0.3rem">Relative rotation, not direct fund flows.</div>`;
        h += `<div id="mh-sankey-inner">${_buildSankeySvg(rd, tf)}</div>`;
        return h;
    }

    // ── Rotation & Opportunity Map (Combined: Sector Momentum + Opp/Risk) ──
    function rotVizRotationMap(rd) {
        const sectorRel = rd.sectorRelative || {};
        const ratios = rd.ratios || {};

        // Build unified dataset: use sectorRelative as primary, add macro/style ratios that are NOT already represented
        const sectorIds = new Set(Object.keys(sectorRel));
        const unifiedEntries = [];

        // Add sector-relative entries (deduplicated)
        const seenLabels = new Set();
        for (const [id, s] of Object.entries(sectorRel)) {
            const label = (s.displayName || id).split(' / ')[0].trim();
            if (seenLabels.has(label)) continue; // skip duplicates like 2x Tech
            seenLabels.add(label);
            unifiedEntries.push({
                id, label, fullName: s.displayName || id,
                rs: s.rsScore, mom: s.momScore, quadrant: s.quadrant,
                composite: ratios[id]?.composite ?? s.rsScore,
                zScore: ratios[id]?.zScore ?? 0,
                trendScore: ratios[id]?.trendScore ?? 50,
                category: ratios[id]?.category || 'sector',
                source: 'sector'
            });
        }

        // Add non-sector ratios that aren't already in (macro, style)
        for (const [id, r] of Object.entries(ratios)) {
            if (sectorIds.has(id)) continue;
            if (r.composite == null) continue;
            const label = (RATIO_NAMES[id] || id).split(' / ')[0].trim();
            if (seenLabels.has(label)) continue;
            seenLabels.add(label);
            // Map composite/zScore to RS/Mom axes
            const rs = r.composite;
            const mom = clamp(50 + (r.ram || 0) * 3, 0, 100);
            const quad = rs >= 50 ? (mom >= 50 ? 'Leading' : 'Weakening') : (mom >= 50 ? 'Improving' : 'Lagging');
            unifiedEntries.push({
                id, label, fullName: RATIO_NAMES[id] || id.replace(/_/g, '/'),
                rs, mom, quadrant: quad,
                composite: r.composite, zScore: r.zScore || 0,
                trendScore: r.trendScore || 50, category: r.category || '—',
                source: 'ratio'
            });
        }

        if (!unifiedEntries.length) return secTitle('Rotation & Opportunity Map') + `<div style="color:${MH.muted}">No data.</div>`;

        const W = 520, H = 400, PAD = 55;
        let svg = `<svg viewBox="0 0 ${W} ${H}" class="mh-viz-opprisk">`;
        svg += `<rect x="0" y="0" width="${W}" height="${H}" fill="${MH.panel}" rx="6"/>`;
        const cx = PAD, cy = PAD, cw = W - 2 * PAD, ch = H - 2 * PAD;

        // Quadrant fills
        svg += `<rect x="${cx}" y="${cy}" width="${cw / 2}" height="${ch / 2}" fill="${MH.blue}" opacity="0.04"/>`;
        svg += `<rect x="${cx + cw / 2}" y="${cy}" width="${cw / 2}" height="${ch / 2}" fill="${MH.bull}" opacity="0.06"/>`;
        svg += `<rect x="${cx}" y="${cy + ch / 2}" width="${cw / 2}" height="${ch / 2}" fill="${MH.bear}" opacity="0.06"/>`;
        svg += `<rect x="${cx + cw / 2}" y="${cy + ch / 2}" width="${cw / 2}" height="${ch / 2}" fill="${MH.warn}" opacity="0.04"/>`;

        svg += `<line x1="${cx}" y1="${cy + ch / 2}" x2="${cx + cw}" y2="${cy + ch / 2}" stroke="${MH.border}" stroke-width="1"/>`;
        svg += `<line x1="${cx + cw / 2}" y1="${cy}" x2="${cx + cw / 2}" y2="${cy + ch}" stroke="${MH.border}" stroke-width="1"/>`;

        // Quadrant labels (dual: momentum quadrant + opportunity quadrant)
        svg += `<text x="${cx + cw * 0.75}" y="${cy + 16}" fill="${MH.bull}" font-size="9" font-weight="700" text-anchor="middle" opacity="0.5">LEADING / STRONG</text>`;
        svg += `<text x="${cx + cw * 0.25}" y="${cy + 16}" fill="${MH.blue}" font-size="9" font-weight="700" text-anchor="middle" opacity="0.5">IMPROVING / WATCH</text>`;
        svg += `<text x="${cx + cw * 0.75}" y="${cy + ch - 6}" fill="${MH.warn}" font-size="9" font-weight="700" text-anchor="middle" opacity="0.5">WEAKENING / RISKY</text>`;
        svg += `<text x="${cx + cw * 0.25}" y="${cy + ch - 6}" fill="${MH.bear}" font-size="9" font-weight="700" text-anchor="middle" opacity="0.5">LAGGING / AVOID</text>`;

        svg += `<text x="${cx + cw / 2}" y="${H - 6}" fill="${MH.muted}" font-size="8" text-anchor="middle">Relative Strength / Composite Score →</text>`;
        svg += `<text x="12" y="${cy + ch / 2}" fill="${MH.muted}" font-size="8" text-anchor="middle" transform="rotate(-90,12,${cy + ch / 2})">Momentum Score →</text>`;

        // Plot entries with collision avoidance for labels
        const labelPositions = [];
        for (const e of unifiedEntries) {
            const x = cx + (clamp(e.rs, 0, 100) / 100) * cw;
            const y = cy + ch - (clamp(e.mom, 0, 100) / 100) * ch;
            const radius = e.source === 'sector' ? (4 + Math.abs(e.rs - 50) / 10) : 3.5;
            const dotC = e.rs >= 50 ? (e.mom >= 50 ? MH.bull : MH.warn) : (e.mom >= 50 ? MH.blue : MH.bear);
            const opacity = e.source === 'sector' ? '0.85' : '0.55';
            const stroke = e.source === 'sector' ? `stroke="${dotC}" stroke-width="1"` : `stroke="${MH.border}" stroke-width="0.5"`;

            // Reversal indicator ring for high z-score
            if (Math.abs(e.zScore) > 1.5) {
                svg += `<circle cx="${x}" cy="${y}" r="${radius + 4}" fill="none" stroke="${MH.warn}" stroke-width="1" stroke-dasharray="2,2" opacity="0.5"><title>High Z-Score: potential reversal</title></circle>`;
            }

            svg += `<circle cx="${x}" cy="${y}" r="${radius}" fill="${dotC}" opacity="${opacity}" ${stroke}><title>${esc(e.fullName)} | RS:${Math.round(e.rs)} Mom:${Math.round(e.mom)} | ${e.quadrant} | Z:${e.zScore.toFixed(2)} | ${e.category}</title></circle>`;

            // Smart label: avoid overlaps
            let ly = y - radius - 4;
            for (const lp of labelPositions) {
                if (Math.abs(lp.x - x) < 30 && Math.abs(lp.y - ly) < 10) ly = lp.y - 11;
            }
            labelPositions.push({ x, y: ly });
            const fs = e.source === 'sector' ? '8' : '6.5';
            const fc = e.source === 'sector' ? MH.text : MH.muted;
            svg += `<text x="${x}" y="${ly}" fill="${fc}" font-size="${fs}" font-weight="${e.source === 'sector' ? '600' : '400'}" text-anchor="middle">${esc(e.label)}</text>`;
        }

        svg += `<text x="${W - 6}" y="${H - 6}" fill="${MH.muted}" font-size="6" text-anchor="end">Not RRG™ — risk-adjusted momentum | Dashed ring = high reversal potential</text>`;
        svg += '</svg>';

        // Insight sentence
        const leading = unifiedEntries.filter(e => e.quadrant === 'Leading');
        const lagging = unifiedEntries.filter(e => e.quadrant === 'Lagging');
        const watchCandidates = unifiedEntries.filter(e => e.rs < 40 && Math.abs(e.zScore) > 1.2);
        let insight = `${leading.length} sectors/ratios lead, ${lagging.length} lag.`;
        if (watchCandidates.length) {
            insight += ` Watch: ${watchCandidates.map(e => e.label).join(', ')} — weak, but with elevated reversal potential (dashed rings).`;
        }

        let h = secTitle('Rotation & Opportunity Map');
        h += _insightBox(insight);
        h += `<div style="font-size:0.62rem;color:${MH.muted};margin-bottom:0.3rem">Sectors (large dots) + macro/style ratios (small dots) | Dashed ring = high reversal potential</div>` + svg;
        return h;
    }

    // ── Divergence Radar ──
    function rotVizDivRadar(rd) {
        const confs = rd.confirmations || {};
        const divs = rd.divergences || [];
        const ratios = rd.ratios || {};

        const axes = [
            { label: 'Credit', value: _confStrength(confs.credit) },
            { label: 'Dollar', value: _confStrength(confs.dollar) },
            { label: 'Volatility', value: _confStrength(confs.vix) },
            { label: 'Cycl. Breadth', value: _breadthScore(ratios) },
            { label: 'Growth Int.', value: _growthScore(ratios) },
            { label: 'Defensive', value: _defensiveScore(ratios) }
        ];

        const W = 300, H = 300, cx2 = W / 2, cy2 = H / 2, R = 110;
        const n = axes.length;
        let svg = `<svg viewBox="0 0 ${W} ${H}" class="mh-viz-radar">`;
        svg += `<rect x="0" y="0" width="${W}" height="${H}" fill="${MH.panel}" rx="6"/>`;

        [0.25, 0.5, 0.75, 1].forEach(pct => {
            let pts = [];
            for (let i = 0; i < n; i++) {
                const angle = -Math.PI / 2 + (2 * Math.PI * i) / n;
                pts.push(`${cx2 + Math.cos(angle) * R * pct},${cy2 + Math.sin(angle) * R * pct}`);
            }
            svg += `<polygon points="${pts.join(' ')}" fill="none" stroke="${MH.border}" stroke-width="0.5"/>`;
        });

        for (let i = 0; i < n; i++) {
            const angle = -Math.PI / 2 + (2 * Math.PI * i) / n;
            const lx = cx2 + Math.cos(angle) * (R + 18);
            const ly = cy2 + Math.sin(angle) * (R + 18);
            svg += `<line x1="${cx2}" y1="${cy2}" x2="${cx2 + Math.cos(angle) * R}" y2="${cy2 + Math.sin(angle) * R}" stroke="${MH.border}" stroke-width="0.5"/>`;
            svg += `<text x="${lx}" y="${ly + 3}" fill="${MH.muted}" font-size="7" text-anchor="middle">${axes[i].label}</text>`;
        }

        let dataPts = [];
        for (let i = 0; i < n; i++) {
            const angle = -Math.PI / 2 + (2 * Math.PI * i) / n;
            const v = clamp(axes[i].value, 0, 100) / 100;
            dataPts.push(`${cx2 + Math.cos(angle) * R * v},${cy2 + Math.sin(angle) * R * v}`);
        }
        svg += `<polygon points="${dataPts.join(' ')}" fill="${MH.blue}" fill-opacity="0.15" stroke="${MH.blue}" stroke-width="1.5"/>`;

        for (let i = 0; i < n; i++) {
            const angle = -Math.PI / 2 + (2 * Math.PI * i) / n;
            const v = clamp(axes[i].value, 0, 100) / 100;
            const dx = cx2 + Math.cos(angle) * R * v;
            const dy = cy2 + Math.sin(angle) * R * v;
            const dotC = axes[i].value >= 60 ? MH.bull : axes[i].value <= 40 ? MH.bear : MH.warn;
            svg += `<circle cx="${dx}" cy="${dy}" r="3.5" fill="${dotC}"><title>${axes[i].label}: ${axes[i].value}</title></circle>`;
        }

        if (divs.length) svg += `<text x="${cx2}" y="${H - 8}" fill="${MH.warn}" font-size="8" text-anchor="middle">${divs.length} divergence(s) active</text>`;
        svg += '</svg>';

        const weak = axes.filter(a => a.value < 40).map(a => a.label);
        const strong = axes.filter(a => a.value >= 60).map(a => a.label);
        let insight = '';
        if (weak.length && strong.length) insight = `Strength in ${strong.join(', ')} — but weakness in ${weak.join(', ')} shows internal conflict below the surface.`;
        else if (weak.length) insight = `Broad weakness in ${weak.join(', ')} — risk backdrop is deteriorating even if score still looks neutral.`;
        else if (strong.length) insight = `Broad strength in ${strong.join(', ')} — all dimensions support current trend.`;
        else insight = 'All dimensions near neutral — no clear outlier, wait stance preferred.';

        let h = secTitle('Divergence Radar');
        h += _insightBox(insight);
        h += svg;
        return h;
    }

    function _confStrength(conf) {
        if (!conf) return 50;
        const s = conf.strength || 0;
        return conf.supportsRotation === 'yes' ? 50 + s * 50 : conf.supportsRotation === 'no' ? 50 - s * 50 : 50;
    }
    function _breadthScore(ratios) {
        const sectorRatios = Object.values(ratios).filter(r => r.category === 'sector');
        if (!sectorRatios.length) return 50;
        return Math.round(sectorRatios.reduce((s, r) => s + (r.composite || 50), 0) / sectorRatios.length);
    }
    function _growthScore(ratios) {
        const growth = ['QQQ_DIA', 'QQQ_SPY', 'IVW_IVE'].map(k => ratios[k]?.composite).filter(v => v != null);
        return growth.length ? Math.round(growth.reduce((s, v) => s + v, 0) / growth.length) : 50;
    }
    function _defensiveScore(ratios) {
        const def = ['XLV_XLU', 'XLE_XLU', 'XLY_XLP'].map(k => ratios[k]?.composite).filter(v => v != null);
        return def.length ? Math.round(100 - def.reduce((s, v) => s + v, 0) / def.length) : 50;
    }

    // ── Cycle Progress Bar ──
    function rotVizCycleBar(rd) {
        const cyc = rd.cycle || {};
        const pct = cyc.positionPct ?? 50;
        const segments = [
            { label: 'Early', color: MH.blue, range: [0, 20] },
            { label: 'Mid', color: MH.bull, range: [20, 40] },
            { label: 'Late', color: MH.warn, range: [40, 60] },
            { label: 'Exhausted', color: MH.orange, range: [60, 80] },
            { label: 'Reversal', color: MH.bear, range: [80, 100] }
        ];

        let h = secTitle('Cycle Progress Bar');
        h += _cycleInsight(rd);
        h += '<div style="position:relative">';
        h += '<div class="mh-viz-cycle-track">';
        segments.forEach(s => {
            h += `<div class="mh-viz-cycle-seg" style="background:${s.color}44" title="${s.label}: ${s.range[0]}-${s.range[1]}">${s.label}</div>`;
        });
        h += `<div class="mh-viz-cycle-marker" style="left:${pct}%"></div>`;
        h += '</div></div>';
        h += `<div style="display:flex;justify-content:space-between;align-items:center;margin-top:0.3rem">`;
        h += `<div style="font-size:0.84rem;color:${MH.text};font-weight:600">${esc(cyc.state || 'Unknown')}</div>`;
        h += `<div style="font-size:0.74rem;color:${MH.muted}">Position: ${pct}th pct | Confidence: ${cyc.confidence ?? '—'}</div>`;
        h += '</div>';
        if (cyc.description) h += `<div style="font-size:0.72rem;color:${MH.muted};margin-top:0.2rem">${esc(cyc.description)}</div>`;
        return h;
    }

    // ── Flow Story Timeline ──
    function rotVizTimeline(rd) {
        const gs = rd.globalScore || {};
        const ratios = rd.ratios || {};
        const divs = rd.divergences || [];
        const sorted = Object.entries(ratios).filter(([, r]) => r.composite != null).sort(([, a], [, b]) => b.composite - a.composite);
        const topName = sorted[0] ? (RATIO_NAMES[sorted[0][0]] || sorted[0][0]) : '—';
        const botName = sorted.length ? (RATIO_NAMES[sorted[sorted.length - 1][0]] || sorted[sorted.length - 1][0]) : '—';

        const topScore = sorted[0]?.[1]?.composite ?? 50;
        const botScore2 = sorted.length ? sorted[sorted.length - 1][1]?.composite ?? 50 : 50;
        const topR2 = sorted[0]?.[1];
        const ret6t = topR2?.returns?.['126'], ret3t = topR2?.returns?.['63'];
        let trendNote2 = 'short-term trend';
        if (ret6t != null && ret6t > 0.03) trendNote2 = 'trend running for 3-6 months';
        else if (ret3t != null && ret3t > 0.01) trendNote2 = 'trend building for 1-3 months';

        let h = secTitle('Flow Story Timeline');
        h += _insightBox(`${esc(topName)} leads with score ${topScore} (${trendNote2}), while ${esc(botName)} is weakest at ${botScore2} — ${divs.length ? 'active divergences point to possible rotation shift' : 'no warning signals for near-term change'}.`);
        h += `<div style="font-size:0.62rem;color:${MH.muted};margin-bottom:0.4rem">Current snapshot — historical timeline requires time-series data</div>`;
        h += '<div class="mh-viz-timeline-tracks">';

        const scC = (gs.value ?? 50) >= 65 ? MH.bull : (gs.value ?? 50) >= 45 ? MH.warn : MH.bear;
        const scW = gs.value ?? 50;
        h += `<div class="mh-viz-timeline-row"><span style="color:${MH.muted}">Global Score</span><div class="mh-viz-timeline-bar" style="width:${scW}%;background:${scC}">${gs.value ?? 50}</div></div>`;

        h += `<div class="mh-viz-timeline-row"><span style="color:${MH.bull}">Top Rotation</span><div class="mh-viz-timeline-bar" style="width:${topScore}%;background:${MH.bull}">${esc(topName)} (${topScore})</div></div>`;

        h += `<div class="mh-viz-timeline-row"><span style="color:${MH.bear}">Weakest</span><div class="mh-viz-timeline-bar" style="width:${Math.max(10, botScore2)}%;background:${MH.bear}">${esc(botName)} (${botScore2})</div></div>`;

        if (divs.length) {
            h += `<div class="mh-viz-timeline-row"><span style="color:${MH.warn}">Divergences</span><div style="display:flex;gap:0.3rem;flex-wrap:wrap">`;
            divs.forEach(d => {
                h += `<span style="background:${MH.warn}15;color:${MH.warn};font-size:0.68rem;padding:0.2rem 0.5rem;border-radius:4px;border:1px solid ${MH.warn}33">${esc(d.title)}</span>`;
            });
            h += '</div></div>';
        }

        h += '</div>';
        return h;
    }

    function renderCapitalRotation(panel) {
        if (!rotationDoc) {
            renderFlows(panel);
            return;
        }
        const rd = rotationDoc;
        const gs = rd.globalScore || {};
        const meta = rd.meta || {};
        let h = '';

        // Stale / Partial banners
        if (meta.staleStatus === 'critical_stale') {
            h += `<div style="background:${MH.bear}22;border:1px solid ${MH.bear};border-radius:6px;padding:0.5rem 0.8rem;margin-bottom:0.6rem;font-size:0.78rem;color:${MH.bear}">⚠ Data is critically stale. Scores may be unreliable.</div>`;
        } else if (meta.staleStatus === 'stale') {
            h += `<div style="background:${MH.warn}15;border:1px solid ${MH.warn}44;border-radius:6px;padding:0.4rem 0.8rem;margin-bottom:0.5rem;font-size:0.75rem;color:${MH.warn}">⏳ Data is stale. Scores may not reflect current conditions.</div>`;
        }
        if (meta.coverage != null && meta.coverage < 1) {
            h += `<div style="background:${MH.warn}10;border:1px solid ${MH.border};border-radius:6px;padding:0.35rem 0.8rem;margin-bottom:0.5rem;font-size:0.72rem;color:${MH.muted}">Coverage: ${(meta.coverage * 100).toFixed(0)}% — some signals partial.</div>`;
        }

        // ═══ ABOVE THE FOLD: Score + Flow Intel + Divergence Radar ═══
        const sc = gs.value ?? 50;
        const scC = sc >= 65 ? MH.bull : sc >= 45 ? MH.warn : MH.bear;
        const staleBadge = meta.staleStatus === 'critical_stale' ? ` <span style="color:${MH.bear};font-size:0.68rem">STALE</span>` : meta.staleStatus === 'stale' ? ` <span style="color:${MH.warn};font-size:0.68rem">stale</span>` : '';
        const neutralBadge = gs.neutralMode === 'conflicted' ? `<div style="color:${MH.warn};font-size:0.7rem">⚡ Conflicting block signals</div>` : gs.neutralMode === 'quiet' ? `<div style="color:${MH.muted};font-size:0.7rem">Quiet neutral — no strong direction</div>` : '';

        const intelLines = buildFlowIntel(rd);
        const radarHtml = rotVizDivRadar(rd);

        h += card(`<div style="display:flex;gap:1.2rem;align-items:flex-start;flex-wrap:wrap">
      <div style="text-align:center;min-width:100px">
        <div style="width:80px;height:80px;border-radius:50%;border:3px solid ${scC};display:flex;align-items:center;justify-content:center;margin:0 auto;background:${scC}15">
          <span style="font-size:1.7rem;font-weight:800;color:${scC}">${sc}</span>
        </div>
        <div style="font-size:0.82rem;font-weight:700;color:${scC};margin-top:0.3rem">${esc(gs.regime || '—')}</div>
        <div style="font-size:0.68rem;color:${MH.muted}">Conf: ${esc(gs.confidenceLabel || '—')}${staleBadge}</div>
        ${neutralBadge}
        <div style="font-size:0.62rem;color:${MH.muted};margin-top:0.15rem">As of ${esc(meta.asOfDate || '—')}</div>
      </div>
      <div style="flex:1;min-width:200px">
        <div style="font-size:0.82rem;font-weight:700;color:${MH.text};margin-bottom:0.4rem">Flow Intelligence</div>
        ${intelLines.map(l => `<div style="font-size:0.76rem;color:${MH.muted};line-height:1.5;margin-bottom:0.15rem">${l}</div>`).join('')}
      </div>
      <div style="min-width:220px;max-width:300px">${radarHtml}</div>
    </div>`);

        // ═══ HEATMAP (merged 2.0 — sortable + arrows + Z + RAM) ═══
        const ratios = rd.ratios || {};
        const categories = ['macro', 'sector', 'style'];
        let heatHtml = secTitle('Rotation Heatmap');
        heatHtml += _heatmapInsight(rd);
        heatHtml += `<div style="font-size:0.65rem;color:${MH.muted};margin-bottom:0.3rem">Click column headers to sort. Blue = relative strength | Orange = weakness | Gray = neutral. Click ratio to drill down.</div>`;
        heatHtml += '<div style="overflow-x:auto"><table class="mh-table" id="mh-rot-heatmap" style="font-size:0.74rem"><thead><tr>';
        heatHtml += '<th class="mh-sort-col" data-col="0" style="cursor:pointer">Ratio ⇅</th>';
        heatHtml += '<th class="mh-center mh-sort-col" data-col="1" style="cursor:pointer">1M ⇅</th>';
        heatHtml += '<th class="mh-center mh-sort-col" data-col="2" style="cursor:pointer">3M ⇅</th>';
        heatHtml += '<th class="mh-center mh-sort-col" data-col="3" style="cursor:pointer">6M ⇅</th>';
        heatHtml += '<th class="mh-center mh-sort-col" data-col="4" style="cursor:pointer">12M ⇅</th>';
        heatHtml += '<th class="mh-center mh-sort-col" data-col="5" style="cursor:pointer">Score ⇅</th>';
        heatHtml += '<th class="mh-center mh-sort-col" data-col="6" style="cursor:pointer">Z ⇅</th>';
        heatHtml += '<th class="mh-center mh-sort-col" data-col="7" style="cursor:pointer">RAM ⇅</th>';
        heatHtml += '</tr></thead><tbody>';
        for (const cat of categories) {
            const catRatios = Object.entries(ratios).filter(([, r]) => r.category === cat);
            if (!catRatios.length) continue;
            heatHtml += `<tr class="mh-cat-header" data-cat="${esc(cat)}"><td colspan="8" style="font-weight:700;color:${MH.text};font-size:0.78rem;padding-top:0.5rem;border-bottom:1px solid ${MH.dim}">${cat.toUpperCase()}</td></tr>`;
            for (const [id, r] of catRatios) {
                const ret = r.returns || {};
                const name = RATIO_NAMES[id] || id.replace(/_/g, '/');
                heatHtml += `<tr class="mh-ratio-row" data-ratio="${esc(id)}" data-cat="${esc(cat)}" style="cursor:pointer" onclick="window._mhDrilldown('${esc(id)}')">`;
                heatHtml += `<td style="color:${MH.text};font-size:0.74rem" data-sort="${esc(name)}">${esc(name)}</td>`;
                // Enhanced cells with arrows + percentage
                ['21', '63', '126', '252'].forEach(w => {
                    const v = ret[w];
                    if (v == null) { heatHtml += `<td class="mh-center" style="color:${MH.muted};font-size:0.72rem" data-sort="-1">—</td>`; return; }
                    const pct = (v * 100).toFixed(1);
                    const arrow = v > 0.02 ? '↑' : v < -0.02 ? '↓' : '→';
                    const c = v > 0.02 ? MH.blue : v < -0.02 ? MH.orange : MH.neutral;
                    const op = Math.min(0.5, Math.abs(v) * 3) + 0.1;
                    const heatVal = mapRetToHeat(v);
                    heatHtml += `<td class="mh-center" style="background:${c}${Math.round(op * 40).toString(16).padStart(2, '0')};color:${c};font-weight:600;font-size:0.72rem" title="${pct}%" data-sort="${heatVal}">${arrow} ${pct}%</td>`;
                });
                heatHtml += `<td class="mh-center" data-sort="${r.composite ?? -1}">${scorePill(r.composite)}</td>`;
                const zC = Math.abs(r.zScore || 0) > 1.5 ? MH.warn : MH.muted;
                heatHtml += `<td class="mh-center" style="color:${zC};font-size:0.72rem" data-sort="${(r.zScore || 0).toFixed(2)}">${(r.zScore || 0).toFixed(2)}</td>`;
                const ramC = (r.ram || 0) >= 0 ? MH.bull : MH.bear;
                heatHtml += `<td class="mh-center" style="color:${ramC};font-size:0.72rem" data-sort="${(r.ram || 0).toFixed(1)}">${(r.ram || 0).toFixed(1)}</td>`;
                heatHtml += '</tr>';
            }
        }
        heatHtml += '</tbody></table></div>';
        h += card(heatHtml);

        // ═══ NARRATIVE + KEY CARDS ═══
        const narr = rd.narrative || {};
        const kc = rd.keyCards || [];
        let narrHtml = secTitle('Narrative');
        narrHtml += _narrativeInsight(rd);
        narrHtml += `<div style="font-weight:700;font-size:0.86rem;color:${MH.text};line-height:1.4;margin-bottom:0.4rem">${esc(narr.headline || 'No narrative.')}</div>`;
        if (narr.blocks) narr.blocks.forEach(b => { narrHtml += `<div style="font-size:0.76rem;color:${MH.muted};line-height:1.35;margin-bottom:0.25rem">${esc(b)}</div>`; });
        if (kc.length) {
            narrHtml += '<div style="display:flex;gap:0.5rem;margin-top:0.5rem;flex-wrap:wrap">';
            kc.forEach(k => {
                const c2 = k.direction === 'up' ? MH.bull : k.direction === 'down' ? MH.bear : k.direction === 'alert' ? MH.warn : MH.muted;
                narrHtml += `<div style="flex:1;min-width:130px;background:${MH.faint};border-left:3px solid ${c2};border-radius:4px;padding:0.4rem 0.6rem"><div style="font-size:0.68rem;color:${MH.muted}">${esc(k.title)}</div><div style="font-size:0.8rem;color:${c2};font-weight:700">${esc(String(k.value).replace(/_/g, '/'))}</div><div style="font-size:0.62rem;color:${MH.muted}">${esc((k.detail || '').slice(0, 60))}</div></div>`;
            });
            narrHtml += '</div>';
        }
        h += card(narrHtml);

        // ═══ CYCLE POSITION ═══
        const cyc = rd.cycle || {};
        if (cyc.state) {
            const phases = ['Early Rotation', 'Mid Rotation', 'Late Rotation', 'Exhausted', 'Reversal Watch', 'Neutral / Undefined'];
            const activeIdx = phases.indexOf(cyc.state);
            let cycHtml = secTitle('Cycle Position');
            cycHtml += _cycleInsight(rd);
            cycHtml += '<div style="display:flex;gap:2px;margin:0.5rem 0">';
            phases.forEach((ph, i) => {
                const active = i === activeIdx;
                const phC = i <= 1 ? MH.blue : i <= 2 ? MH.bull : i === 3 ? MH.warn : i === 4 ? MH.bear : MH.neutral;
                cycHtml += `<div style="flex:1;height:8px;border-radius:3px;background:${active ? phC : MH.dim}" title="${esc(ph)}"></div>`;
            });
            cycHtml += '</div>';
            cycHtml += `<div style="font-size:0.84rem;color:${MH.text};font-weight:600">${esc(cyc.state)} <span style="color:${MH.muted};font-weight:400">(${cyc.positionPct ?? '—'}th pct, conf: ${cyc.confidence ?? '—'})</span></div>`;
            if (cyc.description) cycHtml += `<div style="font-size:0.74rem;color:${MH.muted};margin-top:0.2rem">${esc(cyc.description)}</div>`;
            h += card(cycHtml);
        }

        // ═══ DIVERGENCES (expanded) ═══
        const divs = rd.topDivergence ? [rd.topDivergence] : (rd.divergences || []);
        {
            let divHtml = secTitle(`Divergences (${rd.divergenceCount ?? divs.length})`);
            divHtml += _divInsight(rd);
            if (divs.length) {
                divs.forEach(d => {
                    const dc = d.severity === 'alert' ? MH.bear : d.severity === 'warning' ? MH.warn : MH.blue;
                    divHtml += `<div style="background:${dc}10;border:1px solid ${dc}44;border-radius:6px;padding:0.6rem 0.8rem;margin-bottom:0.5rem">`;
                    divHtml += `<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:0.3rem">`;
                    divHtml += `<div style="font-weight:700;color:${dc};font-size:0.84rem">${esc(d.title)}</div>`;
                    divHtml += `<span style="font-size:0.68rem;padding:0.1rem 0.4rem;border-radius:4px;background:${dc}22;color:${dc};font-weight:600">${esc(d.severity || 'info')}</span>`;
                    divHtml += `</div>`;
                    divHtml += `<div style="font-size:0.76rem;color:${MH.muted};margin-bottom:0.4rem">${esc(d.explanation)}</div>`;
                    // Expanded: related ratios, confirmation context, historical framing
                    const relatedRatios = Object.entries(ratios).filter(([, r]) => r.category === 'sector' && (r.composite < 42 || Math.abs(r.zScore || 0) > 1.3));
                    if (relatedRatios.length) {
                        divHtml += `<div style="font-size:0.72rem;color:${MH.text};margin-bottom:0.3rem"><strong>Related ratios:</strong></div>`;
                        divHtml += `<div style="display:flex;gap:0.3rem;flex-wrap:wrap;margin-bottom:0.3rem">`;
                        relatedRatios.forEach(([id, r]) => {
                            const nm = RATIO_NAMES[id] || id.replace(/_/g, '/');
                            const rc = r.composite < 42 ? MH.bear : MH.warn;
                            divHtml += `<span style="font-size:0.68rem;padding:0.15rem 0.4rem;border-radius:4px;background:${rc}15;color:${rc};border:1px solid ${rc}33">${esc(nm)} (${r.composite}, Z: ${(r.zScore || 0).toFixed(1)})</span>`;
                        });
                        divHtml += `</div>`;
                    }
                    // Confirmation cross-reference
                    const confs = rd.confirmations || {};
                    const confEntries = Object.entries(confs);
                    if (confEntries.length) {
                        const supporting = confEntries.filter(([, c]) => c.supportsRotation === 'yes').map(([k]) => k);
                        const against = confEntries.filter(([, c]) => c.supportsRotation === 'no').map(([k]) => k);
                        divHtml += `<div style="font-size:0.72rem;margin-top:0.2rem">`;
                        if (supporting.length) divHtml += `<span style="color:${MH.bull}">Supporting: ${supporting.join(', ')}</span> `;
                        if (against.length) divHtml += `<span style="color:${MH.bear}">Against: ${against.join(', ')}</span>`;
                        divHtml += `</div>`;
                    }
                    // Historical context
                    divHtml += `<div style="font-size:0.68rem;color:${MH.muted};margin-top:0.3rem;padding-top:0.3rem;border-top:1px solid ${MH.dim}">`;
                    divHtml += `Historical context: breadth erosion often appears 4-8 weeks before major trend changes. `;
                    const sectorAvg = Object.values(ratios).filter(r => r.category === 'sector').reduce((s, r) => ({ sum: s.sum + (r.composite || 50), n: s.n + 1 }), { sum: 0, n: 0 });
                    const avgScore = sectorAvg.n ? (sectorAvg.sum / sectorAvg.n).toFixed(0) : 50;
                    divHtml += `Current sector average: ${avgScore}/100. `;
                    const weakCount = Object.values(ratios).filter(r => r.category === 'sector' && (r.composite || 50) < 45).length;
                    const totalSec = Object.values(ratios).filter(r => r.category === 'sector').length;
                    divHtml += `${weakCount} of ${totalSec} sectors below 45 — ${weakCount > totalSec / 2 ? 'majority weak, elevated caution' : 'limited weakness, no broad stress yet'}.`;
                    divHtml += `</div>`;
                    divHtml += `</div>`;
                });
            } else {
                divHtml += `<div style="color:${MH.bull};font-size:0.78rem;padding:0.4rem 0">No divergences detected — signals are aligned.</div>`;
                // Still show summary stats
                const sectorAvg = Object.values(ratios).filter(r => r.category === 'sector').reduce((s, r) => ({ sum: s.sum + (r.composite || 50), n: s.n + 1 }), { sum: 0, n: 0 });
                const avgScore = sectorAvg.n ? (sectorAvg.sum / sectorAvg.n).toFixed(0) : 50;
                divHtml += `<div style="font-size:0.72rem;color:${MH.muted}">Sector average: ${avgScore}/100 | Confirmations and ratios aligned.</div>`;
            }
            h += card(divHtml);
        }

        // ═══ EXPERIMENTAL VISUALIZATIONS ═══
        h += card(rotVizTogglePanel());
        const _vt = _vizToggles();
        const _vizRenderers = {
            ladder: rotVizLadder, sankey: rotVizSankey, rotationMap: rotVizRotationMap,
            cycleBar: rotVizCycleBar, timeline: rotVizTimeline
        };
        VIZ_OPTIONS.forEach(o => {
            const show = _vt[o.id];
            h += `<div id="mh-viz-${o.id}" style="display:${show ? 'block' : 'none'}">`;
            h += card(_vizRenderers[o.id](rd));
            h += '</div>';
        });

        h += '<div id="mh-ratio-drilldown" style="display:none"></div>';
        h += `<div style="font-size:0.68rem;color:${MH.muted};margin-top:0.6rem;font-style:italic">Relative rotation derived from EOD price ratios — not fund-flow data. Price return only. <a href="#" onclick="window._mhSwitchTab('help');return false" style="color:${MH.blue}">Methodology</a></div>`;
        h += sourcesFooter('EODHD (derived ratios)', meta.asOfDate);
        panel.innerHTML = h;

        // Attach sort handlers after DOM render
        setTimeout(() => _mhAttachHeatmapSort(), 0);
    }

    /** Attach click-to-sort on heatmap column headers */
    function _mhAttachHeatmapSort() {
        const table = document.getElementById('mh-rot-heatmap');
        if (!table) return;
        const headers = table.querySelectorAll('.mh-sort-col');
        let sortState = { col: -1, asc: true };
        headers.forEach(th => {
            th.addEventListener('click', () => {
                const col = parseInt(th.dataset.col, 10);
                if (sortState.col === col) sortState.asc = !sortState.asc;
                else { sortState.col = col; sortState.asc = false; } // default desc
                const tbody = table.querySelector('tbody');
                const catHeaders = [...tbody.querySelectorAll('.mh-cat-header')];
                catHeaders.forEach(ch => ch.style.display = 'none'); // hide category headers when sorted
                const rows = [...tbody.querySelectorAll('.mh-ratio-row')];
                rows.sort((a, b) => {
                    const cellA = a.children[col];
                    const cellB = b.children[col];
                    let vA = cellA?.dataset?.sort ?? cellA?.textContent ?? '';
                    let vB = cellB?.dataset?.sort ?? cellB?.textContent ?? '';
                    const nA = parseFloat(vA), nB = parseFloat(vB);
                    if (!isNaN(nA) && !isNaN(nB)) return sortState.asc ? nA - nB : nB - nA;
                    return sortState.asc ? String(vA).localeCompare(String(vB)) : String(vB).localeCompare(String(vA));
                });
                rows.forEach(r => tbody.appendChild(r));
                // Update header arrows
                headers.forEach(h2 => {
                    const c2 = parseInt(h2.dataset.col, 10);
                    const base = h2.textContent.replace(/ [⇅▲▼]$/, '');
                    h2.textContent = base + (c2 === col ? (sortState.asc ? ' ▲' : ' ▼') : ' ⇅');
                });
            });
        });
    }

    /** Map a ratio return to a 0-100 heatmap score */
    function mapRetToHeat(ret) {
        if (ret == null) return null;
        const clamped = Math.max(-0.10, Math.min(0.10, ret));
        return Math.round(((clamped + 0.10) / 0.20) * 100);
    }

    /** Drilldown: fetch and show ratio detail */
    window._mhDrilldown = async function (ratioId) {
        const container = document.getElementById('mh-ratio-drilldown');
        if (!container) return;
        container.style.display = 'block';
        container.innerHTML = `<div style="padding:1rem;color:${MH.muted}">Loading ${ratioId.replace(/_/g, '/')}…</div>`;

        try {
            const detail = await fetchJsonWithTimeout(`/data/v3/derived/market/capital-rotation/ratios/${encodeURIComponent(ratioId)}.json`, 5000);
            if (!detail) { container.innerHTML = card(`<div style="color:${MH.warn}">Detail not available for ${ratioId}.</div>`); return; }

            const d = detail;
            let html = `<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:0.5rem">
        <div style="font-size:1rem;font-weight:700;color:${MH.text}">${esc(d.displayName || ratioId.replace(/_/g, '/'))}</div>
        <button onclick="document.getElementById('mh-ratio-drilldown').style.display='none'" style="background:none;border:1px solid ${MH.border};border-radius:4px;color:${MH.muted};cursor:pointer;padding:0.2rem 0.6rem;font-size:0.78rem">Close</button>
      </div>`;
            html += `<div style="font-size:0.75rem;color:${MH.muted};margin-bottom:0.5rem">${esc(d.symbolA)} / ${esc(d.symbolB)} | ${esc(d.category)} | ${d.barsUsed || '?'} bars</div>`;

            // Sparkline
            if (d.sparkline && d.sparkline.length > 1) {
                const vals = d.sparkline.map(s => s.v);
                const min = Math.min(...vals), max = Math.max(...vals);
                const range = max - min || 1;
                const sw = 360, sh = 60;
                let path = `M 0 ${sh - ((vals[0] - min) / range) * sh}`;
                for (let i = 1; i < vals.length; i++) {
                    const x = (i / (vals.length - 1)) * sw;
                    const y = sh - ((vals[i] - min) / range) * sh;
                    path += ` L ${x} ${y}`;
                }
                const lc = vals[vals.length - 1] >= vals[0] ? MH.bull : MH.bear;
                html += `<svg viewBox="0 0 ${sw} ${sh}" style="width:100%;height:60px;margin-bottom:0.5rem"><path d="${path}" fill="none" stroke="${lc}" stroke-width="1.5"/></svg>`;
            }

            // Metrics table
            html += '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:0.4rem">';
            const metrics = [
                ['Composite', d.composite],
                ['RAM', d.ram != null ? d.ram.toFixed(3) : '—'],
                ['Z-Score', d.zScore != null ? d.zScore.toFixed(2) : '—'],
                ['Percentile (5Y)', d.percentile5y ?? '—'],
                ['Percentile (Long)', d.percentileLong ?? '—'],
                ['Window (5Y)', d.windowYearsUsed5y ? d.windowYearsUsed5y + 'Y' : '—'],
                ['Window (Long)', d.windowYearsUsedLong ? d.windowYearsUsedLong + 'Y' : '—'],
                ['Trend Slope', d.trendSlope != null ? (d.trendSlope * 100).toFixed(3) + '%' : '—'],
                ['Cycle', d.cycle?.state || '—'],
                ['Cycle Conf', d.cycle?.confidence ?? '—']
            ];
            metrics.forEach(([label, val]) => {
                html += `<div style="background:${MH.faint};border-radius:4px;padding:0.35rem 0.5rem"><div style="font-size:0.65rem;color:${MH.muted}">${esc(label)}</div><div style="font-size:0.82rem;color:${MH.text};font-weight:600">${esc(String(val))}</div></div>`;
            });
            html += '</div>';

            // Warnings
            if (d.alignmentWarnings?.length) {
                html += `<div style="margin-top:0.4rem;font-size:0.7rem;color:${MH.warn}">⚠ ${d.alignmentWarnings.join(' | ')}</div>`;
            }
            if (d.limitedHistory) {
                html += `<div style="font-size:0.7rem;color:${MH.warn}">Limited history — percentile calculations may be less reliable.</div>`;
            }

            container.innerHTML = card(html);
            container.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        } catch (err) {
            container.innerHTML = card(`<div style="color:${MH.bear}">Error loading detail: ${esc(err.message)}</div>`);
        }
    };

    const RENDERERS = {
        dashboard: renderDashboard,
        flows: renderCapitalRotation,
        assets: renderAssetClasses,
        riskmonitor: renderRiskMonitor,
        help: renderHelp
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
        html += `<div class="mh-demo-warn">All scores based on End of The Day Data. Flows are price-proxies, not real fund-flows. <a href="#" onclick="window._mhSwitchTab('help');return false">Methodology & Glossary</a></div>`;

        // Tab bar
        html += '<div class="mh-tab-bar">';
        TABS.forEach(t => {
            html += `<button class="mh-tab${t.id === 'dashboard' ? ' mh-tab-active' : ''}" data-tab="${t.id}" onclick="window._mhSwitchTab('${t.id}')">${t.label}</button>`;
        });
        html += '</div>';

        // Panels
        TABS.forEach(t => {
            html += `<div id="mh-panel-${t.id}" class="mh-panel${t.id === 'dashboard' ? ' mh-panel-active' : ''}"></div>`;
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
            dashboard: has(gDoc?.regime_mode) && has(gDoc?.investment_compass),
            flows: has(cards),
            assets: Object.keys(cards).length > 0,
            riskmonitor: has(gDoc?.regime_details),
            help: true
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
        // Load market data + rotation data + narrative dictionary in parallel
        const [, rotData, dictData] = await Promise.all([
            loadData(),
            fetchJsonWithTimeout(ROTATION_SUMMARY_URL, 5000).catch(() => null),
            fetchJsonWithTimeout(DICT_URL, 3000).catch(() => null)
        ]);
        if (dictData && typeof dictData === 'object') narrativeDict = dictData;
        if (rotData) rotationDoc = rotData.data || rotData;

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
