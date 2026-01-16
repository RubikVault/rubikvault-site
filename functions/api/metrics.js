import metricsCatalog from "../../config/metrics-catalog.json" assert { type: "json" };
import uiLayouts from "../../config/ui-layouts.json" assert { type: "json" };
import signalRules from "../../config/signal-rules.json" assert { type: "json" };
import { jsonResponse, kvGetJson, kvPutJson } from "./_shared.js";

const VERSION = "5.0";
const CACHE_TTL_SECONDS = 180;
const LASTGOOD_TTL_SECONDS = 7 * 24 * 60 * 60;
const CACHE_KEY = "rv:cache:metrics:v5";
const LASTGOOD_KEY = "rv:lastgood:metrics:v5";
const LASTGOOD_META_KEY = "rv:lastgood:metrics:v5:meta";

function nowIso() {
  return new Date().toISOString();
}

function createRequestId() {
  try {
    if (globalThis.crypto && typeof globalThis.crypto.randomUUID === "function") {
      return globalThis.crypto.randomUUID();
    }
  } catch (error) {
    // ignore
  }
  return Math.random().toString(36).slice(2, 10);
}

function isDateTime(value) {
  return typeof value === "string" && value.includes("T");
}

function normalizeAsOf(cadence, value) {
  if (!value) return nowIso();
  if (cadence === "monthly" || cadence === "quarterly") {
    return String(value).slice(0, 10);
  }
  const raw = String(value);
  return isDateTime(raw) ? raw : `${raw}T00:00:00Z`;
}

function coerceNumber(value) {
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

function buildGroupMap(groups) {
  const map = new Map();
  (groups || []).forEach((group) => {
    (group.metricIds || []).forEach((metricId) => {
      if (!map.has(metricId)) {
        map.set(metricId, group.id);
      }
    });
  });
  return map;
}

function computeTrend(valueType, change) {
  if (valueType !== "number") return "flat";
  if (change?.d1 !== null && change?.d1 !== undefined) {
    return change.d1 > 0 ? "up" : change.d1 < 0 ? "down" : "flat";
  }
  if (change?.w1 !== null && change?.w1 !== undefined) {
    return change.w1 > 0 ? "up" : change.w1 < 0 ? "down" : "flat";
  }
  return "flat";
}

function computeSeverity(valueType, thresholds, value) {
  if (valueType !== "number") return "neutral";
  if (!thresholds || typeof value !== "number") return "neutral";
  if (
    (Number.isFinite(thresholds.alertAbove) && value >= thresholds.alertAbove) ||
    (Number.isFinite(thresholds.alertBelow) && value <= thresholds.alertBelow)
  ) {
    return "alert";
  }
  if (
    (Number.isFinite(thresholds.warnAbove) && value >= thresholds.warnAbove) ||
    (Number.isFinite(thresholds.warnBelow) && value <= thresholds.warnBelow)
  ) {
    return "warn";
  }
  return "ok";
}

function validateValue(valueType, value) {
  if (valueType === "number") {
    return Number.isFinite(value) ? "OK" : "FAIL_NULL";
  }
  if (valueType === "label" || valueType === "dataset") {
    return typeof value === "string" && value ? "OK" : "FAIL_NULL";
  }
  return "FAIL_NULL";
}

function buildMetric({
  catalog,
  metricId,
  groupId,
  value,
  asOf,
  change,
  spark,
  sourcePrimary,
  fallbackUsed,
  validation,
  badgeText
}) {
  const entry = catalog.metricsCatalog[metricId];
  if (!entry) return null;
  const resolvedChange = entry.valueType === "number" ? change : { d1: null, w1: null, m1: null };
  const trend = computeTrend(entry.valueType, resolvedChange);
  const severity = computeSeverity(entry.valueType, entry.thresholds, value);
  const tooltip = entry.display?.tooltip || "";
  return {
    id: metricId,
    groupId,
    label: entry.label,
    value,
    valueType: entry.valueType,
    unit: entry.unit,
    asOf: normalizeAsOf(entry.cadence, asOf),
    cadence: entry.cadence,
    change: resolvedChange,
    spark: Array.isArray(spark) ? spark : [],
    quality: {
      isFresh: validation === "OK",
      isStale: validation !== "OK",
      marketClosed: false,
      consecutiveFails: 0,
      validation
    },
    display: {
      trend,
      severity,
      badgeText: badgeText || null,
      tooltip
    },
    source: {
      primary: sourcePrimary || entry.sourceHint?.primary || "snapshot",
      fallbackUsed: Boolean(fallbackUsed)
    }
  };
}

function computeDatasetTopFlop(items) {
  if (!Array.isArray(items) || !items.length) return "";
  const sorted = items
    .map((item) => ({ symbol: item.symbol, value: coerceNumber(item.returnPct) }))
    .filter((item) => item.symbol && item.value !== null)
    .sort((a, b) => b.value - a.value);
  if (!sorted.length) return "";
  const top = sorted.slice(0, 2);
  const flop = sorted.slice(-2).reverse();
  const format = (item) => {
    const sign = item.value > 0 ? "+" : "";
    return `${item.symbol}:${sign}${item.value.toFixed(1)}`;
  };
  return `TOP:${top.map(format).join(",")}|FLOP:${flop.map(format).join(",")}`;
}

function normalizeFxRates(items) {
  const map = new Map();
  (items || []).forEach((entry) => {
    if (entry?.pair) map.set(entry.pair, entry);
  });
  const usdPerEur = coerceNumber(map.get("USD/EUR")?.value);
  const gbpPerEur = coerceNumber(map.get("GBP/EUR")?.value);
  const jpyPerEur = coerceNumber(map.get("JPY/EUR")?.value);
  const eurusd = usdPerEur;
  const gbpusd = usdPerEur && gbpPerEur ? (usdPerEur * (1 / gbpPerEur)) : null;
  const usdjpy = usdPerEur && jpyPerEur ? jpyPerEur / usdPerEur : null;
  const date = map.get("USD/EUR")?.date || map.get("GBP/EUR")?.date || map.get("JPY/EUR")?.date || null;
  return { eurusd, gbpusd, usdjpy, date };
}

function buildSignals(metricsById, rulesConfig) {
  const rules = rulesConfig?.rules || [];
  const severityOrder = rulesConfig?.sort?.severityOrder || ["alert", "warning", "info"];
  const maxSignals = rulesConfig?.maxSignals || 8;
  const severityRank = new Map(severityOrder.map((level, idx) => [level, idx]));
  const triggered = [];
  for (const rule of rules) {
    const metric = metricsById[rule?.when?.metricId];
    const value = metric?.valueType === "number" ? metric.value : null;
    if (!metric || value === null || value === undefined || !Number.isFinite(value)) continue;
    const op = rule?.when?.op || "";
    const threshold = Number(rule?.when?.value);
    let hit = false;
    if (op === "<") hit = value < threshold;
    if (op === "<=") hit = value <= threshold;
    if (op === ">") hit = value > threshold;
    if (op === ">=") hit = value >= threshold;
    if (op === "==") hit = value === threshold;
    if (!hit) continue;
    triggered.push({
      id: rule.id,
      severity: rule.severity,
      title: rule.title,
      message: rule.message,
      metricId: rule.when.metricId,
      groupId: metric.groupId,
      actionText: rule.actionText ?? null,
      priority: rule.priority
    });
  }
  triggered.sort((a, b) => {
    if (a.priority !== b.priority) return a.priority - b.priority;
    return (severityRank.get(a.severity) ?? 99) - (severityRank.get(b.severity) ?? 99);
  });
  return triggered.slice(0, maxSignals);
}

async function fetchSnapshot(context, name) {
  const url = new URL(`/data/snapshots/${name}.json`, context.request.url);
  try {
    const res = await fetch(url.toString(), { cf: { cacheTtl: 60 } });
    if (!res.ok) return null;
    const text = await res.text();
    return text ? JSON.parse(text) : null;
  } catch (error) {
    return null;
  }
}

async function fetchMirror(context, name) {
  const url = new URL(`/mirrors/${name}.json`, context.request.url);
  try {
    const res = await fetch(url.toString(), { cf: { cacheTtl: 60 } });
    if (!res.ok) return null;
    const text = await res.text();
    return text ? JSON.parse(text) : null;
  } catch (error) {
    return null;
  }
}

async function loadSnapshots(context) {
  const names = [
    "us-yield-curve",
    "vol-regime",
    "risk-regime-lite",
    "credit-stress-proxy",
    "credit-spread-proxy-lite",
    "fx-board",
    "energy-macro",
    "market-cockpit",
    "market-breadth",
    "highs-vs-lows",
    "sector-rotation",
    "inflation-pulse",
    "labor-pulse"
  ];
  const mirrorNames = ["crypto-snapshot", "price-snapshot"];
  const results = await Promise.all(names.map((name) => fetchSnapshot(context, name)));
  const mirrorResults = await Promise.all(mirrorNames.map((name) => fetchMirror(context, name)));
  const snapshots = {};
  names.forEach((name, idx) => {
    snapshots[name] = results[idx];
  });
  mirrorNames.forEach((name, idx) => {
    snapshots[name] = mirrorResults[idx];
  });
  return snapshots;
}

function mapMetricsFromSnapshots(snapshots, catalog) {
  const groupMap = buildGroupMap(catalog.groups);
  const metrics = {};

  const yieldCurve = snapshots["us-yield-curve"];
  const yieldItems = yieldCurve?.data?.items || [];
  const yieldMap = new Map(yieldItems.map((item) => [item.maturity, item]));

  const tenY = coerceNumber(yieldMap.get("10y")?.value);
  const twoY = coerceNumber(yieldMap.get("2y")?.value);
  const thirtyY = coerceNumber(yieldMap.get("30y")?.value);
  const yieldsDate = yieldMap.get("10y")?.date || yieldCurve?.dataAt || yieldCurve?.generatedAt || null;

  const volRegime = snapshots["vol-regime"];
  const vixItem = volRegime?.data?.items?.[0] || null;

  const riskRegime = snapshots["risk-regime-lite"];
  const riskItem = riskRegime?.data?.items?.[0] || null;

  const creditStress = snapshots["credit-stress-proxy"];
  const creditLite = snapshots["credit-spread-proxy-lite"];
  const creditItem =
    creditStress?.data?.items?.find((item) => item.series === "HY_OAS") ||
    creditLite?.data?.items?.find((item) => item.series === "HY_OAS") ||
    null;

  const fxBoard = snapshots["fx-board"];
  const fxRates = normalizeFxRates(fxBoard?.data?.items || []);

  const energy = snapshots["energy-macro"];
  const wtiItem = energy?.data?.items?.find((item) => item.series === "WTI") || null;

  const cockpit = snapshots["market-cockpit"];
  const benchmarkItems = cockpit?.data?.items?.find((item) => item.section === "benchmarks")?.items || [];
  const benchmarkMap = new Map(benchmarkItems.map((item) => [item.symbol, item]));
  const priceSnapshot = snapshots["price-snapshot"];
  const priceItems = priceSnapshot?.items || priceSnapshot?.data?.items || [];
  const priceMap = new Map(priceItems.map((item) => [item.symbol, item]));

  const breadth = snapshots["market-breadth"];
  const breadthSummary = breadth?.data?.summary || {};

  const highsLows = snapshots["highs-vs-lows"];
  const highsLowsSummary = highsLows?.data?.summary || {};

  const sectorRotation = snapshots["sector-rotation"];
  const sectorItems = sectorRotation?.data?.items || [];

  const inflation = snapshots["inflation-pulse"];
  const inflationItem = inflation?.data?.items?.find((item) => item.series === "CPI") || null;

  const labor = snapshots["labor-pulse"];
  const laborItem = labor?.data?.items?.find((item) => item.series === "UNRATE") || null;

  const setMetric = (id, value, asOf, sourcePrimary) => {
    if (value === null || value === undefined) return;
    const groupId = groupMap.get(id) || "";
    const entry = catalog.metricsCatalog[id];
    const validation = validateValue(entry.valueType, value);
    const metric = buildMetric({
      catalog,
      metricId: id,
      groupId,
      value,
      asOf,
      change: { d1: null, w1: null, m1: null },
      spark: [],
      sourcePrimary,
      fallbackUsed: false,
      validation,
      badgeText: validation === "FAIL_SPIKE" ? "Verify" : null
    });
    if (metric) {
      metrics[id] = metric;
    }
  };

  setMetric("rates.us10y", tenY, yieldsDate, "FRED:DGS10");
  setMetric("rates.us2y", twoY, yieldsDate, "FRED:DGS2");
  setMetric("rates.us30y", thirtyY, yieldsDate, "FRED:DGS30");
  if (tenY !== null && twoY !== null) {
    setMetric("rates.yield_curve", (tenY - twoY) * 100, yieldsDate, "Derived from DGS10-DGS2");
  }

  setMetric("risk.vix", coerceNumber(vixItem?.value), vixItem?.date || volRegime?.dataAt, "FRED:VIXCLS");

  if (riskItem?.regime) {
    const labelRaw = String(riskItem.regime || "").toUpperCase();
    const label =
      labelRaw.includes("ON") ? "RISK_ON" : labelRaw.includes("OFF") ? "RISK_OFF" : "NEUTRAL";
    setMetric("risk.regime", label, riskItem?.date || riskRegime?.dataAt, "Derived");
  }

  if (creditItem?.value !== undefined) {
    const raw = coerceNumber(creditItem.value);
    const bpValue = raw !== null && raw < 50 ? raw * 100 : raw;
    setMetric("credit.hy_oas", bpValue, creditItem?.date || creditStress?.dataAt, "FRED:BAMLH0A0HYM2");
  }

  setMetric("fx.eurusd", fxRates.eurusd, fxRates.date || fxBoard?.dataAt, "ECB FX");
  setMetric("fx.gbpusd", fxRates.gbpusd, fxRates.date || fxBoard?.dataAt, "ECB FX");
  setMetric("fx.usdjpy", fxRates.usdjpy, fxRates.date || fxBoard?.dataAt, "ECB FX");

  setMetric("comm.wti", coerceNumber(wtiItem?.value), wtiItem?.date || energy?.dataAt, "FRED:DCOILWTICO");

  const spy = benchmarkMap.get("SPY");
  const qqq = benchmarkMap.get("QQQ");
  const iwm = benchmarkMap.get("IWM");
  const spyFallback = priceMap.get("SPY");
  const qqqFallback = priceMap.get("QQQ");
  const iwmFallback = priceMap.get("IWM");
  setMetric(
    "eq.sp500",
    coerceNumber(spy?.close ?? spyFallback?.close),
    spy?.lastBarDate || spyFallback?.lastBarDate || cockpit?.dataAt || priceSnapshot?.asOf,
    "Stooq/^SPX proxy"
  );
  setMetric(
    "eq.nasdaq",
    coerceNumber(qqq?.close ?? qqqFallback?.close),
    qqq?.lastBarDate || qqqFallback?.lastBarDate || cockpit?.dataAt || priceSnapshot?.asOf,
    "Stooq/^NDQ proxy"
  );
  setMetric(
    "eq.russell2000",
    coerceNumber(iwm?.close ?? iwmFallback?.close),
    iwm?.lastBarDate || iwmFallback?.lastBarDate || cockpit?.dataAt || priceSnapshot?.asOf,
    "Stooq/^RUT proxy"
  );

  const advancers = coerceNumber(breadthSummary.advancers);
  const decliners = coerceNumber(breadthSummary.decliners);
  if (advancers !== null && decliners !== null && decliners !== 0) {
    setMetric("breadth.ad_ratio", advancers / decliners, breadth?.dataAt, "Derived");
  }

  const highs = coerceNumber(highsLowsSummary.highs);
  const lows = coerceNumber(highsLowsSummary.lows);
  if (highs !== null && lows !== null) {
    setMetric("breadth.high_low_52w", highs - lows, highsLows?.dataAt, "Derived");
  }

  const rotationValue = computeDatasetTopFlop(sectorItems);
  if (rotationValue) {
    setMetric("sectors.rotation", rotationValue, sectorRotation?.dataAt, "Derived from sector ETF returns");
  }

  setMetric("macro.us_cpi", coerceNumber(inflationItem?.yoyPct), inflationItem?.date || inflation?.dataAt, "FRED:CPIAUCSL");
  setMetric("macro.us_unemployment", coerceNumber(laborItem?.value), laborItem?.date || labor?.dataAt, "FRED:UNRATE");

  const cryptoSnapshot = snapshots["crypto-snapshot"];
  const cryptoItems = cryptoSnapshot?.items || cryptoSnapshot?.data?.items || [];
  if (cryptoItems.length) {
    const totalCap = cryptoItems
      .map((item) => coerceNumber(item.marketCap))
      .filter((value) => value !== null)
      .reduce((sum, value) => sum + value, 0);
    const btcCap =
      cryptoItems.find((item) => String(item.symbol || "").toUpperCase() === "BTC")?.marketCap;
    const btcCapValue = coerceNumber(btcCap);
    const asOf = cryptoSnapshot?.asOf || cryptoSnapshot?.updatedAt || cryptoSnapshot?.runId;
    if (totalCap > 0) {
      setMetric("crypto.market_cap", totalCap, asOf, "Mirror:crypto-snapshot");
    }
    if (totalCap > 0 && btcCapValue !== null) {
      setMetric("crypto.btc_dominance", (btcCapValue / totalCap) * 100, asOf, "Mirror:crypto-snapshot");
    }
  }

  return { metrics };
}

function applyLastGoodFallback(metrics, lastGood) {
  if (!lastGood || !lastGood.metricsById) return { metrics, fallbackUsed: false, missing: [] };
  let fallbackUsed = false;
  const missing = [];
  Object.keys(metricsCatalog.metricsCatalog).forEach((metricId) => {
    if (metrics[metricId]) return;
    const fallbackMetric = lastGood.metricsById[metricId];
    if (fallbackMetric) {
      metrics[metricId] = {
        ...fallbackMetric,
        quality: {
          ...fallbackMetric.quality,
          isFresh: false,
          isStale: true,
          validation: fallbackMetric.quality?.validation || "FAIL_NULL"
        },
        source: {
          ...fallbackMetric.source,
          fallbackUsed: true
        }
      };
      fallbackUsed = true;
      return;
    }
    missing.push(metricId);
  });
  return { metrics, fallbackUsed, missing };
}

function buildEnvelope({ data, meta, error }) {
  return { meta, data, error };
}

export async function onRequestGet(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  if (url.searchParams.get("v") !== "5") {
    const payload = buildEnvelope({
      meta: {
        status: "ERROR",
        requestId: createRequestId(),
        asOf: nowIso(),
        generatedAt: nowIso(),
        ageSeconds: 0,
        version: VERSION,
        source: { primary: "metrics-v5", fallbackUsed: false },
        cache: { hit: false, ttlSeconds: CACHE_TTL_SECONDS, kvAvailable: false },
        circuitOpen: true,
        missingMetricIds: [],
        metricsCount: 0,
        groupsCount: metricsCatalog.groups.length
      },
      data: null,
      error: { code: "BAD_VERSION", message: "Missing or invalid v parameter", details: null }
    });
    return jsonResponse(payload, { status: 400, headers: { "Cache-Control": "no-store" } });
  }

  const hasKV = Boolean(env?.RV_KV && typeof env.RV_KV.get === "function");
  const cacheEntry = hasKV ? await kvGetJson(env, CACHE_KEY) : { value: null };
  const cached = cacheEntry?.value || null;
  if (cached?.meta?.generatedAt) {
    const ageSeconds = Math.max(0, (Date.now() - Date.parse(cached.meta.generatedAt)) / 1000);
    if (ageSeconds <= CACHE_TTL_SECONDS) {
      const requestId = createRequestId();
      const response = buildEnvelope({
        meta: {
          ...cached.meta,
          requestId,
          ageSeconds,
          cache: { ...cached.meta.cache, hit: true }
        },
        data: cached.data,
        error: cached.error
      });
      return jsonResponse(response, {
        status: 200,
        headers: { "Cache-Control": `public, max-age=${CACHE_TTL_SECONDS}` }
      });
    }
  }

  const lastGoodEntry = hasKV ? await kvGetJson(env, LASTGOOD_KEY) : { value: null };
  const lastGood = lastGoodEntry?.value?.data || null;

  const snapshots = await loadSnapshots(context);
  const { metrics: rawMetrics } = mapMetricsFromSnapshots(snapshots, metricsCatalog);
  const { metrics, fallbackUsed } = applyLastGoodFallback(rawMetrics, lastGood);
  const omitId = url.searchParams.get("omit");
  if (omitId && metrics[omitId]) {
    delete metrics[omitId];
  }

  const allMetricIds = Object.keys(metricsCatalog.metricsCatalog);
  const presentMetricIds = Object.keys(metrics);
  const missingMetricIds = allMetricIds.filter((id) => !metrics[id]);

  const metricsCount = presentMetricIds.length;
  const groupsCount = metricsCatalog.groups.length;

  const status =
    metricsCount === 0 ? "ERROR" : metricsCount < allMetricIds.length ? "PARTIAL" : "OK";

  const now = nowIso();
  const asOf = presentMetricIds
    .map((id) => metrics[id]?.asOf)
    .filter(Boolean)
    .sort()
    .slice(-1)[0] || now;

  const data =
    status === "ERROR"
      ? null
      : {
          groups: metricsCatalog.groups,
          metricsById: metrics,
          signals: buildSignals(metrics, signalRules),
          uiDefaults: {
            defaultUi: uiLayouts.defaultUi,
            availableUis: uiLayouts.availableUis
          }
        };

  const meta = {
    status,
    requestId: createRequestId(),
    asOf,
    generatedAt: now,
    ageSeconds: 0,
    version: VERSION,
    source: { primary: "snapshots", fallbackUsed },
    cache: { hit: false, ttlSeconds: CACHE_TTL_SECONDS, kvAvailable: hasKV },
    circuitOpen: !hasKV,
    missingMetricIds: status === "OK" ? [] : missingMetricIds,
    metricsCount,
    groupsCount
  };

  const error =
    status === "ERROR"
      ? { code: "NO_DATA", message: "No metrics available", details: null }
      : null;

  const payload = buildEnvelope({ meta, data, error });

  if (hasKV && status !== "ERROR") {
    await kvPutJson(env, LASTGOOD_KEY, { data, meta: { savedAt: now } }, LASTGOOD_TTL_SECONDS);
    await kvPutJson(env, LASTGOOD_META_KEY, meta, LASTGOOD_TTL_SECONDS);
  }

  if (hasKV) {
    await kvPutJson(env, CACHE_KEY, payload, CACHE_TTL_SECONDS);
  }

  return jsonResponse(payload, {
    status: status === "ERROR" ? 503 : 200,
    headers: { "Cache-Control": `public, max-age=${CACHE_TTL_SECONDS}` }
  });
}
