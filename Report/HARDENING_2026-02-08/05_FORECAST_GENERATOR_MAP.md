# 05_FORECAST_GENERATOR_MAP

## Discovery probes
- `rg -n "forecast" scripts src tools mirrors public/data -S`
  - Note: `tools` path does not exist in repo (`rg: tools: No such file or directory`).
- `rg -n "public/data/forecast|forecast/latest\\.json" -S`

## Primary writer chain (evidence)
1. Daily orchestrator
- File: `scripts/forecast/run_daily.mjs`
- Role: full pipeline orchestration and publish to UI-facing forecast artifacts.
- Evidence:
  - quality gate + circuit-open fallback: `scripts/forecast/run_daily.mjs:225-243`
  - latest publish: `scripts/forecast/run_daily.mjs:359-367`
  - last_good update: `scripts/forecast/run_daily.mjs:369-374`

2. Artifact writer + atomic publish
- File: `scripts/forecast/report_generator.mjs`
- Role: canonical JSON docs and atomic write path.
- Evidence:
  - `atomicWriteJson`: `scripts/forecast/report_generator.mjs:30-35`
  - latest validation + write: `scripts/forecast/report_generator.mjs:340-349`
  - fallback from last_good/bootstrap: `scripts/forecast/report_generator.mjs:369-402`
  - last_good pointer + envelope persistence: `scripts/forecast/report_generator.mjs:409-431`

3. Circuit helper
- File: `scripts/forecast/circuit_breaker.mjs`
- Role: explicit circuit-open/close actions and fallback publish.
- Evidence:
  - open circuit + fallback latest: `scripts/forecast/circuit_breaker.mjs:120-136`

## Writer/Reader matrix (current)
- Writer: `scripts/forecast/report_generator.mjs` -> `public/data/forecast/latest.json`
  - Reader: `public/forecast.html` (`API_BASE='/data/forecast'`)
- Writer: `scripts/forecast/report_generator.mjs` -> `public/data/forecast/system/status.json`
  - Reader: `public/forecast.html`
- Writer: `scripts/forecast/report_generator.mjs` -> `public/data/forecast/last_good.json` + `public/data/forecast/system/last_good.json`
  - Reader: fallback path in `scripts/forecast/report_generator.mjs:369-402` and run pipeline (`scripts/forecast/run_daily.mjs:228-240`)

## Seed/bootstrap artifacts added for never-empty deploy
- `public/data/snapshots/market-prices/latest.json` (bootstrap presence artifact, schema/timestamp present)
- `public/data/forecast/last_good.json` (stable fallback envelope)
- `public/data/forecast/system/last_good.json` (pointer doc)
- `public/data/forecast/system/status.json` now points `last_good` to `public/data/forecast/last_good.json`
