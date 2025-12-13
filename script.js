// =======================================================
// RUBIKVAULT MAIN SCRIPT
// Features: Market Ticker, Fear & Greed, Market Status
// =======================================================

const ASSETS_TO_TRACK = {
    'Crypto': ['BTC', 'ETH', 'SOL']
};

/**
 * FEATURE 1: Market Status Indicator
 * Checks if US Stock Market (NYSE/NASDAQ) is open.
 * Logic: Mon-Fri, 09:30 - 16:00 ET, excluding generic logic for holidays.
 */
function updateMarketStatus() {
    const statusEl = document.getElementById('rv-market-status-text');
    const indicatorEl = document.getElementById('rv-market-status-dot');
    const containerEl = document.getElementById('rv-market-status');
    
    if (!statusEl || !containerEl) return;

    const now = new Date();
    // Convert current time to New York time
    const nyTime = new Date(now.toLocaleString("en-US", {timeZone: "America/New_York"}));
    const day = nyTime.getDay(); // 0=Sun, 6=Sat
    const hour = nyTime.getHours();
    const minute = nyTime.getMinutes();
    
    // Simple Rules: Weekday + Time between 09:30 and 16:00
    const isWeekday = day >= 1 && day <= 5;
    const isPreMarket = isWeekday && (hour >= 4 && (hour < 9 || (hour === 9 && minute < 30)));
    const isOpenHours = isWeekday && (hour > 9 || (hour === 9 && minute >= 30)) && hour < 16;
    
    if (isOpenHours) {
        statusEl.textContent = "US Markets Open";
        indicatorEl.style.color = "#10b981"; // Green
        containerEl.style.borderColor = "rgba(16, 185, 129, 0.4)";
    } else if (isPreMarket) {
        statusEl.textContent = "Pre-Market";
        indicatorEl.style.color = "#f59e0b"; // Orange
        containerEl.style.borderColor = "rgba(245, 158, 11, 0.4)";
    } else {
        statusEl.textContent = "US Markets Closed";
        indicatorEl.style.color = "#ef4444"; // Red
        containerEl.style.borderColor = "rgba(239, 68, 68, 0.4)";
    }
}

/**
 * FEATURE 2: Crypto Ticker
 * Fetches prices from CoinGecko Free API
 */
async function updateMarketTicker() {
    const tickerElement = document.getElementById('rv-live-ticker');
    if (!tickerElement) return;

    try {
        const cryptoIds = ['bitcoin', 'ethereum', 'solana'];
        const response = await fetch(`https://api.coingecko.com/api/v3/simple/price?ids=${cryptoIds.join(',')}&vs_currencies=usd&include_24hr_change=true`);
        
        if (!response.ok) throw new Error("API Limit or Error");
        
        const data = await response.json();
        let outputHtml = `<span class="rv-ticker-category">CRYPTO:</span>`;
        let symbols = ['BTC', 'ETH', 'SOL'];

        symbols.forEach(symbol => {
            const id = (symbol === 'BTC') ? 'bitcoin' : (symbol === 'ETH' ? 'ethereum' : 'solana');
            if (data[id]) {
                const price = data[id].usd;
                const change24h = data[id].usd_24h_change;
                const formattedPrice = price.toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0, maximumFractionDigits: 2 });
                const formattedChange = change24h ? Math.abs(change24h).toFixed(2) : '0.00';
                const changeClass = change24h >= 0 ? 'success' : 'danger';
                const sign = change24h >= 0 ? '▲' : '▼';

                outputHtml += `
                    <span class="rv-ticker-item">
                        <strong>${symbol}</strong> ${formattedPrice} 
                        <span class="rv-ticker-change ${changeClass}">${sign}${formattedChange}%</span>
                    </span>
                `;
            }
        });

        tickerElement.innerHTML = outputHtml;
    } catch (error) {
        console.warn("Ticker update failed (likely rate limit):", error);
        // Keep old data if possible or show simplified message
        if (tickerElement.innerHTML.includes("initializing")) {
           tickerElement.innerHTML = '<span class="rv-ticker-category">Info:</span> Pricing data refreshing...';
        }
    }
}

/**
 * FEATURE 3: Fear & Greed Index
 * Fetches from alternative.me
 */
async function updateFearAndGreed() {
    const fngValueText = document.getElementById('rv-fng-value-text');
    const fngBar = document.getElementById('rv-fng-bar');
    const fngPointer = document.getElementById('rv-fng-pointer');
    const fngContainer = document.getElementById('rv-fng');

    if (!fngValueText) return;

    try {
        const response = await fetch('https://api.alternative.me/fng/');
        const data = await response.json();

        if (data && data.data && data.data.length > 0) {
            const latest = data.data[0];
            const value = parseInt(latest.value);
            const classification = latest.value_classification;

            fngValueText.innerHTML = `<span style="color: ${getValueColor(value)}">${value}</span> <span style="font-weight:400; opacity:0.7">(${classification})</span>`;
            
            // Visual Update
            if (fngBar) fngBar.style.width = `${value}%`;
            if (fngPointer) fngPointer.style.left = `calc(${value}% - 7px)`;
            
            // Add classification class for subtle border effects if needed
            fngContainer.className = `rv-fng ${classification.toLowerCase().replace(' ', '-')}`;
        }
    } catch (error) {
        console.error("F&G Error:", error);
        fngValueText.textContent = 'Unavailable';
    }
}

// Helper: Color code for F&G value
function getValueColor(val) {
    if (val < 25) return '#ef4444'; // Extreme Fear
    if (val < 45) return '#f97316'; // Fear
    if (val < 55) return '#fbbf24'; // Neutral
    if (val < 75) return '#34d399'; // Greed
    return '#10b981'; // Extreme Greed
}

// =======================================================
// INITIALIZATION
// =======================================================
document.addEventListener('DOMContentLoaded', () => {
    // 1. Initial Calls
    updateMarketStatus();
    updateMarketTicker();
    updateFearAndGreed();

    // 2. Set Intervals
    setInterval(updateMarketStatus, 60000); // Every min
    setInterval(updateMarketTicker, 60000); // Every min
    setInterval(updateFearAndGreed, 300000); // Every 5 min

    // 3. Footer Year
    const yearEl = document.getElementById('rv-year');
    if (yearEl) yearEl.textContent = new Date().getFullYear();
});