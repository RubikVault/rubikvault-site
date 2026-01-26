import { serveStaticJson } from "./_shared/static-only.js";

function isoDay(date = new Date()) {
  return date.toISOString().slice(0, 10);
}

function isoMonth(date = new Date()) {
  return date.toISOString().slice(0, 7);
}

function isoWeek(date = new Date()) {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
  return `${d.getUTCFullYear()}-${String(weekNo).padStart(2, "0")}`;
}

async function kvIncr(env, key) {
  const kv = env?.RV_KV;
  if (!kv || typeof kv.get !== "function" || typeof kv.put !== "function") return { ok: false, reason: "BINDING_MISSING" };
  try {
    const current = await kv.get(key);
    const next = (Number.parseInt(String(current || "0"), 10) || 0) + 1;
    await kv.put(key, String(next));
    return { ok: true, value: next };
  } catch {
    return { ok: false, reason: "KV_ERROR" };
  }
}

export async function onRequest(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const path = url.pathname;
  const now = new Date();

  if (path.startsWith("/api/")) {
    const dayKey = `mc:calls:day:${isoDay(now)}`;
    const weekKey = `mc:calls:week:${isoWeek(now)}`;
    const monthKey = `mc:calls:month:${isoMonth(now)}`;
    const endpoint = path;
    await kvIncr(env, dayKey);
    await kvIncr(env, weekKey);
    await kvIncr(env, monthKey);
    await kvIncr(env, `${dayKey}:${endpoint}`);
    await kvIncr(env, `${weekKey}:${endpoint}`);
    await kvIncr(env, `${monthKey}:${endpoint}`);
  }

  const res = await context.next();
  if (res && typeof res.status === "number" && res.status === 404 && path.startsWith("/api/")) {
    return serveStaticJson(request, env);
  }
  return res;
}
