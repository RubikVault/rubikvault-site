/**
 * Cloudflare Pages Function for /internal/health
 * 
 * Serves the Mission Control Dashboard HTML file directly
 */

export async function onRequestGet(context) {
  const { request } = context;
  const url = new URL(request.url);
  
  // For /internal/health or /internal/health/, redirect to index.html
  if (url.pathname === '/internal/health' || url.pathname === '/internal/health/') {
    return Response.redirect(new URL('/internal/health/index.html', request.url), 301);
  }
  
  // For /internal/health/index.html, fetch and serve the static file
  // We need to make a subrequest to get the file content
  try {
    const fileUrl = new URL('/internal/health/index.html', request.url);
    const fileRequest = new Request(fileUrl, {
      method: 'GET',
      headers: request.headers
    });
    
    // Try to fetch from the static file system
    const response = await fetch(fileRequest);
    
    if (response.ok) {
      return new Response(response.body, {
        status: 200,
        headers: {
          'Content-Type': 'text/html; charset=utf-8',
          'Cache-Control': 'no-store'
        }
      });
    }
  } catch (err) {
    // Fallback: return error
    return new Response(`Error loading Mission Control Dashboard: ${err.message}`, {
      status: 500,
      headers: { 'Content-Type': 'text/plain' }
    });
  }
  
  return new Response("Mission Control Dashboard not found", {
    status: 404,
    headers: { 'Content-Type': 'text/plain' }
  });
}
