export async function onRequestGet({ request }) {
  const url = new URL(request.url);
  const tickers = url.searchParams.get('tickers') || 'SPY';
  
  // Mapping für Stooq API
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
      const [symbol, date, time, open, high, low, close] = lines[i].split(',');
      if (!close || close === 'N/A') continue;

      // Symbol cleanen
      let sym = symbol.replace('.US', '').replace('.V', '-USD');
      
      const price = parseFloat(close);
      const openPrice = parseFloat(open);
      let changePct = 0;
      
      if(openPrice > 0) changePct = ((price - openPrice) / openPrice) * 100;

      quotes[sym] = {
        price: price,
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