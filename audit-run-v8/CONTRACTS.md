# CONTRACTS

Generated: 2026-02-11T18:06:31Z

## Bases
- PREVIEW_BASE=https://6c0a5a7f.rubikvault-site.pages.dev
- PROD_BASE=https://rubikvault.com

## Endpoint probes

```text
=== BASE: https://6c0a5a7f.rubikvault-site.pages.dev ===
URL=https://6c0a5a7f.rubikvault-site.pages.dev/api/mission-control/summary?debug=1
HTTP=200
CONTENT_TYPE=content-type: application/json; charset=utf-8
HTML_SIGNATURE=no
JQ_PARSE=yes
META={"schema_version":"3.0","status":"error","circuitOpen":true,"reason":"NO_API_KEY","count":null}
URL=https://6c0a5a7f.rubikvault-site.pages.dev/api/elliott-scanner
HTTP=200
CONTENT_TYPE=content-type: application/json; charset=utf-8
HTML_SIGNATURE=no
JQ_PARSE=yes
META={"schema_version":null,"status":"ok","circuitOpen":null,"reason":null,"count":517}
URL=https://6c0a5a7f.rubikvault-site.pages.dev/data/marketphase/index.json
HTTP=200
CONTENT_TYPE=content-type: application/json; charset=utf-8
HTML_SIGNATURE=no
JQ_PARSE=yes
META={"schema_version":null,"status":"error","circuitOpen":true,"reason":"MARKETPHASE_INDEX_MISSING","count":null}

=== BASE: https://rubikvault.com ===
URL=https://rubikvault.com/api/mission-control/summary?debug=1
HTTP=200
CONTENT_TYPE=content-type: application/json; charset=utf-8
HTML_SIGNATURE=no
JQ_PARSE=yes
META={"schema_version":"3.0","status":"error","circuitOpen":null,"reason":"MARKETPHASE_INDEX_MISSING","count":null}
URL=https://rubikvault.com/api/elliott-scanner
HTTP=200
CONTENT_TYPE=content-type: application/json; charset=utf-8
HTML_SIGNATURE=no
JQ_PARSE=yes
META={"schema_version":null,"status":"fresh","circuitOpen":null,"reason":null,"count":517}
URL=https://rubikvault.com/data/marketphase/index.json
HTTP=404
CONTENT_TYPE=content-type: text/html; charset=utf-8
HTML_SIGNATURE=yes
JQ_PARSE=no
BODY_SNIPPET=<!doctype html><meta charset="utf-8"><title>404</title> <h1>404</h1><p>Not found.</p> <script>(function(){function c(){var b=a.contentDocument||a.contentWindow.document;if(b){var d=b.createElement('script');d.innerHTML="window.__CF$cv$param

```

## Contract checks (policy)
- JSON OR DIE: non-JSON or HTML challenge is classified as contract failure / WAF block.
- mission-control expects meta.status + meta.circuitOpen semantics.
- elliott expects meta.count (+ universe mode/source contract if provided).
