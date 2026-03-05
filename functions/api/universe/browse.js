import { browseUniverse } from '../_shared/universe-explorer-v7.js';

export async function onRequestGet(context) {
  try {
    const url = new URL(context.request.url);
    const payload = await browseUniverse(context, {
      page: Number(url.searchParams.get('page') || 1),
      pageSize: Number(url.searchParams.get('pageSize') || 200),
      class: url.searchParams.get('class') || 'ALL',
      exchange: url.searchParams.get('exchange') || 'ALL',
      status: url.searchParams.get('status') || 'ALL',
      q: url.searchParams.get('q') || '',
      sort: url.searchParams.get('sort') || 'symbol',
      dir: url.searchParams.get('dir') || 'asc',
      minBars: Number(url.searchParams.get('minBars') || 0)
    });

    return new Response(JSON.stringify(payload), {
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'public, max-age=120',
        'X-RV-Universe-Explorer': 'browse-v1'
      }
    });
  } catch (error) {
    return new Response(JSON.stringify({
      ok: false,
      error: 'browse_failed',
      reason: String(error?.message || error)
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}
