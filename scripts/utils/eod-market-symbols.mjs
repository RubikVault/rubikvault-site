import { fetchStooqDaily } from "./stooq-fetch.mjs";
import { sma, rsiWilder, macd, atrPercent, pctChange, avg, alphaScore, clamp } from "./market-indicators.mjs";
import { stochRsi } from "./market-rsi.mjs";

function weeklySeries(values, step = 5) {
  const out = [];
  for (let i = values.length - 1; i >= 0; i -= step) {
    out.unshift(values[i]);
  }
  return out;
}

export async function processSymbols(universe) {
  const results = [];
  const missingSymbols = [];
  const errors = [];

  for (const symbol of universe) {
    try {
      const bars = await fetchStooqDaily(symbol);
      results.push({ symbol, bars });
    } catch (err) {
      missingSymbols.push(symbol);
      errors.push({ symbol, error: String(err.message || err) });
    }
  }

  const itemsQuotes = [];
  const itemsTech = [];
  const itemsAlpha = [];
  const itemsAnomaly = [];
  const itemsBreakout = [];
  let latestAsOf = null;
  let breadth50Count = 0;
  let breadth200Count = 0;
  let breadthTotal = 0;

  for (const { symbol, bars } of results) {
    const { dates, highs, lows, closes, volumes } = bars;
    const barsUsed = closes.length;
    const lastIdx = closes.length - 1;
    const close = closes[lastIdx];
    const prevClose = closes[lastIdx - 1];
    const lastDate = dates[lastIdx];
    if (!latestAsOf || lastDate > latestAsOf) latestAsOf = lastDate;

    const sma20 = sma(closes, 20);
    const sma50 = sma(closes, 50);
    const sma200 = sma(closes, 200);
    const rsi14 = rsiWilder(closes, 14);
    const weeklyCloses = weeklySeries(closes, 5);
    const rsiWeekly = rsiWilder(weeklyCloses, 14);
    const stochRsiVal = stochRsi(closes, 14);
    const macdVal = macd(closes);
    const atr14 = atrPercent(highs, lows, closes, 14);
    const avgVol20 = avg(volumes, 20);
    const rvol20 = Number.isFinite(avgVol20) && avgVol20 > 0 ? volumes[lastIdx] / avgVol20 : null;
    const changePct = pctChange(close, prevClose);
    const perf1w = pctChange(close, closes[lastIdx - 5]);
    const missingFields = [];
    if (!Number.isFinite(sma20)) missingFields.push("sma20");
    if (!Number.isFinite(sma50)) missingFields.push("sma50");
    if (!Number.isFinite(sma200)) missingFields.push("sma200");
    if (!Number.isFinite(rsi14)) missingFields.push("rsi14");
    if (!Number.isFinite(rsiWeekly)) missingFields.push("rsiWeekly");
    if (!macdVal) missingFields.push("macd");

    if (Number.isFinite(sma50)) {
      breadthTotal += 1;
      if (close > sma50) breadth50Count += 1;
    }
    if (Number.isFinite(sma200) && close > sma200) breadth200Count += 1;

    itemsQuotes.push({ symbol, close, prevClose, changePct, lastBarDate: lastDate, barsUsed, missingFields });
    let maRegime = "Neutral";
    if (Number.isFinite(sma20) && Number.isFinite(sma50) && Number.isFinite(sma200)) {
      if (close > sma20 && sma20 > sma50 && sma50 > sma200) maRegime = "Bull";
      else if (close < sma200) maRegime = "Bear";
    }

    itemsTech.push({
      symbol,
      rsi: rsi14,
      rsiWeekly,
      ma20: sma20,
      ma50: sma50,
      ma200: sma200,
      maRegime,
      macd: macdVal ? macdVal.value : null,
      macd_signal: macdVal ? macdVal.signal : null,
      macd_hist: macdVal ? macdVal.histogram : null,
      stochRsi: stochRsiVal,
      perf1w,
      atr14,
      barsUsed,
      missingFields
    });

    const alpha = alphaScore({
      close,
      sma20,
      sma50,
      sma200,
      rsi: rsi14,
      macdVal: macdVal ? macdVal.value : null,
      macdSignal: macdVal ? macdVal.signal : null,
      macdHist: macdVal ? macdVal.histogram : null,
      rvol20,
      prevClose
    });
    itemsAlpha.push({
      symbol,
      score: alpha.score,
      state: alpha.score >= 70 ? "STRONG" : alpha.score >= 55 ? "WATCH" : "NEUTRAL",
      reasons: alpha.reasons,
      barsUsed,
      missingFields
    });

    const avgTr20 = avg(highs.map((h, i) => h - lows[i]), 20);
    const tr = Number.isFinite(highs[lastIdx]) && Number.isFinite(lows[lastIdx]) ? highs[lastIdx] - lows[lastIdx] : null;
    const rangeExp = Number.isFinite(avgTr20) && avgTr20 > 0 && Number.isFinite(tr) ? tr / avgTr20 : null;
    const anomaly = (Number.isFinite(rvol20) && rvol20 >= 1.8) || (Number.isFinite(rangeExp) && rangeExp >= 1.5);
    if (anomaly) {
      itemsAnomaly.push({
        symbol,
        rvol20,
        rangeExp,
        changePct,
        barsUsed,
        missingFields,
        reasons: [
          rvol20 >= 1.8 ? "RVOL_SPIKE" : null,
          rangeExp >= 1.5 ? "RANGE_EXPANSION" : null
        ].filter(Boolean)
      });
    }

    const trendUp = Number.isFinite(sma50) && Number.isFinite(sma200) && close > sma50 && close > sma200;
    if (trendUp && Number.isFinite(rvol20) && rvol20 >= 1.5 && Number.isFinite(rangeExp) && rangeExp >= 1.5) {
      itemsBreakout.push({
        symbol,
        score: clamp((rvol20 || 1) * 20 + (rangeExp || 1) * 20, 0, 100),
        reasons: ["RVOL_SPIKE", "RANGE_EXPANSION", "TREND_UP"],
        barsUsed,
        missingFields
      });
    }
  }

  const spyPerf1w = itemsTech.find((item) => item.symbol === "SPY")?.perf1w ?? null;
  if (Number.isFinite(spyPerf1w)) {
    itemsTech.forEach((item) => {
      item.relPerf1w = Number.isFinite(item.perf1w) ? item.perf1w - spyPerf1w : null;
    });
  }

  return {
    itemsQuotes,
    itemsTech,
    itemsAlpha,
    itemsAnomaly,
    itemsBreakout,
    latestAsOf,
    breadth50Count,
    breadth200Count,
    breadthTotal,
    missingSymbols,
    errors
  };
}
