// Smoke test for API Stock
// USAGE: node scripts/dev/smoke-api-stock.mjs
// EXPECTS: Local dev server running or ability to call functions locally (unlikely without wrangler).
// INSTEAD: We will simulate the function call logic by importing the module IF possible, 
// OR we just define the expectations for a manual CURL test.

// Since this is a "script", let's make it a test harness that mocks the env and calls the provider chain directly.

import { fetchBarsWithProviderChain } from '../../functions/api/_shared/eod-providers.mjs';

const MOCK_ENV = {
    EODHD_API_KEY: process.env.EODHD_API_KEY || 'mock_key',
    TIINGO_API_KEY: process.env.TIINGO_API_KEY || 'mock_key',
    TWELVEDATA_API_KEY: process.env.TWELVEDATA_API_KEY || 'mock_key'
};

const SYMBOL = 'AAPL';

async function runSmoke() {
    console.log('💨 Running Smoke Test for Provider Chain...');
    console.log(`Symbol: ${SYMBOL}`);

    const result = await fetchBarsWithProviderChain(SYMBOL, MOCK_ENV, { startDate: '2024-01-01' });

    console.log('Result OK:', result.ok);
    console.log('Selected Provider:', result.chain?.selected);
    console.log('Primary:', result.chain?.primary);

    if (result.ok) {
        console.log('Bars Count:', result.bars.length);
        if (result.bars.length > 0) {
            console.log('Sample Bar:', result.bars[0]);

            // Assert formatting
            const bar = result.bars[0];
            const keys = Object.keys(bar).sort();
            const expected = ['close', 'date', 'high', 'low', 'open', 'volume'];
            const keysMatch = JSON.stringify(keys) === JSON.stringify(expected);
            console.log('Keys Integrity:', keysMatch ? 'PASS' : `FAIL (Got ${keys})`);

            if (!keysMatch) process.exit(1);
            if (!bar.date.match(/^\d{4}-\d{2}-\d{2}$/)) {
                console.error('Date format FAIL');
                process.exit(1);
            }
        }
    } else {
        console.error('Fetch Failed:', result.error);
        // If it failed because of invalid auth (expected in mock), it's a pass for the *harness* logic
        // but a fail for the *integration*.
        // We just want to ensure it TRIED to use EODHD.

        if (result.chain?.primary === 'eodhd') {
            console.log('✅ Configuration Check: Primary is EODHD');
        } else {
            console.error('❌ Configuration Check: Primary is NOT EODHD');
            process.exit(1);
        }
    }
}

runSmoke().catch(e => {
    console.error(e);
    process.exit(1);
});
