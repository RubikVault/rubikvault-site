export async function onRequest(ctx) {
  const { request } = ctx;
  const url = new URL(request.url);
  const debug = url.searchParams.get("debug") === "1" || url.searchParams.get("debug") === "true";

  const assetUrl = new URL("/data/render-plan.json", url.origin);

  let raw = null;
  let meta = { status: "OK" };
  let ok = true;
  let error = null;

  try {
    const r = await fetch(assetUrl.toString(), { headers: { "accept": "application/json" } });
    if (!r.ok) {
      ok = false;
      meta = { status: "ERROR", reason: `asset_fetch_${r.status}` };
    } else {
      raw = await r.json();
    }
  } catch (e) {
    ok = false;
    meta = { status: "ERROR", reason: "asset_fetch_exception" };
    error = { code: "ASSET_FETCH_FAILED", message: String(e && e.message ? e.message : e) };
  }

  const payload = {
    ok,
    feature: "render-plan",
    meta,
    data: raw,
    error,
  };

  if (debug) {
    payload.meta = {
      ...payload.meta,
      debug: {
        assetPath: "/data/render-plan.json",
        hasData: raw !== null,
      },
    };
  }

  return new Response(JSON.stringify(payload), {
    status: ok ? 200 : 200,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}
