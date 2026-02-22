# RUBIKVAULT — Audit Remediation Runbook v2.0 (Final, Repo-Safe Text Version)

Status: Final (Runbook-Dokument)  
Repo: `rubikvault-site`  
Modus: Text-only Anpassung (keine produktiven Codepfade geändert)  
Prinzip: Auditability > Coverage > Convenience

## 0. Zweck und Sicherheitsregel
Dieses Dokument ist die finale v2.0-Planfassung fuer die spaetere Umsetzung.  
Es ist bewusst repo-sicher formuliert:

- `mirrors/` = SSOT/State/Ledgers/Manifeste
- `public/` = abgeleitete/publishte Artefakte
- Migrationen immer: `report-first -> revalidate -> enforce`
- Keine Big-Bang-Umstellung bei Resolvern oder Gates

Wichtig:
- Dieses Runbook ist implementation-ready als Plan.
- Die eigentliche Code-Umsetzung startet erst auf sauberer Baseline (kein aktiver Backfill, Worktree eingefroren).

## 1. Executive Summary
RubikVault hat derzeit mehrere technische Wahrheiten gleichzeitig:

- unterschiedliche OHLCV-Normalisierung je Consumer
- teilweise ticker-first, teilweise canonical-first Aufloesung
- Completeness-Gates mit semantischer Luecke
- Forecast-Aussagen ohne expliziten Walk-Forward-Nachweis
- QuantLab noch in Scaffold-/Q1-Naehe

v2.0 schafft einen auditierbaren Zustand:

1. zentrale Clean-Bars Contract-Engine (mit duennen Adaptern)
2. zwei getrennte Coverage-Hard-Gates (History vs Pointer/Pack)
3. globales Dropout-Ledger mit Reason Enum
4. additive canonical Resolver-Migration (ohne Legacy-Break)
5. Forecast Fold-Artefakte + Promotion Decision Trail
6. Revalidation Snapshot + globaler Run-Status-Standard
7. Clean-Bars Rollback/Versionierung

## 2. Zielbild (System + Features)

### 2.1 Systemziele
1. Determinismus (inhaltlich deterministisch; nicht zwingend byte-identisch wegen Timestamps/Run-IDs)
2. Auditierbarkeit jeder "gruenen" Aussage durch Artefakte
3. Ehrliche Gates (kein Fake-Completeness)
4. SSOT-Disziplin (`mirrors/` Wahrheit, `public/` Darstellung)
5. Breakage-Minimierung durch additive Migration und Rollback
6. Operative Nutzbarkeit durch Reason Codes + Counts + Next Action

### 2.2 Featureziele
- Universe/v7: reproduzierbare SSOT-/Coverage-/Gate-Entscheidungen
- API/Resolver: canonical-first intern, kompatible Legacy-Pfade
- Scientific: keine unbemerkten synthetischen Inputs in produktiven Snapshots
- Forecast: Walk-Forward/Folds + Promotion-Entscheidungen belegbar
- QuantLab: erst echte Daten + Leakage Guard, dann Bias-Kontrollen

## 3. Problem-Landkarte (P0-P7)

### P0 — Fragmentierte OHLCV-Normalisierung
Mehrere normalizeBars-Varianten erzeugen unterschiedliche Datenrealitaeten je Feature/API.

### P1 — Canonical-first nur teilweise umgesetzt
v7 Explorer/Suche sind canonical-staerker; allgemeiner Resolver ist ticker/name-first.

### P2 — "Historie vollstaendig" Gate semantisch unvollstaendig
Es gibt zwei verschiedene Fehlerklassen, die getrennt gemessen und getrennt gegatet werden muessen:

- Gate A: Pointer/Pack Integrity (`resolved_missing_in_pack == 0`)
- Gate B: History Completeness (`truly_missing == 0`)

Beide sind notwendig fuer echtes System-Grün.

### P3 — Kein zentraler Dropout Ledger
Reason Codes existieren verteilt, aber nicht als globaler, append-only Nachweis.

### P4 — Synthetic / Code-vs-Snapshot Drift
Nicht der Code allein entscheidet, sondern das konsumierte Snapshot-Artefakt.
P4 gilt erst als erledigt, wenn der produktive Snapshot revalidiert sauber ist.

### P5 — Walk-Forward / Leakage-Proof nicht nachweisbar
Metriken ohne Fold-Artefakte sind audit-seitig nicht ausreichend.

### P6 — Promotion Trail nicht auditierbar
Promotion-Mechanik existiert, aber die Decision-Historie ist nicht lueckenlos als Ledger nachweisbar.

### P7 — QuantLab: Leakage Stub, Bias-Kontrollen zu frueh
Survivorship-/Sampling-Kontrollen erst sinnvoll nach echter Clean-Bars-Integration.

## 4. Architektur-Entscheidungen v2.0

### 4.1 SSOT vs Publish (Pflicht)
- Roh-Ledger, State, Manifeste: `mirrors/...`
- UI/Reports/Publish-Summary: `public/data/...`

Keine Roh-Ledger in `public/`.

### 4.2 Clean-Bars Contract-Engine (P0 Fix)
Nicht "ein identischer Normalizer fuer alle", sondern:

- eine zentrale Contract-Engine
- zentrale Validation
- zentrale Reason-Map
- Consumer nur als duenne Adapter

Pfadwahl (neutral, ohne Worker-Coupling):

- `lib/ohlcv/clean-bars.mjs`
- `lib/ohlcv/ohlcv_policy.json`
- `lib/ohlcv/reasons.json`

Adapter-Ziele (spaetere Refactors):
- API payload -> clean-bars adapter
- Forecast pack row -> clean-bars adapter
- Marketphase/Elliott bars -> clean-bars adapter

### 4.3 Dual Coverage Gates (P2 Fix, Kernpunkt)
Zwei getrennte Gates, getrennt reporten, getrennt enforce:

- Gate A (Pointer/Pack Integrity): `resolved_missing_in_pack == 0`
- Gate B (History Completeness): `truly_missing == 0`

Enforce-Reihenfolge (v2.0):
1. Erst Gate A enforce (Pointer/Pack Integritaet)
2. Dann Gate B enforce (History Completeness)

Grund:
- Daten koennen "irgendwo" existieren und trotzdem von Features nicht gefunden werden.

### 4.4 Dropout Ledger + Summary (P3 Fix)
SSOT Ledger (append-only):

- `mirrors/universe-v7/ledgers/dropout_ledger.ndjson`

Publish Summary:

- `public/data/universe/v7/reports/dropout_summary.json`

Pflicht: Write-Disziplin (kein Race/Corruption)
- Single-Writer oder Locking/Spool+Merge
- keine unkoordinierten Mehrprozess-Appends

Global Reason Enum (v2.0, zentral):
- OHLCV: `INSUFFICIENT_BARS`, `GAP_TOO_LARGE`, `NAN_IN_SERIES`, `DUPLICATE_DATES`, `NON_MONOTONIC_DATES`, `BAD_OHLCV_SHAPE`
- Resolver: `AMBIGUOUS_SYMBOL`, `SYMBOL_NOT_FOUND`, `ALIAS_COLLISION`
- Coverage: `TRULY_MISSING`, `POINTER_INTEGRITY_FAILED`
- Synthetic: `SYNTHETIC_PRESENT_IN_SNAPSHOT`, `SYNTHETIC_BLOCKED`
- Forecast: `MISSING_FOLDS_MANIFEST`, `LEAKAGE_DETECTED`, `MISSING_OUTCOMES`
- Ops: `REVALIDATION_SNAPSHOT_MISSING`, `ROLLBACK_REQUIRED`, `RUN_INCOMPLETE`

### 4.5 Canonical Resolver Migration (P1 Fix, additiv)
Additive Migration statt globaler Umschaltung:

1. Neue Resolver-API einfuehren (z. B. `resolveCanonicalV7` / `resolveToCanonical`)
2. Zuerst v7-kritische Pfade migrieren
3. Legacy-Pfade kompatibel lassen
4. Ambiguity niemals still aufloesen, sondern deterministic candidates liefern

Pflicht:
- Compatibility/Redirect Layer fuer bestehende ticker-Deep-Links
- `canonical_id` als interner Primary Key, Display-Symbol nur sekundär

### 4.6 P4 Synthetic — Status nur ueber konsumierte Snapshots
v2.0-Regel:
P4 ist nicht "erledigt", bis die konsumierten Artefakte sauber sind.

Definition "P4 erledigt":
1. `public/data/snapshots/stock-analysis.json` hat `synthetic_count == 0` im Prod-Build
   oder ist explizit DEMO markiert
2. Revalidation Snapshot dokumentiert den Zustand
3. Downstream (Forecast/Quant) blockiert synthetische Inputs (falls DEMO erlaubt)

Zusatz (wichtig):
- P4-Pruefung muss Snapshot-Freshness / Build-Ref mitpruefen, um stale Snapshots nicht falsch zu bewerten.

### 4.7 Walk-Forward Proof (P5 Fix)
Folds werden im Runner/Trainer erzeugt, nicht im Evaluator.

Artefakte:
- `mirrors/forecast/manifests/folds_manifest.json`
- `mirrors/forecast/manifests/run_manifest.json`

Regel:
- Evaluator liest Folds-Manifeste nur ein
- fehlendes Manifest = report-only zuerst, spaeter hard fail (`MISSING_FOLDS_MANIFEST`)

### 4.8 Promotion Audit Trail (P6 Fix)
Semantische Trennung + operative Querybarkeit:

- `promotion_decisions` (immer schreiben, auch `NO_PROMOTION`)
- `promotion_events` (nur echte Promotion-Events)
- `promotion_index.json` fuer Zeitraum-Queries

Artefakte:
- `mirrors/forecast/ledger/promotions/promotion_decisions.ndjson`
- `mirrors/forecast/ledger/promotions/promotion_events.ndjson`
- `mirrors/forecast/ledger/promotions/promotion_index.json`
- `public/data/forecast/reports/promotion_summary.json`

Wichtig:
- "daily" ist nicht hart vorgeschrieben.
- Pflicht ist: **bei jedem Evaluationslauf** (weekly/daily/manuell) wird mindestens ein Decision-Record geschrieben.

### 4.9 QuantLab Split (P7 Fix)
Q1 zuerst:
- echte Clean-Bars Integration
- realer Leakage Guard
- auditierbarer Quant run report

Q2 danach:
- Survivorship Bias Kontrollen
- stratified sampling
- weitere Bias-Gates

## 5. v2.0 Add-ons (neu, Pflicht)

### 5.1 Revalidation Snapshot (Pflicht vor Phase-Wechsel / Enforce)
Artefakt:
- `mirrors/universe-v7/revalidation/revalidation_snapshot.json`

Minimalinhalte:
- `ts`, `run_id`, `git_sha`, `pipeline_version`
- Coverage: `resolved_missing_in_pack_count`, `truly_missing_count`
- Synthetic: `synthetic_count_in_stock_analysis_snapshot`, `snapshot_freshness`
- Dropouts: `dropouts_by_feature`, `top_reasons_by_feature`
- Resolver: `ambiguous_symbol_count`, `symbol_not_found_count`
- Forecast: `folds_manifest_present`, `outcomes_present_count`
- Quant: `leakage_detections_count`, `clean_bars_consumption_ok`

Hard rule:
- Kein Phase-Wechsel / kein Enforce-Switch ohne Snapshot-Artefakt.

### 5.2 Global Observability / Silent-Failure Standard (additiv)
Ziel:
- Kein Ersatz bestehender subsystem-spezifischer Status-Artefakte im ersten Schritt
- Sondern ein aggregierender, standardisierter Run-Status fuer Kernruns

Artefakte:
- `mirrors/system/run_status/latest.json`
- `mirrors/system/run_status/history/YYYY-MM-DD.json`
- optional `public/data/system/status/system_status.json`

Minimal-Schema:
- `run_id`, `ts`, `git_sha`
- `stage_results[]` mit `stage_name`, `ok`, `reason_codes[]`, `counts`, `artifacts_written[]`
- `gates[]` mit `gate_name`, `mode`, `ok`, `value`, `threshold`

### 5.3 Clean-Bars Rollback / Versionierung
Da Clean Bars zentrale Wahrheit wird, braucht es Build-Manifeste + Rollback-Zeiger.

Artefakte:
- `mirrors/ohlcv/manifests/clean_bars_build_manifest.json`
- `mirrors/ohlcv/manifests/clean_bars_policy_manifest.json`

Manifest-Minima:
- `policy_version`
- `engine_version` (hash)
- `diff_summary` (z. B. dropped rows / reason shifts)
- `rollback_pointer` (`last_known_good`)

Rollback-Regel:
- Bei starken Gate-/Dropout-Verschiebungen Rollback auf `last_known_good`, Event im System-Ledger dokumentieren.

## 6. Phasenplan v2.0 (repo-sicher)

### Phase 0 — Safety & Visibility (0 Breakage)
Ziel: messen, nichts hart schalten.

Deliverables:
1. Revalidation Snapshot Script + Artefakt
2. Global run_status Standard (additiv) fuer Kernruns
3. Dual Gates report-only:
   - Gate A (`resolved_missing_in_pack`)
   - Gate B (`truly_missing`)
4. P4 Snapshot-Revalidation (synthetic_count + snapshot freshness)

DoD:
- Revalidation Snapshot existiert
- globales run_status latest existiert
- beide Gate-Werte sichtbar (ohne throw)
- synthetic_count sichtbar

### Phase 0.5 — Beobachtungsrun (Pflicht)
Bevor irgendetwas enforced wird:
- mindestens ein kompletter Beobachtungsrun mit neuen Reports/Ledgern
- Baseline-Deltas dokumentieren

### Phase 1 — Backbone (Clean Bars + Dropout Ledger)
Ziel: zentrale Bars-Wahrheit + zentrale Reason-Forensik

Deliverables:
1. `lib/ohlcv/clean-bars.mjs` + policy + reasons
2. Adapter-Refactors (API + Forecast ingest + Marketphase builder)
3. Dropout Ledger in `mirrors/` + Summary in `public/`
4. Clean-Bars Build-/Policy-Manifeste + rollback pointer

DoD:
- mindestens 1 End-to-End Pfad nutzt clean-bars engine
- Dropout Ledger schreibt reason-coded Eintraege
- Summary baut Top-Reasons

Wichtig (Transitional caveat):
- Solange nicht mindestens API + Forecast + Marketphase auf clean-bars laufen, keine harte cross-feature Vergleichbarkeits-Claims.

### Phase 1.5 — Resolver Migration (v7-first) + Compatibility
Ziel: canonical-first v7 ohne Legacy-Break

Deliverables:
1. additiver canonical Resolver
2. v7 endpoints migriert
3. Compatibility/redirect layer
4. deterministische Ambiguity-Responses

DoD:
- v7-Flows canonical-first
- Legacy funktioniert weiter
- Ambiguous responses enthalten candidates + reason

### Phase 2 — Forecast Proof (Walk-Forward + Promotion Audit)
Ziel: Forecast-Aussagen sind beweisbar

Deliverables:
1. Folds Manifest im Runner/Trainer
2. Evaluator liest Manifest (kein self-invented folds)
3. Promotion Decision Ledger + Event Ledger + Index Helper
4. Forecast run_status referenziert folds/outcomes

DoD:
- `folds_manifest.json` vorhanden und referenziert
- pro Evaluationslauf mindestens ein Decision-Record
- Promotion-Index liefert Zeitfensterabfragen

### Phase 3 — QuantLab Q1 (Real Data + Leakage Guard)
Ziel: QuantLab wird Validator statt nur Scaffold

Deliverables:
1. QuantLab konsumiert Clean Bars
2. Leakage Guard real (kein stub)
3. Quant run report in `mirrors`

DoD:
- baseline runs ohne Leakage-Treffer
- Reports referenzieren policy / manifests

### Phase 4 — Enforce Gates (nur mit Snapshot + Rollback-Pointer)
Voraussetzungen:
- Revalidation Snapshot vorhanden
- Baseline akzeptiert
- last-known-good / rollback pointer vorhanden

Enforce:
1. Gate A (`resolved_missing_in_pack`) hart
2. Gate B (`truly_missing`) hart
3. Missing Folds Manifest hart
4. Synthetic in prod snapshot hart

DoD:
- jede Failure mit reason codes + counts + artefact refs im run_status

## 7. Global Definition of Done (v2.0 Release)
v2.0 ist DONE, wenn:

1. Clean-Bars Contract-Engine existiert und wird produktiv genutzt
2. Dual Gates existieren und sind `report|enforce` schaltbar
3. Dropout Ledger (`mirrors`) + Summary (`public`) existieren
4. Revalidation Snapshot wird vor Enforce erzeugt und referenziert
5. Global run_status (additiv) schreibt Kernrun-Zustaende
6. v7 Resolver-Migration ist canonical-first und Legacy-kompatibel
7. P4 Synthetic ist per Snapshot revalidiert und gegatet
8. Forecast Folds Manifest ist vorhanden und in Evaluation referenziert
9. Promotion Decision/Event Trail ist querybar
10. Clean-Bars Rollback Manifest + pointer existieren

## 8. Repo Change List (v2.0 Zielzustand)

### Neue Artefakte/Module (Pflicht)
- `lib/ohlcv/clean-bars.mjs`
- `lib/ohlcv/ohlcv_policy.json`
- `lib/ohlcv/reasons.json`
- `mirrors/universe-v7/ledgers/dropout_ledger.ndjson`
- `public/data/universe/v7/reports/dropout_summary.json`
- `mirrors/universe-v7/revalidation/revalidation_snapshot.json`
- `mirrors/system/run_status/latest.json` (+ history)
- `mirrors/ohlcv/manifests/clean_bars_build_manifest.json`
- `mirrors/ohlcv/manifests/clean_bars_policy_manifest.json`
- `mirrors/forecast/manifests/folds_manifest.json`
- `mirrors/forecast/manifests/run_manifest.json`
- `mirrors/forecast/ledger/promotions/promotion_decisions.ndjson`
- `mirrors/forecast/ledger/promotions/promotion_events.ndjson`
- `mirrors/forecast/ledger/promotions/promotion_index.json`
- `public/data/forecast/reports/promotion_summary.json`

### Modifikationen (Pflichtbereiche)
- OHLCV-Adapter-Stellen (API + Forecast ingest + Marketphase builder)
- `functions/api/_shared/symbol-resolver.mjs` (additive canonical resolver)
- Forecast Runner/Trainer (folds writing)
- Forecast Evaluator (folds reading only)
- Universe Coverage/Gates (`stocks-history-completion-gate.mjs` dual-gate mode)
- Scientific Analyzer (P4 snapshot revalidation integration)

## 9. Risiken und Guardrails

### 9.1 Clean-Bars Engine aendert Outputs spuerbar
Guardrails:
- report-first Baseline
- Revalidation Snapshot
- Dropout-Deltas sichtbar
- Clean-Bars rollback pointer + build manifest

### 9.2 Resolver Big Bang bricht Legacy
Guardrails:
- additive Migration
- compatibility layer
- parity tests

### 9.3 Gates zu frueh hart
Guardrails:
- report-only Phase
- Beobachtungsrun (Phase 0.5)
- Enforce nur mit Revalidation Snapshot + rollback pointer

### 9.4 P4 nur im Code "gefixt", Snapshot driftet weiter
Guardrails:
- Snapshot als konsumierte Wahrheit
- synthetic_count + freshness im Revalidation Snapshot

### 9.5 Dropout Ledger Korrumpierung durch parallele Writes
Guardrails:
- Single-Writer oder Lock/Spool+Merge
- NDJSON-Integrity check vor Summary-Generierung

## 10. Operatives Regelwerk (ab v2.0)
1. Keine Policy-Aenderung ohne Revalidation Snapshot
2. Kein Enforce ohne last-known-good Rollback Pointer
3. Jeder Failure hat Reason Codes + Counts
4. `mirrors/` ist Wahrheit, `public/` ist Darstellung
5. Additive Migration statt Big Bang
6. Konsumierte Snapshots schlagen Code-Annahmen

## 11. Nicht-Ziele (explizit nicht Teil von v2.0)
- Parquet-Migration
- "Policy as Code" als Muss
- generische Trend-/Mode-Diskussionen zu Synthetics
- adaptive Gate-Schwellen als Kernbestandteil

## 12. Ergebnisversprechen von v2.0
Nach v2.0 soll jederzeit belegbar sein:

- warum ein Asset in einem Feature fehlt (Dropout Ledger + Reason)
- ob das Universe wirklich vollstaendig ist (Dual Gates)
- wie Forecast evaluiert wurde (Folds + Outcomes + Metriken)
- warum ein Modell nicht promoted wurde (Decision Ledger)
- ob Synthetics in konsumierten Snapshots vorkommen (Revalidation)
- wie auf einen letzten guten Clean-Bars-Stand zurueckgerollt wird (Manifeste + Pointer)

## 13. Implementation Notes (Pflicht fuer spaetere Umsetzung)

### 13.1 Run IDs
Run IDs sollen inhaltlich deterministisch ableitbar sein (Zeitfenster + git_sha + pipeline_version), auch wenn Artefakte wegen Timestamps nicht byte-identisch sind.

### 13.2 Primary Key
Primary Key fuer Assets: `canonical_id`
Display-Symbol bleibt UI-Attribut.

### 13.3 Gate Mode Switch
Jedes neue Gate muss `mode: report|enforce` unterstuetzen.

### 13.4 Promotion Queryability
Decision + Event getrennt, aber ueber `promotion_index.json` gemeinsam abfragbar.

---

Hinweis zur Umsetzung:
Dieses Dokument ist absichtlich ohne produktive Codeaenderungen erstellt worden. Vor Start der Implementierung:

1. aktive Backfill-/Pipeline-Runs beenden oder sauber einfrieren
2. Worktree baseline sichern (Commit oder Snapshot)
3. Umsetzung phasenweise ab Phase 0 starten

