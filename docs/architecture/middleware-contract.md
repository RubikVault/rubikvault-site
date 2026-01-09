# API Middleware Contract

## Scope
Applies to all `/api/*` endpoints.

## Content-Type Gate (Authoritative)
- If Content-Type includes `application/json`: middleware may parse/enrich.
- If Content-Type is NOT JSON: passthrough immediately, no body reads.
- No heuristics like body startsWith("{") or HTML guessing.

## Binary Passthrough
- `/api/og-image` is explicit passthrough.
- Must return HTTP 200 + `image/svg+xml` even with `?debug=1`.

## Parse Failures
- JSON.parse errors must log and return the original response.
- Middleware must never convert parse failures into HTTP 503.

## Headers
- Safe headers (e.g. `X-RV-KV`) may be added on passthrough.
- Do not overwrite Content-Type for non-JSON responses.

## Enforcement
- Pre-merge smoke tests are mandatory.
- Use `rv_smoke_json_envelope` and `rv_smoke_og` from `docs/runbooks/smoke-tests.md`.
