# Web Features v4 (Forecast / Scientific / Elliott) – Non-Breaking Runbook

Stand: 2026-03-27

## Ziel

Additive Shadow-Einführung von v4 für drei Analyze-Features:

1. Forecast
2. Scientific
3. Elliott

Ohne Regression des produktiven v1/v2-Verhaltens.

## Architektur-Regeln (hart)

1. Detail-Owner bleibt `/stock?ticker=...` (`/Users/michaelpuchowezki/Dev/rubikvault-site/public/stock.html`).
2. SPA-Frontpage (`/Users/michaelpuchowezki/Dev/rubikvault-site/public/index.html`) rendert keine zweite Detailansicht, sondern navigiert nur.
3. v4 wird nur additiv geladen:
   - `/api/stock-insights-v4` (neu)
   - optional `evaluation_v4` in `/api/stock?eval_v4=1`
4. v1/v2 bleiben Hard-Fallback.

## Feature Flag (default OFF)

v4 wird nur aktiv, wenn einer der Schalter gesetzt ist:

- Query: `rv_features_v4=1`
- Query: `features_v4=1`
- Query: `featuresV4=1`
- Window flag: `window.__RV_FLAGS.featuresV4`
- Window flag: `window.__RV_FEATURES_V4`
- Local storage: `rv.features.v4=true`

Ohne Flag bleibt Verhalten unverändert (v1/v2).

## v4 Contract

`/api/stock-insights-v4` liefert den additiven Vertrag:

- `v4_contract.scientific`
- `v4_contract.forecast`
- `v4_contract.elliott`
- `v4_contract.raw_validation`
- `v4_contract.outcome_labels`
- `v4_contract.scientific_eligibility`
- `v4_contract.fallback_state`
- `v4_contract.timeframe_confluence`
- `v4_contract.decision_trace`

Jeder Contract-Row enthält:

- `value`
- `as_of`
- `source`
- `status`
- `reason`

## Artefakte

Builder:

- `/Users/michaelpuchowezki/Dev/rubikvault-site/scripts/build-features-v4.mjs`

Outputs:

- SSOT: `/Users/michaelpuchowezki/Dev/rubikvault-site/mirrors/features-v4/stock-insights/index.json`
- Publish: `/Users/michaelpuchowezki/Dev/rubikvault-site/public/data/features-v4/stock-insights/index.json`

## Checks

Parität v1/v2/v4:

```bash
cd /Users/michaelpuchowezki/Dev/rubikvault-site
npm run verify:features:v4:parity -- --base-url http://127.0.0.1:8788 --max-tickers 120
```

Lokaler 5-Ticker-Abgleich gegen Main:

```bash
cd /Users/michaelpuchowezki/Dev/rubikvault-site
npm run verify:features:v4:local-main-5ticker -- --local-base http://127.0.0.1:8788 --main-base https://rubikvault.com
```

Reports:

- `/Users/michaelpuchowezki/Dev/rubikvault-site/mirrors/features-v4/reports/stock-insights-v4-parity-report.json`
- `/Users/michaelpuchowezki/Dev/rubikvault-site/public/data/features-v4/reports/stock-insights-v4-parity-report.json`
- `/Users/michaelpuchowezki/Dev/rubikvault-site/mirrors/features-v4/reports/stock-v4-local-vs-main-5ticker.json`
- `/Users/michaelpuchowezki/Dev/rubikvault-site/public/data/features-v4/reports/stock-v4-local-vs-main-5ticker.json`

Zusatz-Gate fuer Nicht-Verschlechterung:

```bash
cd /Users/michaelpuchowezki/Dev/rubikvault-site
node scripts/validate/stock-analyzer-non-regression-gate.mjs --local-base http://127.0.0.1:8788 --benchmark-base https://56a89a60.rubikvault-site.pages.dev --ticker AAPL
```

Weitere Reports:

- `/Users/michaelpuchowezki/Dev/rubikvault-site/mirrors/features-v4/reports/stock-analyzer-non-regression-gate.json`
- `/Users/michaelpuchowezki/Dev/rubikvault-site/public/data/features-v4/reports/stock-analyzer-non-regression-gate.json`

Optionale Browser-Traces bei verfuegbarem lokalen HTTP:

- `/Users/michaelpuchowezki/Dev/rubikvault-site/mirrors/features-v4/reports/ui-path.local.trace.json`
- `/Users/michaelpuchowezki/Dev/rubikvault-site/mirrors/features-v4/reports/ui-path.benchmark.trace.json`

## Latest Local Verification (2026-03-08)

Executed with local Pages server + v4 scripts:

1. `npm run verify:features:v4:parity -- --base-url http://127.0.0.1:8788 --max-tickers 60 --concurrency 6 --retries 1`
2. `npm run verify:features:v4:local-main-5ticker -- --local-base http://127.0.0.1:8788 --main-base https://rubikvault.com`
3. `npm run test:stock-insights-v4`
4. `npm run test:stock-ui-extras`

Result snapshot:

- parity summary: `endpoints_ok=60/60`, `v4_contract_ok=60/60`, `activation_ready=true`
- local-main 5-ticker summary: `baseline_presence_parity_ok=5/5`, `v4_local_contract_ok=5/5`
- sampled tickers: `A`, `AAPL`, `ABBV` (S&P 500) and `AAMI`, `AAOI` (Russell 2000)

Current status: v4 is locally shadow-ready under flag, production default remains OFF.

## Local Safety Contract – Web Features v4

1. Production default bleibt `v4_disabled`.
2. v4 läuft read-only parallel.
3. Bei ungültigem v4-Contract sofortiger Fallback auf v2/v1.
4. Keine QuantLab-Artefakte im Web-Rollout anfassen.
5. `Scientific` und `Elliott` behalten einen statischen Rueckfall-Layer.
6. Lernende Challenger duerfen nur per Shadow-first + Nicht-Verschlechterungs-Gate promotet werden.
7. Commit/Push erst nach bestandenem lokalen Paritäts-/Abgleich-Report, Nicht-Verschlechterungs-Gate und manueller Verifikation.
