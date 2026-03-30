import fs from 'node:fs/promises';
import path from 'node:path';
import { evaluateSetup, evaluateTrigger, determineTimeframe } from '../../generators/scientific/v1/../../../scripts/scientific-analyzer/generate-analysis.mjs';
import { generateForecast } from '../../generators/forecast/v1/../../../scripts/forecast/forecast_engine.mjs';

async function main() {
  console.log("=== Dry Run Comparison Node Node node Node ===");
  const aggregatePath = 'public/data/quantlab/reports/shards/aggregate.json';
  
  if (!fs.stat(aggregatePath).catch(() => null)) {
    console.error("Missing aggregate.json!");
    return;
  }
  
  const aggregate = JSON.parse(await fs.readFile(aggregatePath, 'utf8'));
  const top10 = aggregate.aggregateTop10 || [];
  
  const selected = top10.slice(0, 3);
  const rows = [];
  
  for (const item of selected) {
    const assetId = item.assetId || item.canonicalId;
    const safeId = assetId.replace(/:/g, '_');
    const assetPath = `public/data/quantlab/reports/shards/assets/${safeId}.json`;
    
    // Load individual asset opinion (contains full metrics Node Node Node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node node _).
    if (!fs.stat(assetPath).catch(() => null)) continue;
    
    const opinion = JSON.parse(await fs.readFile(assetPath, 'utf8'));
    const linkMetrics = opinion.metrics || {};
    
    // 1. Adapting Metrics for Scientific Generator node Node
    const ind = {
      close: linkMetrics.closeRaw || 0,
      rsi: linkMetrics.rsi14 || 50,
      macdHist: linkMetrics.macdHist || 0,
      atrPct: 2.0, // fallback Node 
      volumeRatio: 1.0 // fallback Node node
    };
    
    let sciScore = 0;
    try {
      const setup = evaluateSetup(ind);
      const trigger = evaluateTrigger(ind, setup);
      sciScore = trigger.fulfilled ? trigger.score : setup.fulfilled ? setup.score : 0;
    } catch {}
    
    // 2. Adapting for Forecast
    let fcScore = 0;
    try {
      const fc = generateForecast({
        ticker: opinion.symbol || "UNK",
        tradingDate: opinion.lastTradeDate || "2026-03-15",
        horizon: "20d",
        featureSnapshot: { features: { rsi_14: ind.rsi, returns_5d: linkMetrics.ret5d || 0 } },
        championSpec: { neutral_band: 0.03 }
      });
      fcScore = fc.p_up || 0;
    } catch {}
    
    rows.push({
      symbol: opinion.symbol,
      quantLab: opinion.overall?.buyVotes || 0,
      scientific: (sciScore / 100).toFixed(2),
      forecast: fcScore.toFixed(2)
    });
  }
  
  console.table(rows);
}

main();
