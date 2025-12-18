import { XMLParser } from 'fast-xml-parser';

export async function onRequestGet(context) {
  const feeds = [
    { id: 'yahoo', url: 'https://finance.yahoo.com/news/rssindex', category: 'finance' },
    { id: 'cnbc', url: 'https://search.cnbc.com/rs/search/combined.xml?type=articles&id=10000664', category: 'finance' },
    { id: 'coindesk', url: 'https://www.coindesk.com/arc/outboundfeeds/rss', category: 'crypto' }
  ];

  const cacheHeader = {
    'Content-Type': 'application/json',
    'Cache-Control': 'public, max-age=120, s-maxage=120'
  };

  try {
    const parser = new XMLParser({ 
        ignoreAttributes: false, 
        attributeNamePrefix: "@_" 
    });
    
    let allItems = [];
    
    const promises = feeds.map(async (feed) => {
        try {
            const res = await fetch(feed.url, { 
                headers: { 'User-Agent': 'RubikVault/1.0' },
                cf: { cacheTtl: 60, cacheEverything: true }
            });
            
            if (!res.ok) return [];
            
            const xml = await res.text();
            const obj = parser.parse(xml);
            
            let items = obj.rss?.channel?.item || obj.feed?.entry || [];
            if(!Array.isArray(items)) items = [items];

            return items.slice(0, 10).map(i => ({
                title: cleanText(i.title),
                link: i.link,
                source: feed.id,
                category: feed.category,
                publishedAt: new Date(i.pubDate || i.updated || Date.now()).toISOString()
            }));

        } catch (e) {
            return [];
        }
    });

    const results = await Promise.all(promises);
    results.forEach(r => allItems.push(...r));

    const unique = Array.from(new Map(allItems.map(item => [item.title, item])).values());
    unique.sort((a, b) => new Date(b.publishedAt) - new Date(a.publishedAt));

    return new Response(JSON.stringify({ 
        items: unique.slice(0, 40)
    }), { headers: cacheHeader });

  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500 });
  }
}

function cleanText(str) {
    if(!str) return "";
    return String(str)
        .replace(/<!\[CDATA\[(.*?)\]\]>/g, '$1')
        .replace(/<[^>]*>/g, '')
        .trim();
}