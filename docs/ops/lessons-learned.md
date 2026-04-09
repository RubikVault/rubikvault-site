# Lessons Learned

> **Pflichtlektüre für jede KI und jeden Entwickler, der in diesem Repo arbeitet.**
>
> Alle Erkenntnisse aus echten Fehlern, Bugs und Infrastruktur-Vorfällen werden hier gebündelt.
> Egal welche KI oder welcher Mensch etwas gebaut hat — die Lektion gehört hierher.
> Ziel: Kein Fehler wird zweimal gemacht.

---

## Wie dieser Abschnitt gepflegt wird

- **Wer:** Jede KI (Claude, GPT, etc.) und jeder Entwickler, der einen Bug findet, einen Incident löst oder eine nicht-offensichtliche Design-Entscheidung trifft.
- **Wann:** Sofort nach dem Fix, nicht retrospektiv.
- **Format:** Datum · Kategorie · Was schief lief · Warum · Fix · Wie es in Zukunft verhindert wird.
- **Verweise:** Dieses Dokument wird in `AI_CONTEXT.md`, `AI_README.md`, `docs/ops/decisions.md`, `PIPELINE.md` und allen Supervisor-/Ops-Skripten referenziert.

---

## Lessons

---

### 2026-04-08 · Supervisor · `phaseStalled()` Rückgabewert verworfen

**Was:** Der QuantLab Catchup Supervisor loggete korrekt `[STALLED→RECOVER] Storage cleared`, schrieb aber den neuen State nie in die State-Datei. Folge: Jeder 5-Minuten-Tick las weiter `STALLED` aus der alten Datei und loggete erneut `RECOVER` — ein stiller Endlos-Loop über 4,5 Stunden (12:30–17:00 Uhr).

**Warum:** In der `switch`-Anweisung war `phaseStalled(state)` aufgerufen, aber der Rückgabewert nicht `next` zugewiesen:
```js
// Bug:
case 'STALLED':
  phaseStalled(state);
  return; // "never reached" — war aber tatsächlich der Code-Pfad

// Fix:
case 'STALLED':
  next = phaseStalled(state);
  break;
```

**Prävention:** Bei jeder State-Machine mit `switch/case`: alle `case`-Zweige müssen `next =` zuweisen. Nie `return` mitten in einem `switch` nutzen, das den State-Write-Pfad umgeht. Code-Review-Regel: `phaseX()` muss immer `next = phaseX()` sein.

---

### 2026-04-08 · Supervisor · `MAX_HOURS` zu kurz für Catchup-Runs

**Was:** Der `start_q1_operator_safe.sh` day-Modus hat `MAX_HOURS=3.5` hardcoded. Bei 24 Catchup-Dates (~20 min/Date = ~8h nötig) hat der Job sich nach 3,5h selbst beendet. Der Supervisor interpretierte den dead PID als Fehler, inkrementierte `restart_count`, und nach 3 Restarts trat STALLED ein. Das passierte 3× zwischen 17:05–19:42 Uhr.

**Warum:** `MAX_HOURS` wurde für normale Nachtläufe (2–4 Dates) dimensioniert, nicht für Catchup-Szenarien mit bis zu 25 Dates.

**Fix:** `MAX_HOURS` wird jetzt im Supervisor dynamisch berechnet:
```js
const maxHours = Math.min(12, Math.max(4, Math.ceil(asofDatesCount * 22 / 60) + 0.5));
// 24 Dates → 9.5h | 4 Dates → 4h | 1 Date → 4h
```

**Prävention:** Jeder Supervisor, der einen externen Job mit Timeout startet, muss den Timeout aus der erwarteten Arbeitslast ableiten — niemals hardcoden. Faustregel: `timeout = max(minimum, estimated_work * 1.3) + buffer`.

---

### 2026-04-08 · Supervisor · `--reset-to-phase` setzt `training_restart_count` nicht zurück

**Was:** `node run-quantlab-catchup-supervisor.mjs --reset-to-phase TRAINING_CATCHUP` hat `phase` auf `TRAINING_CATCHUP` gesetzt, aber `training_restart_count=3` beibehalten. Beim nächsten Zyklus wurde sofort wieder STALLED ausgelöst, weil `restart_count >= MAX_RESTARTS`.

**Warum:** Die `--reset-to-phase` Implementierung merged den neuen Phase-Wert in den vorhandenen State, ohne restart-bezogene Felder zu nullen.

**Fix (TODO):** `--reset-to-phase TRAINING_CATCHUP` muss `training_restart_count`, `training_pid`, `training_pid_start_time` und `stalled_reason` immer auf `null`/`0` zurücksetzen. Bis dahin: State-Datei direkt per Python patchen (wie heute gemacht).

**Prävention:** Alle Admin-CLI-Befehle die eine Phase explizit setzen, müssen alle phasen-assoziierten Felder atomisch mitsetzen.

---

### 2026-04-08 · Storage · APFS Local Snapshots halten gelöschte Dateien zurück

**Was:** Nach dem erfolgreichen Archivieren von 153 GB (24 q1step2bars Snapshots) auf die NAS zeigte `df` weiterhin nur 37 GB frei — weil macOS APFS automatisch lokale Time Machine Snapshots erstellt hatte, die die gelöschten Inodes noch referenzierten.

**Warum:** APFS Copy-on-Write: gelöschte Dateien werden nicht sofort freigegeben solange ein lokaler Snapshot sie referenziert. Time Machine erstellt standardmäßig stündliche APFS-Snapshots.

**Fix:** `tmutil listlocalsnapshotdates /` → `tmutil deletelocalsnapshots <date>` für alle Snapshots die zu den archivierten Dateien gehören. Danach sofort volle Speicherfreigabe.

**Prävention:** Nach jedem größeren Archiv-/Lösch-Vorgang (>10 GB): `tmutil listlocalsnapshotdates /` prüfen. Der Storage Governor sollte APFS-Snapshots als Teil des Freigabe-Flows berücksichtigen.

---

### 2026-04-08 · NAS · rsync schlägt fehl ohne `--rsync-path=/usr/bin/rsync`

**Was:** rsync-Transfers zur Synology NAS schlugen fehl mit "rsync: not found on remote", obwohl SSH-Auth funktionierte.

**Warum:** Synologys non-interaktive Shell (`/bin/sh`) hat `/usr/bin` nicht im PATH. rsync auf der NAS liegt unter `/usr/bin/rsync`, nicht im Standard-PATH.

**Fix:** Alle rsync-Calls zur NAS brauchen `--rsync-path=/usr/bin/rsync`.

**Prävention:** Immer in allen rsync-Calls zur Synology NAS: `--rsync-path=/usr/bin/rsync`. Ist jetzt in `run-storage-governor.mjs` fest verankert.

---

### 2026-04-08 · NAS · SSH von Node.js subprocess scheitert ohne explizite Identity-File

**Was:** `rsync -e ssh neonas:...` funktionierte im Terminal (SSH Agent aktiv), aber scheiterte als Node.js `spawnSync`-Subprozess.

**Warum:** Non-interaktive Node.js Subprozesse erben keinen SSH Agent (`SSH_AUTH_SOCK`). `~/.ssh/config` wird von OpenSSH gelesen, aber der Agent-Socket fehlt.

**Fix:** `ssh -G neonas` liest die effektive Config-Konfiguration aus (inkl. `IdentityFile`). Das Identity-File wird dann explizit übergeben: `rsync -e "ssh -i /path/to/key -p 2222 -o BatchMode=yes"`.

**Prävention:** Jeder SSH-basierte Subprozess aus Node.js muss explizite `-i key -p port` Flags setzen. Nie auf SSH Agent in non-interaktiven Prozessen verlassen.

---

### 2026-04-08 · Notifications · `osascript display notification` öffnet Script Editor beim Klick

**Was:** macOS Notifications aus `osascript display notification` waren mit Script Editor als aufrufende App verknüpft. Klick auf Notification öffnete leeres Script Editor Fenster.

**Warum:** Bekanntes macOS-Verhalten: `osascript` läuft im Kontext von Script Editor, nicht der aufrufenden App.

**Fix:** `terminal-notifier` installieren (`brew install terminal-notifier`). Mit `-group` Parameter verhindert man zusätzlich Notification-Stapel.

**Prävention:** Nie `osascript display notification` für Produktions-Notifications verwenden. Immer `terminal-notifier` mit `osascript`-Fallback.

---

### 2026-04-08 · Storage · `featureStore.version` hardcoded statt dynamisch

**Was:** Im Daily Report war `featureStore.version: 'v4_q1panel_fullchunk_daily'` als String-Literal hardcoded, obwohl der tatsächliche Store-Name aus dem Manifest gelesen werden könnte.

**Warum:** Schnelle Implementierung ohne Rückkoppelung ans Manifest.

**Fix:** `String(fullchunkManifest?.feature_store_version || 'v4_q1panel_fullchunk_daily')` — dynamisch, mit Fallback.

**Prävention:** Kein interner Konfigurationswert darf als String-Literal hardcoded sein, wenn er aus einem Manifest/SSOT gelesen werden kann.

---

---

### 2026-04-08 · Supervisor · Python venv Pfad falsch: `QUANT_ROOT/.venv` statt `REPO_ROOT/quantlab/.venv`

**Was:** Training startete und crashte sofort mit `FATAL: python not executable: /Users/.../QuantLabHot/rubikvault-quantlab/.venv/bin/python`. Das venv existiert dort nicht.

**Warum:** `const PYTHON = path.join(QUANT_ROOT, '.venv/bin/python')` — der Supervisor suchte das venv relativ zu `QUANT_ROOT` (QuantLabHot). Das Python-venv liegt aber in `REPO_ROOT/quantlab/.venv/`.

**Fix:** `const PYTHON = path.join(REPO_ROOT, 'quantlab/.venv/bin/python')` — relativ zum Repo-Root.

**Prävention:** Python-venv Pfade immer aus `REPO_ROOT` ableiten, nie aus `QUANT_ROOT`. Beim Erstellen neuer Supervisor-Skripte: `python --version` aus dem geplanten Pfad testen bevor der Skript deployed wird.

---

### 2026-04-09 · Feature Store · `build_feature_store_q1_panel.py` ignoriert `delta_*.parquet` Bars — Feature Store nie über 2026-03-11 hinaus

**Was:** Das Feature Store Build (`v4_q1panel_overnight`) lief durch, produzierte aber immer `panel_max_asof_date=2026-03-11` — egal wie frisch der Snapshot. Training schlug deshalb still fehl: es gab keine Features für asof_dates nach März 2026. Dashboard V7 blieb seit Wochen rot.

**Warum:** `build_feature_store_q1_panel.py` scannte nur `rglob("part_*.parquet")`. Tägliche Auto-Snapshots ab ca. 2026-03-12 speichern neue Bars aber als `delta_*.parquet` (inkrementelles Format). `part_*.parquet` existiert nur bis zum letzten Full-Snapshot (2026-03-11). Alle neueren Bar-Daten wurden schlicht ignoriert.

**Fix:**
```python
# Alle drei rglob("part_*.parquet")-Stellen in _build_bars_pack_file_index,
# inline scan-fallback, und _list_bars_files_for_classes:
all_bar_files = sorted(
    list(bars_root.rglob("part_*.parquet")) + list(bars_root.rglob("delta_*.parquet"))
)
for fp in all_bar_files:
    name = fp.name
    if name.startswith("part_"):
        pack_key = name[len("part_"):-len(".parquet")]
    elif name.startswith("delta_"):
        pack_key = name[len("delta_"):-len(".parquet")]
```
Zusätzlich: Stale `v7_bars_pack_file_index.*.json` Cache löschen.

**Prävention:** Jeder Script der Bar-Dateien per Glob sucht muss explizit für BEIDE Formate (`part_*` und `delta_*`) ausgelegt sein. Bei jedem neuen Snapshot-Format: zuerst `ls bars/ingest_date=<neuestem>/asset_class=stock/` prüfen welches Dateinamenmuster genutzt wird.

---

### 2026-04-09 · Supervisor · `terminal-notifier` hängt ohne SIGKILL — Supervisor blockiert 4+ Stunden

**Was:** Ein Supervisor-Prozess (PID 64137) blockierte 4+ Minuten auf `terminal-notifier`, obwohl `spawnSync` mit `timeout: 5000` aufgerufen wurde.

**Warum:** `spawnSync` mit `timeout` sendet bei Ablauf standardmäßig SIGTERM. `terminal-notifier` ignoriert SIGTERM auf macOS (wartet auf Notification-Center Callback). Der spawnSync-Aufruf blockierte dadurch zeitlich unbegrenzt.

**Fix:** `killSignal: 'SIGKILL'` und `stdio: 'ignore'` zum spawnSync-Aufruf hinzugefügt:
```js
spawnSync(tnPath, [...args], { timeout: 5000, killSignal: 'SIGKILL', stdio: 'ignore' });
```

**Prävention:** Alle `spawnSync`-Aufrufe auf externe Notification-Tools (terminal-notifier, osascript) müssen `killSignal: 'SIGKILL'` und `stdio: 'ignore'` setzen.

---

## Verwandte Dokumente

- [decisions.md](decisions.md) — Architektur-Entscheidungen (Was und Warum)
- [nas-migration-journal.md](nas-migration-journal.md) — NAS-spezifische Incidents und Fortschritt
- [nas-runbook.md](nas-runbook.md) — NAS-Betrieb und Troubleshooting
- [contract.md](contract.md) — Systeminvarianten die nie verletzt werden dürfen
