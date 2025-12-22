export async function onRequestGet() {
  return new Response(
    JSON.stringify({
      ok: true,
      service: "rubikvault",
      ts: new Date().toISOString()
    }),
    {
      status: 200,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Access-Control-Allow-Origin": "*",
        "Cache-Control": "no-store"
      }
    }
  );
}
