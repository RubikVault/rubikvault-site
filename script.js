/**
 * RubikVault Core Logic
 * - Modular architecture (IIFE pattern)
 * - No API keys in frontend
 * - LocalStorage persistence
 */

const App = (() => {
    // --- STATE & STORE ---
    const state = {
        watchlist: JSON.parse(localStorage.getItem('rv_watchlist')) || ['AAPL', 'BTC-USD', 'NVDA'],
        layout: JSON.parse(localStorage.getItem('rv_layout')) || ['section-mcs', 'section-watchlist', 'section-charts', 'section-news'],
        theme: localStorage.getItem('rv_theme') || 'dark'
    };

    const saveState = (key, val) => {
        state[key] = val;
        localStorage.setItem(`rv_${key}`, JSON.stringify(val));
    };

    // --- UTILS ---
    const sanitize = (str) => DOMPurify.sanitize(str);
    const timeAgo = (date) => {
        const seconds = Math.floor((new Date() - new Date(date)) / 1000);
        if (seconds < 60) return "Just now";
        if (seconds < 3600) return Math.floor(seconds/60) + "m ago";
        if (seconds < 86400) return Math.floor(seconds/3600) + "h ago";
        return Math.floor(seconds/86400) + "d ago";
    };

    // --- MODULES ---

    // 1. THEME
    const Theme = {
        init: () => {
            const body = document.body;
            const btn = document.getElementById('theme-toggle');
            
            const apply = () => {
                if(state.theme === 'light') {
                    body.setAttribute('data-theme', 'light');
                    btn.innerHTML = '🌙';
                } else {
                    body.removeAttribute('data-theme');
                    btn.innerHTML = '☀️';
                }
            };
            apply();

            btn.addEventListener('click', () => {
                state.theme = state.theme === 'light' ? 'dark' : 'light';
                localStorage.setItem('rv_theme', state.theme); // Direct save for string
                apply();
            });
        }
    };

    // 2. MARKET TIMER
    const Timer = {
        init: () => {
            setInterval(Timer.update, 1000);
            Timer.update();
        },
        update: () => {
            const now = new Date();
            // Simple UTC Logic for NYSE (14:30 - 21:00 UTC)
            const h = now.getUTCHours();
            const m = now.getUTCMinutes();
            const time = h + m/60;
            const day = now.getUTCDay();
            const elStatus = document.getElementById('mt-status');
            const elDot = document.getElementById('mt-dot');
            const elTime = document.getElementById('mt-time');

            // NYC Time Display
            elTime.textContent = "NYC: " + new Date().toLocaleTimeString('en-US', {timeZone: 'America/New_York', hour:'2-digit', minute:'2-digit'});

            let status = "Closed";
            let cls = "status-closed";

            if(day > 0 && day < 6) {
                if(time >= 14.5 && time < 21) {
                    status = "Open"; cls = "status-open";
                } else if(time >= 9 && time < 14.5) {
                    status = "Pre-Mkt"; cls = "status-pre";
                }
            }
            elStatus.textContent = status;
            elDot.className = `status-dot ${cls}`;
        }
    };

    // 3. DAILY INSIGHT ("Overnight Pulse")
    const Insight = {
        init: () => {
            // Mock Data - In real app, fetch from backend API
            const msg = "Tech stocks are leading pre-market gains driven by AI chip demand. Bond yields stabilized overnight. Bitcoin holds $65k support level.";
            document.getElementById('daily-insight-text').innerText = msg;
            
            // Read Aloud
            const btn = document.getElementById('read-aloud-btn');
            btn.addEventListener('click', () => {
                const speech = new SpeechSynthesisUtterance(msg);
                speech.lang = 'en-US';
                window.speechSynthesis.speak(speech);
            });
        }
    };

    // 4. WATCHLIST
    const Watchlist = {
        init: () => {
            Watchlist.render();
            document.getElementById('wl-add-btn').addEventListener('click', () => {
                const input = document.getElementById('wl-input');
                const sym = input.value.toUpperCase().trim();
                if(sym && !state.watchlist.includes(sym)) {
                    if(state.watchlist.length >= 5) {
                        alert("Free limit reached (5 items).");
                        return;
                    }
                    state.watchlist.push(sym);
                    saveState('watchlist', state.watchlist);
                    Watchlist.render();
                    input.value = '';
                }
            });
        },
        render: () => {
            const container = document.getElementById('wl-container');
            if(state.watchlist.length === 0) {
                container.innerHTML = '<div class="rv-empty-state">List empty. Add a symbol.</div>';
                return;
            }
            container.innerHTML = state.watchlist.map(sym => `
                <div class="rv-wl-item">
                    <div style="font-weight:bold">${sanitize(sym)}</div>
                    <div style="font-size:12px; color:var(--text-muted)">$Loading...</div>
                    <span class="rv-wl-remove" onclick="App.Watchlist.remove('${sym}')">&times;</span>
                </div>
            `).join('');
            
            // Simulating Quote Fetch (Mock)
            setTimeout(() => {
                document.querySelectorAll('.rv-wl-item').forEach(el => {
                    const price = (Math.random() * 200 + 50).toFixed(2);
                    el.children[1].innerText = `$${price} (+0.5%)`;
                    el.children[1].style.color = '#10b981';
                });
            }, 500);
        },
        remove: (sym) => {
            state.watchlist = state.watchlist.filter(s => s !== sym);
            saveState('watchlist', state.watchlist);
            Watchlist.render();
        }
    };

    // 5. CHARTS (Chart.js)
    const Charts = {
        init: () => {
            // Mock Data Generation
            const generateData = () => Array.from({length: 30}, () => Math.random() * 100 + 400);
            const labels = Array.from({length: 30}, (_, i) => `Day ${i+1}`);

            new Chart(document.getElementById('chart-spy'), {
                type: 'line',
                data: {
                    labels: labels,
                    datasets: [{
                        label: 'Price',
                        data: generateData(),
                        borderColor: '#00e5ff',
                        tension: 0.4,
                        borderWidth: 2,
                        pointRadius: 0
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: { legend: { display: false } },
                    scales: { x: { display: false }, y: { display: false } }
                }
            });

            new Chart(document.getElementById('chart-btc'), {
                type: 'line',
                data: {
                    labels: labels,
                    datasets: [{
                        label: 'Price',
                        data: generateData(),
                        borderColor: '#f59e0b',
                        tension: 0.4,
                        borderWidth: 2,
                        pointRadius: 0
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: { legend: { display: false } },
                    scales: { x: { display: false }, y: { display: false } }
                }
            });
        }
    };

    // 6. MCS GAUGE
    const MCS = {
        init: () => {
            const ctx = document.getElementById('mcs-chart').getContext('2d');
            // Mock Score: 65 (Greed)
            const score = 65; 
            document.getElementById('mcs-value').innerText = score;
            
            new Chart(ctx, {
                type: 'doughnut',
                data: {
                    labels: ['Score', 'Remaining'],
                    datasets: [{
                        data: [score, 100-score],
                        backgroundColor: [score > 50 ? '#10b981' : '#f97373', 'rgba(255,255,255,0.1)'],
                        borderWidth: 0,
                        cutout: '85%'
                    }]
                },
                options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false }, tooltip: { enabled: false } } }
            });

            document.getElementById('vix-value').innerText = "14.2 (Low)";
        }
    };

    // 7. NEWS FEED (RSS via Proxy)
    const News = {
        proxy: 'https://api.allorigins.win/get?url=',
        feeds: [
            'https://finance.yahoo.com/news/rssindex',
            'https://cointelegraph.com/rss'
        ],
        init: () => {
            News.fetch();
            document.getElementById('news-refresh-btn').addEventListener('click', () => {
                document.getElementById('rv-news-grid').innerHTML = '<div style="padding:20px">Reloading...</div>';
                News.fetch();
            });
        },
        filter: (cat) => {
            // Simple DOM filtering for MVP
            document.querySelectorAll('.rv-filter-btn').forEach(b => b.classList.remove('active'));
            event.target.classList.add('active');
            // Logic would go here to filter array
            console.log("Filter:", cat);
        },
        fetch: async () => {
            const container = document.getElementById('rv-news-grid');
            let items = [];
            
            // Parallel Fetch
            const promises = News.feeds.map(url => 
                fetch(News.proxy + encodeURIComponent(url))
                .then(r => r.json())
                .then(d => {
                    const parser = new DOMParser();
                    const xml = parser.parseFromString(d.contents, "text/xml");
                    return Array.from(xml.querySelectorAll("item")).map(i => ({
                        title: i.querySelector("title").textContent,
                        link: i.querySelector("link").textContent,
                        pubDate: i.querySelector("pubDate").textContent,
                        source: url.includes('yahoo') ? 'Finance' : 'Crypto'
                    }));
                })
                .catch(e => [])
            );

            const results = await Promise.all(promises);
            results.forEach(res => items = [...items, ...res]);
            
            // Sort & Dedup
            items.sort((a,b) => new Date(b.pubDate) - new Date(a.pubDate));
            items = items.slice(0, 9); // Limit 9

            // Render
            container.innerHTML = items.map(item => `
                <a href="${sanitize(item.link)}" target="_blank" class="rv-news-card">
                    <div class="rv-news-meta">
                        <span class="rv-news-source">${item.source}</span>
                        <span>${timeAgo(item.pubDate)}</span>
                    </div>
                    <div class="rv-news-title">${sanitize(item.title)}</div>
                    <div class="rv-news-snippet">Click to read full story on source website.</div>
                </a>
            `).join('');
            
            document.getElementById('news-last-updated').innerText = "Updated: " + new Date().toLocaleTimeString();
        }
    };

    // 8. LAYOUT (Sortable)
    const Layout = {
        init: () => {
            const grid = document.getElementById('dashboard-grid');
            // Re-order DOM based on saved layout
            state.layout.forEach(id => {
                const el = document.getElementById(id);
                if(el) grid.appendChild(el);
            });

            // Init Sortable
            new Sortable(grid, {
                animation: 150,
                handle: '.rv-drag-handle',
                onEnd: () => {
                    const order = Array.from(grid.children).map(el => el.id);
                    saveState('layout', order);
                }
            });
        }
    };

    // MAIN INIT
    return {
        init: () => {
            try {
                Theme.init();
                Timer.init();
                Insight.init();
                Watchlist.init();
                Charts.init();
                MCS.init();
                News.init();
                Layout.init();
            } catch(e) {
                console.error("Critical Init Error", e);
            }
        },
        Watchlist, // Expose for HTML onclick
        news: News
    };
})();

// Start App
document.addEventListener('DOMContentLoaded', App.init);