/**
 * Forecast UI Runtime Smoke Test
 * 
 * GAP 3 FIX: Automated runtime verification that:
 * 1. Bootstrap notice is hidden when forecasts exist
 * 2. Forecast table renders ≥100 rows
 * 3. No blocking JavaScript errors
 * 
 * Uses Playwright for headless browser testing.
 * Run with: npm run test:forecast-ui
 */

import { chromium } from 'playwright';

const BASE_URL = process.env.TEST_URL || 'http://localhost:8788';
const FORECAST_URL = `${BASE_URL}/forecast`;

async function runSmokeTest() {
    console.log('🔬 Forecast UI Runtime Smoke Test');
    console.log(`   URL: ${FORECAST_URL}\n`);

    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext();
    const page = await context.newPage();

    const errors = [];
    page.on('pageerror', (error) => {
        errors.push(error.message);
    });

    try {
        // Navigate to forecast page
        console.log('📄 Loading forecast page...');
        const response = await page.goto(FORECAST_URL, {
            waitUntil: 'domcontentloaded',
            timeout: 15000
        });

        if (!response.ok()) {
            throw new Error(`Page load failed: HTTP ${response.status()}`);
        }
        console.log('✅ Page loaded successfully\n');

        // Wait for JavaScript to execute and table to populate
        await page.waitForSelector('#forecasts-table tbody tr', { timeout: 10000 });

        // Test 1: Bootstrap notice visibility
        console.log('🧪 Test 1: Bootstrap notice visibility');
        const bootstrapNotice = await page.$('#bootstrap-notice');
        if (!bootstrapNotice) {
            throw new Error('Bootstrap notice element not found');
        }

        const noticeDisplay = await bootstrapNotice.evaluate((el) => {
            return window.getComputedStyle(el).display;
        });

        if (noticeDisplay !== 'none') {
            throw new Error(`Bootstrap notice visible (display: ${noticeDisplay}), expected 'none'`);
        }
        console.log('   ✅ Bootstrap notice is HIDDEN (display: none)\n');

        // Test 2: Forecast table row count
        console.log('🧪 Test 2: Forecast table row count');
        const rows = await page.$$('#forecasts-table tbody tr');
        const rowCount = rows.length;

        if (rowCount < 100) {
            throw new Error(`Forecast table has ${rowCount} rows, expected ≥100`);
        }
        console.log(`   ✅ Forecast table has ${rowCount} rows (≥100 required)\n`);

        // Test 3: Stock count element
        console.log('🧪 Test 3: Stock count display');
        const countText = await page.$eval('#forecast-count', el => el.textContent);
        const stockCount = parseInt(countText.match(/\d+/)?.[0] || '0');

        if (stockCount < 100) {
            throw new Error(`Stock count shows ${stockCount}, expected ≥100`);
        }
        console.log(`   ✅ Stock count displays: "${countText}"\n`);

        // Test 4: No blocking JS errors
        console.log('🧪 Test 4: JavaScript error check');
        const criticalErrors = errors.filter(e =>
            !e.includes('404') && // 404s for missing reports are acceptable
            !e.includes('favicon')
        );

        if (criticalErrors.length > 0) {
            throw new Error(`Critical JS errors: ${criticalErrors.join(', ')}`);
        }
        console.log(`   ✅ No critical JavaScript errors\n`);

        // Summary
        console.log('═'.repeat(50));
        console.log('🎉 ALL SMOKE TESTS PASSED');
        console.log('═'.repeat(50));
        console.log(`   Bootstrap notice: HIDDEN`);
        console.log(`   Table rows: ${rowCount}`);
        console.log(`   Stock count: ${countText}`);
        console.log(`   JS errors: ${errors.length} (${criticalErrors.length} critical)`);

    } catch (error) {
        console.error('\n❌ SMOKE TEST FAILED:', error.message);
        process.exit(1);
    } finally {
        await browser.close();
    }
}

runSmokeTest().catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
});
