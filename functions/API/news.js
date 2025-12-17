import { XMLParser } from 'fast-xml-parser';

export async function onRequestGet(context) {
  // Quellen
  const feeds = [
    { id: 'yahoo', url: 'https://finance.yahoo.com/news/rssindex' },
    { id: 'cnbc', url: 'https://search.cnbc.com/rs/search/combined.xml?type=articles&id=10000664' },
    { id: 'coindesk', url: 'https://www.coindesk.com/arc/outboundfeeds/rss' }
  ];

  try {
    const parser = new XMLParser({ ignoreAttributes: false });
    let allItems = [];

    // Parallel Fetching
    const promises = feeds.map(async (feed) => {
      try {
        const res = await fetch(feed.url, { 
          headers: { 'User-Agent': 'RubikVault/1.0' },
          cf: { cacheTtl: 60, cacheEverything: true } 
        });
        if (!res.ok) return [];
        const xmlText = await res.text();
        const xmlObj = parser.parse(xmlText);
        
        let items = xmlObj.rss?.channel?.item || xmlObj.feed?.entry || [];
        if (!Array.isArray(items)) items = [items];

        return items.slice(0, 10).map(item => ({
          title: item.title,
          link: item.link,
          pubDate: item.pubDate || item.updated,
          source: feed.id
        }));
      } catch (e) { return []; }
    });

    const results = await Promise.all(promises);
    results.forEach(r => allItems.push(...r));

    // Dedupe & Sort
    const unique = Array.from(new Map(allItems.map(item => [item.title, item])).values());
    unique.sort((a, b) => new Date(b.pubDate) - new Date(a.pubDate));

    return new Response(JSON.stringify({ items: unique.slice(0, 30) }), {
      headers: { 
        'Content-Type': 'application/json',
        'Cache-Control': 'public, max-age=60' 
      }
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500 });
  }
}