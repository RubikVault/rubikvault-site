# Web Features v2 (Forecast / Scientific / Elliott) – Non-Breaking Runbook

Stand: 2026-03-07 (aktualisiert)

## Ziel

Additive Einführung von v2 für genau drei Analyze-Features:

1. Forecast
2. Scientific
3. Elliott

Ohne Bruch des aktuellen Main-Verhaltens.

## Architektur (Shadow + Flag)

1. Bestehender Endpunkt bleibt unverändert:
   - `/api/stock-insights` (v1 canonical)
2. Neuer additiver Endpunkt:
   - `/api/stock-insights-v2`
3. Frontend nutzt weiterhin v1, solange v2 nicht explizit aktiviert ist.
4. Bei v2-Aktivierung:
   - erst v2 laden
   - v2-Contract validieren
   - bei ungültigem Contract sofort auf v1 zurückfallen

## Feature Flag (default OFF)

v2 wird nur aktiv, wenn einer der folgenden Schalter gesetzt ist:

- Query: `rv_features_v2=1`
- Query: `features_v2=1`
- Query: `featuresV2=1`
- Window flag: `window.__RV_FLAGS.featuresV2`
- Window flag: `window.__RV_FEATURES_V2`
- Local storage: `rv.features.v2=true`

Wenn kein Flag gesetzt ist: v1-only Verhalten.

## v2 Contract

Pro Feature muss der Vertrag vorhanden sein:

- `value`
- `as_of`
- `source`
- `status`
- `reason`

Der Endpoint liefert diese Struktur unter:

- `v2_contract.scientific`
- `v2_contract.forecast`
- `v2_contract.elliott`

Zusätzlich bleibt die v1-kompatible Struktur erhalten:

- `scientific`
- `forecast`
- `forecast_meta`
- `elliott`

## Artefakte (additiv)

Builder:

- `/Users/michaelpuchowezki/Dev/rubikvault-site/scripts/build-features-v2.mjs`

Outputs:

- SSOT: `/Users/michaelpuchowezki/Dev/rubikvault-site/mirrors/features-v2/stock-insights/index.json`
- Publish: `/Users/michaelpuchowezki/Dev/rubikvault-site/public/data/features-v2/stock-insights/index.json`

Script-Aufruf:

```bash
cd /Users/michaelpuchowezki/Dev/rubikvault-site
npm run build:features:v2
```

## Local Safety Contract – Web Features v2

1. Production default bleibt `v2_disabled`.
2. v2 läuft ausschließlich parallel und read-only.
3. Bestehende Endpunkte und Renderer bleiben canonical bis Parität grün ist.
4. Bei fehlendem/invalidem v2-Contract: sofortiger Fallback auf v1.
5. Keine Änderung an QuantLab-Artefakten für Web-Rollout.
6. Freischaltung erst nach bestandener Paritäts-/Non-Regression-Matrix.

## Rollout-Reihenfolge

1. v2-Artefakte lokal bauen.
2. `/api/stock-insights-v2` lokal smoke-testen.
3. Analyze-Seite mit `?rv_features_v2=1` prüfen.
4. Parität gegen v1 report-first validieren.
5. Erst danach optionales Aktivieren auf Preview.

## Paritäts-Checker (report-first)

Script:

- `/Users/michaelpuchowezki/Dev/rubikvault-site/scripts/validate/stock-insights-v2-parity.mjs`

NPM:

```bash
cd /Users/michaelpuchowezki/Dev/rubikvault-site
npm run verify:features:v2:parity -- --base-url http://127.0.0.1:8788 --max-tickers 120
```

Report outputs:

- SSOT: `/Users/michaelpuchowezki/Dev/rubikvault-site/mirrors/features-v2/reports/stock-insights-v2-parity-report.json`
- Publish: `/Users/michaelpuchowezki/Dev/rubikvault-site/public/data/features-v2/reports/stock-insights-v2-parity-report.json`

Activation darf erst erwogen werden, wenn `summary.activation_ready=true` und keine kritischen Issues verbleiben.

## Aktueller Verifikationsstand (2026-03-07)

1. v2-Artefakte wurden neu gebaut:
   - `tickers=55992`
   - `scientific_ok=2442`
   - `forecast_ok=2425`
   - `elliott_ok=52958`
2. Paritäts-Checker wurde gehärtet:
   - realistischeres Default-Timeout (`30s`)
   - Warmup-Phase gegen Cold-Start-/Cache-False-Negatives
   - Retry bleibt aktiv
3. Letzter Lauf (local, report-first):
   - `total=120`
   - `endpoints_ok=120`
   - `v2_contract_ok=120`
   - `no_issue=120`
   - `activation_ready=true`
