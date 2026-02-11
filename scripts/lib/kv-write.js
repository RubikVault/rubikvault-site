import { setTimeout as sleep } from "node:timers/promises";

function withTimeout(promise, ms, label) {
  if (!ms || ms <= 0) return promise;
  return Promise.race([
    promise,
    sleep(ms).then(() => {
      throw new Error(`TIMEOUT${label ? `:${label}` : ""}`);
    })
  ]);
}

function envString(name) {
  const v = process.env[name];
  return typeof v === "string" ? v.trim() : "";
}

function toBool(v) {
  const s = String(v || "").trim().toLowerCase();
  return s === "1" || s === "true" || s === "yes";
}

export function shouldSkipKvWrite() {
  if (toBool(process.env.SKIP_KV_WRITE)) return true;
  if (toBool(process.env.INPUT_SKIP_KV_WRITE)) return true;
  return false;
}

export function createOptionalCloudflareRestKVFromEnv() {
  const accountId = envString("CF_ACCOUNT_ID");
  const namespaceId = envString("CF_KV_NAMESPACE_ID");
  const apiToken = envString("CF_API_TOKEN") || envString("CF_API_KEY");

  if (!accountId || !namespaceId || !apiToken) {
    return null;
  }

  const base = `https://api.cloudflare.com/client/v4/accounts/${accountId}/storage/kv/namespaces/${namespaceId}/values/`;

  return {
    get: async (key) => {
      const url = base + encodeURIComponent(key);
      const res = await fetch(url, {
        method: "GET",
        headers: { Authorization: `Bearer ${apiToken}` }
      });
      if (res.status === 404) return null;
      if (!res.ok) {
        const body = await res.text();
        throw new Error(`KV_GET_FAIL ${res.status} ${body.slice(0, 200)}`);
      }
      return res.text();
    },
    put: async (key, value) => {
      const url = base + encodeURIComponent(key);
      const res = await fetch(url, {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${apiToken}`,
          "Content-Type": "text/plain"
        },
        body: String(value)
      });
      if (!res.ok) {
        const body = await res.text();
        throw new Error(`KV_PUT_FAIL ${res.status} ${body.slice(0, 200)}`);
      }
      return true;
    }
  };
}

export async function kvPutSnapshotIfChanged(kv, key, valueString, digest, opts = {}) {
  const timeoutMs = Number.isFinite(opts.timeoutMs) ? opts.timeoutMs : 500;

  if (!kv || typeof kv.get !== "function" || typeof kv.put !== "function") {
    return { ok: true, status: "SKIP_NO_KV_BACKEND", wrote: false };
  }

  if (!key || !digest) {
    return { ok: false, status: "INVALID_INPUT", wrote: false };
  }

  const digestKey = key.replace(/\/latest\.json$/, "/latest.digest");

  try {
    const existingDigest = await withTimeout(
      Promise.resolve(kv.get(digestKey)),
      timeoutMs,
      "KV_GET_DIGEST"
    );

    if (typeof existingDigest === "string" && existingDigest.trim() === String(digest).trim()) {
      return { ok: true, status: "KV_WRITE_SKIPPED_NO_CHANGE", wrote: false, digestKey };
    }

    await withTimeout(Promise.resolve(kv.put(key, valueString)), timeoutMs, "KV_PUT_SNAPSHOT");
    await withTimeout(Promise.resolve(kv.put(digestKey, String(digest))), timeoutMs, "KV_PUT_DIGEST");

    return { ok: true, status: "KV_WRITE_OK", wrote: true, digestKey };
  } catch (error) {
    return {
      ok: false,
      status: "KV_WRITE_FAILED",
      wrote: false,
      digestKey,
      error: error?.message || String(error)
    };
  }
}
