// Terminal helpers (copy/paste)
// curl -sS "$PREVIEW/api/health-report" | jq -r '
// (.blocks//[]) | sort_by(.id) | .[] |
// "Block \(.id) — \(.title)\n  state=\(.blockState) status=\(.endpointStatus) reason=\(.reason//"-")\n" +
// (
//   (.fields//[]) | map(
//     "  • \(.key) (\(.path)) required=\(.required) valid=\(.valid)\n    reason=\(.reason//"-")\n    fix=\(.fixHint//"-")\n"
//   ) | join("")
// ) + "\n"
// '
import { BLOCK_REGISTRY_LIST, REGISTRY_HASH } from "../../features/blocks-registry.js";
import { normalizeResponse } from "./_shared/feature-contract.js";
import { createTraceId, jsonResponse } from "./_shared.js";

function resolvePath(obj, path) {
  if (!obj || !path) return undefined;
  const parts = path.split(".").filter(Boolean);
  return parts.reduce((acc, key) => (acc && acc[key] !== undefined ? acc[key] : undefined), obj);
}

function resolveValue(payload, field) {
  if (!payload || !field) return undefined;
  const key = field.path || field.key || "";
  if (!key) return undefined;
  const hasRootPrefix =
    key.startsWith("data.") ||
    key.startsWith("meta.") ||
    key.startsWith("error.") ||
    key.startsWith("cache.") ||
    key.startsWith("upstream.") ||
    key.startsWith("trace.");
  const path = hasRootPrefix ? key : `data.${key}`;
  return resolvePath(payload, path);
}

function detectItems(payload) {
  const data = payload?.data ?? {};
  const candidates = [
    data.items,
    data.rows,
    data.data?.items,
    data.data?.rows,
    payload?.items,
    payload?.rows
  ];
  const items = candidates.find((value) => Array.isArray(value));
  return Array.isArray(items) ? items : [];
}

function normalizeEndpointStatus(raw, normalized) {
  const metaStatus = raw?.meta?.status;
  if (metaStatus === "LIVE" || metaStatus === "STALE" || metaStatus === "EMPTY") return metaStatus;
  if (normalized?.dataQuality?.status === "LIVE") return "LIVE";
  if (normalized?.dataQuality?.status === "PARTIAL") return "STALE";
  return "EMPTY";
}

function buildFixHint({
  contentType,
  bodySnippet,
  itemsCount,
  dataQuality,
  cacheLayer,
  upstreamStatus,
  httpStatus,
  endpointStatus,
  reason
}) {
  const ct = String(contentType || "").toLowerCase();
  const snippet = String(bodySnippet || "").trim();
  if (ct.includes("text/html") || snippet.startsWith("<!doctype") || snippet.startsWith("<html")) {
    return "ROUTING_HTML (API returns HTML)";
  }
  if (endpointStatus === "LIVE" && itemsCount === 0) {
    return "Endpoint marks LIVE but data empty; check mapper/envelope.";
  }
  if (upstreamStatus === 401 || httpStatus === 401) {
    return "Missing/invalid API key or blocked access; configure env var/provider, then seed lastGood in PROD.";
  }
  if (upstreamStatus === 403 || httpStatus === 403) {
    return "UPSTREAM_AUTH (key/plan missing or blocked)";
  }
  if (reason === "CACHE_MISSING") {
    return "No lastGood yet. Hit PROD once to seed KV; Preview then returns STALE.";
  }
  if (reason === "NO_DATA") {
    return "Data genuinely absent for current universe/threshold; lower threshold or expand universe; verify mapper outputs items.";
  }
  if (reason === "SCHEMA_INVALID") {
    return "Mapper/validator mismatch; update mapper to produce required fields or relax validator.";
  }
  if (!cacheLayer || cacheLayer === "none") {
    return "CACHE_MISSING (KV binding or cache miss)";
  }
  if (itemsCount === 0 && (dataQuality?.reason === "NO_DATA" || dataQuality?.status === "PARTIAL")) {
    return "EMPTY_DATA (threshold/universe/cache)";
  }
  return null;
}

function buildEmptyReason({
  contentType,
  bodySnippet,
  itemsCount,
  dataQuality,
  upstreamStatus,
  httpStatus,
  cacheLayer,
  emptyPolicy,
  endpointStatus
}) {
  const ct = String(contentType || "").toLowerCase();
  const snippet = String(bodySnippet || "").trim();
  const isHtml = ct.includes("text/html") || snippet.startsWith("<!doctype") || snippet.startsWith("<html");
  if (isHtml) return "ROUTING_HTML";
  if (upstreamStatus === 401 || httpStatus === 401) return "UPSTREAM_4XX";
  if (upstreamStatus === 403 || httpStatus === 403) return "UPSTREAM_4XX";
  if ((upstreamStatus && upstreamStatus >= 500) || (httpStatus && httpStatus >= 500)) return "UPSTREAM_5XX";
  if (itemsCount === 0) {
    if (emptyPolicy === "CLIENT_ONLY") return "CLIENT_ONLY";
    if (emptyPolicy === "EMPTY_OK_WITH_CONTEXT") return "EVENT_NO_EVENTS";
    if (!cacheLayer || cacheLayer === "none") return "CACHE_EMPTY";
    if (dataQuality?.reason === "NO_DATA") return "NO_DATA_YET";
    if (endpointStatus === "LIVE") return "EMPTY_LIVE";
    return "EMPTY";
  }
  return dataQuality?.reason || null;
}

function isDataEmpty(data) {
  if (!data || typeof data !== "object") return true;
  if (Array.isArray(data)) return data.length === 0;
  return Object.keys(data).length === 0;
}

function isPlaceholder(value) {
  if (value === null || value === undefined) return false;
  if (typeof value !== "string") return false;
  const trimmed = value.trim().toLowerCase();
  return trimmed === "" || trimmed === "n/a" || trimmed === "na" || trimmed === "-" || trimmed === "—";
}

function resolveValidator(field) {
  if (!field) return null;
  const validator = field.validator;
  if (validator && typeof validator === "object" && validator.type) return validator;
  if (typeof validator === "string") {
    if (validator.startsWith("arrayMin:")) {
      return { type: "arrayMin", min: Number(validator.split(":")[1] || 0) };
    }
    return { type: validator };
  }
  return null;
}

function validateFieldValue(value, field) {
  const validator = resolveValidator(field) || { type: "exists" };
  const required = Boolean(field.required);

  if ((value === undefined || value === null) && required) {
    return { valid: false, reason: "MISSING" };
  }
  if (value === undefined || value === null) {
    return { valid: true, reason: null };
  }

  const type = validator.type || "exists";
  if (type === "exists") {
    return { valid: true, reason: null };
  }
  if (type === "nonEmpty") {
    if (typeof value === "string") {
      if (isPlaceholder(value)) return { valid: false, reason: "PLACEHOLDER" };
      return value.trim().length > 0 ? { valid: true, reason: null } : { valid: false, reason: "EMPTY" };
    }
    if (Array.isArray(value)) {
      return value.length > 0 ? { valid: true, reason: null } : { valid: false, reason: "EMPTY" };
    }
    if (typeof value === "object") {
      return Object.keys(value || {}).length > 0 ? { valid: true, reason: null } : { valid: false, reason: "EMPTY" };
    }
    if (typeof value === "number") {
      return Number.isFinite(value) ? { valid: true, reason: null } : { valid: false, reason: "WRONG_TYPE" };
    }
    return { valid: false, reason: "WRONG_TYPE" };
  }
  if (type === "stringNonEmpty") {
    if (typeof value !== "string") return { valid: false, reason: "WRONG_TYPE" };
    if (isPlaceholder(value)) return { valid: false, reason: "PLACEHOLDER" };
    return value.trim().length > 0 ? { valid: true, reason: null } : { valid: false, reason: "EMPTY" };
  }
  if (type === "numeric") {
    if (typeof value !== "number") return { valid: false, reason: "WRONG_TYPE" };
    if (!Number.isFinite(value)) return { valid: false, reason: "WRONG_TYPE" };
    return { valid: true, reason: null };
  }
  if (type === "arrayMin") {
    if (!Array.isArray(value)) return { valid: false, reason: "WRONG_SHAPE" };
    const min = Number.isFinite(validator.min) ? validator.min : 0;
    return value.length >= min ? { valid: true, reason: null } : { valid: false, reason: "EMPTY" };
  }
  if (type === "oneOf") {
    const values = Array.isArray(validator.values) ? validator.values : [];
    return values.includes(value) ? { valid: true, reason: null } : { valid: false, reason: "OUT_OF_RANGE" };
  }
  if (type === "range") {
    if (typeof value !== "number" || !Number.isFinite(value)) return { valid: false, reason: "WRONG_TYPE" };
    if (Number.isFinite(validator.min) && value < validator.min) return { valid: false, reason: "OUT_OF_RANGE" };
    if (Number.isFinite(validator.max) && value > validator.max) return { valid: false, reason: "OUT_OF_RANGE" };
    return { valid: true, reason: null };
  }
  if (type === "regex") {
    if (typeof value !== "string") return { valid: false, reason: "WRONG_TYPE" };
    try {
      const regex = new RegExp(validator.pattern || "");
      return regex.test(value) ? { valid: true, reason: null } : { valid: false, reason: "FORMAT_INVALID" };
    } catch (error) {
      return { valid: false, reason: "FORMAT_INVALID" };
    }
  }
  if (type === "objectNonEmpty") {
    if (!value || typeof value !== "object" || Array.isArray(value)) return { valid: false, reason: "WRONG_SHAPE" };
    return Object.keys(value).length > 0 ? { valid: true, reason: null } : { valid: false, reason: "EMPTY" };
  }
  return { valid: true, reason: null };
}

function fixHintForReason(reason, fallback) {
  if (!reason) return fallback || null;
  if (reason === "UPSTREAM_4XX") {
    return "Missing/invalid API key or blocked access; configure env var / provider; then seed lastGood in PROD.";
  }
  if (reason === "CACHE_MISSING") {
    return "No lastGood yet. Hit PROD once to seed KV; Preview then returns STALE.";
  }
  if (reason === "NO_DATA") {
    return "Data genuinely absent for current universe/threshold; lower threshold or expand universe; verify mapper outputs items.";
  }
  if (reason === "SCHEMA_INVALID") {
    return "Mapper/validator mismatch; update mapper to produce required fields or relax validator.";
  }
  if (reason === "EMPTY_LIVE") {
    return "Endpoint marks LIVE but data empty; bug in endpoint envelope or mapper.";
  }
  if (reason === "PLACEHOLDER") {
    return "Placeholder values detected; ensure mapper emits real values or null with notes.";
  }
  return fallback || null;
}

export async function onRequestGet(context) {
  const { request, env } = context;
  const traceId = createTraceId(request);
  const origin = new URL(request.url).origin;
  const now = new Date().toISOString();
  const debugEnabled = new URL(request.url).searchParams.get("debug") === "1";
  const globalCandidates = [
    "data.items",
    "data.rows",
    "data.points",
    "data.series",
    "data.value",
    "data.score",
    "data.updatedAt"
  ];
  const registryEntries = (BLOCK_REGISTRY_LIST || []).slice();

  const results = [];
  let fetchFailures = 0;
  for (const entry of registryEntries) {
    const featureId = entry.featureId || entry.blockId || "unknown";
    const endpoint = entry.apiPath || (entry.api ? `/api/${entry.api}` : null);
    const fields = Array.isArray(entry.fieldsContract)
      ? entry.fieldsContract
      : Array.isArray(entry.fields)
        ? entry.fields
        : [];
    const block = {
      id: entry.id || "00",
      featureId,
      title: entry.title || featureId,
      apiPath: endpoint,
      endpointStatus: "EMPTY",
      reason: null,
      error: null,
      circuitOpen: null,
      invalidFields: 0,
      fields: [],
      discovered: {
        serverKeys: [],
        envelopeIssues: [],
        endpointMeta: {}
      }
    };

    if (!endpoint) {
      block.endpointStatus = "EMPTY";
      block.reason = "CLIENT_ONLY";
      block.fields = fields.map((field) => ({
        key: field.key,
        path: field.path || field.key,
        required: Boolean(field.required),
        valid: !field.required,
        reason: field.required ? "CLIENT_ONLY" : null,
        fixHint: field.required ? "Client-only block has no API payload." : null
      }));
      block.invalidFields = block.fields.filter((field) => field.valid === false).length;
      results.push(block);
      continue;
    }

    let responseStatus = null;
    let contentType = "";
    let bodySnippet = "";
    let raw = null;
    let parseFailed = false;
    try {
      const res = await fetch(`${origin}${endpoint}?debug=1`, {
        headers: { "x-rv-trace-id": traceId }
      });
      responseStatus = res.status;
      contentType = res.headers.get("content-type") || "";
      const text = await res.text();
      bodySnippet = text.slice(0, 200);
      if (text.trim().startsWith("{")) {
        try {
          raw = JSON.parse(text);
        } catch (error) {
          parseFailed = true;
          raw = null;
        }
      }
    } catch (error) {
      fetchFailures += 1;
      block.endpointStatus = "EMPTY";
      block.reason = "FETCH_ERROR";
      block.error = { code: "FETCH_ERROR", message: error?.message || "Fetch failed" };
      block.fields = fields.map((field) => ({
        key: field.key,
        path: field.path || field.key,
        required: Boolean(field.required),
        valid: false,
        reason: "FETCH_ERROR",
        fixHint: "Check routing or upstream availability."
      }));
      block.invalidFields = block.fields.filter((field) => field.valid === false).length;
      results.push(block);
      continue;
    }

    if (!raw) {
      block.endpointStatus = "ERROR";
      block.reason = "NON_JSON_RESPONSE";
      block.error = {
        code: "NON_JSON_RESPONSE",
        message: parseFailed ? "JSON parse failed" : "Response was not JSON"
      };
      block.discovered.envelopeIssues.push("NON_JSON_RESPONSE");
      block.discovered.endpointMeta = {
        httpStatus: responseStatus,
        contentType,
        reason: block.reason
      };
      block.fields = fields.map((field) => ({
        key: field.key,
        path: field.path || field.key,
        required: Boolean(field.required),
        valid: false,
        reason: "NON_JSON_RESPONSE",
        fixHint: "Endpoint did not return JSON. Check routing and content-type."
      }));
      block.invalidFields = block.fields.filter((field) => field.valid === false).length;
      results.push(block);
      continue;
    }

    const normalized = raw ? normalizeResponse(raw, { feature: featureId }) : null;
    const items = normalized ? detectItems(normalized) : [];
    const itemsCount = items.length;
    const endpointStatus = normalizeEndpointStatus(raw, normalized);
    const dataQuality = normalized?.dataQuality || null;
    const upstreamStatus = normalized?.upstream?.status ?? null;
    const cacheLayer = normalized?.cache?.layer || "none";
    const fixHint = buildFixHint({
      contentType,
      bodySnippet,
      itemsCount,
      dataQuality,
      cacheLayer,
      upstreamStatus,
      httpStatus: responseStatus,
      endpointStatus,
      reason: dataQuality?.reason
    });

    block.endpointStatus = endpointStatus;
    const baseReason = raw?.meta?.reason || dataQuality?.reason || null;
    const emptyReason = buildEmptyReason({
      contentType,
      bodySnippet,
      itemsCount,
      dataQuality,
      cacheLayer,
      upstreamStatus,
      httpStatus: responseStatus,
      emptyPolicy: entry.emptyPolicy || "",
      endpointStatus
    });
    if (endpointStatus === "LIVE" && itemsCount === 0) {
      block.reason = "EMPTY_LIVE";
    } else {
      block.reason = baseReason || emptyReason || null;
    }
    block.error = raw?.error ? { code: raw.error.code, message: raw.error.message } : null;
    block.circuitOpen = raw?.meta?.circuitOpen ?? null;
    block.discovered.endpointMeta = {
      httpStatus: responseStatus,
      status: endpointStatus,
      reason: block.reason,
      contentType
    };
    if (!raw?.meta) block.discovered.envelopeIssues.push("MISSING_META");
    if (!raw?.meta?.status) block.discovered.envelopeIssues.push("MISSING_META_STATUS");
    if (raw?.ok === undefined) block.discovered.envelopeIssues.push("MISSING_OK");
    if (!raw?.feature) block.discovered.envelopeIssues.push("MISSING_FEATURE");
    const dataObj = normalized?.data || null;
    if (Array.isArray(dataObj)) {
      block.discovered.serverKeys = dataObj.length ? Object.keys(dataObj[0] || {}) : [];
    } else if (dataObj && typeof dataObj === "object") {
      block.discovered.serverKeys = Object.keys(dataObj);
    } else {
      block.discovered.serverKeys = [];
    }

    const isPreviewEmpty = endpointStatus === "EMPTY" && block.reason === "PREVIEW";
    const isClientOnly = block.reason === "CLIENT_ONLY";
    const isEndpointError = endpointStatus === "ERROR";
    const isStale = endpointStatus === "STALE";
    const forceEmptyInvalid =
      endpointStatus === "EMPTY" && !isPreviewEmpty && !isClientOnly;

    block.fields = fields.map((field) => {
      const value = normalized ? resolveValue(normalized, field) : undefined;
      let { valid, reason } = validateFieldValue(value, field);
      let fix = null;
      const isOptional = field.required === false && field.optional === true;
      if (isEndpointError) {
        valid = false;
        reason = "ENDPOINT_ERROR";
        fix = block.error?.code
          ? `Endpoint error (${block.error.code}). Check routing, schema, or upstream availability.`
          : "Endpoint error. Check routing, schema, or upstream availability.";
      } else if (forceEmptyInvalid && !isOptional) {
        valid = false;
        if (block.reason === "PREVIEW") {
          reason = "EMPTY_PREVIEW";
          fix =
            "Preview blocks upstream. Seed lastGood by calling PROD /api/<endpoint> once, then Preview shows STALE.";
        } else if (block.reason === "UPSTREAM_4XX") {
          reason = "EMPTY_UPSTREAM";
          fix =
            "Missing/invalid API key; configure env var or switch provider; then seed lastGood in PROD.";
        } else if (block.reason === "CACHE_EMPTY") {
          reason = "CACHE_MISSING";
          fix = "No lastGood yet. Hit PROD once to seed KV; Preview then returns STALE.";
        } else {
          reason = "EMPTY_UPSTREAM";
          fix = "Seed lastGood in PROD or validate upstream response.";
        }
      } else if (isPreviewEmpty) {
        if (field.allowInPreviewEmpty) {
          valid = true;
          reason = null;
          fix = null;
        } else {
          valid = false;
          reason = "EXPECTED_PREVIEW_EMPTY";
          fix =
            "Preview blocks upstream. Seed lastGood by hitting PROD once; Preview shows STALE afterwards.";
        }
      } else if (isClientOnly) {
        valid = true;
        reason = null;
        fix = null;
      } else if (!valid) {
        fix =
          entry.fixHints?.[field.key] ||
          fixHintForReason(reason, fixHint) ||
          "Mapper/normalization may be missing.";
      }
      return {
        key: field.key,
        path: field.path || field.key,
        required: Boolean(field.required),
        valid,
        reason: reason || field.reasonOnFail || null,
        fixHint: fix || field.fixHint || null
      };
    });
    block.invalidFields = block.fields.filter((field) => field.valid === false).length;
    if (isPreviewEmpty || isClientOnly) {
      block.blockState = "EXPECTED";
    } else if (isEndpointError) {
      block.blockState = "BAD";
    } else if (isStale) {
      block.blockState = "OK";
    } else if (forceEmptyInvalid && block.invalidFields > 0) {
      block.blockState = "BAD";
    } else if (block.invalidFields > 0) {
      block.blockState = "BAD";
    } else {
      block.blockState = "OK";
    }

    if (debugEnabled) {
      const dataObj = normalized?.data || {};
      const observedTopKeys = dataObj && typeof dataObj === "object" ? Object.keys(dataObj) : [];
      const candidates = Array.from(
        new Set([...(entry.schemaHints?.candidates || []), ...globalCandidates])
      );
      const observedCandidatePaths = candidates.map((path) => {
        const value = resolvePath(normalized, path);
        return {
          path,
          present: value !== undefined,
          type: Array.isArray(value) ? "array" : typeof value,
          count: Array.isArray(value) ? value.length : undefined
        };
      });
      const suggestionFields = observedCandidatePaths
        .filter((candidate) => candidate.present)
        .slice(0, 4)
        .map((candidate) => ({
          key: candidate.path.split(".").slice(-1)[0],
          path: candidate.path,
          required: false,
          validator: Array.isArray(resolvePath(normalized, candidate.path))
            ? { type: "arrayMin", min: 1 }
            : { type: "exists" },
          reasonOnFail: "EMPTY_DATA",
          fixHint: `Add fieldsContract for ${candidate.path}.`
        }));
      block.debug = {
        observedTopKeys,
        observedCandidatePaths,
        suggestion: suggestionFields.length > 0 ? { addFieldsContractExample: suggestionFields } : null
      };
    }

    results.push(block);
  }

  const expectedPreview = results.filter(
    (block) => block.endpointStatus === "EMPTY" && block.reason === "PREVIEW"
  ).length;
  const expectedClientOnly = results.filter((block) => block.reason === "CLIENT_ONLY").length;
  const okBlocks = results.filter((block) => block.blockState === "OK").length;
  const badBlocks = results.filter((block) => block.blockState === "BAD").length;
  const payload = {
    ok: fetchFailures < registryEntries.length,
    generatedAt: now,
    env: {
      branch: env?.CF_PAGES_BRANCH || null,
      preview:
        env?.ENV_HINT === "preview" ||
        (env?.CF_PAGES_BRANCH && env?.CF_PAGES_BRANCH !== "main") ||
        String(request.headers.get("host") || "").includes("pages.dev")
    },
    summary: {
      blocks: results.length,
      okBlocks,
      badBlocks,
      expectedPreview,
      expectedClientOnly
    },
    blocks: results,
    meta: {
      generatedAt: now,
      traceId,
      registryHash: REGISTRY_HASH,
      commands: [
        "curl -sS \"$PREVIEW/api/health-report\" | jq -r '(.blocks//[]) | sort_by(.id) | .[] | \"Block \\(.id) — \\(.title)\"'"
      ]
    }
  };

  return jsonResponse(payload, 200, { "X-RV-Trace": traceId });
}
