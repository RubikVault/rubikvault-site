/**
 * Elliott Waves Scanner API
 *
 * DFMSIF v1.0 — Deterministic Fractal Market Structure Inference
 *
 * Scans configured universe for Elliott Wave setups using:
 * - Pre-computed marketphase data (if available)
 * - Heuristic estimation from EOD stats (fallback)
 *
 * This is NOT prediction — it is rule-based historical structure detection.
 */
import universePolicyRaw from "../../policies/universe-policy.json" assert { type: "json" };

const DEFAULT_UNIVERSE_POLICY = {
    defaultMode: "full",
    allowedModes: ["full", "ndx100", "sp500", "top100"],
    parityRules: {
        production: { mode: "full", locked: true },
        preview: { mode: "full", allowDrift: false }
    }
};

function normalizePolicy(raw) {
    if (!raw || typeof raw !== "object") return DEFAULT_UNIVERSE_POLICY;
    const allowedModes = Array.isArray(raw.allowedModes) && raw.allowedModes.length
        ? raw.allowedModes.map((item) => String(item).trim()).filter(Boolean)
        : DEFAULT_UNIVERSE_POLICY.allowedModes;
    const defaultMode = allowedModes.includes(String(raw.defaultMode || ""))
        ? String(raw.defaultMode)
        : DEFAULT_UNIVERSE_POLICY.defaultMode;
    return {
        defaultMode,
        allowedModes,
        parityRules: {
            production: {
                mode: String(raw?.parityRules?.production?.mode || DEFAULT_UNIVERSE_POLICY.parityRules.production.mode),
                locked: Boolean(raw?.parityRules?.production?.locked)
            },
            preview: {
                mode: String(raw?.parityRules?.preview?.mode || DEFAULT_UNIVERSE_POLICY.parityRules.preview.mode),
                allowDrift: Boolean(raw?.parityRules?.preview?.allowDrift)
            }
        }
    };
}

function normalizeCommit(value) {
    if (!value) return null;
    const text = String(value).trim();
    return text || null;
}

function isoMinute(iso) {
    return String(iso || "").replace(/[-:]/g, "").slice(0, 13);
}

function buildRuntimeMeta(context, generatedAtIso) {
    const env = context?.env || {};
    const commit = normalizeCommit(env.CF_PAGES_COMMIT_SHA || env.GITHUB_SHA || env.COMMIT_SHA);
    const shortCommit = commit ? commit.slice(0, 8) : "unknown";
    const sequence = normalizeCommit(env.GITHUB_RUN_NUMBER) || "runtime";
    const buildId = `${shortCommit}-${isoMinute(generatedAtIso)}-${sequence}`;
    return { commit, buildId };
}

function detectRuntimeKind(hostname) {
    const host = String(hostname || "").toLowerCase();
    if (host === "rubikvault.com" || host === "www.rubikvault.com") return "production";
    if (host.endsWith(".pages.dev")) return "preview";
    return "local";
}

function resolveMode(policy, requestUrl) {
    const url = new URL(requestUrl);
    const runtimeKind = detectRuntimeKind(url.hostname);
    const requestedModeRaw = (url.searchParams.get("mode") || "").trim().toLowerCase();
    let mode = policy.defaultMode;
    let filterReason = null;

    if (requestedModeRaw) {
        if (policy.allowedModes.includes(requestedModeRaw)) {
            mode = requestedModeRaw;
        } else {
            filterReason = `MODE_NOT_ALLOWED:${requestedModeRaw}`;
        }
    }

    if (runtimeKind === "production" && policy.parityRules.production.locked) {
        const lockedMode = policy.parityRules.production.mode || policy.defaultMode;
        if (mode !== lockedMode) {
            mode = lockedMode;
            filterReason = filterReason || "MODE_LOCKED_PRODUCTION";
        }
    }

    if (runtimeKind === "preview" && policy.parityRules.preview.allowDrift === false) {
        const previewMode = policy.parityRules.preview.mode || policy.defaultMode;
        if (mode !== previewMode) {
            mode = previewMode;
            filterReason = filterReason || "MODE_LOCKED_PREVIEW";
        }
    }

    return { mode, filterReason, runtimeKind };
}

function universePathForMode(mode) {
    if (mode === "ndx100") return "/data/universe/nasdaq100.json";
    if (mode === "sp500") return "/data/universe/sp500.json";
    return "/data/universe/all.json";
}

async function fetchJsonSafe(url) {
    try {
        const res = await fetch(url);
        if (!res.ok) return { ok: false, status: res.status, body: null, contentType: res.headers.get("content-type") || "" };
        const contentType = String(res.headers.get("content-type") || "");
        const text = await res.text();
        const trimmed = text.trimStart();
        const looksJson = contentType.toLowerCase().includes("application/json") || trimmed.startsWith("{") || trimmed.startsWith("[");
        if (!looksJson) return { ok: false, status: res.status, body: null, contentType };
        return { ok: true, status: res.status, body: JSON.parse(text), contentType };
    } catch {
        return { ok: false, status: null, body: null, contentType: "" };
    }
}

function normalizeUniverseRows(universeDoc) {
    if (!Array.isArray(universeDoc)) return [];
    return universeDoc
        .map((row) => ({
            ticker: String(row?.ticker || row?.symbol || "").trim().toUpperCase(),
            name: row?.name ? String(row.name) : null
        }))
        .filter((row) => row.ticker);
}

function applyModeFilter(symbols, mode) {
    if (!Array.isArray(symbols)) return { symbols: [], filtered: false, filterReason: null };
    if (mode !== "top100") return { symbols, filtered: false, filterReason: null };
    const sorted = [...symbols].sort((a, b) => String(a.ticker).localeCompare(String(b.ticker)));
    return {
        symbols: sorted.slice(0, 100),
        filtered: true,
        filterReason: "MODE_TOP100_LIMIT"
    };
}

function extractMarketphaseSymbolSet(indexDoc) {
    const rows = Array.isArray(indexDoc?.data?.symbols)
        ? indexDoc.data.symbols
        : Array.isArray(indexDoc?.symbols)
            ? indexDoc.symbols
            : [];
    const set = new Set();
    for (const row of rows) {
        if (typeof row === "string") {
            const t = row.trim().toUpperCase();
            if (t) set.add(t);
            continue;
        }
        const t = String(row?.symbol || "").trim().toUpperCase();
        if (t) set.add(t);
    }
    return set;
}

function scannerErrorPayload({ code, message, meta }) {
    return {
        ok: false,
        meta: {
            ...meta,
            status: "error",
            circuitOpen: true,
            reason: code
        },
        error: { code, message },
        setups: []
    };
}

export async function onRequest(context) {
    const startMs = Date.now();
    const generatedAt = new Date().toISOString();
    const policy = normalizePolicy(universePolicyRaw);
    const resolved = resolveMode(policy, context.request.url);
    const baseUrl = new URL(context.request.url).origin;
    const runtimeMeta = buildRuntimeMeta(context, generatedAt);

    try {
        const universePath = universePathForMode(resolved.mode);
        const universeRes = await fetchJsonSafe(`${baseUrl}${universePath}`);
        if (!universeRes.ok) {
            return jsonResponse(scannerErrorPayload({
                code: "UNIVERSE_UNAVAILABLE",
                message: `Unable to load universe at ${universePath}`,
                meta: {
                    asOf: generatedAt,
                    generatedAt,
                    build_id: runtimeMeta.buildId,
                    commit: runtimeMeta.commit,
                    mode: resolved.mode,
                    universeSource: universePath,
                    universeCount: 0,
                    returnedCount: 0,
                    filtered: false,
                    filterReason: resolved.filterReason
                }
            }), 503);
        }

        const normalized = normalizeUniverseRows(universeRes.body);
        const modeFiltered = applyModeFilter(normalized, resolved.mode);
        const modeFilterReason = modeFiltered.filterReason || resolved.filterReason;
        const symbols = modeFiltered.symbols;

        const eodRes = await fetchJsonSafe(`${baseUrl}/data/eod/batches/eod.latest.000.json`);
        const eodData = eodRes.ok ? eodRes.body : null;
        const eodBySymbol = eodData?.data || {};

        const mpIndexRes = await fetchJsonSafe(`${baseUrl}/data/marketphase/index.json`);
        const mpIndex = mpIndexRes.ok ? mpIndexRes.body : { ok: false, data: { symbols: [] } };
        const mpSymbols = extractMarketphaseSymbolSet(mpIndex);

        const setups = [];
        for (const { ticker, name } of symbols) {
            const eod = eodBySymbol[ticker];

            if (mpSymbols.has(ticker)) {
                try {
                    const mpRes = await fetchJsonSafe(`${baseUrl}/data/marketphase/${ticker}.json`);
                    const mp = mpRes.ok ? mpRes.body : null;
                    const elliott = mp?.data?.elliott;
                    if (elliott) {
                        setups.push(extractSetupFromMarketphase(ticker, name, elliott, eod));
                        continue;
                    }
                } catch {
                    // Fall through to heuristic path.
                }
            }

            setups.push(estimateWaveFromEOD(ticker, name, eod));
        }

        setups.sort((a, b) => (b.confidence || 0) - (a.confidence || 0));

        const response = {
            ok: true,
            meta: {
                asOf: generatedAt,
                generatedAt,
                durationMs: Date.now() - startMs,
                count: setups.length,
                analyzedFull: mpSymbols.size,
                version: "DFMSIF_v1.0",
                build_id: runtimeMeta.buildId,
                commit: runtimeMeta.commit,
                status: "ok",
                circuitOpen: false,
                reason: modeFilterReason || null,
                universeSource: universePath,
                universeCount: normalized.length,
                returnedCount: setups.length,
                filtered: Boolean(modeFiltered.filtered || modeFilterReason),
                mode: resolved.mode,
                filterReason: modeFilterReason || null
            },
            setups
        };

        return jsonResponse(response);
    } catch (err) {
        return jsonResponse(scannerErrorPayload({
            code: "SCANNER_ERROR",
            message: err?.message || String(err),
            meta: {
                asOf: generatedAt,
                generatedAt,
                build_id: runtimeMeta.buildId,
                commit: runtimeMeta.commit,
                mode: resolved.mode,
                universeSource: universePathForMode(resolved.mode),
                universeCount: 0,
                returnedCount: 0,
                filtered: false,
                filterReason: resolved.filterReason
            }
        }), 500);
    }
}

function jsonResponse(data, status = 200) {
    return new Response(JSON.stringify(data), {
        status,
        headers: {
            "Content-Type": "application/json",
            "Cache-Control": "public, max-age=300"
        }
    });
}

function extractSetupFromMarketphase(ticker, name, elliott, eod) {
    const completed = elliott?.completedPattern || {};
    const developing = elliott?.developingPattern || {};
    const fib = elliott?.fib || {};
    const uncertainty = elliott?.uncertainty || {};

    // Determine wave position from developing pattern
    let wavePosition = 'unknown';
    const possibleWave = developing.possibleWave || '';

    if (possibleWave.includes('4') || possibleWave.includes('ABC')) {
        wavePosition = completed.valid ? 'pre-wave-5' : 'in-correction';
    } else if (completed.valid && fib.conformanceScore > 50) {
        wavePosition = 'wave-1-start';
    } else {
        wavePosition = 'pre-wave-3';
    }

    // Override based on rule analysis
    if (!completed.rules?.r2) {
        wavePosition = 'pre-wave-3';
    }

    const confidence = uncertainty?.confidenceDecay?.adjusted ?? completed.confidence0_100 ?? 0;

    return {
        ticker,
        name,
        wavePosition,
        confidence,
        direction: completed.direction || 'neutral',
        fibConformance: fib.conformanceScore ?? null,
        validPattern: completed.valid ?? false,
        source: 'marketphase'
    };
}

function estimateWaveFromEOD(ticker, name, eod) {
    if (!eod) {
        return {
            ticker,
            name,
            wavePosition: 'unknown',
            confidence: 0,
            direction: 'neutral',
            fibConformance: null,
            validPattern: false,
            source: 'unavailable'
        };
    }

    const close = eod.close;
    const high = eod.high;
    const low = eod.low;
    const open = eod.open;

    if (!Number.isFinite(close)) {
        return {
            ticker,
            name,
            wavePosition: 'unknown',
            confidence: 0,
            direction: 'neutral',
            fibConformance: null,
            validPattern: false,
            source: 'heuristic'
        };
    }

    // Estimate direction from today's bar
    const dayChange = (close - open) / open;
    const direction = dayChange >= 0 ? 'bullish' : 'bearish';

    // Position in day's range
    const range = high - low;
    const positionInRange = range > 0 ? (close - low) / range : 0.5;

    // Calculate Fibonacci conformance based on close position relative to key Fib levels
    // Key Fib retracement levels: 0%, 23.6%, 38.2%, 50%, 61.8%, 78.6%, 100%
    const fibLevels = [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1.0];

    // Find nearest Fib level
    let minDistance = 1;
    for (const fibLevel of fibLevels) {
        const distance = Math.abs(positionInRange - fibLevel);
        if (distance < minDistance) {
            minDistance = distance;
        }
    }

    // Convert distance to conformance score (0-100%)
    // Distance 0 = 100% conformance, Distance 0.5 = 0% conformance
    const fibConformance = Math.max(0, Math.min(100, (1 - minDistance * 2) * 100));

    // Heuristic wave position
    let wavePosition;
    let confidence;

    if (positionInRange > 0.8) {
        wavePosition = direction === 'bullish' ? 'in-correction' : 'pre-wave-3';
        confidence = 35;
    } else if (positionInRange < 0.2) {
        wavePosition = direction === 'bearish' ? 'in-correction' : 'pre-wave-3';
        confidence = 35;
    } else if (positionInRange > 0.5) {
        wavePosition = 'pre-wave-5';
        confidence = 25;
    } else {
        wavePosition = 'wave-1-start';
        confidence = 20;
    }

    return {
        ticker,
        name,
        wavePosition,
        confidence,
        direction,
        fibConformance: Math.round(fibConformance * 10) / 10,
        validPattern: false,
        source: 'heuristic'
    };
}
