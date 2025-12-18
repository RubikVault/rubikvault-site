export async function onRequestGet({ request }) {
  const url = new URL(request.url);
  const tickers = url.searchParams.get('tickers') || 'SPY';
  
  // Mapping für Stooq
  const stooqTickers = tickers.split(',').map(t => {
    t = t.trim().toUpperCase();
    if(t === 'BTC-USD') return 'BTC.V';
    if(t === 'ETH-USD') return 'ETH.V';
    if(t.includes('.')) return t; 
    return `${t}.US`;
  }).join('+');

  const apiUrl = `https://stooq.com/q/l/?s=${stooqTickers}&f=sd2t2ohlcv&h&e=csv`;

  try {
    const res = await fetch(apiUrl);
    const csv = await res.text();
    const lines = csv.trim().split('\n');
    const quotes = {};

    for (let i = 1; i < lines.length; i++) {
      const parts = lines[i].split(',');
      // Stooq CSV Format: Symbol,Date,Time,Open,High,Low,Close,Volume
      // Manchmal fehlen Daten, wir brauchen min. Close
      if (parts.length < 7) continue;
      
      const symbol = parts[0];
      const close = parseFloat(parts[6]);
      const open = parseFloat(parts[3]);

      if (isNaN(close)) continue;

      let sym = symbol.replace('.US', '').replace('.V', '-USD');
      let changePct = 0;
      
      if(!isNaN(open) && open !== 0) {
        changePct = ((close - open) / open) * 100;
      }

      quotes[sym] = {
        price: close,
        changePct: changePct
      };
    }

    return new Response(JSON.stringify({ quotes }), {
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500 });
  }
}