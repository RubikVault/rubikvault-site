function stripBom(text) {
  if (!text) return "";
  return text.replace(/^\uFEFF/, "");
}

function buildError(message, context, text) {
  const error = new Error(message);
  error.code = "SCHEMA_INVALID";
  error.details = {
    context,
    head: text ? text.slice(0, 200) : ""
  };
  return error;
}

export function parseJsonLenient(text, context = "unknown") {
  const raw = stripBom(String(text || "")).trim();
  if (!raw) {
    throw buildError("Empty response", context, raw);
  }
  try {
    return JSON.parse(raw);
  } catch (error) {
    // continue to lenient path
  }

  const segments = [];
  let depth = 0;
  let start = -1;
  let inString = false;
  let stringChar = "";
  let escaped = false;

  for (let i = 0; i < raw.length; i += 1) {
    const char = raw[i];
    if (inString) {
      if (escaped) {
        escaped = false;
        continue;
      }
      if (char === "\\") {
        escaped = true;
        continue;
      }
      if (char === stringChar) {
        inString = false;
        stringChar = "";
      }
      continue;
    }

    if (char === '"' || char === "'") {
      inString = true;
      stringChar = char;
      continue;
    }

    if (char === "{" || char === "[") {
      if (depth === 0) {
        start = i;
      }
      depth += 1;
      continue;
    }

    if (char === "}" || char === "]") {
      if (depth > 0) {
        depth -= 1;
        if (depth === 0 && start >= 0) {
          segments.push(raw.slice(start, i + 1));
          start = -1;
        }
      }
    }
  }

  const parsedSegments = [];
  segments.forEach((segment) => {
    try {
      parsedSegments.push(JSON.parse(segment));
    } catch (error) {
      // ignore invalid segment
    }
  });

  if (parsedSegments.length > 0) {
    if (parsedSegments.length > 1) {
      console.warn("[parseJsonLenient] multiple JSON segments detected", {
        context,
        segments: parsedSegments.length
      });
    }
    return parsedSegments[0];
  }

  const firstIndex = Math.min(
    ...["{", "["].map((token) => {
      const idx = raw.indexOf(token);
      return idx === -1 ? Infinity : idx;
    })
  );
  const lastIndex = Math.max(raw.lastIndexOf("}"), raw.lastIndexOf("]"));
  if (Number.isFinite(firstIndex) && lastIndex > firstIndex) {
    const sliced = raw.slice(firstIndex, lastIndex + 1);
    try {
      return JSON.parse(sliced);
    } catch (error) {
      // ignore
    }
  }

  throw buildError("Invalid JSON response", context, raw);
}

export async function fetchTextWithTimeout(url, options = {}, timeoutMs = 10000) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  const signal = controller.signal;

  if (options.signal) {
    try {
      options.signal.addEventListener("abort", () => controller.abort(), { once: true });
    } catch (error) {
      // ignore
    }
  }

  try {
    const response = await fetch(url, { ...options, signal });
    const text = await response.text();
    return {
      ok: response.ok,
      status: response.status,
      text,
      headers: response.headers
    };
  } finally {
    clearTimeout(timeout);
  }
}

export async function fetchJsonWithFallbacks(urls, options = {}, context = "unknown") {
  const list = Array.isArray(urls) ? urls : [];
  let lastError = null;
  for (const url of list) {
    try {
      const { ok, status, text } = await fetchTextWithTimeout(
        url,
        options,
        options.timeoutMs || 10000
      );
      const json = parseJsonLenient(text, context);
      return { json, chosenUrl: url, upstreamStatus: status, upstreamOk: ok };
    } catch (error) {
      lastError = error;
    }
  }
  if (lastError) {
    throw lastError;
  }
  throw buildError("No upstream response", context, "");
}
