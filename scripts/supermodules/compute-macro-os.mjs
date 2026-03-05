/**
 * compute-macro-os.mjs
 * Pure compute module — transforms existing macro-hub snapshot into Super-Module format.
 * Input:  macro-hub snapshot (from public/data/snapshots/macro-hub.json)
 * Output: { regime, metrics, signals, meta }
 */

// ── Helpers ──────────────────────────────────────────────────────────
function toNum(v) { const n = Number(v); return Number.isFinite(n) ? n : null; }
function round(v, d = 2) { return v === null || v === undefined ? null : Math.round(v * 10 ** d) / 10 ** d; }

// ── Regime Classification ───────────────────────────────────────────
const REGIME_RULES = [
    // Risk-Off signals (score increases = riskier)
    { metric: 'VIXCLS', threshold: 25, above: 'RISK_OFF', weight: 15 },
    { metric: 'VIXCLS', threshold: 35, above: 'FEAR', weight: 10 },
    { metric: 'CURVE10_2', threshold: 0, below: 'INVERTED_CURVE', weight: 12 },
    { metric: 'HY_OAS', threshold: 500, above: 'CREDIT_STRESS', weight: 10 },
    { metric: 'HY_OAS', threshold: 350, below: 'CREDIT_CALM', weight: -5 },
    { metric: 'VIXRATIO', threshold: 1.0, above: 'CONTANGO_BREAK', weight: 8 },
    // Risk-On signals (score decreases)
    { metric: 'VIXCLS', threshold: 15, below: 'COMPLACENT', weight: -10 },
    { metric: 'SPY_20D', threshold: 5, above: 'MOMENTUM_UP', weight: -8 },
    { metric: 'SPY_20D', threshold: -5, below: 'MOMENTUM_DOWN', weight: 12 },
];

function classifyRegime(data) {
    let score = 50; // neutral baseline
    const activeSignals = [];

    for (const rule of REGIME_RULES) {
        const m = data?.[rule.metric];
        const value = toNum(m?.value);
        if (value === null) continue;

        if (rule.above !== undefined && value > rule.threshold) {
            score += rule.weight;
            activeSignals.push({ signal: rule.above, metric: rule.metric, value: round(value), threshold: rule.threshold });
        }
        if (rule.below !== undefined && value < rule.threshold) {
            score += rule.weight;
            activeSignals.push({ signal: rule.below, metric: rule.metric, value: round(value), threshold: rule.threshold });
        }
    }

    score = Math.max(0, Math.min(100, score));

    let regime;
    if (score >= 70) regime = 'RISK_OFF';
    else if (score >= 55) regime = 'CAUTIOUS';
    else if (score <= 30) regime = 'RISK_ON';
    else if (score <= 40) regime = 'CONSTRUCTIVE';
    else regime = 'NEUTRAL';

    return { regime, regime_score: score, active_signals: activeSignals };
}

// ── Metric Categories ───────────────────────────────────────────────
const CATEGORY_MAP = {
    // Rates & Curve
    US10Y: 'rates', US2Y: 'rates', US30Y: 'rates', CURVE10_2: 'rates', SOFR: 'rates', EFFR: 'rates',
    // Volatility
    VIXCLS: 'volatility', VIX3M: 'volatility', VIXRATIO: 'volatility', VOL_TERM: 'volatility',
    // Credit
    HY_OAS: 'credit', IG_OAS: 'credit', BBB_OAS: 'credit', STRESS: 'credit', BAA_YLD: 'credit', HY_OAS_1M: 'credit',
    // Equities
    SPY: 'equities', QQQ: 'equities', IWM: 'equities', EWG: 'equities', EWJ: 'equities',
    SPY_20D: 'equities', SPY_200D: 'equities',
    // FX & Commodities
    DXY: 'fx', EURUSD: 'fx', USDJPY: 'fx', GOLD: 'commodities', OIL: 'commodities',
    // Macro
    CPI_YOY: 'inflation', UNRATE: 'labor', GDP_QOQ: 'growth',
    // Crypto
    BTCUSD: 'crypto', ETHUSD: 'crypto', CRY_MCAP: 'crypto', BTC_DOM: 'crypto', STABLECOIN_SUPPLY: 'crypto',
    // Risk
    RISKREG: 'risk_composite',
};

function transformMetrics(data) {
    if (!data || typeof data !== 'object') return [];
    const metrics = [];

    for (const [id, m] of Object.entries(data)) {
        if (!m || typeof m !== 'object') continue;
        metrics.push({
            id,
            category: CATEGORY_MAP[id] || 'other',
            value: toNum(m.value),
            change: toNum(m.change),
            change_unit: m.changeUnit || m.change_unit || '',
            unit: m.unit || '',
            source: m.source || 'UNKNOWN',
            observed_at: m.observedAt || m.observed_at || null,
            stale: Boolean(m.stale),
            stale_reason: m.staleReason || m.stale_reason || null,
        });
    }

    return metrics;
}

// ── Main compute ────────────────────────────────────────────────────
/**
 * @param {object} macroSnapshot - The macro-hub snapshot (content of macro-hub.json)
 * @returns {{ regime: object, metrics: object[], signals: object[], meta: object }}
 */
export function computeMacroOS(macroSnapshot) {
    const data = macroSnapshot?.data || {};
    const snapshotMeta = macroSnapshot?.meta || {};

    const { regime, regime_score, active_signals } = classifyRegime(data);
    const metrics = transformMetrics(data);

    // Categorize metrics
    const categories = {};
    for (const m of metrics) {
        if (!categories[m.category]) categories[m.category] = [];
        categories[m.category].push(m);
    }

    // Data quality stats
    const total = metrics.length;
    const fresh = metrics.filter((m) => !m.stale).length;
    const stale = metrics.filter((m) => m.stale).length;
    const missing = metrics.filter((m) => m.value === null).length;

    return {
        regime: {
            current: regime,
            score: regime_score,
            label: regime === 'RISK_OFF'
                ? '🔴 Risk-Off'
                : regime === 'CAUTIOUS'
                    ? '🟠 Cautious'
                    : regime === 'NEUTRAL'
                        ? '🟡 Neutral'
                        : regime === 'CONSTRUCTIVE'
                            ? '🟢 Constructive'
                            : '🟢 Risk-On',
        },
        signals: active_signals,
        metrics,
        categories,
        meta: {
            total_metrics: total,
            fresh_metrics: fresh,
            stale_metrics: stale,
            missing_metrics: missing,
            coverage_pct: round(((total - missing) / Math.max(total, 1)) * 100, 1),
            source_snapshot: snapshotMeta?.generated_at || snapshotMeta?.run_id || null,
        },
    };
}
