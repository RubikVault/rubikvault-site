/**
 * V2 API middleware.
 * Adds V2-specific headers. Parent middleware (functions/api/_middleware.js)
 * runs first automatically and handles envelope enforcement.
 */
export async function onRequest(context) {
  const response = await context.next();

  if (response && response.headers) {
    const headers = new Headers(response.headers);
    headers.set('X-RV-API-Version', '2');
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
  }

  return response;
}
