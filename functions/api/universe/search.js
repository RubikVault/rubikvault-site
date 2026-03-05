import { searchUniverse } from '../_shared/universe-explorer-v7.js';

export async function onRequestGet(context) {
  try {
    const url = new URL(context.request.url);
    const payload = await searchUniverse(context, {
      q: url.searchParams.get('q') || '',
      limit: Number(url.searchParams.get('limit') || 20),
      class: url.searchParams.get('class') || 'ALL'
    });

    return new Response(JSON.stringify(payload), {
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'public, max-age=120',
        'X-RV-Universe-Explorer': 'search-v1'
      }
    });
  } catch (error) {
    return new Response(JSON.stringify({
      ok: false,
      error: 'search_failed',
      reason: String(error?.message || error)
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}
