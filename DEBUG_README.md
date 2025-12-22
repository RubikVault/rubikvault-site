# RubikVault Diagnostics

Dieses Debug-System sammelt Client‑seitige Informationen (Assets, API‑Checks, Dynamic Imports, Errors, Cache, Performance) und stellt sie in einem zentralen Panel bereit.

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

## Build-Info

Das Panel lädt `/build-info.json`. Wenn die Datei nicht existiert, nutzt es `RV_CONFIG.buildInfo`.

## Erweiterung

- Neue APIs: In `rv-loader.js` die Liste `apiPaths` erweitern.
- Neue Feature‑Module: In `rv-loader.js` den `registry` ergänzen.
- Zusätzliche Checks: in `debug/diagnostics.js` hinzufügen.
