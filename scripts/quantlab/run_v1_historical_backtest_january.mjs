import fs from 'node:fs/promises';
import path from 'node:path';
import { evaluateSetup, evaluateTrigger } from '../../scripts/scientific-analyzer/generate-analysis.mjs';
import { generateForecast } from '../../scripts/forecast/forecast_engine.mjs';

async function main() {
  console.log("=== 🚀 Starting Mature January Backtest batch for Win Rate analytics ===");
  const baseDir = '/Users/michaelpuchowezki/QuantLabHot/rubikvault-quantlab/features/store/feature_store_version=v4_q1panel_fullchunk_daily';
  const sqlPath = 'QuantLab/registry/audit_trail_backtest_jan.sql';
  await fs.writeFile(sqlPath, ""); 

  const cp = await import('node:child_process');

  const dates = [
      '2026-01-05',
      '2026-01-06',
      '2026-01-07',
      '2026-01-08',
      '2026-01-09'
  ];

  for (const today of dates) {
    console.log(`\n--- Processing Date: ${today} ---`);
    const parquetPath = path.join(baseDir, `asof_date=${today}/asset_class=stock/*.parquet`);
    
    const dirExists = await fs.stat(path.dirname(parquetPath.replace('*.parquet', ''))).catch(() => null);
    if (!dirExists) {
        console.warn(`Skipping missing date folder: ${today}`);
        continue;
    }

    const tmpJson = `/tmp/backtest_jan_${today}.json`;
    const query = `SELECT asset_id, asof_date, close_raw as close, sma_20, sma_50, sma_200, macd_hist, rsi_14 as rsi, atr_pct_14 as atr_pct FROM '${parquetPath}'`;
    
    cp.execSync(`npx duckdb -json -c "${query}" > ${tmpJson}`);
    const rows = JSON.parse(await fs.readFile(tmpJson, 'utf8'));
    console.log(`Loaded ${rows.length} rows for ${today}.`);

    for (const row of rows) {
        try {
            const ind = {
                close: row.close || 0,
                sma20: row.sma_20 || 0,
                sma50: row.sma_50 || 0,
                sma200: row.sma_200 || 0,
                rsi: row.rsi || 50,
                macdHist: row.macd_hist || 0,
                atrPct: row.atr_pct || 2.0,
                volumeRatio: 1.0
            };
            
            let sciScore = 0;
            try {
                const setup = evaluateSetup(ind);
                const trigger = evaluateTrigger(ind, setup);
                sciScore = trigger.fulfilled ? trigger.score : setup.fulfilled ? setup.score : 0;
            } catch {}

            let fcScore = 0;
            try {
                const fc = generateForecast({
                    ticker: row.asset_id || "UNK",
                    tradingDate: today,
                    horizon: "20d",
                    featureSnapshot: { features: { rsi_14: ind.rsi, returns_5d: 0 } },
                    championSpec: { neutral_band: 0.03 }
                });
                fcScore = fc.p_up || 0;
            } catch {}

            const safeSymbol = (row.asset_id || "UNK").replace(/'/g, "''");
            const safeId = safeSymbol.replace(/:/g, '_');

            const sqlSci = `INSERT INTO hypotheses VALUES ('hyp_sci_${safeId}_${today}_${Date.now()}', '${safeSymbol}', '${today}', 'scientific', 'v1', ${sciScore/100}, 0.8, 0.2, 20, 'T_plus_1', 'snap_123', '${new Date().toISOString()}', 'synthetic', '{}');`;
            const sqlFc = `INSERT INTO hypotheses VALUES ('hyp_fc_${safeId}_${today}_${Date.now()}', '${safeSymbol}', '${today}', 'forecast', 'v1', ${fcScore}, 0.8, 0.2, 20, 'T_plus_1', 'snap_123', '${new Date().toISOString()}', 'synthetic', '{}');`;
            await fs.appendFile(sqlPath, sqlSci + "\n" + sqlFc + "\n");
        } catch (err) {}
    }
    console.log(`Finished ${today}`);
  }

  console.log("\nCommitting to DuckDB...");
  cp.execSync('npx duckdb QuantLab/registry/audit_trail.duckdb < QuantLab/registry/audit_trail_backtest_jan.sql');
  console.log("🎉 January data committed successfully to DuckDB Freeze Registry batches.");
}

main();
