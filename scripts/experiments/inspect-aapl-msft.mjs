#!/usr/bin/env node
import { evaluateTickerViaSharedCore } from '../lib/best-setups-local-loader.mjs';

async function main() {
    for (const ticker of ['AAPL', 'MSFT']) {
        const res = await evaluateTickerViaSharedCore(ticker);
        console.log(`\n=== 🔎 INSPECTION: ${ticker} ===`);
        console.log(`Fallback Verdict (Short):`, res?.decision?.horizons?.short?.verdict);
        console.log(`Fallback Verdict (Medium):`, res?.decision?.horizons?.medium?.verdict);
        console.log(`Fallback Verdict (Long):`, res?.decision?.horizons?.long?.verdict);
        console.log(`Setup Phase:`, res?.decision?.setup_phase);
        console.log(`Scores (Short):`, JSON.stringify(res?.decision?.horizons?.short?.scores, null, 2));
        console.log(`Explanation (Overall):`, res?.explanation?.summary ?? "No explanation available");
        console.log(`Scientific State Status:`, res?.v4_contract?.scientific?.status);
        if (res?.states) {
            console.log(`States (Snippet):`, {
                trend: res.states.trend,
                setup: res.states.setup,
                trigger: res.states.trigger
            });
        }
    }
}

main().catch(err => console.error(err));
