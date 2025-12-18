/* ==========================================================================
   RUBIK VAULT - MASTER LOGIC
   ========================================================================== */

document.addEventListener("DOMContentLoaded", () => {
    RV.init();
    RV_ADD.init();
});

const RV = {
    init: () => {
        RV.Theme.init();
        RV.Timer.init();
        setInterval(RV.Timer.update, 1000);
    },
    Theme: {
        init: () => {
            const btn = document.getElementById('theme-toggle');
            const body = document.body;
            btn.addEventListener('click', () => {
                const current = body.getAttribute('data-theme');
                const next = current === 'light' ? 'dark' : 'light';
                body.setAttribute('data-theme', next);
                btn.innerHTML = next === 'light' ? '🌙 Dark' : '☀️ Light';
            });
        }
    },
    Timer: {
        init: () => { RV.Timer.update(); },
        update: () => {
            const elTime = document.getElementById('mt-time');
            const elDot = document.getElementById('mt-dot');
            const elStatus = document.getElementById('mt-status');
            
            const now = new Date();
            const nyTime = new Date().toLocaleString("en-US", {timeZone: "America/New_York"});
            const nyDate = new Date(nyTime);
            
            const h = nyDate.getHours();
            const m = nyDate.getMinutes();
            const timeVal = h + m/60;
            const day = nyDate.getDay();

            elTime.textContent = "NYC: " + nyDate.toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'});

            let status = "Closed";
            let cls = "status-closed";

            if (day > 0 && day < 6) {
                if(timeVal >= 4 && timeVal < 9.5) { status = "Pre-Market"; cls = "status-pre"; }
                else if(timeVal >= 9.5 && timeVal < 16) { status = "Market Open"; cls = "status-open"; }
                else if(timeVal >= 16 && timeVal < 20) { status = "After Hours"; cls = "status-pre"; }
            }
            if(elStatus) elStatus.textContent = status;
            if(elDot) elDot.className = "status-dot " + cls;
        }
    }
};

const RV_ADD = {
    init: () => {
        RV_ADD.News.init();
        RV_ADD.Watchlist.init();
        RV_ADD.MCS.init();
        RV_ADD.Explorer.init();
    },

    News: {
        init: () => {
            RV_ADD.News.fetch();
            setInterval(RV_ADD.News.fetch, 30000); 
            document.getElementById('news-refresh-btn')?.addEventListener('click', RV_ADD.News.fetch);
        },
        fetch: async () => {
            const container = document.getElementById('rv-news-feed-list');
            if(!container) return;
            
            if(container.children.length === 0) container.innerHTML = '<div style="padding:20px; text-align:center;">Syncing...</div>';

            try {
                const res = await fetch('/api/news');
                const data = await res.json();
                
                if(data.items) {
                    const html = data.items.map(item => `
                        <a href="${item.url}" target="_blank" class="rv-news-list-item">
                            <span class="rv-news-list-title">${item.title}</span>
                            <span class="rv-news-list-time">${new Date(item.publishedAt).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'})}</span>
                        </a>
                    `).join('');
                    container.innerHTML = html;
                    
                    RV_ADD.Cheats.update(data.items);
                }
            } catch(e) {
                container.innerHTML = '<div class="rv-news-error">Live Data Error. Retrying...</div>';
            }
        }
    },

    Watchlist: {
        suggestions: [
            {s:'AAPL', n:'Apple'}, {s:'MSFT', n:'Microsoft'}, {s:'NVDA', n:'NVIDIA'}, {s:'AMZN', n:'Amazon'}, 
            {s:'GOOGL', n:'Alphabet'}, {s:'TSLA', n:'Tesla'}, {s:'META', n:'Meta'}, {s:'AMD', n:'AMD'},
            {s:'NFLX', n:'Netflix'}, {s:'INTC', n:'Intel'}, {s:'BTC-USD', n:'Bitcoin'}, {s:'ETH-USD', n:'Ethereum'},
            {s:'SPY', n:'S&P 500'}, {s:'QQQ', n:'Nasdaq 100'}, {s:'IWM', n:'Russell 2000'}
        ],
        init: () => {
            RV_ADD.Watchlist.render();
            const input = document.getElementById('wl-input');
            const box = document.getElementById('wl-suggestions');
            
            input.addEventListener('input', (e) => {
                const val = e.target.value.toUpperCase();
                if(val.length < 1) { box.style.display='none'; return; }
                const matches = RV_ADD.Watchlist.suggestions.filter(x => x.s.startsWith(val));
                if(matches.length > 0) {
                    box.innerHTML = matches.map(m => `<div class="rv-suggestion-item" onclick="RV_ADD.Watchlist.add('${m.s}')">${m.s} <span style="color:#666">(${m.n})</span></div>`).join('');
                    box.style.display = 'block';
                } else box.style.display='none';
            });
            
            window.RV_ADD.Watchlist.add = (sym) => {
                let list = JSON.parse(localStorage.getItem('rv_watchlist')) || [];
                if(!list.includes(sym)) {
                    list.push(sym);
                    localStorage.setItem('rv_watchlist', JSON.stringify(list));
                    RV_ADD.Watchlist.render();
                }
                input.value = '';
                box.style.display = 'none';
            };
            
            document.getElementById('wl-add-btn').addEventListener('click', () => {
                if(input.value) RV_ADD.Watchlist.add(input.value.toUpperCase());
            });
        },
        remove: (sym) => {
            let list = JSON.parse(localStorage.getItem('rv_watchlist')) || [];
            list = list.filter(s => s !== sym);
            localStorage.setItem('rv_watchlist', JSON.stringify(list));
            RV_ADD.Watchlist.render();
        },
        render: async () => {
            const container = document.getElementById('wl-container');
            const list = JSON.parse(localStorage.getItem('rv_watchlist')) || ['AAPL', 'NVDA', 'SPY'];
            
            container.innerHTML = list.map(sym => `
                <div class="rv-wl-item" id="wl-item-${sym}">
                    <div style="font-weight:bold; font-size:14px;">${sym}</div>
                    <div class="rv-wl-price" id="price-${sym}">...</div>
                    <span class="rv-wl-remove" onclick="RV_ADD.Watchlist.remove('${sym}')">&times;</span>
                </div>
            `).join('');

            try {
                const res = await fetch(`/api/quotes?tickers=${list.join(',')}`);
                const data = await res.json();
                
                if(data.quotes) {
                    list.forEach(sym => {
                        const el = document.getElementById(`price-${sym}`);
                        const quote = data.quotes[sym];
                        
                        if(el && quote) {
                            const color = quote.changePct >= 0 ? '#10b981' : '#ef4444';
                            const sign = quote.changePct >= 0 ? '+' : '';
                            el.innerHTML = `$${quote.price.toFixed(2)} <br><span style="color:${color}; font-size:11px;">${sign}${quote.changePct.toFixed(2)}%</span>`;
                        } else if(el) {
                            el.innerHTML = '<span style="color:#666">N/A</span>';
                        }
                    });
                }
            } catch(e) { console.error(e); }
        }
    },

    MCS: {
        init: () => {
            const common = { 
                responsive: true, maintainAspectRatio: false, cutout: '80%', 
                plugins: { legend: { display: false }, tooltip: { enabled: false } }
            };
            
            const ctxS = document.getElementById('mcs-chart-stock')?.getContext('2d');
            if(ctxS) new Chart(ctxS, {
                type: 'doughnut',
                data: { labels: ['Greed','Fear'], datasets: [{ data: [60, 40], backgroundColor: ['#10b981', '#333'], borderWidth:0 }] },
                options: common
            });
            document.getElementById('mcs-value-stock').innerText = "60";
            
            const ctxC = document.getElementById('mcs-chart-crypto')?.getContext('2d');
            if(ctxC) new Chart(ctxC, {
                type: 'doughnut',
                data: { labels: ['Greed','Fear'], datasets: [{ data: [75, 25], backgroundColor: ['#00e5ff', '#333'], borderWidth:0 }] },
                options: common
            });
            document.getElementById('mcs-value-crypto').innerText = "75";
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
        init: () => { RV_ADD.Explorer.load('nasdaq'); },
        load: (cat) => {
            const list = document.getElementById('rv-stock-list-container');
            const stocks = RV_ADD.Explorer.lists[cat];
            
            document.querySelectorAll('.rv-list-tab').forEach(b => b.classList.remove('active'));
            document.querySelector(`button[onclick="RV_ADD.Explorer.load('${cat}')"]`).classList.add('active');
            
            list.innerHTML = stocks.map(s => `
                <div class="rv-stock-item" onclick="RV_ADD.Explorer.update('${s.s}', '${s.n}')">
                    <div class="rv-stock-symbol">${s.s}</div>
                    <div style="font-size:10px; color:#666;">${s.n}</div>
                    <div>&rsaquo;</div>
                </div>
            `).join('');
            
            RV_ADD.Explorer.update(stocks[0].s, stocks[0].n);
        },
        update: (sym, name) => {
            document.getElementById('rv-selected-stock-name').innerText = name + " (" + sym + ")";
            const fund = document.getElementById('container-fundamentals');
            const tech = document.getElementById('container-technicals');
            fund.innerHTML = ''; tech.innerHTML = '';

            let exchange = "NASDAQ";
            if(['SPY','BA','JPM','MMM','V','KO','DIS','HD','PG','UNH'].includes(sym)) exchange = "NYSE";
            if(sym === 'SPY') exchange = "AMEX";

            const fullSym = `${exchange}:${sym}`;

            const inject = (c, type) => {
                const div = document.createElement('div');
                div.className = 'tradingview-widget-container';
                const s = document.createElement('script');
                s.type = 'text/javascript';
                s.src = type === 'tech' ? 'https://s3.tradingview.com/external-embedding/embed-widget-technical-analysis.js' : 'https://s3.tradingview.com/external-embedding/embed-widget-financials.js';
                s.async = true;
                s.innerHTML = JSON.stringify({
                    "symbol": fullSym, "width": "100%", "height": "100%", "colorTheme": "dark", "isTransparent": true, "locale": "en",
                    ...(type === 'tech' ? {"interval": "1D", "showIntervalTabs": true} : {"displayMode": "regular"})
                });
                div.appendChild(s);
                c.appendChild(div);
            };
            
            inject(tech, 'tech');
            inject(fund, 'fund');
        },
        filter: () => {
            const val = document.getElementById('stockSearch').value.toUpperCase();
            document.querySelectorAll('.rv-stock-item').forEach(el => {
                el.style.display = el.innerText.toUpperCase().includes(val) ? 'flex' : 'none';
            });
        }
    },

    Cheats: {
        update: (items) => {
            const keys = ['FED', 'RATE', 'AI', 'CRYPTO', 'EARNINGS'];
            const counts = {};
            keys.forEach(k => counts[k] = 0);
            items.forEach(i => {
                keys.forEach(k => { if(i.title.toUpperCase().includes(k)) counts[k]++; });
            });
            
            const div = document.getElementById('cheat-heat');
            if(div) {
                const sorted = Object.entries(counts).sort((a,b) => b[1] - a[1]);
                div.innerHTML = sorted.map(([k,v]) => 
                    `<div style="display:flex; justify-content:space-between; padding:4px 0; border-bottom:1px solid #333;">
                        <span>${k}</span> <span style="color:${v>0?'var(--rv-accent)':'#666'}">${v}</span>
                    </div>`
                ).join('');
            }
        }
    }
};