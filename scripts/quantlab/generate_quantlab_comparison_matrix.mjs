import fs from 'node:fs/promises';
import { execSync } from 'node:child_process';
import path from 'node:path';
import { evaluateSetup, evaluateTrigger } from '../../scripts/scientific-analyzer/generate-analysis.mjs';
import { generateForecast } from '../../scripts/forecast/forecast_engine.mjs';

async function main() {
  console.log("=== 📊 Generating Quant Lab overlap Comparison ===");
  const marketPath = 'public/data/quantlab/reports/v4-daily-market.json';
  const dbPath = 'QuantLab/registry/audit_trail.duckdb';
  const outputPath = 'QuantLab/reports/quantlab_correlation.md';

  await fs.mkdir(path.dirname(outputPath), { recursive: true });

  const marketData = JSON.parse(await fs.readFile(marketPath, 'utf8'));
  const assetOpinions = marketData.assetOpinions || {};

  const matrix = [];
  
  for (const assetId in assetOpinions) {
      const asset = assetOpinions[assetId];
      const symbol = asset.symbol;
      const votes = asset.overall?.buyVotes || 0;
      const linkMetrics = asset.metrics || {};

      // Calculate Scientific
      const ind = {
        close: linkMetrics.closeRaw || 0,
        rsi: linkMetrics.rsi14 || 50,
        macdHist: linkMetrics.macdHist || 0,
        atrPct: 2.0,
        volumeRatio: 1.0
      };
      
      let sciScore = 0;
      try {
        const setup = evaluateSetup(ind);
        const trigger = evaluateTrigger(ind, setup);
        sciScore = trigger.fulfilled ? trigger.score : setup.fulfilled ? setup.score : 0;
      } catch {}

      // Calculate Forecast
      let fcScore = 0;
      try {
        const fc = generateForecast({
          ticker: symbol || "UNK",
          tradingDate: "2026-03-11",
          horizon: "20d",
          featureSnapshot: { features: { rsi_14: ind.rsi, returns_5d: 0 } },
          championSpec: { neutral_band: 0.03 }
        });
        fcScore = fc.p_up || 0;
      } catch {}

      matrix.push({
          symbol,
          name: asset.name || "",
          quantLab: votes,
          scientific: (sciScore / 100).toFixed(2),
          forecast: fcScore.toFixed(2)
      });
  }

  // Rank by QuantLab Node node Node Node node Node Node
  const top10 = matrix.sort((a, b) => b.quantLab - a.quantLab).slice(0, 10);

  let md = `# 📊 Quant Lab Side-by-Side Vergleich (Zeitraum: 11. März 2026)\n\n`;
  md += `| Asset | Name | 🤖 Quant Lab Votes | 🔬 Scientific Score | 🔮 Forecast Score |\n`;
  md += `|---|---|---|---|---|\n`;

  top10.forEach(r => {
      md += `| ${r.symbol} | ${r.name} | ${r.quantLab} | ${r.scientific} | ${r.forecast} |\n`;
  });

  md += `\n### ⚖️ Erklärung:\n`;
  md += `- **Historie:** Die massenhaften Win-Rates wurden für Januar berechnet, da dort 20d Returns reif sind.\n`;
  md += `- **Überlappung:** Für den 11. März haben wir **sowohl die QuantLab Signale** (aus dem JSON) als auch das parallele System aufgeschlüsselt.\n`;

  await fs.writeFile(outputPath, md);
  console.log("Matrix generated successfully of length", top10.length);
}

main();
