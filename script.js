/* ==========================================================================
   RUBIK VAULT - MASTER LOGIC (Modularized for Skalability B1)
   ========================================================================== */

// B2. Globaler State (minimal, robust)
const RV_STATE = {
    theme: 'dark',
    layout: [],
    watchlist: [],
    preferredTab: 'finance',
    lastUpdated: {
        quotes: null,
        news: null,
        mcs: null
    },
    currentExplorerSymbol: 'AAPL'
};

// D5. Watchlist Limit (Freemium-Vorbereitung)
const WATCHLIST_LIMIT = 5;

// J. Konkrete Code-Tricks (Utilities)

/**
 * J. Sanitizing Utility (D11. Security)
 * @param {string} htmlString - Unsicheren HTML-String
 * @returns {string} - Bereinigter HTML-String
 */
function sanitizeHTML(htmlString) {
    if (typeof DOMPurify === 'undefined') {
        console.error("DOMPurify not loaded. Skipping sanitization.");
        return htmlString; 
    }
    return DOMPurify.sanitize(htmlString, { USE_PROFILES: { html: false } });
}

/**
 * J. Zeit-Utility (Relative Zeit)
 * @param {string} isoDate - ISO-Datumstring
 * @returns {string} - Relative Zeit (z.B. "vor 5 Minuten")
 */
function timeAgo(isoDate) {
    const seconds = Math.floor((new Date() - new Date(isoDate)) / 1000);
    let interval = seconds / 31536000;
    if (interval > 1) return Math.floor(interval) + " Jahren";
    interval = seconds / 2592000;
    if (interval > 1) return Math.floor(interval) + " Monaten";
    interval = seconds / 86400;
    if (interval > 1) return Math.floor(interval) + " Tagen";
    interval = seconds / 3600;
    if (interval > 1) return Math.floor(interval) + " Stunden";
    interval = seconds / 60;
    if (interval > 1) return Math.floor(interval) + " Minuten";
    return Math.floor(seconds) + " Sekunden";
}


/* ==========================================================================
   MODULES (B1. Modularisierung)
   ========================================================================== */

const RV = {};

// --- B3. ERROR BOUNDARY WRAPPER ---
RV.ErrorBoundary = function(fn, moduleName, fallbackHtml = "Modul konnte nicht geladen werden. 💔") {
    try {
        fn();
    } catch (e) {
        console.error(`RV Error in ${moduleName}:`, e);
        // D9. Friendly fallback UI (wird vom Wrapper gerendert)
        const container = document.querySelector(`[data-module="${moduleName}"]`);
        if (container) {
            container.innerHTML = `<div class="rv-error-fallback"><h3>${moduleName}</h3><p>${fallbackHtml}</p><button onclick="window.location.reload()">Reload</button></div>`;
        }
    }
};

// --- A2. Progressive Disclosure / Onboarding (D8) ---
RV.Onboarding = {
    init() {
        if (localStorage.getItem('rv_onboarding_shown') === 'true') {
            const onboarding = document.getElementById('rv-onboarding-tip');
            if (onboarding) onboarding.removeAttribute('open');
        } else {
            const onboarding = document.getElementById('rv-onboarding-tip');
            if (onboarding) {
                onboarding.addEventListener('toggle', () => {
                    // Speichert den Zustand, sobald der User es schließt
                    if (!onboarding.open) {
                        localStorage.setItem('rv_onboarding_shown', 'true');
                    }
                });
            }
        }
    }
};

// --- News Feed (D1) ---
RV.NewsFeed = {
    container: document.getElementById('rv-news-feed-list'),
    tabButtons: document.querySelectorAll('.rv-tab-btn'),
    init() {
        this.tabButtons.forEach(btn => {
            btn.addEventListener('click', () => this.switchTab(btn.dataset.tab));
        });
        this.switchTab(RV_STATE.preferredTab, false);
        // Start-Fetch
        this.fetchNews();
        setInterval(() => this.fetchNews(), 300000); // C2. 5 Minuten (300000 ms)
    },
    switchTab(tab, save = true) {
        if (save) {
            RV_STATE.preferredTab = tab;
            localStorage.setItem('rv_preferred_tab', tab);
        }
        this.tabButtons.forEach(btn => btn.classList.toggle('active', btn.dataset.tab === tab));
        this.render(window.RV_CACHED_NEWS || []);
    },
    async fetchNews() {
        document.getElementById('rv-update-news').textContent = `News: Fetching...`;
        try {
            // C1. Ruft Backend-Proxy auf
            const response = await fetch('/api/news');
            const data = await response.json();
            window.RV_CACHED_NEWS = data.articles || [];
            RV_STATE.lastUpdated.news = new Date();
            this.render(window.RV_CACHED_NEWS);
            document.getElementById('rv-update-news').textContent = `News: ${timeAgo(RV_STATE.lastUpdated.news)} ago`;

            // D3. MCS muss nach News aktualisiert werden
            RV.MCS.calculateAndRender(window.RV_CACHED_NEWS);

        } catch (e) {
            console.error("News fetch failed:", e);
            this.container.innerHTML = `<p class="rv-error-fallback" style="padding: 15px;">Fehler beim Laden der News. Versuche es in 5 Min. erneut.</p>`;
            document.getElementById('rv-update-news').textContent = `News: OFFLINE (${RV_STATE.lastUpdated.news ? timeAgo(RV_STATE.lastUpdated.news) + ' alt' : 'nie'})`;
        }
    },
    render(articles) {
        const filteredArticles = articles.filter(article => {
            // Option J.2 Filter-Logik (vereinfacht: "Finance" vs "General" basiert auf Quelle/Sentiment)
            // ANNAHME: Marketaux liefert "Finance", Alpha Vantage "General" oder nutze Sentiment-Filter.
            if (RV_STATE.preferredTab === 'finance') {
                return article.sentiment && article.sentiment !== 'neutral'; 
            }
            return true; // Zeige alles in General
        }).slice(0, 50); // Limit auf 50, um DOM-Last zu reduzieren

        this.container.innerHTML = filteredArticles.map(item => {
            const sentiment = item.sentiment || 'neutral';
            const sentimentClass = `sentiment-${sentiment.toLowerCase().replace('.', '')}`;
            const sentimentIcon = sentiment === 'positive' ? '📈' : sentiment === 'negative' ? '📉' : '➖';
            
            // D1. Sanitizing & Deduplizieren (Deduplizieren erfolgt idealerweise im Backend/Caching)
            const title = sanitizeHTML(item.title);
            const snippet = sanitizeHTML(item.description || item.snippet || '');

            // D1. Rendern als Cards
            return `
                <a href="${item.url}" target="_blank" class="rv-news-list-item">
                    <span class="rv-news-list-title">${title}</span>
                    <p style="font-size: 12px; color: var(--rv-text-muted); margin: 0;">${snippet}</p>
                    <div class="rv-news-list-meta">
                        <span style="display:flex; gap:5px;">
                            Source: ${item.source}
                        </span>
                        <span>${timeAgo(item.published_at)} ago</span>
                        <span class="rv-news-sentiment-badge ${sentimentClass}">${sentimentIcon} ${sentiment.toUpperCase()}</span>
                    </div>
                </a>
            `;
        }).join('');
    }
};

// --- Market Consensus Score (D3, Option X.1) ---
RV.MCS = {
    ctx: document.getElementById('mcsGauge'),
    gauge: null,
    uncertaintyBadge: document.getElementById('rv-mcs-uncertainty-badge'),
    valueEl: document.getElementById('mcsValue'),
    labelEl: document.getElementById('mcsLabel'),
    init() {
        this.gauge = new Chart(this.ctx, {
            type: 'doughnut',
            data: { datasets: [{ data: [50, 50], backgroundColor: ['var(--rv-success)', 'var(--rv-danger)'], borderWidth: 0 }] },
            options: {
                responsive: true, maintainAspectRatio: false, cutout: '80%', circumference: 180, rotation: -90,
                plugins: { legend: { display: false }, tooltip: { enabled: false } }
            }
        });
        // Initialisierungs-Rendering
        this.updateGauge(0.0, 0.0);
    },
    calculateAndRender(articles) {
        if (!articles || articles.length === 0) {
            this.valueEl.textContent = '--';
            this.labelEl.textContent = 'No data';
            return;
        }

        const sentiments = articles.map(a => {
            // Normalisiere Sentiment: 'positive'=1, 'negative'=-1, 'neutral'=0
            if (a.sentiment === 'positive') return 1;
            if (a.sentiment === 'negative') return -1;
            return 0;
        }).filter(s => s !== 0); // Nur positive/negative für die Berechnung

        if (sentiments.length === 0) {
            this.updateGauge(0.0, 0.0);
            return;
        }

        const mean = sentiments.reduce((a, b) => a + b, 0) / sentiments.length;
        const stdDev = Math.sqrt(sentiments.map(x => Math.pow(x - mean, 2)).reduce((a, b) => a + b) / sentiments.length);

        this.updateGauge(mean, stdDev);
        RV_STATE.lastUpdated.mcs = new Date();
        document.getElementById('rv-update-mcs').textContent = `MCS: ${timeAgo(RV_STATE.lastUpdated.mcs)} ago`;
    },
    updateGauge(mean, stdDev) {
        // MCS Score (0 bis 100, umwandeln von -1 bis 1)
        const score = Math.round((mean + 1) / 2 * 100);
        const positive = score;
        const negative = 100 - score;

        // Visualisierung
        this.gauge.data.datasets[0].data = [positive, negative];
        this.gauge.data.datasets[0].backgroundColor = [positive >= 50 ? 'var(--rv-success)' : 'var(--rv-danger)', positive < 50 ? 'var(--rv-danger)' : 'var(--rv-success)'];
        this.gauge.update();
        
        // D3. Interpretation
        this.valueEl.textContent = `${score}%`;
        
        if (score >= 60) this.labelEl.textContent = 'Bullish Consensus';
        else if (score <= 40) this.labelEl.textContent = 'Bearish Consensus';
        else this.labelEl.textContent = 'Neutral/Mixed';

        // D3. Uncertainty Badge (hohe Standardabweichung)
        const isUncertain = stdDev >= 0.8; 
        this.uncertaintyBadge.style.display = isUncertain ? 'inline-flex' : 'none';
        
        // D7. Daily Insight Box (Update based on MCS)
        RV.Insight.updateContent(score, isUncertain);
    }
};

// --- Daily Insight Box (D7, Option Y.2) ---
RV.Insight = {
    briefEl: document.getElementById('rv-insight-brief'),
    takeEl: document.getElementById('rv-insight-take'),
    readBtn: document.getElementById('rv-read-out-loud-btn'),
    init() {
        this.readBtn.addEventListener('click', () => this.readOutLoud());
    },
    updateContent(mcsScore, isUncertain) {
        let briefText, takeText;

        if (!mcsScore) {
            briefText = "Warte auf die Marktkonsens-Daten...";
            takeText = "Initialisiere Analyse...";
        } else if (isUncertain) {
            briefText = "Markt-Alarm: Hohe Divergenz im Sentiment. Der Konsens fehlt heute.";
            takeText = "Vorsicht ist geboten. Setze enge Stop-Losses oder warte ab. Der MCS ist zu widersprüchlich.";
        } else if (mcsScore >= 65) {
            briefText = "Der Markt zeigt starke Kaufbereitschaft. Sentiment: " + mcsScore + "% Bullish.";
            takeText = "Achte auf Sektor-Flows. Tech ist stark, aber das Momentum könnte sich schnell umkehren.";
        } else if (mcsScore <= 35) {
            briefText = "Überwiegend negative Stimmung in den News. Sentiment: " + (100 - mcsScore) + "% Bearish.";
            takeText = "Bleibe defensiv. Ein Test des letzten Tiefs bei den Indizes ist wahrscheinlich.";
        } else {
            briefText = "Ausgewogenes Sentiment. Markt wartet auf den nächsten Makro-Trigger.";
            takeText = "Heute ist Stock-Picking wichtiger als der Gesamtmarkt. Handle nur klare Setups.";
        }

        this.briefEl.textContent = briefText;
        this.takeEl.innerHTML = `<span style="font-weight: 600;">Mein Take:</span> ${takeText}`;
    },
    readOutLoud() {
        if ('speechSynthesis' in window) {
            const textToRead = this.briefEl.textContent + ". " + this.takeEl.textContent.replace('Mein Take:', '');
            const utterance = new SpeechSynthesisUtterance(textToRead);
            utterance.lang = 'de-DE'; 
            window.speechSynthesis.speak(utterance);
        } else {
            alert('Die Text-zu-Sprache-Funktion wird von deinem Browser nicht unterstützt.');
        }
    }
};


// --- Watchlist (D5) ---
RV.Watchlist = {
    starIcons: null,
    listContainer: document.getElementById('rv-watchlist-list'),
    limitBadge: document.getElementById('rv-watchlist-limit-badge'),
    init() {
        RV_STATE.watchlist = JSON.parse(localStorage.getItem('rv_watchlist') || '[]');
        this.render();
        // Event Delegation für dynamisch geladene Sterne
        document.addEventListener('click', (e) => {
            if (e.target.classList.contains('rv-stock-item-star')) {
                const symbol = e.target.dataset.symbol;
                this.toggle(symbol);
            }
        });
    },
    render() {
        // D5. Watchlist-Sektion Rendern
        if (RV_STATE.watchlist.length === 0) {
            this.listContainer.innerHTML = '<p class="rv-text-muted" style="padding: 10px;">Füge Aktien über das Stern-Icon hinzu.</p>';
        } else {
            this.listContainer.innerHTML = RV_STATE.watchlist.map(symbol => {
                // ANNAHME: Hier würde ein Mini-Widget für den Live-Kurs gerendert werden
                const data = SUGGESTIONS_DB.find(s => s.s === symbol);
                return `
                    <div class="rv-stock-item" style="padding: 10px; border-bottom: 1px dashed var(--rv-border);">
                        <strong>${symbol}</strong>: ${data ? data.n : 'N/A'} 
                        <span class="rv-stock-item-star active" data-symbol="${symbol}">⭐</span>
                    </div>
                `;
            }).join('');
        }
        this.limitBadge.textContent = `${RV_STATE.watchlist.length}/${WATCHLIST_LIMIT}`;
        this.updateAllStarIcons(); // Stellt sicher, dass alle Sterne auf der Seite richtig markiert sind
    },
    toggle(symbol) {
        const index = RV_STATE.watchlist.indexOf(symbol);
        if (index > -1) {
            RV_STATE.watchlist.splice(index, 1); // Entfernen
        } else if (RV_STATE.watchlist.length < WATCHLIST_LIMIT) {
            RV_STATE.watchlist.push(symbol); // Hinzufügen
        } else {
            alert(`Limit erreicht! Max. ${WATCHLIST_LIMIT} Aktien in der Watchlist (Premium-Vorbereitung).`);
            return;
        }
        localStorage.setItem('rv_watchlist', JSON.stringify(RV_STATE.watchlist));
        this.render();
    },
    updateAllStarIcons() {
        // Aktualisiert alle Stern-Icons auf der Seite (z.B. im Stock Explorer)
        document.querySelectorAll('.rv-stock-item-star').forEach(icon => {
            const symbol = icon.dataset.symbol;
            icon.classList.toggle('active', RV_STATE.watchlist.includes(symbol));
            icon.textContent = RV_STATE.watchlist.includes(symbol) ? '⭐' : '☆';
        });
    }
};

// --- Layout Manager (D6) ---
RV.LayoutManager = {
    grid: document.getElementById('rv-dash-grid'),
    init() {
        RV_STATE.layout = JSON.parse(localStorage.getItem('rv_layout') || '[]');
        if (RV_STATE.layout.length > 0) {
            this.applyLayout(RV_STATE.layout);
        }

        // D6. SortableJS Initialisierung
        new Sortable(this.grid, {
            animation: 150,
            handle: '.rv-box-title', // Titel als Drag-Handle
            onEnd: () => this.saveLayout()
        });
    },
    saveLayout() {
        RV_STATE.layout = Array.from(this.grid.children).map(el => el.getAttribute('data-module'));
        localStorage.setItem('rv_layout', JSON.stringify(RV_STATE.layout));
    },
    applyLayout(layout) {
        layout.forEach(moduleName => {
            const el = document.querySelector(`[data-module="${moduleName}"]`);
            if (el) this.grid.appendChild(el);
        });
    }
};

// --- Explorer (Erweitert um Custom Charts D4) ---
RV.Explorer = {
    chartContainer: document.getElementById('rv-explorer-chart'),
    currentChart: null,
    update(symbol, name) {
        RV_STATE.currentExplorerSymbol = symbol;
        document.getElementById('rv-explorer-stock-name').textContent = name;
        this.loadCustomChart(symbol);
        
        // TradingView Financials (Beibehalten, aber neu laden)
        this.loadTradingViewWidgets(symbol);
        
        RV.Watchlist.updateAllStarIcons();
    },
    async loadCustomChart(symbol) {
        this.chartContainer.innerHTML = '<div class="rv-skeleton-chart"></div>';
        try {
            // C1. Ruft Backend-Proxy auf (angenommen es liefert [date, close] Arrays)
            const response = await fetch(`/api/quotes?symbol=${symbol}&timeframe=30d`);
            const data = await response.json(); 

            // Daten müssen für Chart.js vorbereitet werden
            const labels = data.map(d => new Date(d.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }));
            const prices = data.map(d => d.close);
            const lastPrice = prices[prices.length - 1];
            const firstPrice = prices[0];
            const isPositive = lastPrice >= firstPrice;
            const color = isPositive ? 'var(--rv-purple)' : 'var(--rv-danger)';

            this.chartContainer.innerHTML = '<canvas id="customChart"></canvas>';

            if (this.currentChart) this.currentChart.destroy();

            this.currentChart = new Chart(document.getElementById('customChart'), {
                type: 'line',
                data: {
                    labels: labels,
                    datasets: [{
                        label: `${symbol} Close Price`,
                        data: prices,
                        borderColor: color,
                        backgroundColor: color.replace(')', ', 0.2)'), // Transparente Füllung
                        borderWidth: 2,
                        pointRadius: 0,
                        tension: 0.2
                    }]
                },
                // D4. Minimales Design
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: { legend: { display: false } },
                    scales: {
                        x: { display: false, grid: { color: 'var(--rv-border)' } },
                        y: { 
                            ticks: { color: 'var(--rv-text-muted)' },
                            grid: { color: 'var(--rv-border)' } 
                        }
                    }
                }
            });

        } catch (e) {
            console.error("Custom Chart load failed:", e);
            this.chartContainer.innerHTML = '<p class="rv-error-fallback">Chart-Daten konnten nicht geladen werden.</p>';
        }
    },
    loadTradingViewWidgets(symbol) {
        // Original-Logik zur Neuladung der TradingView Widgets (beibehalten)
        const financialsContainer = document.getElementById('tv-financials-container');
        financialsContainer.innerHTML = ''; // Leeren

        const s2 = document.createElement('script');
        s2.type = 'text/javascript';
        s2.src = 'https://s3.tradingview.com/external-embedding/embed-widget-financials.js';
        s2.async = true;
        s2.innerHTML = JSON.stringify({
            "colorTheme": RV_STATE.theme, // Theme-Integration
            "isTransparent": true, "displayMode": "regular", 
            "width": "100%", "height": "100%", "symbol": symbol, "locale": "en"
        });
        const c2 = document.createElement('div'); c2.className = 'tradingview-widget-container';
        c2.appendChild(s2);
        financialsContainer.appendChild(c2);
    }
};


/* ==========================================================================
   INITIALISIERUNG
   ========================================================================== */

document.addEventListener("DOMContentLoaded", () => {
    // RV_STATE aus LocalStorage wiederherstellen (Thema/Tab)
    RV_STATE.theme = localStorage.getItem('rv_theme') || 'dark';
    RV_STATE.preferredTab = localStorage.getItem('rv_preferred_tab') || 'finance';
    
    // Initialisiere die Module in der richtigen Reihenfolge
    
    // Sicherheit und UX-Basis
    RV.ErrorBoundary(() => RV.Theme.init(), 'ThemeToggle');
    RV.ErrorBoundary(() => RV.Onboarding.init(), 'Onboarding');
    
    // Layout & Persistenz
    RV.ErrorBoundary(() => RV.LayoutManager.init(), 'LayoutManager');
    RV.ErrorBoundary(() => RV.Watchlist.init(), 'Watchlist');
    
    // Haupt-Daten-Feeds
    RV.ErrorBoundary(() => RV.NewsFeed.init(), 'NewsFeed');
    RV.ErrorBoundary(() => RV.MCS.init(), 'MCSGauge');
    RV.ErrorBoundary(() => RV.Insight.init(), 'DailyInsightBox');

    // Explorer und Timer (Beibehalten/Aktualisiert)
    RV.ErrorBoundary(() => initUSMarketTimer(), 'MarketTimer');
    RV.ErrorBoundary(() => {
        loadStockList('nasdaq'); // Lädt die Liste der Ticker
        RV.Explorer.update(RV_STATE.currentExplorerSymbol, SUGGESTIONS_DB.find(s => s.s === RV_STATE.currentExplorerSymbol)?.n || 'Stock Explorer');
    }, 'StockExplorer');


    // Intervals (Beibehalten)
    setInterval(initUSMarketTimer, 1000); 
});

// --- ORIGINAL-FUNKTIONEN (ANGEPASST FÜR NEUE STRUKTUR/APIS) ---

const SUGGESTIONS_DB = [
    {s:'AAPL', n:'Apple Inc', t:'Stock'}, {s:'MSFT', n:'Microsoft', t:'Stock'}, {s:'NVDA', n:'NVIDIA', t:'Stock'},
    {s:'AMZN', n:'Amazon', t:'Stock'}, {s:'GOOGL', n:'Alphabet', t:'Stock'}, {s:'TSLA', n:'Tesla', t:'Stock'},
    {s:'META', n:'Meta Platforms', t:'Stock'}, {s:'BTCUSDT', n:'Bitcoin', t:'Crypto'}, {s:'ETHUSDT', n:'Ethereum', t:'Crypto'},
    {s:'AMD', n:'AMD', t:'Stock'}, {s:'NFLX', n:'Netflix', t:'Stock'}, {s:'INTC', n:'Intel', t:'Stock'},
    {s:'PYPL', n:'PayPal', t:'Stock'}, {s:'ADBE', n:'Adobe', t:'Stock'}, {s:'SOLUSDT', n:'Solana', t:'Crypto'}
];

function loadStockList(filter) {
    const listContainer = document.getElementById('stock-list-container');
    const filtered = SUGGESTIONS_DB.filter(s => filter === 'all' || s.t.toLowerCase() === filter);
    
    listContainer.innerHTML = filtered.map(stock => {
        // D5. Stern-Icon für Watchlist hinzugefügt
        const isActive = RV_STATE.watchlist.includes(stock.s);
        const star = `<span class="rv-stock-item-star ${isActive ? 'active' : ''}" data-symbol="${stock.s}">${isActive ? '⭐' : '☆'}</span>`;
        return `
            <div class="rv-stock-item" onclick="RV.Explorer.update('${stock.s}', '${stock.n}')">
                <span>${stock.s} - ${stock.n}</span>
                ${star}
            </div>
        `;
    }).join('');

    RV.Watchlist.updateAllStarIcons(); // Stellt sicher, dass das erste Rendern korrekt ist
}

function updateExplorer(symbol, name) {
    RV.Explorer.update(symbol, name);
}

function filterStocks() {
    const input = document.getElementById('stockSearch').value.toUpperCase();
    const items = document.querySelectorAll('.rv-stock-item');
    items.forEach(item => {
        const text = item.innerText.toUpperCase();
        item.style.display = text.includes(input) ? 'flex' : 'none';
    });
}

// --- ORIGINAL MARKET TIMER (Beibehalten, aber auf neue API vorbereitet) ---
function initUSMarketTimer() {
    // ANNAHME: Die Logik für den Timer bleibt (oder wird auf /api/status umgestellt)
    const timerElement = document.getElementById('market-timer');
    const now = new Date();
    const hour = now.getHours();
    const minutes = now.getMinutes();

    // Simplifizierte US-Marktzeiten (9:30 AM - 4:00 PM EST)
    const isTradingHours = (hour >= 15 && hour < 22) || (hour === 14 && minutes >= 30); // CET conversion
    
    if (isTradingHours) {
        timerElement.textContent = "US Market Open";
        timerElement.style.backgroundColor = 'var(--rv-success)';
    } else {
        timerElement.textContent = "US Market Closed";
        timerElement.style.backgroundColor = 'var(--rv-danger)';
    }

    // ANNAHME: Hier würde ein Fetch an /api/quotes erfolgen, um die Basis-Indizes zu aktualisieren.
    // ...
}

// --- ORIGINAL THEME SWITCHER (B2. Global State Integration) ---
RV.Theme = {
    init() {
        const btn = document.getElementById('theme-toggle');
        const body = document.body;
        
        // D2. Initial aus LocalStorage/Preference
        const initialTheme = localStorage.getItem('rv_theme') || 
                             (window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark');
        
        this.setTheme(initialTheme);
        
        btn.addEventListener('click', () => {
            const newTheme = body.getAttribute('data-theme') === 'light' ? 'dark' : 'light';
            this.setTheme(newTheme);
        });
    },
    setTheme(theme) {
        const body = document.body;
        body.setAttribute('data-theme', theme);
        localStorage.setItem('rv_theme', theme);
        RV_STATE.theme = theme;
        // ANNAHME: Hier müssten alle TradingView Widgets neu geladen werden (RV.Explorer.loadTradingViewWidgets)
    }
};