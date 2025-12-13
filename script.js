// =======================================================
// FEATURE: Live Market Ticker & Fear & Greed Index
// =======================================================

// 1. Definition der Assets für den Ticker (getrennt nach Kategorien)
const ASSETS_TO_TRACK = {
    'Stocks USA': [
        'SPX', 'NDX', 'DJI', 'RUT' 
    ],
    'Crypto': [
        'BTC', 'ETH', 'SOL'
    ],
    'Commodities & Bonds': [
        'XAU', 'XAG', 'BRENT', 'NGAS', 'US10Y', 'ESTX50'
    ]
};

// 2. Funktion zum Abrufen und Aktualisieren des Tickers
async function updateMarketTicker() {
    const tickerElement = document.getElementById('rv-live-ticker');
    if (!tickerElement) return;

    let outputHtml = '';

    for (const category in ASSETS_TO_TRACK) {
        const symbols = ASSETS_TO_TRACK[category];
        const coingeckoIds = symbols.map(s => s.toLowerCase()); 
        
        // Da TradingView-Symbole keine direkten Coingecko-IDs sind, verwenden wir eine vereinfachte 
        // Logik für Crypto und lassen Stocks/Bonds/Commo in diesem JS-Ticker weg (da sie besser in TV-Widgets sind).
        // Wir fokussieren den JS-Ticker nur auf Krypto, wie es ursprünglich der Fall war, 
        // und nutzen für die anderen Kategorien TradingView Widgets (siehe index.html).
        
        if (category === 'Crypto') {
            try {
                // IDs für Coingecko-API: BTC=bitcoin, ETH=ethereum, SOL=solana
                const cryptoIds = ['bitcoin', 'ethereum', 'solana'];
                const response = await fetch(`https://api.coingecko.com/api/v3/simple/price?ids=${cryptoIds.join(',')}&vs_currencies=usd&include_24hr_change=true`);
                const data = await response.json();
                
                let cryptoHtml = `<span class="rv-ticker-category">${category}:</span>`;

                symbols.forEach(symbol => {
                    const id = (symbol === 'BTC') ? 'bitcoin' : (symbol === 'ETH' ? 'ethereum' : 'solana');
                    if (data[id]) {
                        const price = data[id].usd;
                        const change24h = data[id].usd_24h_change;
                        const formattedPrice = price.toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: (price < 1) ? 4 : 2 });
                        const formattedChange = change24h ? (change24h / price * 100).toFixed(2) : 'N/A';
                        const changeClass = change24h >= 0 ? 'success' : 'danger';
                        const sign = change24h >= 0 ? '▲' : '▼';

                        cryptoHtml += `
                            <span class="rv-ticker-item">
                                ${symbol} ${formattedPrice} 
                                <span class="rv-ticker-change ${changeClass}">${sign} ${formattedChange}%</span>
                            </span>
                        `;
                    }
                });
                outputHtml += cryptoHtml;

            } catch (error) {
                console.error("Error fetching Crypto data:", error);
                outputHtml += `<span class="rv-ticker-category">Crypto:</span> <span class="rv-ticker-item error">Data unavailable.</span>`;
            }
        }
    }

    // Wenn nur Crypto über Coingecko geladen wird, nutzen wir für die anderen Kategorien 
    // das TradingView Ticker Widget, um die Ladezeiten niedrig zu halten.
    // Daher bleibt der JS Ticker nun auf Krypto fokussiert.
    
    tickerElement.innerHTML = outputHtml || 'Market data loading...';
}

// 3. Funktion zum Abrufen und Aktualisieren des Crypto Fear & Greed Index
async function updateFearAndGreed() {
    const fngValueText = document.getElementById('rv-fng-value-text');
    const fngBar = document.getElementById('rv-fng-bar');
    const fngPointer = document.getElementById('rv-fng-pointer');
    const fngContainer = document.getElementById('rv-fng');

    if (!fngValueText || !fngBar || !fngPointer || !fngContainer) return;

    try {
        // Alternative.me API für Crypto Fear & Greed Index
        const response = await fetch('https://api.alternative.me/fng/');
        const data = await response.json();

        if (data && data.data && data.data.length > 0) {
            const latest = data.data[0];
            const value = parseInt(latest.value);
            const valueClassification = latest.value_classification;

            // Update Text
            fngValueText.textContent = `${value} (${valueClassification})`;

            // Update Bar Color (CSS handled, just set width)
            fngBar.style.width = `${value}%`;

            // Update Pointer position
            fngPointer.style.left = `calc(${value}% - 8px)`; // -8px to center the pointer width

            // Update color class for text and pointer
            fngContainer.className = 'rv-fng ' + valueClassification.toLowerCase().replace(' ', '-');
        } else {
            throw new Error("Invalid F&G data structure.");
        }
    } catch (error) {
        console.error("Error fetching Fear & Greed data:", error);
        fngValueText.textContent = 'Data unavailable.';
    }
}

// 4. Initialisierung und Intervalle
document.addEventListener('DOMContentLoaded', () => {
    updateMarketTicker();
    updateFearAndGreed();
    
    // Auto-Update alle 60 Sekunden für Ticker
    setInterval(updateMarketTicker, 60000); 
    
    // Auto-Update alle 5 Minuten für F&G (Index wird nicht so oft aktualisiert)
    setInterval(updateFearAndGreed, 300000); 

    // Update Footer Year (kleines JS-Feature)
    const yearElement = document.getElementById('rv-year');
    if (yearElement) {
        yearElement.textContent = new Date().getFullYear();
    }
});