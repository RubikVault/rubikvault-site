async function readJsonAsset(origin, path) {
  const response = await fetch(new URL(path, origin).toString(), { cf: { cacheTtl: 60 } });
  if (!response.ok) return null;
  return response.json();
}

export async function onRequestGet(context) {
  const url = new URL(context.request.url);
  const latest = await readJsonAsset(url.origin, "/data/breakout/manifests/latest.json");
  const manifest = latest?.validation?.publishable === true
    ? latest
    : await readJsonAsset(url.origin, "/data/breakout/manifests/last_good.json");
  if (!manifest?.files?.top500) {
    return Response.json({
      ok: false,
      feature: "breakout-v12",
      data: null,
      error: { code: "BREAKOUT_V12_UNAVAILABLE", message: "Breakout V1.2 artifacts are not published yet." },
      meta: { status: "missing", generated_at: new Date().toISOString() },
    }, { status: 404 });
  }

  const top500 = await readJsonAsset(url.origin, `/data/breakout/${manifest.files.top500}`);
  if (!top500) {
    return Response.json({
      ok: false,
      feature: "breakout-v12",
      data: null,
      error: { code: "BREAKOUT_V12_TOP500_MISSING", message: "Breakout V1.2 top500 artifact is missing." },
      meta: { status: "error", generated_at: new Date().toISOString(), manifest_path: manifest.manifest_path || null },
    }, { status: 502 });
  }

  return Response.json({
    ok: true,
    feature: "breakout-v12",
    data: {
      manifest,
      top500,
    },
    error: null,
    meta: {
      status: "ok",
      provider: "static",
      data_date: manifest.as_of || top500.as_of || null,
      generated_at: new Date().toISOString(),
      score_version: manifest.score_version || top500.score_version || null,
    },
  });
}
