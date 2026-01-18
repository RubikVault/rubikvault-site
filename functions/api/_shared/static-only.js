import fs from "node:fs/promises";
import path from "node:path";

export async function serveStaticJson(req) {
  const url = new URL(req.url);
  const p = url.pathname.replace(/^\/api/, "").replace(/\/$/, "") || "/bundle";
  const file = path.join(process.cwd(), "public", "data", `${p}.json`);

  try {
    const body = await fs.readFile(file, "utf8");
    return new Response(body, { headers: { "Content-Type": "application/json" } });
  } catch {
    return new Response(
      JSON.stringify({ ok: false, error: "SNAPSHOT_NOT_FOUND", path: `/data${p}.json` }),
      { status: 404, headers: { "Content-Type": "application/json" } }
    );
  }
}
