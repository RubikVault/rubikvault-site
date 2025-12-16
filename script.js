/* ==========================================================================
   RUBIK VAULT - MASTER LOGIC
   ========================================================================== */

const RV = {
    // STATE
    State: {
        watchlist: JSON.parse(localStorage.getItem('rv_watchlist')) || ['AAPL', 'NVDA', 'SPY'],
        theme: localStorage.getItem('rv_theme') || 'dark',
    },

    // INIT
    init: () => {
        RV.Theme.init();
        RV.Timer.init();
        RV.News.init();
        RV.Watchlist.init();
        RV.MCS.init();
        RV.Explorer.init();
        RV.Insight.init();
        
        // Intervals
        setInterval(RV.Timer.update, 1000);
        setInterval(RV.News.fetch, 30000); 
    },

    // --- MODULES ---

    Theme: {
        init: () => {
            const btn = document.getElementById('theme-toggle');
            const body = document.body;
            
            const apply = () => {
                if(RV.State.theme === 'light') {
                    body.setAttribute('data-theme', 'light');
                    btn.innerHTML = '🌙 Dark';
                } else {
                    body.removeAttribute('data-theme');
                    btn.innerHTML = '☀️ Light';
                }
            };
            apply();

            btn.addEventListener('click', () => {
                RV.State.theme = RV.State.theme === 'light' ? 'dark' : 'light';
                localStorage.setItem('rv_theme', RV.State.theme);
                apply();
            });
        }
    },

    Timer: {
        init: () => { RV.Timer.update(); },
        update: () => {
            const statusText = document.getElementById('mt-status');
            const dot = document.getElementById('mt-dot');
            const timeDisplay = document.getElementById('mt-time');

            const options = { timeZone: 'America/New_York', hour: '2-digit', minute: '2-digit', hour12: false };
            const nyTimeStr = new Date().toLocaleTimeString('en-US', options);
            
            const nyDate = new Date().toLocaleString("en-US", {timeZone: "America/New_York"});
            const nowNY = new Date(nyDate);
            const hours = nowNY.getHours();
            const minutes = nowNY.getMinutes();
            const timeVal = hours + minutes / 60;
            const day = nowNY.getDay();

            timeDisplay.textContent = `NYC: ${nyTimeStr}`;

            let status = "Closed";
            let cls = "status-closed";

            if (day > 0 && day < 6) {
                if (timeVal >= 4.0 && timeVal < 9.5) { status = "Pre-Market"; cls = "status-pre"; }
                else if (timeVal >= 9.5 && timeVal < 16.0) { status = "Market Open"; cls = "status-open"; }
                else if (timeVal >= 16.0 && timeVal < 20.0) { status = "After Hours"; cls = "status-pre"; }
            }

            if(statusText) statusText.textContent = status;
            if(dot) dot.className = "status-dot " + cls;
        }
    },

    Insight: {
        init: () => {
            const msgs = [
                "Tech sector volatility remains high ahead of earnings.",
                "Bond yields stabilized, supporting growth stocks.",
                "Crypto markets showing resilience above key support levels."
            ];
            // Pick random insight for demo (replace with API later)
            document.getElementById('daily-insight-text').innerText = msgs[Math.floor(Math.random()*msgs.length)];
            
            document.getElementById('read-aloud-btn').addEventListener('click', () => {
                const msg = document.getElementById('daily-insight-text').innerText;
                const speech = new SpeechSynthesisUtterance(msg);
                speech.lang = 'en-US';
                window.speechSynthesis.speak(speech);
            });
        }
    },

    News: {
        init: () => {
            RV.News.fetch();
            document.getElementById('news-refresh-btn').addEventListener('click', RV.News.fetch);
        },
        fetch: async () => {
            const container = document.getElementById('rv-news-feed-list');
            if(!container) return;
            
            if(container.children.length === 0) container.innerHTML = '<div style="padding:20px; text-align:center;">Syncing...</div>';

            try {
                const res = await fetch('/api/news'); // Calls Cloudflare Function
                const data = await res.json();
                
                if(data.items && data.items.length > 0) {
                    const html = data.items.map(item => {
                        // Date parsing fix
                        const date = new Date(item.pubDate || item.date);
                        const time = isNaN(date.getTime()) ? '--:--' : date.toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'});
                        
                        return `
                        <a href="${item.link}" target="_blank" class="rv-news-list-item">
                            <span class="rv-news-list-title">${item.title}</span>
                            <span class="rv-news-list-time">${time}</span>
                        </a>`;
                    }).join('');
                    container.innerHTML = html;
                } else {
                    container.innerHTML = '<div style="padding:20px;">No news available.</div>';
                }
            } catch(e) {
                console.error(e);
                container.innerHTML = '<div style="padding:20px; color:red;">News Error (Check API)</div>';
            }
        }
    },

    Watchlist: {
        suggestions: [
            {s:'AAPL', n:'Apple'}, {s:'MSFT', n:'Microsoft'}, {s:'NVDA', n:'NVIDIA'}, {s:'AMZN', n:'Amazon'},
            {s:'GOOGL', n:'Alphabet'}, {s:'TSLA', n:'Tesla'}, {s:'META', n:'Meta'}, {s:'BTC-USD', n:'Bitcoin'},
            {s:'SPY', n:'S&P 500'}, {s:'QQQ', n:'Nasdaq 100'}, {s:'AMD', n:'AMD'}, {s:'NFLX', n:'Netflix'}
        ],
        init: () => {
            RV.Watchlist.render();
            const input = document.getElementById('wl-input');
            const box = document.getElementById('wl-suggestions');
            
            input.addEventListener('input', (e) => {
                const val = e.target.value.toUpperCase();
                if(val.length < 1) { box.style.display='none'; return; }
                const matches = RV.Watchlist.suggestions.filter(x => x.s.startsWith(val));
                if(matches.length > 0) {
                    box.innerHTML = matches.map(m => `<div class="rv-suggestion-item" onclick="RV.Watchlist.add('${m.s}')">${m.s} <span style="color:#666">(${m.n})</span></div>`).join('');
                    box.style.display = 'block';
                } else box.style.display='none';
            });

            document.getElementById('wl-add-btn').addEventListener('click', () => {
                if(input.value) RV.Watchlist.add(input.value.toUpperCase());
            });
        },
        add: (sym) => {
            if(!RV.State.watchlist.includes(sym)) {
                RV.State.watchlist.push(sym);
                localStorage.setItem('rv_watchlist', JSON.stringify(RV.State.watchlist));
                RV.Watchlist.render();
            }
            document.getElementById('wl-input').value = '';
            document.getElementById('wl-suggestions').style.display = 'none';
        },
        remove: (sym) => {
            RV.State.watchlist = RV.State.watchlist.filter(s => s !== sym);
            localStorage.setItem('rv_watchlist', JSON.stringify(RV.State.watchlist));
            RV.Watchlist.render();
        },
        render: async () => {
            const container = document.getElementById('wl-container');
            
            // 1. Render Skeleton
            container.innerHTML = RV.State.watchlist.map(sym => `
                <div class="rv-wl-item" id="wl-item-${sym}">
                    <div style="font-weight:bold">${sym}</div>
                    <div class="rv-wl-price" style="font-size:12px; color:#aaa;">Loading...</div>
                    <span class="rv-wl-remove" onclick="RV.Watchlist.remove('${sym}')">&times;</span>
                </div>
            `).join('');

            // 2. Fetch Live Prices via Function
            const tickers = RV.State.watchlist.join(',');
            if(!tickers) return;

            try {
                const res = await fetch(`/api/quotes?tickers=${tickers}`);
                const data = await res.json();
                
                if(data.quotes) {
                    Object.keys(data.quotes).forEach(sym => {
                        const quote = data.quotes[sym];
                        const el = document.querySelector(`#wl-item-${sym} .rv-wl-price`);
                        if(el && quote.price) {
                            const color = quote.changePct >= 0 ? '#10b981' : '#ef4444';
                            const sign = quote.changePct >= 0 ? '+' : '';
                            el.innerHTML = `$${quote.price.toFixed(2)} <span style="color:${color}">(${sign}${quote.changePct.toFixed(2)}%)</span>`;
                        }
                    });
                }
            } catch(e) {
                console.error("Quotes Error", e);
            }
        }
    },

    MCS: {
        init: () => {
            const ctx = document.getElementById('mcs-chart').getContext('2d');
            const score = 65; 
            document.getElementById('mcs-value').innerText = score;
            new Chart(ctx, {
                type: 'doughnut',
                data: {
                    labels: ['Greed', 'Fear'],
                    datasets: [{
                        data: [score, 100-score],
                        backgroundColor: ['#10b981', 'rgba(255,255,255,0.1)'],
                        borderWidth: 0,
                        cutout: '85%'
                    }]
                },
                options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false }, tooltip: { enabled: false } } }
            });
        }
    },

    Explorer: {
        lists: {
            nasdaq: [
                { s: "AAPL", n: "Apple" }, { s: "MSFT", n: "Microsoft" }, { s: "NVDA", n: "NVIDIA" }, { s: "AMZN", n: "Amazon" },
                { s: "META", n: "Meta" }, { s: "GOOGL", n: "Alphabet" }, { s: "TSLA", n: "Tesla" }, { s: "AVGO", n: "Broadcom" },
                { s: "COST", n: "Costco" }, { s: "PEP", n: "PepsiCo" }, { s: "NFLX", n: "Netflix" }, { s: "AMD", n: "AMD" }
            ],
            dow: [
                { s: "MMM", n: "3M" }, { s: "AXP", n: "Am. Express" }, { s: "AMGN", n: "Amgen" }, { s: "AAPL", n: "Apple" },
                { s: "BA", n: "Boeing" }, { s: "CAT", n: "Caterpillar" }, { s: "CVX", n: "Chevron" }, { s: "CSCO", n: "Cisco" },
                { s: "KO", n: "Coca-Cola" }, { s: "DIS", n: "Disney" }, { s: "DOW", n: "Dow Inc" }, { s: "GS", n: "Goldman" }
            ],
            sp500: [
                { s: "SPY", n: "S&P 500 ETF" }, { s: "JPM", n: "JPMorgan" }, { s: "V", n: "Visa" }, { s: "LLY", n: "Lilly" },
                { s: "MA", n: "Mastercard" }, { s: "HD", n: "Home Depot" }, { s: "XOM", n: "Exxon" }, { s: "UNH", n: "UnitedHealth" }
            ]
        },
        init: () => {
            RV.Explorer.load('nasdaq');
        },
        load: (cat) => {
            document.querySelectorAll('.rv-list-tab').forEach(b => b.classList.remove('active'));
            document.querySelector(`button[onclick="RV.Explorer.load('${cat}')"]`).classList.add('active');

            const list = document.getElementById('rv-stock-list-container');
            const data = RV.Explorer.lists[cat];
            
            list.innerHTML = data.map(s => `
                <div class="rv-stock-item" onclick="RV.Explorer.update('${s.s}', '${s.n}')">
                    <div>
                        <div class="rv-stock-symbol">${s.s}</div>
                        <div style="font-size:10px; color:#666;">${s.n}</div>
                    </div>
                    <div style="font-size:18px; color:#444;">&rsaquo;</div>
                </div>
            `).join('');
        },
        update: (sym, name) => {
            document.getElementById('rv-selected-stock-name').innerText = name + " (" + sym + ")";
            const fund = document.getElementById('container-fundamentals');
            const tech = document.getElementById('container-technicals');
            
            // TradingView Widget Injection Logic
            fund.innerHTML = ''; tech.innerHTML = '';
            
            // Helper to inject
            const inject = (container, scriptContent) => {
                const div = document.createElement('div');
                div.className = 'tradingview-widget-container';
                const inner = document.createElement('div');
                inner.className = 'tradingview-widget-container__widget';
                const s = document.createElement('script');
                s.type = 'text/javascript';
                s.src = 'https://s3.tradingview.com/external-embedding/embed-widget-technical-analysis.js'; 
                // Note: Source changes based on widget type, simplified here for brevity
                if(scriptContent.includes('financials')) s.src = 'https://s3.tradingview.com/external-embedding/embed-widget-financials.js';
                s.async = true;
                s.innerHTML = scriptContent;
                div.appendChild(inner);
                div.appendChild(s);
                container.appendChild(div);
            };

            // Full Symbol Resolution (Simple)
            let fullSym = "NASDAQ:" + sym;
            if(sym === 'SPY') fullSym = "AMEX:SPY";
            if(sym === 'BA' || sym === 'MMM') fullSym = "NYSE:" + sym;

            inject(tech, JSON.stringify({
                "interval": "1D", "width": "100%", "height": "100%", "symbol": fullSym, 
                "showIntervalTabs": true, "displayMode": "single", "locale": "en", "colorTheme": "dark", "isTransparent": true
            }));
            
            inject(fund, JSON.stringify({
                "colorTheme": "dark", "isTransparent": true, "displayMode": "regular", 
                "width": "100%", "height": "100%", "symbol": fullSym, "locale": "en"
            }));
        },
        filter: () => {
            const val = document.getElementById('stockSearch').value.toUpperCase();
            document.querySelectorAll('.rv-stock-item').forEach(el => {
                el.style.display = el.innerText.toUpperCase().includes(val) ? 'flex' : 'none';
            });
        }
    }
};

document.addEventListener('DOMContentLoaded', RV.init);