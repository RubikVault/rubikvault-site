# RubikVault Diagnostics

Dieses Debug-System sammelt Client‑seitige Informationen (Assets, API‑Checks, Dynamic Imports, Errors, Cache, Performance) und stellt sie in einem zentralen Panel bereit.

## Schnellstart (Browser)

1. Öffne die Seite und filtere die Konsole auf `RV:` (z.B. `[RV:rv-price-snapshot]`).
2. Öffne die DevTools → Network und filtere nach `/API/`.
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

## Server Logs (Cloudflare)

- Dashboard → Pages → Functions → Real‑time logs.
- Optional: Wrangler `wrangler tail <project>` für Live‑Logs.
- Erwartetes Log‑Format: `{"feature":"top-movers","traceId":"abcd1234","kv":"hit|miss|bypass","upstreamStatus":200,"durationMs":123}`

## Erwartete Status‑Beispiele

- OK: `ok=true`, `isStale=false`, Daten werden normal gerendert.
- FAIL: `ok=false`, Fehler‑UI erscheint mit `error.code` und `error.message`.
- PARTIAL: `ok=true` + `isStale=true` (Fallback aus KV/Shadow) oder Teilfehler bei Feeds.

## Bindings & ENV

- `RV_KV` (required): KV Binding für Cache.
- `EARNINGS_API_KEY` (required): Provider‑Key für Earnings‑Calendar.
- `EARNINGS_API_BASE` (optional): Base URL (Default: FinancialModelingPrep).
- `CROSS_ORIGIN` (optional): `true` aktiviert CORS via `functions/API/_middleware.js`.

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
<!-- agent test -->
<!-- agent test -->
<!-- agent test -->
