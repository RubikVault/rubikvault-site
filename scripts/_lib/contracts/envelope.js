import { STATUS_LIST } from "./status-enum.js";

function normalizeMeta(meta) {
  const base = meta && typeof meta === "object" ? { ...meta } : {};
  const status = STATUS_LIST.includes(String(base.status)) ? base.status : "ERROR";
  return {
    ...base,
    status,
    reason: base.reason ?? ""
  };
}

export function buildEnvelope({ ok, feature, data, error, meta }) {
  const safeOk = Boolean(ok);
  const safeFeature = String(feature || "");
  const safeMeta = normalizeMeta(meta);
  const safeData = data && typeof data === "object" ? data : {};
  let safeError = null;

  if (!safeOk) {
    if (error && typeof error === "object") {
      safeError = {
        code: error.code || "ERROR",
        message: error.message || "",
        details: error.details || {}
      };
    } else {
      safeError = { code: "ERROR", message: "", details: {} };
    }
  }

  return {
    ok: safeOk,
    feature: safeFeature,
    meta: safeMeta,
    data: safeData,
    error: safeError
  };
}
