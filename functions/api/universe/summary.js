import { getSummary } from '../_shared/universe-explorer-v7.js';

export async function onRequestGet(context) {
  try {
    const url = new URL(context.request.url);
    const pageSize = Number(url.searchParams.get('pageSize') || 200);
    const summary = await getSummary(context, pageSize);

    return new Response(JSON.stringify(summary), {
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'public, max-age=120',
        'X-RV-Universe-Explorer': 'summary-v1'
      }
    });
  } catch (error) {
    return new Response(JSON.stringify({
      ok: false,
      error: 'summary_failed',
      reason: String(error?.message || error)
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}
