import { buildBaseMirror } from "./mirror-builders.mjs";
import { computeAlphaRadarPicks } from "../core/alpha-radar-core.mjs";
import { deriveRegime } from "./market-indicators.mjs";
import { loadMirror } from "./mirror-io.mjs";

export function buildDQ(items, missing) {
  if (!items.length) return "EMPTY";
  if (missing.length) return "PARTIAL";
  return "OK";
}

export function buildEodMirrors({
  universe,
  skipped,
  data,
  asOfIso,
  prevRegimePath
}) {
  const prevRegime = loadMirror(prevRegimePath) || {};
  const prevContext = prevRegime.context || {};
  const breadth50 = data.breadthTotal ? data.breadth50Count / data.breadthTotal : 0;
  const breadth200 = data.breadthTotal ? data.breadth200Count / data.breadthTotal : 0;
  const regimeState = deriveRegime({
    breadth50,
    breadth200,
    prevState: {
      currentRegime: prevContext.currentRegime || "neutral",
      pendingRegime: prevContext.pendingRegime || null,
      pendingCount: prevContext.pendingCount || 0,
      daysSinceChange: prevContext.daysSinceChange || 0
    }
  });

  const quotesMirror = buildBaseMirror({
    mirrorId: "quotes",
    mode: "EOD",
    cadence: "EOD",
    trust: "raw",
    sourceUpstream: "stooq",
    whyUnique: "EOD closing prices for tracked symbols.",
    items: data.itemsQuotes,
    context: { selectedSymbols: universe, skippedSymbols: skipped },
    missingSymbols: data.missingSymbols,
    errors: data.errors,
    notes: [`selectedSymbols=${universe.join(",")}`, `skippedSymbols=${skipped.join(",")}`],
    dataQuality: buildDQ(data.itemsQuotes, data.missingSymbols),
    asOf: asOfIso
  });

  const benchmarkSymbols = ["SPY", "QQQ", "IWM"];
  const marketHealthItems = data.itemsQuotes.filter((item) =>
    benchmarkSymbols.includes(item.symbol)
  );

  const marketHealthMirror = buildBaseMirror({
    mirrorId: "market-health",
    mode: "EOD",
    cadence: "EOD",
    trust: "derived",
    sourceUpstream: "stooq",
    whyUnique: "EOD benchmark health snapshot.",
    items: marketHealthItems,
    context: { benchmarks: benchmarkSymbols },
    missingSymbols: data.missingSymbols,
    errors: data.errors,
    notes: [],
    dataQuality: marketHealthItems.length ? "OK" : "EMPTY",
    asOf: asOfIso
  });

  const techMirrorBase = buildBaseMirror({
    mirrorId: "tech-signals",
    mode: "EOD",
    cadence: "EOD",
    trust: "derived",
    sourceUpstream: "stooq",
    whyUnique: "EOD technical indicators per symbol.",
    items: data.itemsTech,
    context: { selectedSymbols: universe },
    missingSymbols: data.missingSymbols,
    errors: data.errors,
    notes: [],
    dataQuality: buildDQ(data.itemsTech, data.missingSymbols),
    asOf: asOfIso
  });
  const techMirror = {
    ...techMirrorBase,
    generatedAt: techMirrorBase.updatedAt,
    data: {
      ...(techMirrorBase.data && typeof techMirrorBase.data === "object" ? techMirrorBase.data : {}),
      signals: data.itemsTech,
      rows: data.itemsTech
    }
  };

  const priceSnapshotMirror = buildBaseMirror({
    mirrorId: "price-snapshot",
    mode: "EOD",
    cadence: "EOD",
    trust: "derived",
    sourceUpstream: "stooq",
    whyUnique: "Compact EOD price snapshot.",
    items: data.itemsQuotes,
    context: { selectedSymbols: universe },
    missingSymbols: data.missingSymbols,
    errors: data.errors,
    notes: [],
    dataQuality: buildDQ(data.itemsQuotes, data.missingSymbols),
    asOf: asOfIso
  });

  const movers = [...data.itemsQuotes].filter((item) => Number.isFinite(item.changePct));
  movers.sort((a, b) => b.changePct - a.changePct);
  const topMoversItems = movers.slice(0, 10);

  const topMoversMirror = buildBaseMirror({
    mirrorId: "top-movers",
    mode: "EOD",
    cadence: "EOD",
    trust: "derived",
    sourceUpstream: "stooq",
    whyUnique: "EOD top movers derived from quotes.",
    items: topMoversItems,
    context: { selectedSymbols: universe },
    missingSymbols: data.missingSymbols,
    errors: data.errors,
    notes: [],
    dataQuality: topMoversItems.length ? "OK" : "EMPTY",
    asOf: asOfIso
  });

  const marketCockpitMirror = buildBaseMirror({
    mirrorId: "market-cockpit",
    mode: "EOD",
    cadence: "EOD",
    trust: "derived",
    sourceUpstream: "stooq",
    whyUnique: "Summary cockpit for benchmarks and signals.",
    items: [
      {
        section: "benchmarks",
        items: marketHealthItems
      }
    ],
    context: { benchmarks: benchmarkSymbols },
    missingSymbols: data.missingSymbols,
    errors: data.errors,
    notes: [],
    dataQuality: marketHealthItems.length ? "OK" : "EMPTY",
    asOf: asOfIso
  });

  const alphaMirrorBase = buildBaseMirror({
    mirrorId: "alpha-radar",
    mode: "EOD",
    cadence: "EOD",
    trust: "derived",
    sourceUpstream: "stooq",
    whyUnique: "EOD scoring based on technicals.",
    items: data.itemsAlpha,
    context: { selectedSymbols: universe },
    missingSymbols: data.missingSymbols,
    errors: data.errors,
    notes: [],
    dataQuality: buildDQ(data.itemsAlpha, data.missingSymbols),
    asOf: asOfIso
  });
  const alphaPicks = computeAlphaRadarPicks({ itemsAlpha: data.itemsAlpha });
  const alphaMirror = {
    ...alphaMirrorBase,
    generatedAt: alphaMirrorBase.updatedAt,
    data: {
      ...(alphaMirrorBase.data && typeof alphaMirrorBase.data === "object" ? alphaMirrorBase.data : {}),
      picks: alphaPicks
    }
  };

  const regimeMirror = buildBaseMirror({
    mirrorId: "market-regime",
    mode: "EOD",
    cadence: "EOD",
    trust: "derived",
    sourceUpstream: "stooq",
    whyUnique: "Breadth-based regime with hysteresis.",
    items: [
      {
        regime: regimeState.currentRegime,
        confidence: regimeState.confidence,
        breadth50,
        breadth200,
        daysSinceChange: regimeState.daysSinceChange
      }
    ],
    context: regimeState,
    missingSymbols: [],
    errors: [],
    notes: [],
    dataQuality: "OK",
    asOf: asOfIso
  });

  const anomalyMirror = buildBaseMirror({
    mirrorId: "volume-anomaly",
    mode: "EOD",
    cadence: "EOD",
    trust: "derived",
    sourceUpstream: "stooq",
    whyUnique: "Volume/range anomaly list.",
    items: data.itemsAnomaly,
    context: { selectedSymbols: universe },
    missingSymbols: data.missingSymbols,
    errors: data.errors,
    notes: [],
    dataQuality: data.itemsAnomaly.length ? "OK" : "EMPTY",
    asOf: asOfIso
  });

  const breakoutMirror = buildBaseMirror({
    mirrorId: "breakout-energy",
    mode: "EOD",
    cadence: "EOD",
    trust: "derived",
    sourceUpstream: "stooq",
    whyUnique: "Breakout energy candidates from EOD bars.",
    items: data.itemsBreakout,
    context: { selectedSymbols: universe },
    missingSymbols: data.missingSymbols,
    errors: data.errors,
    notes: [],
    dataQuality: data.itemsBreakout.length ? "OK" : "EMPTY",
    asOf: asOfIso
  });

  return {
    mirrors: {
      quotes: quotesMirror,
      "price-snapshot": priceSnapshotMirror,
      "top-movers": topMoversMirror,
      "market-cockpit": marketCockpitMirror,
      "market-health": marketHealthMirror,
      "tech-signals": techMirror,
      "alpha-radar": alphaMirror,
      "market-regime": regimeMirror,
      "volume-anomaly": anomalyMirror,
      "breakout-energy": breakoutMirror
    },
    regimeState
  };
}
