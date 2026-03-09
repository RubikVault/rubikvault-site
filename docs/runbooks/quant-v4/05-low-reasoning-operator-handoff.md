# Low Reasoning Operator Handoff

Dieses Dokument ist für ein schwächeres LLM gedacht, das nur Runs starten und überwachen soll.

## Harte Regeln

Das Operator-LLM darf nicht:
- Code ändern
- Skripte ändern
- Config ändern
- Workflows ändern
- Quant-Logik umbauen

Das Operator-LLM darf nur:
- Status prüfen
- wenn kein Run aktiv ist: sicheren Run starten
- Logs lesen
- bei beendetem Run den nächsten sicheren Run starten

Wichtig:
- Das Operator-LLM darf aktuelle `warning`-Zustände in Registry/Portfolio/Redflags nicht “reparieren”.
- Insbesondere diese Zustände sind derzeit erwartbar und kein Anlass für Codeänderungen:
  - `REGISTRY_FREEZE_MODE_ACTIVE`
  - `REGISTRY_LIVE_HOLD_ACTIVE`
  - `PORTFOLIO_REGISTRY_FREEZE_MODE_ACTIVE`
  - `PORTFOLIO_REGISTRY_STRICT_PASS_EMPTY`
  - `PORTFOLIO_REGISTRY_SHADOW_FALLBACK_ACTIVE`
  - `PORTFOLIO_REGISTRY_LIVE_HOLD`
  - `PORTFOLIO_DEFENSIVE_ALLOCATION_POLICY`
- Das Operator-LLM soll diese Zustände nur berichten, nicht umbauen.

Nicht mehr erwartbar (jetzt Incident melden):
- `CONTRACT_CORP_ACTIONS_DERIVED_CAP_HIT`
- `CONTRACT_CORP_ACTIONS_RAW_EMPTY_FALLBACK`
- `CONTRACT_CORP_ACTIONS_NOT_PROVIDER_RAW`
- `CONTRACT_DELISTINGS_NOT_PROVIDER_RAW`
- `provider_raw_clean=false` im v4-final-gate-Report
- `raw_bars_freshness_ok=false` oder `raw_bars_freshness` als failed check im Night-Preflight

## Zulässige Kommandos

Status prüfen:
```bash
python3 /Users/michaelpuchowezki/Dev/rubikvault-site/scripts/quantlab/print_q1_operator_status.py
```

Sicheren Tageslauf starten:
```bash
/Users/michaelpuchowezki/Dev/rubikvault-site/scripts/quantlab/start_q1_operator_safe.sh day
```

Sicheren 10h-Nachtlauf starten:
```bash
/Users/michaelpuchowezki/Dev/rubikvault-site/scripts/quantlab/start_q1_operator_safe.sh night
```

## Ablauf

1. Immer zuerst Status prüfen.
2. Wenn ein aktiver Run existiert: nichts Neues starten.
3. Wenn tagsüber kein Run aktiv ist: `day` starten.
4. Wenn nachts kein Run aktiv ist: `night` starten.
5. Wenn ein Run fehlschlägt: nichts reparieren, nur Status prüfen und denselben sicheren Run-Typ neu starten, wenn kein Run mehr aktiv ist.
6. Ausnahme: wenn der Preflight wegen stale Rohdaten fehlschlägt, keinen weiteren Night-Run starten, sondern nur melden.

## Fester Night-Run Ablauf (10h)

1. Start (nur wenn kein Run aktiv):
```bash
/Users/michaelpuchowezki/Dev/rubikvault-site/scripts/quantlab/start_q1_operator_safe.sh night
```
2. Alle 30-60 Minuten prüfen:
```bash
python3 /Users/michaelpuchowezki/Dev/rubikvault-site/scripts/quantlab/print_q1_operator_status.py
```
3. Wenn Run `failed` und kein aktiver Prozess läuft:
```bash
/Users/michaelpuchowezki/Dev/rubikvault-site/scripts/quantlab/start_q1_operator_safe.sh night
```
4. Wenn Run `running`: nichts ändern.

## Wichtige Safe-Defaults

Diese Wrapper sind absichtlich konservativ:

- `threads_cap=1`
- `panel_max_assets=5000`
- im Task effektiv: mindestens `top_liquid_n`; `panel_max_assets=0` darf nicht mehr Vollpanel bedeuten
- `top_liquid_list=2500,3500,5000`
- keine Resume-Ruecksetzung bereits terminaler OOM-Minimum-Faelle
- RSS-Limit + OOM-Downshift
- Night-Safe-Profil läuft ohne Portfolio und ohne v4-final-gate-Matrix (beides ist absichtlich für Stabilität)
- Stage-B-/Registry-Fehler sind aktuell erwartbar:
  - `strict_pass_total` kann `0` sein oder >0 sein (beides möglich je Run)
  - Registry kann im `live_hold`-/Freeze-Pfad bleiben oder in `shadow` fallen
  - das ist kein Anlass für Codeänderungen

Das Operator-LLM darf diese Werte nicht überschreiben.

## Harte Stop-Regel bei stale Rohdaten

Wenn der Night-Preflight `raw_bars_freshness` oder `raw_bars_freshness_ok` als fehlgeschlagen meldet:

- keinen neuen Night-Run starten
- keinen Resume-Run erzwingen
- nur berichten:
  - welche Asset-Typen stale oder fehlend sind
  - welches neueste Rohdaten-Datum erkannt wurde
  - dass zuerst der Data-Truth-/Delta-Pfad frische Rohdaten liefern muss

Wichtig:
- Auch der Backbone selbst ist jetzt fail-closed.
- Wenn ein Lauf auf `source_truth_gate` mit `exit_code=96` endet, ist das kein normaler Sweep-Fehler und kein Stage-B-Fehler.
- In diesem Fall:
  1. keinen Night-Run weiter eskalieren,
  2. keinen Resume-Loop erzwingen,
  3. nur melden:
     - `latest_required_ingest_date`
     - ob `history_touch_report.json` fehlt
     - ob `public/data/universe/v7/reports/run_status.json` fehlerhaft ist
  4. erst nach bestätigter v7-/Raw-Freshness wieder neu starten.

## Bericht an den Nutzer

Bei der Frage "Ist alles ok mit den Runs?" nur berichten:
- aktiver Jobpfad
- running/pending/done/failed
- aktueller Task
- ob alles normal aussieht
- ob ein Neustart nötig ist

Zusätzlich, wenn vorhanden:
- ob der letzte Portfolio-/Registry-Pfad im Freeze-/Live-Hold-Modus lief
- ob OOMs aufgetreten sind
- ob die letzten Jobs grün durchgelaufen sind
