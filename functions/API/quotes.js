export async function onRequestGet({ request }) {
  const url = new URL(request.url);
  const tickersParam = url.searchParams.get('tickers') || 'SPY';
  
  const stooqTickers = tickersParam.split(',').map(t => {
    t = t.trim().toUpperCase();
    if(t === 'BTC-USD') return 'BTC.V';
    if(t === 'ETH-USD') return 'ETH.V';
    if(t === 'GOLD') return 'GC.F';
    if(t.includes('.')) return t; 
    return `${t}.US`;
  }).join('+');

  const apiUrl = `https://stooq.com/q/l/?s=${stooqTickers}&f=sd2t2ohlcv&h&e=csv`;

  try {
    const res = await fetch(apiUrl, {
        headers: { 'User-Agent': 'RubikVault/1.0' }
    });
    
    if(!res.ok) throw new Error("Source Down");

    const csv = await res.text();
    const lines = csv.trim().split('\n');
    const quotes = {};

    for (let i = 1; i < lines.length; i++) {
        const parts = lines[i].split(',');
        if(parts.length < 5) continue;
        
        const [symbol, date, time, open, high, low, close] = parts;
        
        if (close === 'N/A') continue;

        let userSym = symbol.replace('.US', '').replace('.V', '-USD').replace('GC.F', 'GOLD');
        
        const pClose = parseFloat(close);
        const pOpen = parseFloat(open);
        
        let changePct = 0;
        if(!isNaN(pOpen) && pOpen !== 0) {
            changePct = ((pClose - pOpen) / pOpen) * 100;
        }

        quotes[userSym] = {
            price: pClose,
            changePct: changePct
        };
    }

    return new Response(JSON.stringify({ 
        quotes 
    }), {
        headers: { 
            'Content-Type': 'application/json',
            'Cache-Control': 'public, max-age=60' 
        }
    });

  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500 });
  }
}