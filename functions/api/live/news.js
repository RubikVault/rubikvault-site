export async function onRequestGet(context) {
    const { request, env } = context;
    const url = new URL(request.url);
    const symbol = url.searchParams.get('s');

    if (!symbol) {
        return new Response(JSON.stringify({ error: 'Missing symbol parameter' }), {
            status: 400,
            headers: { 'Content-Type': 'application/json' }
        });
    }

    const apiKey = env.EODHD_API_TOKEN;
    if (!apiKey) {
        return new Response(JSON.stringify({ error: 'Backend API Token missing from Edge Environment' }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' }
        });
    }

    try {
        const targetUrl = `https://eodhd.com/api/news?s=${encodeURIComponent(symbol)}&limit=20&api_token=${apiKey}&fmt=json`;
        const eodhdRes = await fetch(targetUrl, {
            headers: {
                "User-Agent": "RubikVault-Live/1.0",
                "Accept": "application/json"
            }
        });

        if (!eodhdRes.ok) {
            return new Response(JSON.stringify({ error: `Downstream API Error: ${eodhdRes.status}` }), {
                status: 502,
                headers: { 'Content-Type': 'application/json' }
            });
        }

        const data = await eodhdRes.text();

        return new Response(data, {
            status: 200,
            headers: {
                'Content-Type': 'application/json',
                'Cache-Control': 'public, max-age=300', // 5-minute CDN cache for news
                'Access-Control-Allow-Origin': '*'
            }
        });
    } catch (err) {
        return new Response(JSON.stringify({ error: 'Internal Server Error' }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' }
        });
    }
}
