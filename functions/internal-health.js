/**
 * Cloudflare Pages Function specifically for /internal/health
 * 
 * This file must be named functions/internal-health.js to match /internal-health/*
 * But Cloudflare Pages routes /internal/health to this function.
 * Actually, this won't work - we need functions/internal/health.js
 * 
 * WORKAROUND: Serve the HTML content directly by reading it
 */

// Import the HTML as a string at build time
// Note: This requires the HTML to be available at build time
export async function onRequestGet(context) {
  const { request } = context;
  const url = new URL(request.url);
  
  // For /internal-health/* requests, serve the dashboard
  // But we actually want /internal/health - this won't match
  
  // Return a simple HTML response with redirect to actual file
  return new Response(`
    <!DOCTYPE html>
    <html>
    <head>
      <meta http-equiv="refresh" content="0; url=/internal/health/index.html">
      <title>Mission Control</title>
    </head>
    <body>
      <p>Redirecting to <a href="/internal/health/index.html">Mission Control Dashboard</a></p>
    </body>
    </html>
  `, {
    headers: {
      'Content-Type': 'text/html',
      'Location': '/internal/health/index.html'
    },
    status: 302
  });
}
