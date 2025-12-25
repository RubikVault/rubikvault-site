# RubikVault Diagnostics

Dieses Debug-System sammelt Client‑seitige Informationen (Assets, API‑Checks, Dynamic Imports, Errors, Cache, Performance) und stellt sie in einem zentralen Panel bereit.

## Schnellstart (Browser)

1. Öffne die Seite und filtere die Konsole auf `RV:` (z.B. `[RV:rv-price-snapshot]`).
2. Öffne die DevTools → Network und filtere nach `/api/`.
3. Prüfe, dass jede Antwort das Standard‑Schema enthält (`ok`, `feature`, `ts`, `traceId`, `schemaVersion`).

## Aktivierung

1. Setze `DEBUG_ENABLED: true` in `rv-config.js`.
2. Öffne die Seite mit `?debug=1` oder setze `localStorage.debug = "true"`.
3. Optional: Setze `RV_CONFIG.debugAuthToken` und `localStorage.debugAuth` auf denselben Wert, um Debug zu schützen.

## Debug-Panel

Das Panel erscheint unten rechts und enthält Tabs:

- Overview
- Build
- Assets
- Dynamic Imports
- APIs
- Network
- Errors
- Cache / Cloudflare
- Performance

Über die Buttons kannst du Diagnosen kopieren, als JSON herunterladen oder einen Debug‑Link mit Cache‑Buster erzeugen.

## Block Debug-Panel

- Jeder Block rendert ein eigenes Debug‑Panel (Toggle „Show debug“).
- Log‑Zeilen sind prefix‑basiert (`[RV:<featureId>]`) und enthalten Zeitstempel.
- Trace IDs werden pro Block‑Load/Refresh gesetzt und erscheinen im Block‑Header.

## Build-Info

Das Panel lädt `/build-info.json`. Wenn die Datei nicht existiert, nutzt es `RV_CONFIG.buildInfo`.

## KV Setup (Pflicht)

1. Lege zwei KV Namespaces an:
   - `rv-cache-kv` (prod)
   - `rv-cache-kv-preview` (preview)
2. Pages → Settings → Functions → KV bindings:
   - Variable: `RV_KV`
   - Production binding → `rv-cache-kv`
   - Preview binding → `rv-cache-kv-preview`
3. RV_KV muss in Preview + Production gebunden sein (keine Fallbacks).
4. Deploy erneut, dann `/api/health` prüfen.
5. Preflight-Signatur (Logs): `kv:"none"`, `upstreamStatus:null`, `durationMs:0` ⇒ KV Binding fehlt, kein Upstream-Call.

## First 5 minutes checklist

1. Preview-URL öffnen, dann `/api/health` prüfen → `bindings.RV_KV` und `envHint`.
2. DevTools → Network → filter `/api/` → Schema-Felder (`ok`, `feature`, `ts`, `traceId`, `schemaVersion`) prüfen.
3. Console filter `RV:` → TraceIDs, `cache.layer`, `cache.ttl`, `upstream.status` sehen.
4. Falls BINDING_MISSING: Dashboard → Pages → Settings → Functions → KV bindings → RV_KV (Preview + Production).
5. Blocks 01–05 sollten OK oder PARTIAL sein (je nach Upstream).

## Server Logs (Cloudflare)

- Dashboard → Pages → Functions → Real‑time logs.
- Wrangler:
  - `npx wrangler pages deployment list --project-name rubikvault-site`
  - `npx wrangler pages deployment tail --project-name rubikvault-site DEPLOYMENT_ID`
- Erwartetes Log‑Format: `{"feature":"top-movers","traceId":"abcd1234","kv":"kv|none","upstreamStatus":200,"durationMs":123}`

## Erwartete Status‑Beispiele

- OK: `ok=true`, `isStale=false`, Daten werden normal gerendert.
- FAIL: `ok=false`, Fehler‑UI erscheint mit `error.code` und `error.message`.
- PARTIAL: `ok=true` + `isStale=true` (Fallback aus KV/Shadow) oder Teilfehler bei Feeds.
- RATE_LIMITED: `error.code=RATE_LIMITED` + gelb markiert + Backoff/Countdown in UI.

## Bindings & ENV

- `RV_KV` (required): KV Binding für Cache.
- `EARNINGS_API_KEY` (required): Provider‑Key für Earnings‑Calendar.
- `EARNINGS_API_BASE` (optional): Base URL (Default: FinancialModelingPrep).
- `FRED_API_KEY` (required): API‑Key für Macro & Rates (FRED).
- `FMP_API_KEY` (optional): API‑Key für Quotes (FinancialModelingPrep). Falls nicht gesetzt, wird `EARNINGS_API_KEY` verwendet.
- `CROSS_ORIGIN` (optional): `true` aktiviert CORS via `functions/api/_middleware.js`.

## CSP / External Domains

Wenn CSP aktiviert wird, mindestens folgende Domains erlauben:

- `api.coingecko.com`
- `api.alternative.me`
- `search.cnbc.com`
- `finance.yahoo.com`
- `stooq.com`
- `financialmodelingprep.com` (falls genutzt)
- `s3.tradingview.com`

## Erweiterung

- Neue APIs/Blocks: `FEATURES` in `rv-config.js` erweitern.
- Neue Diagnostics: `debug/diagnostics.js` ergänzen.
## Testfälle (Erwartungen)

1. KV fehlt:
   - `/api/health` → `ok=false`, `error.code=BINDING_MISSING`.
   - Blöcke 01–05 zeigen FAIL mit klarer Fix‑Hint.
2. KV vorhanden:
   - Blöcke 01–05 OK oder PARTIAL je nach Upstream.
3. Quotes Rate Limit:
   - `/api/quotes` liefert `RATE_LIMITED`, UI zeigt Backoff + Countdown.
4. Shadow Cache:
   - API failt, aber lokale Quotes jünger als 15 min → PARTIAL + stale.
