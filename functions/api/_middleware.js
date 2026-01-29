import { serveStaticJson } from "./_shared/static-only.js";
import { ensureEnvelopeResponse, errorEnvelope } from "./_shared/envelope.js";


export async function onRequest(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const path = url.pathname;

  let res;
  try {
    res = await context.next();
  } catch (err) {
    // Return error envelope for thrown exceptions - never leak stack traces
    const envelope = errorEnvelope(
      "INTERNAL",
      "An unexpected error occurred",
      { provider: "internal", data_date: "" }
    );
    return new Response(JSON.stringify(envelope), {
      status: 500,
      headers: { "Content-Type": "application/json; charset=utf-8" }
    });
  }

  if (res && typeof res.status === "number" && res.status === 404 && path.startsWith("/api/")) {
    // Try static fallback first
    const fallback = await serveStaticJson(request, env);
    if (!fallback || fallback.status === 404) {
      // Static fallback also 404 - return proper error envelope
      const envelope = errorEnvelope(
        "NOT_FOUND",
        `Resource not found: ${path}`,
        { provider: "internal", data_date: "" }
      );
      return new Response(JSON.stringify(envelope), {
        status: 404,
        headers: { "Content-Type": "application/json; charset=utf-8" }
      });
    }
    res = fallback;
  }
  return ensureEnvelopeResponse(res);
}
