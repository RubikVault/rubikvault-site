# Repository Audit & Skalierbarkeits-Analyse

Dieses Dokument fasst die Ergebnisse des Audits zusammen, ob und wie das System auf 5.000 Ticker täglich skaliert werden kann.

## 1. Was ist sicher (Status Quo)
*   **Repo & Deployment:** Das Repository ist **Public** und deployed erfolgreich auf **Cloudflare Pages**.
*   **Aktuelle Last:** Mit 100 Tickern (NASDAQ-100) läuft das System stabil im GitHub Free Tier.
*   **Code-Basis:** Die Skripte sind modular und robust (Retry-Logik, saubere Trennung von Providern).
*   **Geheimnisse:** Secrets sind korrekt in GitHub hinterlegt und nicht im Code hardcodiert.

## 2. Was ist unsicher / Kritisch (bei 5.000 Tickern)
*   **Git Speicher (SHOWSTOPPER):** Das aktuelle Vorgehen, tägliche Daten-Updates (`public/data/eod` und `snapshots`) in das Git-Repo zu committen, wird das Repo in **< 3 Monaten unbenutzbar** machen (Größe > 1GB). Git ist nicht für Datenbank-Workloads gemacht.
*   **Provider Limits:** Der Free-Tier von Tiingo erlaubt nur **500 Ticker pro Monat**. Für 5.000 Ticker ist der aktuelle Plan völlig unzureichend.
*   **Cloudflare Pages Limit:** Pages hat ein Soft-Limit von ca. 20.000 Dateien pro Deployment. Wenn wir für 5.000 Ticker je 3-4 JSON-Dateien (EOD, Snapshot, Phase, Analyse) erzeugen, sprengen wir dieses Limit sofort.
*   **Laufzeit:** Ein einzelner Job für 5.000 Ticker dauert geschätzt 40-60 Minuten. Das ist nah am Timeout und blockiert Runners zu lange.

## 3. Empfohlene Architektur (kostenlos & robust)

Um 5.000 Ticker dauerhaft und robust zu betreiben, muss die Architektur fundamental geändert werden:

- [ ] **Storage: Weg von Git, hin zu KV/R2**
    *   **Daten-Layer:** Speichere die JSON-Dateien (EOD, Snapshots) ausschließlich in **Cloudflare R2** (günstiger Object Store) oder **KV**.
    *   **Git-Layer:** Das Git-Repo enthält nur Code und Konfiguration, **keine** dynamischen Marktdaten.
    *   Dies löst das Größenproblem und das Datei-Anzahl-Problem (da R2 nicht als Site-Assets deployed werden muss).

- [ ] **Compute: Sharding & Matrix**
    *   Nutze die **GitHub Actions Matrix Strategy**, um die 5.000 Ticker in 5 Jobs à 1.000 Ticker aufzuteilen.
    *   Dies reduziert die Wall-Clock-Time von 60 Min auf ~12 Min und erhöht die Ausfallsicherheit.

- [ ] **Daten-Provider: Upgrade**
    *   Wechsel auf einen bezahlten Plan (z.B. Tiingo Starter oder EODHD), der 5.000 Ticker abdeckt.
    *   Alternativ: Reduziere die Frequenz für das "große Universum" auf wöchentlich und mache täglich nur die Top 100.

## 4. Konkrete nächste To-dos (Dashboard/Forecast System)

1.  **Git-Entkopplung sofort umsetzen**
    *   [ ] In `scripts/eod/build-eod-latest.mjs`: Schreiblogik von `fs.writeFile` auf R2/KV-Upload umstellen.
    *   [ ] In `.github/workflows/eod-latest.yml`: Den `git commit` Step löschen.

2.  **Provider-Limit lösen**
    *   [ ] Prüfen, ob Budget für API-Daten vorhanden ist (~10-20€/Monat).
    *   [ ] Falls nein: Universum strikt auf < 500 Ticker begrenzen.

3.  **Universum splitten**
    *   [ ] Erstelle `public/data/universe/full_5000.json`.
    *   [ ] Implementiere Sharding-Logik in den Fetch-Skripten (`--shard 1/5`).

**Fazit:** Mit der aktuellen "Daten-in-Git" Strategie ist das Ziel **nicht erreichbar**. Mit einem Wechsel auf Cloudflare R2/KV als Datenspeicher ist es **technisch machbar**, erfordert aber ein Upgrade des Daten-Providers.
