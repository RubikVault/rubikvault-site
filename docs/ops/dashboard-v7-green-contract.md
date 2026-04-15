# Dashboard V7 Green Contract

Stand: 2026-04-13

Dieses Repo betrachtet `Dashboard V7 grün` und `Stock Analyzer UI feldsauber` nur dann als erreicht, wenn die folgenden Regeln gleichzeitig erfüllt sind:

1. Single Writer:
`scripts/ops/run-pipeline-master-supervisor.mjs` ist der einzige residente Writer für autoritative Latest-Artefakte. Legacy-Writer wie `run-night-supervisor.mjs` sind deaktiviert.

2. Einheitliche Run-Kette:
Alle releaserelevanten Artefakte derselben Generation tragen dieselbe `run_id` und dasselbe `target_market_date`.

3. Full-Universe-Beweis:
`build-stock-analyzer-universe-audit.mjs` beweist `full_universe_validated` ausschließlich artefaktbasiert über das ganze Universe. Live-Canaries sind davon getrennt und gehen nur in den UI-Truth-Report ein.

4. Hist-Probs neutral statt Scheindefekt:
Assets mit `no_data`, `insufficient_history`, `inactive` oder verifizierter Provider-No-Data-Ausnahme gelten nicht als `artifact_hist_probs_missing`.

5. Fundamentals nie Seal-Blocker:
Fundamentals sind ein eigenes Quality-System für das priorisierte Scope. `OUT_OF_SCOPE` und `NOT_APPLICABLE` müssen in API/UI neutral erscheinen und dürfen Final Seal oder Release nicht blockieren.

6. Upstream-Date-Policy:
`market_data_refresh` und `q1_delta_ingest` dürfen dem aktiven Release-Target voraus sein. Sie blockieren nur, wenn sie hinter dem aktiven `target_market_date` zurückliegen oder unvollständige Evidenz liefern.

7. Dashboard-Wahrheit:
Dashboard V7 zeigt kritische Blocker aus `final-integrity-seal`, `system-status`, `data-freshness`, `ui-field-truth` und `stock-analyzer-universe-audit`. Warning-only Fundamentals bleiben sichtbar, aber nicht releaseblockierend.

Praktische Folge:
- `artifact_hist_probs_stale` oder `artifact_hist_probs_missing` bleiben kritisch.
- `artifact_fundamentals_missing` bleibt Warning.
- `full_universe_validated` kommt aus dem Artefaktpfad.
- `ui_field_truth_ok` kommt aus Artefaktpfad plus separaten Live-Canaries.
