# RubikVault — Projektziele & Architektur (SSOT)

> **Diese Datei ist die zentrale Wahrheitsquelle für alle KIs und Entwickler.**
> Lies sie ZUERST, bevor du Code änderst oder Entscheidungen triffst.
> Letzte Aktualisierung: 2026-04-23

---

## 1. Produktvision

RubikVault ist eine Financial Data Platform für **Stocks, ETFs und Indizes** in den Märkten **US, EU und Asien**.

**Das eine Ziel:** Jedes Asset im Stock Analyzer UI zeigt entweder `All Systems Operational` — oder es gibt einen konkreten, belegten Grund, warum nicht (z.B. EODHD liefert keine Daten, IPO zu frisch, delisted, Symbol-Mapping-Fehler). Es darf **keinen** Pipeline-internen Grund für ein nicht-grünes Asset geben.

**Erfolgsquote:** Mindestens 90% aller EODHD-geeigneten Assets sind grün. Die restlichen 10% sind mit Provider- oder Datenqualitätsgründen klassifiziert.

---

## 2. Architektur-Prinzipien

### 2.1 Kosten
- **Keine neuen bezahlten Infrastruktur-Services.** Cloudflare und GitHub bleiben dauerhaft im Free Tier; EODHD ist der bestehende Datenprovider und braucht einen gültigen Key.
- GitHub Actions, Artifacts, Packages und Storage müssen sparsam genutzt werden. Keine Lösung darf dauerhaft bezahlte Runner, zusätzliche Actions-Minuten oder kostenpflichtige GitHub-Features voraussetzen.
- Besucher dürfen keine unkontrollierten externen Provider-Fetches auslösen. Neue Features folgen `FETCH ONCE, READ MANY`; bestehende Live-Fallbacks müssen eng begrenzt, gecacht oder durch statische Artefakte ersetzt werden.

### 2.2 Datenfluss (Truth Chain)
```
EODHD API → v7 history packs (NAS) → Q1/QuantLab Parquet + features → Reports → UI (Cloudflare Pages)
```
- **Keine Abkürzungen.** Daten fließen nur in eine Richtung.
- **Static-First:** UI und Dashboards lesen primär veröffentlichte Artefakte in `public/data/`; große Runtime-/History-Daten liegen auf NAS/QuantLab und werden daraus publiziert. Kein R2, kein D1.
- **Deployment-Size-Budget:** Public-Artefakte müssen kompakt, shardbar und CDN-freundlich bleiben. Keine riesigen duplizierten per-Asset JSON-Bundles für das ~90k Universe; Daten müssen so publiziert werden, dass Cloudflare Free Tier, Browser, spätere iOS-/Android-Apps und mobile Netze effizient bleiben.
- **Unsinkable:** UI zeigt immer `lastGood` Daten, nie leere Seiten.

### 2.3 Pipeline-Architektur (Lane-basiert)
- **Lane A (Data-Plane):** NAS-native Datenbeschaffung, Ingest, Berechnung. Läuft nachts autonom.
- **Lane B (Release-Full):** UI-Audit, Field-Truth, Integrity-Seal, Deploy. Läuft nach Lane A.
- **Executor:** Ausschließlich `scripts/nas/rv-nas-night-supervisor.sh`. Der alte `pipeline-master` ist per `SUPERVISOR_STOP` deaktiviert.
- **Scheduler:** NAS-seitig (DSM/cron), nicht Mac-gesteuert.
- **Codex/LLM-Heartbeats sind kein Produktions-Scheduler.** Sie dürfen beobachten und helfen, aber dauerhafte Automation muss auf der NAS laufen und ohne Mac/Codex erreichbar bleiben.

### 2.4 Hardware-Rollen
| Gerät | Rolle | Einschränkung |
|:---|:---|:---|
| **Synology NAS** | Produktions-Pipeline, Datenhaltung | Kein Git installiert, begrenzte CPU (2 Cores), 10GB RAM |
| **MacBook** | Entwicklung, Deployments, Notfall-Eingriff | Kein dauerhafter Pipeline-Betrieb |
| **Cloudflare** | CDN, Pages Functions, KV | Free Tier Limits beachten |

### 2.5 Asset-Klassen & Universe
- **Scope:** `STOCK`, `ETF`, `INDEX` (gesteuert über `RV_GLOBAL_ASSET_CLASSES`)
- **Regionen:** US, EU, Asien
- **Canonical Source:** `public/data/universe/v7/registry/registry.ndjson.gz`
- **Global Scope:** `public/data/universe/v7/ssot/assets.global.canonical.ids.json`
- Scope-Generator: `scripts/universe-v7/build-global-scope.mjs`

### 2.6 Release-, Privacy- & Deployment-Regeln
- **Cloudflare Deployments werden immer geprüft.** Nach einem Deploy muss belegt werden, dass der Build erfolgreich war und die Seite/Functions smoke-tests bestehen. Wenn der Build scheitert, wird die Ursache gefixt statt ignoriert.
- **GitHub Workflows dürfen nicht dauerhaft rot bleiben.** Failing Workflows werden repariert; nur nach belegter Obsoleszenz dürfen sie entfernt werden.
- **Keine privaten Personendaten auf `main`.** Namen, Vornamen, private E-Mail-Adressen, lokale Pfade mit Personenbezug, Secrets und private Accounts dürfen nicht in öffentliche Artefakte, Website-Texte oder committed Konfigurationen geraten. Diffs und Deploy-Artefakte müssen darauf geprüft werden.
- **`main` ist user-facing vollständig Englisch.** Website, Dashboard, sichtbare UI-Texte, Fehlermeldungen, News/Content und öffentliche Metadaten auf `main` dürfen kein Deutsch enthalten.
- **Deployments müssen klein und statisch skalieren.** Besonders der Stock Analyzer darf für `STOCK+ETF+INDEX` über US/EU/Asia nicht durch zu große Bundles, unkomprimierte JSON-Mengen oder duplizierte Felder Cloudflare-Deploys gefährden.

---

## 3. Pipeline-Ziele

### 3.1 Robustheit
- Pipeline läuft **nachts vollautomatisch** auf der NAS, ohne menschlichen Eingriff.
- Jeder Step hat Timeout, Memory-Guard und Swap-Ceiling.
- Bei Fehler: Step wird als `failed` dokumentiert, Pipeline stoppt sauber (kein Crash).
- `SUPERVISOR_STOP` verhindert, dass der alte Mac-Supervisor versehentlich startet.
- Kein Step darf wegen SSH-/Tailscale-Problemen in Codex hängen bleiben. Remote-Monitoring ist hilfreich, aber der NAS-Run muss eigenständig weiterlaufen.
- NAS-side health checks use `scripts/nas/rv-nas-night-pipeline-watchdog.sh`, which writes `runtime/night-pipeline/watchdog-latest.json` and does not depend on Codex network access.

### 3.2 Performance
- Jeder Step wird mit `measure-command.py` gemessen: Dauer, Peak-RSS, Swap-Delta.
- Reports liefern täglich konkrete Optimierungs-Hinweise.
- Ziel: Pipeline-Laufzeit minimieren, gleichzeitig NAS-Hardware schonen (Langlebigkeit).
- `hist_probs` nutzt adaptive Heap-Steuerung (1536MB → 1024MB nach 7 stabilen Nächten).

### 3.3 Lessons Learned
- Tägliche Reports (`system-status`, `data-freshness`, `pipeline-epoch`) liefern Rückschlüsse.
- Learning-Lane (`learning_daily`, `v1_audit`, `cutover_readiness`) dokumentiert Optimierungspotenzial.
- Alle Incidents und Fixes werden in `docs/ops/lessons-learned.md` eingetragen.

---

## 4. Green-Definition (Stock Analyzer UI)

Ein Asset ist `All Systems Operational` wenn:
- Frische Kursdaten (Bars) vorhanden (≤ 2 Handelstage alt)
- Hist-Probs berechnet
- Im Snapshot (Best Setups) verarbeitet
- Keine Pipeline-Fehler in der Verarbeitungskette

Ein Asset ist **akzeptabel nicht-grün** nur wenn:
- EODHD liefert keine Daten (Provider-Lücke)
- Asset ist zu neu (IPO, < 250 Bars)
- Asset ist delisted/stale
- Symbol-Mapping-Fehler beim Provider
- API-Abruf-Fehler (Timeout, Rate-Limit)

**Kein Asset darf wegen eines internen Pipeline-Fehlers nicht-grün sein.**

---

## 5. Dashboard (`/dashboard_v7`)

- Muss immer den **aktuellen, echten Stand** der Architektur zeigen.
- Veraltete Pfade, Reports oder Infos müssen entfernt werden.
- Neue relevante Daten (z.B. NAS-Pipeline-Status, Lane-Ergebnisse) müssen eingebaut werden.
- SSOT: `public/data/reports/system-status-latest.json`

---

## 6. Nicht verhandelbar (Hard Rules)

1. **Keine neuen bezahlten Infrastruktur-Services.** Bestehende Provider-Keys wie EODHD sind erlaubt; Cloudflare und GitHub bleiben Free Tier.
2. **Keine Re-Architektur.** Bestehende funktionierende Endpoints nicht umbauen.
3. **Minimale Diffs.** Kleine, sichere Änderungen. Kein Big Bang.
4. **NAS-Schutz:** Keine Deletes auf der NAS, kein Photos/QuickConnect/SMB stören.
5. **NAS-Betrieb:** NAS ist Ziel-Orchestrator; Mac bleibt Entwicklungs- und Notfall-Fallback. Mac-Daten dürfen nur manifestbasiert und belegbar auf die NAS übertragen werden.
6. **Evidence-based:** Kein Fix ohne Beweis. Keine halluzinierten Lösungen.
7. **Envelope Contract:** Alle `/api/*` Responses folgen `{ok, feature, data, error, meta}`.
8. **Git-Safety:** Kein `--force`, kein `reset --hard` ohne explizite Anweisung.
9. **Deployment-Safety:** Cloudflare Builds und GitHub Workflows müssen grün oder begründet entfernt sein; keine dauerhaft ignorierten roten Checks.
10. **Privacy-Safety:** Keine privaten Personendaten, Secrets oder lokalen privaten Identitäten auf `main`.
11. **English-only Main:** Alles User-facing auf `main` bleibt Englisch.
12. **Size-Safety:** Public/Deploy-Artefakte bleiben klein, statisch und skalierbar für ~90k Assets plus Mobile-Apps.

---

## 7. Workflow für KIs

1. **Lies `PROJECT.md`** (diese Datei) — verstehe die Ziele.
2. **Lies `docs/ops/lessons-learned.md`** — vermeide bekannte Fehler.
3. **Mache die kleinstmögliche Änderung.**
4. **Verifiziere mit Tests/Commands.**
5. **Prüfe vor `main`:** Cloudflare-Build, GitHub-Workflow-Status, keine privaten Daten, keine deutschen UI-Texte, keine unnötig großen Public-Artefakte.
6. **Dokumentiere Incidents in `docs/ops/lessons-learned.md`.**

---

## 8. Referenz-Dateien

| Datei | Zweck |
|:---|:---|
| `PROJECT.md` | **Diese Datei.** Ziele & Architektur (SSOT). |
| `PIPELINE.md` | Legacy-/Recovery-Referenz; für aktuellen NAS-Betrieb zuerst `docs/ops/nas-runbook.md` und `docs/ops/nas-night-supervisor.md` nutzen. |
| `AI_CONTEXT.md` | Technische Constraints & Validation Commands. |
| `docs/ops/lessons-learned.md` | Gesammelte Fehler & Lektionen. |
| `docs/ops/runbook.md` | Operatives Handbuch für Pipeline-Recovery. |
| `docs/ops/nas-runbook.md` | NAS-spezifisches Operations-Handbuch. |
| `scripts/nas/rv-nas-night-pipeline-watchdog.sh` | NAS-seitiger Watchdog für Lane-Status, Rate, ETA und Stale-Fortschritt. |
| `.cursorrules` | Cursor/VS-Code-spezifische Regeln. |
