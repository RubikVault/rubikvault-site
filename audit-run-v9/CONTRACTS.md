# CONTRACTS

Generated: 2026-02-11T18:36:43Z

## Remote contract probes

| Env | Endpoint | HTTP | JSON | html_like | meta.status | meta.circuitOpen | meta.count | meta.universeMode | Evidence cmd |
|---|---|---:|---|---|---|---|---:|---|---|
| preview | `mission-control` | 200 | yes | no | error | True | None | None | `curl -sS -H 'cache-control: no-cache' -w '
__META__%{http_code}|%{content_type}|%{time_total}
' 'https://6c0a5a7f.rubikvault-site.pages.dev/api/mission-control/summary?debug=1'` |
| preview | `elliott-scanner` | 200 | yes | no | ok | False | 517 | None | `curl -sS -H 'cache-control: no-cache' -w '
__META__%{http_code}|%{content_type}|%{time_total}
' 'https://6c0a5a7f.rubikvault-site.pages.dev/api/elliott-scanner'` |
| preview | `marketphase-index` | 200 | yes | no | error | True | None | None | `curl -sS -H 'cache-control: no-cache' -w '
__META__%{http_code}|%{content_type}|%{time_total}
' 'https://6c0a5a7f.rubikvault-site.pages.dev/data/marketphase/index.json'` |
| prod | `mission-control` | 200 | yes | no | error | None | None | None | `curl -sS -H 'cache-control: no-cache' -w '
__META__%{http_code}|%{content_type}|%{time_total}
' 'https://rubikvault.com/api/mission-control/summary?debug=1'` |
| prod | `elliott-scanner` | 200 | yes | no | fresh | None | 517 | None | `curl -sS -H 'cache-control: no-cache' -w '
__META__%{http_code}|%{content_type}|%{time_total}
' 'https://rubikvault.com/api/elliott-scanner'` |
| prod | `marketphase-index` | 404 | no | yes | None | None | None | None | `curl -sS -H 'cache-control: no-cache' -w '
__META__%{http_code}|%{content_type}|%{time_total}
' 'https://rubikvault.com/data/marketphase/index.json'` |

## Remote failures / alerts

- WAF_CHALLENGE_OR_FORBIDDEN: `https://rubikvault.com/data/marketphase/index.json` -> http=404 json=False ctype=text/html; charset=utf-8 body_head=`<!doctype html><meta charset="utf-8"><title>404</title> <h1>404</h1><p>Not found.</p> <script>(function(){function c(){var b=a.contentDocument||a.contentWindow.document;if(b){var d=b.createElement('sc`

## Local artifact checks

| Path | exists | valid_json | count | error |
|---|---|---|---:|---|
| `public/data/universe/nasdaq100.json` | True | True | 100 |  |
| `public/data/registry/modules.json` | False | False | None |  |
| `public/data/seed-manifest.json` | False | False | None |  |