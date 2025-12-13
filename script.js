// =======================================================
// RUBIKVAULT MAIN SCRIPT
// Features: Market Status, Live Ticker, Lazy Loading
// =======================================================

/**
 * 1. LAZY LOADING SYSTEM (Performance & SEO)
 * Lädt TradingView Widgets nur, wenn sie sichtbar werden.
 */
function initLazyWidgets() {
    // Prüfen, ob der Browser IntersectionObserver unterstützt
    if (!('IntersectionObserver' in window)) {
        // Fallback: Einfach alles sofort laden, falls uralter Browser
        document.querySelectorAll('.rv-lazy-wrapper').forEach(loadWidget);
        return;
    }

    const observer = new IntersectionObserver((entries, obs) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                loadWidget(entry.target);
                obs.unobserve(entry.target); // Nur einmal laden
            }
        });
    }, { rootMargin: "200px" }); // 200px bevor es sichtbar wird laden

    document.querySelectorAll('.rv-lazy-wrapper').forEach(el => observer.observe(el));
}

function loadWidget(wrapper) {
    const template = wrapper.querySelector('template');
    if (!template) return;

    // Inhalt des Templates klonen
    const content = document.importNode(template.content, true);
    
    // Platzhalter entfernen
    const placeholder = wrapper.querySelector('.rv-lazy-placeholder');
    if (placeholder) placeholder.remove();

    // Spezialbehandlung für Scripts (einfaches appendChild führt oft nicht zur Ausführung bei Templates)
    const scripts = content.querySelectorAll('script');
    
    // Erst den HTML-Teil einfügen (das Div container)
    wrapper.appendChild(content);

    // Dann die Scripts neu erzeugen und einfügen, damit sie ausgeführt werden
    scripts.forEach(oldScript => {
        const newScript = document.createElement('script');
        Array.from(oldScript.attributes).forEach(attr => newScript.setAttribute(attr.name, attr.value));
        newScript.textContent = oldScript.textContent; // Den JSON Config Teil kopieren
        // Das alte Script entfernen (ist eh tot im Template)
        oldScript.parentNode.replaceChild(newScript, oldScript);
    });
}

/**
 * 2. MARKET STATUS (US Open/Close)
 */
function updateMarketStatus() {
    const statusEl = document.getElementById('rv-market-status-text');
    const indicatorEl = document.getElementById('rv-market-status-dot');
    const containerEl = document.getElementById('rv-market-status');
    
    if (!statusEl) return;

    const now = new Date();
    const nyTime = new Date(now.toLocaleString("en-US", {timeZone: "America/New_York"}));
    const day = nyTime.getDay(); 
    const hour = nyTime.getHours();
    const minute = nyTime.getMinutes();
    
    const isWeekday = day >= 1 && day <= 5;
    const isOpenHours = isWeekday && (hour > 9 || (hour === 9 && minute >= 30)) && hour < 16;
    
    if (isOpenHours) {
        statusEl.textContent = "US Markets Open";
        indicatorEl.style.color = "#10b981"; 
        containerEl.style.borderColor = "rgba(16, 185, 129, 0.4)";
    } else {
        statusEl.textContent = "US Markets Closed";
        indicatorEl.style.color = "#6b7280"; 
        containerEl.style.borderColor = "rgba(107, 114, 128, 0.4)";
    }
}

/**
 * 3. COINGECKO LIVE PRICE (Simple Ticker)
 */
async function updateSimpleTicker() {
    const el = document.getElementById('rv-ticker-btc');
    if(!el) return;
    try {
        const res = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd&include_24hr_change=true');
        const data = await res.json();
        const price = data.bitcoin.usd;
        const change = data.bitcoin.usd_24h_change;
        el.innerHTML = `BTC: $${price.toLocaleString()} <span style="color:${change>=0?'#10b981':'#ef4444'}">${change>=0?'+':''}${change.toFixed(2)}%</span>`;
    } catch(e) { console.log("Ticker limit"); }
}

// INIT
document.addEventListener('DOMContentLoaded', () => {
    initLazyWidgets();
    updateMarketStatus();
    updateSimpleTicker();
    
    // Footer Year
    const yearEl = document.getElementById('rv-year');
    if(yearEl) yearEl.textContent = new Date().getFullYear();
    
    // Intervalle
    setInterval(updateMarketStatus, 60000);
});